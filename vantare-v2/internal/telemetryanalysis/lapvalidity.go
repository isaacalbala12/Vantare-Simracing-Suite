package telemetryanalysis

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const (
	lapValidityComputationVersion = "lap-validity.v1"
	lapDistResetMinimumMeters     = 500.0
	coverageClockToleranceSeconds = 5.0
	fuelJumpMinimumLitres         = 3.0
	trafficMaximumGapSeconds      = 2.0
)

var ErrInvalidLapValidityInput = errors.New("invalid lap validity input")

func lapValidityHistoricalPageChannels() []string {
	return []string{
		"ambient temperature",
		"fuel level",
		"in pits",
		"lap",
		"lap dist",
		"lap time",
		"lastimpactmagnitude",
		"time behind next",
		"track temperature",
		"tyrescompound",
		"wind heading",
		"wind speed",
	}
}

type LapLabel string

const (
	LapLabelIncomplete       LapLabel = "incomplete"
	LapLabelOutLap           LapLabel = "out_lap"
	LapLabelInLap            LapLabel = "in_lap"
	LapLabelPit              LapLabel = "pit"
	LapLabelIncidentOfftrack LapLabel = "incident_offtrack"
	LapLabelTraffic          LapLabel = "traffic"
	LapLabelPaceOutlier      LapLabel = "pace_outlier"
)

type LapExclusionReason string

const (
	LapExclusionIncomplete       LapExclusionReason = "incomplete"
	LapExclusionOutLap           LapExclusionReason = "out_lap"
	LapExclusionInLap            LapExclusionReason = "in_lap"
	LapExclusionPit              LapExclusionReason = "pit"
	LapExclusionIncidentOfftrack LapExclusionReason = "incident_offtrack"
	LapExclusionPaceOutlier      LapExclusionReason = "pace_outlier"
)

type LapFamilyUse struct {
	Family           DerivationFamily     `json:"family"`
	Included         bool                 `json:"included"`
	ExclusionReasons []LapExclusionReason `json:"exclusionReasons"`
}

type AnalyzedLap struct {
	Number         int            `json:"number"`
	Start          *time.Time     `json:"start,omitempty"`
	End            time.Time      `json:"end"`
	LapTimeSeconds *float64       `json:"lapTimeSeconds,omitempty"`
	Complete       bool           `json:"complete"`
	Labels         []LapLabel     `json:"labels"`
	FamilyUse      []LapFamilyUse `json:"familyUse"`
}

func (l AnalyzedLap) HasLabel(wanted LapLabel) bool {
	for _, label := range l.Labels {
		if label == wanted {
			return true
		}
	}
	return false
}

type LapValidityDiagnostics struct {
	ReconciledLaps    int `json:"reconciledLaps"`
	LapEventRows      int `json:"lapEventRows"`
	UsableLapTimeRows int `json:"usableLapTimeRows"`
	LapDistResets     int `json:"lapDistResets"`
}

type LapValidityAnalysis struct {
	Temporal    strategyprojection.TemporalSegmentsV1 `json:"temporal"`
	Laps        []AnalyzedLap                         `json:"laps"`
	Diagnostics LapValidityDiagnostics                `json:"diagnostics"`
}

type observedLapEvent struct {
	index     int64
	seconds   float64
	lapNumber int
}

type observedEvent struct {
	seconds float64
	values  []HistoricalValue
}

type stintCandidate struct {
	lapIndex   int
	cause      strategyprojection.StintBoundaryCause
	presence   strategyprojection.Presence
	sampleSize int
	delta      *float64
}

