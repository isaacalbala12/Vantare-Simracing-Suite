package telemetryanalysis

import (
	"math"
	"sort"
	"strings"
)

type TemporalAlignmentStatus struct {
	Aligned bool   `json:"aligned"`
	Reason  string `json:"reason"`
}

type TemporalAlignmentResult struct {
	Session  HistoricalSession                  `json:"session"`
	Pages    []HistoricalPage                   `json:"pages"`
	Bridge   TemporalAlignmentStatus            `json:"bridge"`
	Channels map[string]TemporalAlignmentStatus `json:"channels"`
}

func BuildTemporalAlignment(session HistoricalSession, pages []HistoricalPage) TemporalAlignmentResult {
	return buildTemporalAlignmentWithPages(session, cloneHistoricalPages(pages), false)
}

// ReadCorrectionInput owns the pages returned by its reader and can align them
// without a second full-size copy. Public callers keep the cloning contract.
func buildTemporalAlignmentOwned(session HistoricalSession, pages []HistoricalPage) TemporalAlignmentResult {
	return buildTemporalAlignmentWithPages(session, pages, true)
}

func buildTemporalAlignmentWithPages(session HistoricalSession, pages []HistoricalPage, ordered bool) TemporalAlignmentResult {
	result := TemporalAlignmentResult{
		Session:  cloneHistoricalSession(session),
		Pages:    pages,
		Bridge:   TemporalAlignmentStatus{Reason: "bridge_absent"},
		Channels: make(map[string]TemporalAlignmentStatus),
	}

	bridgeIndex := -1
	for index := range result.Session.Channels {
		if strings.EqualFold(strings.TrimSpace(result.Session.Channels[index].SourceName), "gps time") {
			if bridgeIndex >= 0 {
				result.Bridge.Reason = "bridge_invalid_shape"
				return result
			}
			bridgeIndex = index
		}
	}
	if bridgeIndex < 0 {
		return result
	}

	bridge := result.Session.Channels[bridgeIndex]
	if bridge.Sampling.Kind != SamplingContinuousImplicitFrequency {
		result.Bridge.Reason = "bridge_not_continuous"
		return result
	}
	if bridge.Sampling.FrequencyHz <= 0 {
		result.Bridge.Reason = "bridge_invalid_frequency"
		return result
	}
	if len(bridge.Columns) != 1 {
		result.Bridge.Reason = "bridge_invalid_shape"
		return result
	}

	var clock func(int64) (float64, bool)
	var status TemporalAlignmentStatus
	if ordered {
		clock, status = buildOrderedGPSClock(bridge, result.Pages)
	} else {
		var values map[int64]float64
		values, status = buildGPSClock(bridge, result.Pages)
		clock = func(index int64) (float64, bool) { value, ok := values[index]; return value, ok }
	}
	if !status.Aligned {
		result.Bridge = status
		return result
	}
	result.Bridge = TemporalAlignmentStatus{Aligned: true, Reason: "aligned"}

	channelIndexes := make(map[string]int, len(result.Session.Channels))
	for index := range result.Session.Channels {
		channelIndexes[result.Session.Channels[index].ID] = index
	}
	pageIndexes := make(map[string][]int)
	for index := range result.Pages {
		pageIndexes[result.Pages[index].ChannelID] = append(pageIndexes[result.Pages[index].ChannelID], index)
	}

	for channelID, indexes := range pageIndexes {
		channelIndex, exists := channelIndexes[channelID]
		if !exists {
			continue
		}
		channel := result.Session.Channels[channelIndex]
		if channel.Sampling.Kind != SamplingContinuousImplicitFrequency {
			continue
		}
		channelStatus := alignContinuousPages(&result, channelIndex, indexes, clock, bridge.Sampling.FrequencyHz)
		result.Channels[channelID] = channelStatus
	}
	return result
}

func buildGPSClock(bridge HistoricalChannel, pages []HistoricalPage) (map[int64]float64, TemporalAlignmentStatus) {
	clock := make(map[int64]float64)
	var indexes []int64
	for _, page := range pages {
		if page.ChannelID != bridge.ID {
			continue
		}
		if page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz != bridge.Sampling.FrequencyHz {
			return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_frequency"}
		}
		for _, sample := range page.Samples {
			if sample.Index < 0 {
				return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_index"}
			}
			if _, exists := clock[sample.Index]; exists {
				return nil, TemporalAlignmentStatus{Reason: "bridge_duplicate_index"}
			}
			if len(sample.Values) != 1 {
				return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_shape"}
			}
			value, ok := numericHistoricalValue(sample.Values[0])
			if !ok || math.IsNaN(value) || math.IsInf(value, 0) {
				return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_value"}
			}
			clock[sample.Index] = value
			indexes = append(indexes, sample.Index)
		}
	}
	if len(indexes) == 0 {
		return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_shape"}
	}
	sort.Slice(indexes, func(i, j int) bool { return indexes[i] < indexes[j] })
	for index := 1; index < len(indexes); index++ {
		if clock[indexes[index]] <= clock[indexes[index-1]] {
			return nil, TemporalAlignmentStatus{Reason: "bridge_non_monotonic"}
		}
	}
	return clock, TemporalAlignmentStatus{Aligned: true, Reason: "aligned"}
}