// AnalyzeLapValidity is pure: it consumes an inspected historical model and
// normalized pages. It never opens DuckDB and never assumes a shared clock
// between event and continuous channels.
func AnalyzeLapValidity(session HistoricalSession, pages []HistoricalPage) (LapValidityAnalysis, error) {
	if strings.TrimSpace(session.ID) == "" {
		return LapValidityAnalysis{}, fmt.Errorf("%w: session id", ErrInvalidLapValidityInput)
	}
	grouped, err := groupPagesBySource(session, pages)
	if err != nil {
		return LapValidityAnalysis{}, err
	}

	lapEvents := readLapEvents(grouped["lap"])
	resetIndices, lapDistFrequency, lapDistEnd := readLapDistResets(grouped["lap dist"])
	continuousEnd := continuousCoverageEnd(
		grouped["ambient temperature"],
		grouped["track temperature"],
		grouped["wind heading"],
		grouped["wind speed"],
	)
	if continuousEnd == 0 {
		continuousEnd = lapDistEnd
	}
	if len(lapEvents) == 0 && len(resetIndices) == 0 {
		return LapValidityAnalysis{}, fmt.Errorf("%w: no lap event or lap distance reset", ErrInvalidLapValidityInput)
	}

	result := LapValidityAnalysis{
		Temporal: strategyprojection.TemporalSegmentsV1{
			ContractVersion: strategyprojection.ContractVersionTemporalSegmentsV1,
			Segments:        []strategyprojection.ContinuousSegment{},
			Gaps:            []strategyprojection.CoverageGap{},
			LapBoundaries:   []strategyprojection.LapBoundary{},
			StintBoundaries: []strategyprojection.StintBoundary{},
		},
		Laps: []AnalyzedLap{},
	}
	result.Diagnostics.LapEventRows = len(lapEvents)
	result.Diagnostics.LapDistResets = len(resetIndices)
	if len(lapEvents) > 1 {
		for index := 1; index < len(lapEvents); index++ {
			if lapEvents[index].lapNumber < lapEvents[index-1].lapNumber {
				return LapValidityAnalysis{}, fmt.Errorf("%w: decreasing lap numbers", ErrInvalidLapValidityInput)
			}
		}
		result.Diagnostics.ReconciledLaps = lapEvents[len(lapEvents)-1].lapNumber - lapEvents[0].lapNumber
	} else if len(resetIndices) > 0 {
		result.Diagnostics.ReconciledLaps = len(resetIndices)
	}

	provenance := strategyprojection.Provenance{
		Kind:     strategyprojection.ProvenanceDerived,
		SourceID: session.ID,
	}
	result.Temporal.LapBoundaries = reconcileLapBoundaries(lapEvents, resetIndices, lapDistFrequency, provenance)
	result.Laps, result.Diagnostics.UsableLapTimeRows = buildLapRecords(
		lapEvents,
		readEvents(grouped["lap time"]),
	)
	if len(lapEvents) == 0 {
		result.Laps = buildResetOnlyLapRecords(resetIndices, lapDistFrequency)
	}

	labelPitLaps(result.Laps, readEvents(grouped["in pits"]))
	labelIncidentLaps(result.Laps, readEvents(grouped["lastimpactmagnitude"]))
	labelTrafficLaps(
		result.Laps,
		resetIndices,
		lapDistFrequency,
		grouped["time behind next"],
	)
	labelPaceOutliers(result.Laps)
	for index := range result.Laps {
		if !result.Laps[index].Complete {
			addLapLabel(&result.Laps[index], LapLabelIncomplete)
		}
		result.Laps[index].FamilyUse = familyUseForLap(result.Laps[index])
	}

	result.Temporal.StintBoundaries = inferStintBoundaries(
		session.ID,
		result.Laps,
		lapEvents,
		readEvents(grouped["in pits"]),
		readEvents(grouped["tyrescompound"]),
		resetIndices,
		lapDistFrequency,
		grouped["fuel level"],
	)
	addCoverage(session.ID, &result.Temporal, continuousEnd, lapEvents)
	return result, nil
}

func groupPagesBySource(session HistoricalSession, pages []HistoricalPage) (map[string][]HistoricalPage, error) {
	channels := make(map[string]HistoricalChannel, len(session.Channels))
	for _, channel := range session.Channels {
		channels[channel.ID] = channel
	}
	grouped := make(map[string][]HistoricalPage)
	for _, page := range pages {
		channel, ok := channels[page.ChannelID]
		if !ok {
			return nil, fmt.Errorf("%w: unknown channel %q", ErrInvalidLapValidityInput, page.ChannelID)
		}
		if channel.Sampling != page.Sampling {
			return nil, fmt.Errorf("%w: sampling mismatch for %q", ErrInvalidLapValidityInput, channel.SourceName)
		}
		key := strings.ToLower(strings.TrimSpace(channel.SourceName))
		grouped[key] = append(grouped[key], page)
	}
	return grouped, nil
}

func readLapEvents(pages []HistoricalPage) []observedLapEvent {
	var events []observedLapEvent
	for _, page := range pages {
		for _, sample := range page.Samples {
			value, ok := firstNumber(sample.Values)
			if sample.TimestampSeconds == nil || !ok || value < 0 || value > math.MaxInt32 {
				continue
			}
			events = append(events, observedLapEvent{
				index: sample.Index, seconds: *sample.TimestampSeconds, lapNumber: int(value),
			})
		}
	}
	sort.Slice(events, func(i, j int) bool {
		if events[i].seconds == events[j].seconds {
			return events[i].index < events[j].index
		}
		return events[i].seconds < events[j].seconds
	})
	return events
}

func readEvents(pages []HistoricalPage) []observedEvent {
	var events []observedEvent
	for _, page := range pages {
		for _, sample := range page.Samples {
			if sample.TimestampSeconds == nil {
				continue
			}
			events = append(events, observedEvent{seconds: *sample.TimestampSeconds, values: sample.Values})
		}
	}
	sort.SliceStable(events, func(i, j int) bool { return events[i].seconds < events[j].seconds })
	return events
}

func readLapDistResets(pages []HistoricalPage) ([]int64, int, float64) {
	frequency := 0
	var samples []HistoricalSample
	for _, page := range pages {
		if page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz <= 0 {
			continue
		}
		if frequency == 0 {
			frequency = page.Sampling.FrequencyHz
		}
		if page.Sampling.FrequencyHz != frequency {
			return nil, 0, 0
		}
		samples = append(samples, page.Samples...)
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i].Index < samples[j].Index })
	var resets []int64
	for index := 1; index < len(samples); index++ {
		left, right := samples[index-1], samples[index]
		if right.Index != left.Index+1 {
			continue
		}
		before, beforeOK := firstNumber(left.Values)
		after, afterOK := firstNumber(right.Values)
		if beforeOK && afterOK && before-after > lapDistResetMinimumMeters {
			resets = append(resets, right.Index)
		}
	}
	continuousEnd := 0.0
	if frequency > 0 && len(samples) > 0 {
		continuousEnd = float64(samples[len(samples)-1].Index+1) / float64(frequency)
	}
	return resets, frequency, continuousEnd
}

func continuousCoverageEnd(channels ...[]HistoricalPage) float64 {
	selectedFrequency := 0
	selectedEnd := 0.0
	for _, pages := range channels {
		for _, page := range pages {
			frequency := page.Sampling.FrequencyHz
			if page.Sampling.Kind != SamplingContinuousImplicitFrequency || frequency <= 0 || len(page.Samples) == 0 {
				continue
			}
			maximumIndex := page.Samples[0].Index
			for _, sample := range page.Samples[1:] {
				if sample.Index > maximumIndex {
					maximumIndex = sample.Index
				}
			}
			end := float64(maximumIndex+1) / float64(frequency)
			if selectedFrequency == 0 || frequency < selectedFrequency ||
				(frequency == selectedFrequency && end > selectedEnd) {
				selectedFrequency = frequency
				selectedEnd = end
			}
		}
	}
	return selectedEnd
}

func reconcileLapBoundaries(
	events []observedLapEvent,
	resets []int64,
	resetFrequency int,
	provenance strategyprojection.Provenance,
) []strategyprojection.LapBoundary {
	boundaries := make([]strategyprojection.LapBoundary, 0, max(len(events), len(resets)))
	difference := float64(len(resets) - len(events))
	quality := strategyprojection.PresenceUnknown
	if len(events) == len(resets) && len(events) > 0 {
		quality = strategyprojection.PresenceValid
	}
	for _, event := range events {
		source := strategyprojection.LapBoundarySourceLapEvent
		locationPresence := strategyprojection.PresenceMissing
		if len(resets) > 0 {
			source = strategyprojection.LapBoundarySourceReconciled
			locationPresence = quality
		}
		boundaries = append(boundaries, strategyprojection.LapBoundary{
			LapNumber:  event.lapNumber,
			Timestamp:  secondsTimestamp(event.seconds),
			Source:     source,
			Quality:    quality,
			Provenance: provenance,
			Confidence: strategyprojection.Confidence{
				SampleSize: 2, RangeLower: floatPointer(difference), RangeUpper: floatPointer(difference),
				ComputationVersion: lapValidityComputationVersion,
			},
			Location: strategyprojection.TrackLocation{
				NormalizedDistance: 0,
				Presence:           locationPresence,
			},
		})
	}
	if len(events) > 0 && len(resets) > len(events) && resetFrequency > 0 {
		for _, reset := range resets[len(events):] {
			boundaries = append(boundaries, strategyprojection.LapBoundary{
				Timestamp:  secondsTimestamp(float64(reset) / float64(resetFrequency)),
				Source:     strategyprojection.LapBoundarySourceLapDistReset,
				Quality:    strategyprojection.PresenceUnknown,
				Provenance: provenance,
				Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: lapValidityComputationVersion},
				Location:   strategyprojection.TrackLocation{Presence: strategyprojection.PresenceUnknown},
			})
		}
	}
	if len(events) == 0 {
		for index, reset := range resets {
			seconds := float64(reset)
			if resetFrequency > 0 {
				seconds /= float64(resetFrequency)
			}
			boundaries = append(boundaries, strategyprojection.LapBoundary{
				LapNumber:  index + 1,
				Timestamp:  secondsTimestamp(seconds),
				Source:     strategyprojection.LapBoundarySourceLapDistReset,
				Quality:    strategyprojection.PresenceUnknown,
				Provenance: provenance,
				Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: lapValidityComputationVersion},
				Location:   strategyprojection.TrackLocation{Presence: strategyprojection.PresenceUnknown},
			})
		}
	}
	return boundaries
}