// The correction reader supplies contiguous samples in increasing index order.
// Keep only references to its GPS pages; an unordered pure caller falls back
// to the general clock so its error reasons and timestamps remain unchanged.
func buildOrderedGPSClock(bridge HistoricalChannel, pages []HistoricalPage) (func(int64) (float64, bool), TemporalAlignmentStatus) {
	var pageIndexes []int
	var lastIndex int64
	var lastTime float64
	seen, nonMonotonic := false, false
	for pageIndex := range pages {
		page := &pages[pageIndex]
		if page.ChannelID != bridge.ID {
			continue
		}
		if page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz != bridge.Sampling.FrequencyHz {
			return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_frequency"}
		}
		if len(page.Samples) > 0 {
			pageIndexes = append(pageIndexes, pageIndex)
		}
		for sampleIndex, sample := range page.Samples {
			if sample.Index < 0 {
				return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_index"}
			}
			firstIndex := page.Samples[0].Index
			if (seen && sample.Index <= lastIndex) || sample.Index < firstIndex || sample.Index-firstIndex != int64(sampleIndex) {
				values, status := buildGPSClock(bridge, pages)
				return func(index int64) (float64, bool) { value, ok := values[index]; return value, ok }, status
			}
			if len(sample.Values) != 1 {
				return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_shape"}
			}
			value, ok := numericHistoricalValue(sample.Values[0])
			if !ok || math.IsNaN(value) || math.IsInf(value, 0) {
				return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_value"}
			}
			if seen && value <= lastTime {
				nonMonotonic = true
			}
			lastIndex, lastTime, seen = sample.Index, value, true
		}
	}
	if !seen {
		return nil, TemporalAlignmentStatus{Reason: "bridge_invalid_shape"}
	}
	if nonMonotonic {
		return nil, TemporalAlignmentStatus{Reason: "bridge_non_monotonic"}
	}
	lookup := func(index int64) (float64, bool) {
		position := sort.Search(len(pageIndexes), func(i int) bool {
			return pages[pageIndexes[i]].Samples[0].Index > index
		}) - 1
		if position < 0 {
			return 0, false
		}
		samples := pages[pageIndexes[position]].Samples
		offset := index - samples[0].Index
		if offset < 0 || offset >= int64(len(samples)) {
			return 0, false
		}
		value, _ := numericHistoricalValue(samples[offset].Values[0])
		return value, true
	}
	return lookup, TemporalAlignmentStatus{Aligned: true, Reason: "aligned"}
}

func alignContinuousPages(result *TemporalAlignmentResult, channelIndex int, pageIndexes []int, clock func(int64) (float64, bool), gpsHz int) TemporalAlignmentStatus {
	channel := &result.Session.Channels[channelIndex]
	channelHz := channel.Sampling.FrequencyHz
	if channelHz <= 0 {
		return TemporalAlignmentStatus{Reason: "invalid_frequency"}
	}
	if gpsHz%channelHz != 0 {
		return TemporalAlignmentStatus{Reason: "incompatible_frequency"}
	}
	ratio := int64(gpsHz / channelHz)
	const maxInt64 = int64(^uint64(0) >> 1)
	for _, pageIndex := range pageIndexes {
		page := &result.Pages[pageIndex]
		if page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz != channelHz {
			return TemporalAlignmentStatus{Reason: "invalid_frequency"}
		}
		for _, sample := range page.Samples {
			if sample.Index < 0 || sample.Index > maxInt64/ratio {
				return TemporalAlignmentStatus{Reason: "invalid_sample_index"}
			}
			_, exists := clock(sample.Index * ratio)
			if !exists {
				return TemporalAlignmentStatus{Reason: "truncated_coverage"}
			}
		}
	}

	channel.Sampling.Origin = TimeOriginSourceTimestamp
	for _, pageIndex := range pageIndexes {
		page := &result.Pages[pageIndex]
		page.Sampling.Origin = TimeOriginSourceTimestamp
		for sampleIndex := range page.Samples {
			timestamp, _ := clock(page.Samples[sampleIndex].Index * ratio)
			page.Samples[sampleIndex].TimestampSeconds = &timestamp
		}
	}
	return TemporalAlignmentStatus{Aligned: true, Reason: "aligned"}
}

func numericHistoricalValue(value HistoricalValue) (float64, bool) {
	if !value.Present || value.Quality != QualityValid {
		return 0, false
	}
	switch value.Scalar.Kind {
	case ScalarNumber:
		return value.Scalar.Number, true
	case ScalarInteger:
		return float64(value.Scalar.Integer), true
	default:
		return 0, false
	}
}

func cloneHistoricalSession(source HistoricalSession) HistoricalSession {
	clone := source
	clone.Metadata = append([]HistoricalMetadata(nil), source.Metadata...)
	clone.Laps = append([]HistoricalLap(nil), source.Laps...)
	for index := range clone.Laps {
		if source.Laps[index].EndSeconds != nil {
			end := *source.Laps[index].EndSeconds
			clone.Laps[index].EndSeconds = &end
		}
	}
	clone.Channels = append([]HistoricalChannel(nil), source.Channels...)
	for index := range clone.Channels {
		clone.Channels[index].Columns = append([]HistoricalColumn(nil), source.Channels[index].Columns...)
	}
	return clone
}

func cloneHistoricalPages(source []HistoricalPage) []HistoricalPage {
	clone := append([]HistoricalPage(nil), source...)
	for pageIndex := range clone {
		clone[pageIndex].Samples = append([]HistoricalSample(nil), source[pageIndex].Samples...)
		for sampleIndex := range clone[pageIndex].Samples {
			sample := &clone[pageIndex].Samples[sampleIndex]
			sample.Values = append([]HistoricalValue(nil), source[pageIndex].Samples[sampleIndex].Values...)
			if source[pageIndex].Samples[sampleIndex].TimestampSeconds != nil {
				timestamp := *source[pageIndex].Samples[sampleIndex].TimestampSeconds
				sample.TimestampSeconds = &timestamp
			}
		}
	}
	return clone
}