func buildLapRecords(events []observedLapEvent, lapTimes []observedEvent) ([]AnalyzedLap, int) {
	laps := make([]AnalyzedLap, 0, len(events))
	usable := 0
	for index, event := range events {
		lap := AnalyzedLap{Number: event.lapNumber, End: secondsTimestamp(event.seconds), Labels: []LapLabel{}}
		if index > 0 {
			start := secondsTimestamp(events[index-1].seconds)
			lap.Start = &start
		}
		if lapTime, ok := eventNumberAt(lapTimes, event.seconds); ok && lapTime > 0 {
			lap.LapTimeSeconds = floatPointer(lapTime)
			lap.Complete = true
			usable++
		}
		if index == 0 {
			addLapLabel(&lap, LapLabelOutLap)
		}
		laps = append(laps, lap)
	}
	return laps, usable
}

func buildResetOnlyLapRecords(resets []int64, frequency int) []AnalyzedLap {
	if frequency <= 0 {
		return []AnalyzedLap{}
	}
	laps := make([]AnalyzedLap, 0, len(resets))
	for index, reset := range resets {
		lap := AnalyzedLap{
			Number: index + 1,
			End:    secondsTimestamp(float64(reset) / float64(frequency)),
			Labels: []LapLabel{LapLabelIncomplete},
		}
		if index == 0 {
			addLapLabel(&lap, LapLabelOutLap)
		} else {
			start := laps[index-1].End
			lap.Start = &start
		}
		laps = append(laps, lap)
	}
	return laps
}

func labelPitLaps(laps []AnalyzedLap, events []observedEvent) {
	previousPit := false
	for index := range laps {
		pit := eventBooleanStateAt(events, timestampSeconds(laps[index].End))
		if pit {
			addLapLabel(&laps[index], LapLabelPit)
			if index > 0 && !previousPit {
				addLapLabel(&laps[index], LapLabelInLap)
			}
		} else if previousPit {
			addLapLabel(&laps[index], LapLabelOutLap)
		}
		previousPit = pit
	}
}

func labelIncidentLaps(laps []AnalyzedLap, events []observedEvent) {
	for _, event := range events {
		active, ok := firstBoolean(event.values)
		if !ok || !active {
			continue
		}
		if index := lapIndexAt(laps, event.seconds); index >= 0 && index < len(laps) {
			addLapLabel(&laps[index], LapLabelIncidentOfftrack)
		}
	}
}

func labelTrafficLaps(
	laps []AnalyzedLap,
	resets []int64,
	lapDistFrequency int,
	pages []HistoricalPage,
) {
	if lapDistFrequency <= 0 {
		return
	}
	for _, page := range pages {
		if page.Sampling.FrequencyHz <= 0 {
			continue
		}
		for _, sample := range page.Samples {
			gap, ok := firstNumber(sample.Values)
			if !ok || math.Abs(gap) < 0.05 || math.Abs(gap) > trafficMaximumGapSeconds {
				continue
			}
			lapDistIndex := sample.Index * int64(lapDistFrequency) / int64(page.Sampling.FrequencyHz)
			lapIndex := sort.Search(len(resets), func(i int) bool { return resets[i] >= lapDistIndex })
			if lapIndex >= 0 && lapIndex < len(laps) {
				addLapLabel(&laps[lapIndex], LapLabelTraffic)
			}
		}
	}
}

func labelPaceOutliers(laps []AnalyzedLap) {
	var clean []float64
	for _, lap := range laps {
		if lap.LapTimeSeconds != nil && !hasAnyLabel(lap, LapLabelOutLap, LapLabelInLap, LapLabelPit, LapLabelIncidentOfftrack) {
			clean = append(clean, *lap.LapTimeSeconds)
		}
	}
	if len(clean) < 5 {
		return
	}
	median := medianFloat(clean)
	deviations := make([]float64, len(clean))
	for index, value := range clean {
		deviations[index] = math.Abs(value - median)
	}
	threshold := math.Max(3*medianFloat(deviations), median*0.05)
	for index := range laps {
		if laps[index].LapTimeSeconds != nil && math.Abs(*laps[index].LapTimeSeconds-median) > threshold {
			addLapLabel(&laps[index], LapLabelPaceOutlier)
		}
	}
}

func inferStintBoundaries(
	sessionID string,
	laps []AnalyzedLap,
	lapEvents []observedLapEvent,
	pitEvents []observedEvent,
	tyreEvents []observedEvent,
	resetIndices []int64,
	lapDistFrequency int,
	fuelPages []HistoricalPage,
) []strategyprojection.StintBoundary {
	candidates := make(map[int]stintCandidate)
	for _, entry := range booleanEntries(pitEvents) {
		if entry.seconds <= firstLapSeconds(lapEvents) {
			continue
		}
		index := lapEventIndexAtOrAfter(lapEvents, entry.seconds)
		addStintCandidate(candidates, stintCandidate{
			lapIndex: index, cause: strategyprojection.StintCausePit,
			presence: strategyprojection.PresenceValid, sampleSize: 1,
		})
	}
	for _, change := range valueChanges(tyreEvents) {
		index := lapEventIndexAtOrAfter(lapEvents, change.seconds)
		addStintCandidate(candidates, stintCandidate{
			lapIndex: index, cause: strategyprojection.StintCauseTyreChange,
			presence: strategyprojection.PresenceValid, sampleSize: 2,
		})
	}
	fuelByLap := continuousLapEndValues(fuelPages, resetIndices, lapDistFrequency)
	for index := 1; index < len(fuelByLap); index++ {
		delta := fuelByLap[index] - fuelByLap[index-1]
		if delta <= fuelJumpMinimumLitres {
			continue
		}
		candidateDelta := delta
		addStintCandidate(candidates, stintCandidate{
			lapIndex: index, cause: strategyprojection.StintCauseFuelJump,
			presence: strategyprojection.PresenceUnknown, sampleSize: 2, delta: &candidateDelta,
		})
	}

	indices := make([]int, 0, len(candidates))
	for index := range candidates {
		if index >= 0 && index < len(laps) {
			indices = append(indices, index)
		}
	}
	sort.Ints(indices)
	boundaries := make([]strategyprojection.StintBoundary, 0, len(indices))
	for ordinal, index := range indices {
		candidate := candidates[index]
		confidence := strategyprojection.Confidence{
			SampleSize: candidate.sampleSize, ComputationVersion: lapValidityComputationVersion,
		}
		if candidate.delta != nil {
			confidence.RangeLower = floatPointer(*candidate.delta)
			confidence.RangeUpper = floatPointer(*candidate.delta)
		}
		boundaries = append(boundaries, strategyprojection.StintBoundary{
			StintNumber: ordinal + 2,
			Timestamp:   laps[index].End,
			Cause:       candidate.cause,
			Presence:    candidate.presence,
			Provenance: strategyprojection.Provenance{
				Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID,
			},
			Confidence: confidence,
		})
	}
	return boundaries
}

func addCoverage(
	sessionID string,
	temporal *strategyprojection.TemporalSegmentsV1,
	continuousEnd float64,
	lapEvents []observedLapEvent,
) {
	if continuousEnd <= 0 {
		return
	}
	eventEnd := continuousEnd
	if len(lapEvents) > 0 {
		eventEnd = lapEvents[len(lapEvents)-1].seconds
	}
	coveredEnd := math.Min(continuousEnd, eventEnd)
	timelineEnd := math.Max(continuousEnd, eventEnd)
	start := secondsTimestamp(0)
	end := secondsTimestamp(coveredEnd)
	duration := coveredEnd
	temporal.Segments = append(temporal.Segments, strategyprojection.ContinuousSegment{
		SegmentID: "continuous-1", SessionStartTs: start, SessionEndTs: end,
		Reason: "local_driver_window", Presence: strategyprojection.PresenceValid,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceObserved, SourceID: sessionID},
		Confidence: strategyprojection.Confidence{
			SampleSize: 1, RangeLower: floatPointer(duration), RangeUpper: floatPointer(duration),
			ComputationVersion: lapValidityComputationVersion,
		},
	})
	if timelineEnd-coveredEnd <= coverageClockToleranceSeconds {
		return
	}
	temporal.Gaps = append(temporal.Gaps, strategyprojection.CoverageGap{
		GapID: "coverage-gap-1", StartTs: end, EndTs: secondsTimestamp(timelineEnd),
		Reason: "no_coverage", Presence: strategyprojection.PresenceMissing,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID},
	})
}

func familyUseForLap(lap AnalyzedLap) []LapFamilyUse {
	families := []DerivationFamily{
		FamilyFuelConsumption,
		FamilyVirtualEnergyConsumption,
		FamilyCombinedStintPaceCurve,
		FamilyTyreDegradation,
		FamilyPit,
		FamilySavingCost,
		FamilyObservedStrategy,
	}
	result := make([]LapFamilyUse, 0, len(families))
	for _, family := range families {
		var reasons []LapExclusionReason
		if !lap.Complete {
			reasons = append(reasons, LapExclusionIncomplete)
		}
		switch family {
		case FamilyFuelConsumption, FamilyVirtualEnergyConsumption:
			reasons = appendStateExclusions(reasons, lap, false)
		case FamilyCombinedStintPaceCurve, FamilyTyreDegradation, FamilySavingCost:
			reasons = appendStateExclusions(reasons, lap, true)
		case FamilyPit, FamilyObservedStrategy:
			// Pit and observed strategy retain pit/out/in laps by definition.
		}
		result = append(result, LapFamilyUse{
			Family: family, Included: len(reasons) == 0, ExclusionReasons: reasons,
		})
	}
	return result
}

func appendStateExclusions(reasons []LapExclusionReason, lap AnalyzedLap, paceOutlier bool) []LapExclusionReason {
	for _, pair := range []struct {
		label  LapLabel
		reason LapExclusionReason
	}{
		{LapLabelOutLap, LapExclusionOutLap},
		{LapLabelInLap, LapExclusionInLap},
		{LapLabelPit, LapExclusionPit},
		{LapLabelIncidentOfftrack, LapExclusionIncidentOfftrack},
	} {
		if lap.HasLabel(pair.label) {
			reasons = append(reasons, pair.reason)
		}
	}
	if paceOutlier && lap.HasLabel(LapLabelPaceOutlier) {
		reasons = append(reasons, LapExclusionPaceOutlier)
	}
	return reasons
}

func continuousLapEndValues(pages []HistoricalPage, resets []int64, lapDistFrequency int) []float64 {
	if lapDistFrequency <= 0 {
		return nil
	}
	var samples []HistoricalSample
	frequency := 0
	for _, page := range pages {
		if page.Sampling.FrequencyHz <= 0 {
			continue
		}
		frequency = page.Sampling.FrequencyHz
		samples = append(samples, page.Samples...)
	}
	if frequency <= 0 || len(samples) == 0 {
		return nil
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i].Index < samples[j].Index })
	values := make([]float64, 0, len(resets)+1)
	ends := append(append([]int64(nil), resets...), math.MaxInt64)
	for _, lapDistEnd := range ends {
		target := lapDistEnd
		if target != math.MaxInt64 {
			target = target * int64(frequency) / int64(lapDistFrequency)
		}
		position := sort.Search(len(samples), func(i int) bool { return samples[i].Index > target }) - 1
		if target == math.MaxInt64 {
			position = len(samples) - 1
		}
		if position < 0 {
			continue
		}
		if value, ok := firstNumber(samples[position].Values); ok {
			values = append(values, value)
		}
	}
	return values
}

func addStintCandidate(candidates map[int]stintCandidate, candidate stintCandidate) {
	if candidate.lapIndex < 0 {
		return
	}
	current, exists := candidates[candidate.lapIndex]
	if !exists || stintCausePriority(candidate.cause) > stintCausePriority(current.cause) {
		candidates[candidate.lapIndex] = candidate
	}
}

func stintCausePriority(cause strategyprojection.StintBoundaryCause) int {
	switch cause {
	case strategyprojection.StintCausePit:
		return 3
	case strategyprojection.StintCauseTyreChange:
		return 2
	case strategyprojection.StintCauseFuelJump:
		return 1
	default:
		return 0
	}
}

func booleanEntries(events []observedEvent) []observedEvent {
	entries := []observedEvent{}
	previous := false
	for _, event := range events {
		active, ok := firstBoolean(event.values)
		if ok && active && !previous {
			entries = append(entries, event)
		}
		if ok {
			previous = active
		}
	}
	return entries
}

func valueChanges(events []observedEvent) []observedEvent {
	changes := []observedEvent{}
	for index := 1; index < len(events); index++ {
		if !equalValues(events[index-1].values, events[index].values) {
			changes = append(changes, events[index])
		}
	}
	return changes
}

func equalValues(left, right []HistoricalValue) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index].Present != right[index].Present || left[index].Scalar != right[index].Scalar {
			return false
		}
	}
	return true
}

func eventBooleanStateAt(events []observedEvent, seconds float64) bool {
	state := false
	for _, event := range events {
		if event.seconds > seconds {
			break
		}
		if value, ok := firstBoolean(event.values); ok {
			state = value
		}
	}
	return state
}

func eventNumberAt(events []observedEvent, seconds float64) (float64, bool) {
	for _, event := range events {
		if math.Abs(event.seconds-seconds) <= 0.01 {
			return firstNumber(event.values)
		}
	}
	return 0, false
}

func firstNumber(values []HistoricalValue) (float64, bool) {
	for _, value := range values {
		if !value.Present || value.Quality == QualityMissing || value.Quality == QualityInvalid {
			continue
		}
		switch value.Scalar.Kind {
		case ScalarNumber:
			if !math.IsNaN(value.Scalar.Number) && !math.IsInf(value.Scalar.Number, 0) {
				return value.Scalar.Number, true
			}
		case ScalarInteger:
			return float64(value.Scalar.Integer), true
		}
	}
	return 0, false
}

func firstBoolean(values []HistoricalValue) (bool, bool) {
	for _, value := range values {
		if !value.Present || value.Quality == QualityMissing || value.Quality == QualityInvalid {
			continue
		}
		switch value.Scalar.Kind {
		case ScalarBoolean:
			return value.Scalar.Boolean, true
		case ScalarInteger:
			return value.Scalar.Integer != 0, true
		case ScalarNumber:
			return value.Scalar.Number != 0, true
		}
	}
	return false, false
}

func lapIndexAt(laps []AnalyzedLap, seconds float64) int {
	return sort.Search(len(laps), func(index int) bool {
		return timestampSeconds(laps[index].End) >= seconds
	})
}

func lapEventIndexAtOrAfter(events []observedLapEvent, seconds float64) int {
	return sort.Search(len(events), func(index int) bool { return events[index].seconds >= seconds })
}

func firstLapSeconds(events []observedLapEvent) float64 {
	if len(events) == 0 {
		return math.Inf(1)
	}
	return events[0].seconds
}

func addLapLabel(lap *AnalyzedLap, label LapLabel) {
	if !lap.HasLabel(label) {
		lap.Labels = append(lap.Labels, label)
	}
}

func hasAnyLabel(lap AnalyzedLap, labels ...LapLabel) bool {
	for _, label := range labels {
		if lap.HasLabel(label) {
			return true
		}
	}
	return false
}

func medianFloat(values []float64) float64 {
	ordered := append([]float64(nil), values...)
	sort.Float64s(ordered)
	middle := len(ordered) / 2
	if len(ordered)%2 == 1 {
		return ordered[middle]
	}
	return (ordered[middle-1] + ordered[middle]) / 2
}

func secondsTimestamp(seconds float64) time.Time {
	return time.UnixMilli(int64(math.Round(seconds * 1000))).UTC()
}

func timestampSeconds(value time.Time) float64 {
	return float64(value.UnixMilli()) / 1000
}

func floatPointer(value float64) *float64 {
	return &value
}
