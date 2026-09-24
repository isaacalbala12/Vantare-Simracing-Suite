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
	lapValidityComputationVersion = "lap-validity.v3"
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
	// Only the effective view sets this after validating a complete correction set.
	// Original observations and stored correction preconditions leave it empty.
	CorrectionID     string               `json:"correctionId,omitempty"`
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
	ReconciledLaps     int                                `json:"reconciledLaps"`
	LapEventRows       int                                `json:"lapEventRows"`
	DuplicateLapEvents int                                `json:"duplicateLapEvents,omitempty"`
	UsableLapTimeRows  int                                `json:"usableLapTimeRows"`
	LapDistResets      int                                `json:"lapDistResets"`
	TemporalBridge     TemporalAlignmentStatus            `json:"temporalBridge"`
	TemporalChannels   map[string]TemporalAlignmentStatus `json:"temporalChannels,omitempty"`
}

type LapValidityAnalysis struct {
	// Empty on legacy persisted results: never infer the current version on read.
	SessionID          string                                `json:"sessionId,omitempty"`
	ComputationVersion string                                `json:"computationVersion,omitempty"`
	Temporal           strategyprojection.TemporalSegmentsV1 `json:"temporal"`
	Laps               []AnalyzedLap                         `json:"laps"`
	Diagnostics        LapValidityDiagnostics                `json:"diagnostics"`
}

type observedLapEvent struct {
	index        int64
	seconds      float64
	lapNumber    int
	qualityValid bool
}

type observedEvent struct {
	seconds float64
	values  []HistoricalValue
}

type observedLapReset struct {
	index        int64
	seconds      *float64
	qualityValid bool
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
	return AnalyzeAlignedLapValidity(BuildTemporalAlignment(session, pages))
}

// AnalyzeAlignedLapValidity reuses one already validated temporal view across
// validity and downstream derivations.
func AnalyzeAlignedLapValidity(alignment TemporalAlignmentResult) (LapValidityAnalysis, error) {
	session, pages := alignment.Session, alignment.Pages
	if strings.TrimSpace(session.ID) == "" {
		return LapValidityAnalysis{}, fmt.Errorf("%w: session id", ErrInvalidLapValidityInput)
	}
	grouped, err := groupPagesBySource(session, pages)
	if err != nil {
		return LapValidityAnalysis{}, err
	}

	lapEvents, duplicateLapEvents := readLapEvents(grouped["lap"])
	resets, resetFrequency := readLapDistResetObservations(grouped["lap dist"])
	continuousStart, continuousEnd, hasContinuousCoverage := continuousCoverageWindow(
		grouped["ambient temperature"],
		grouped["track temperature"],
		grouped["wind heading"],
		grouped["wind speed"],
		grouped["lap dist"],
	)
	if len(lapEvents) == 0 && alignedResetCount(resets) == 0 {
		return LapValidityAnalysis{}, fmt.Errorf("%w: no lap event or lap distance reset", ErrInvalidLapValidityInput)
	}

	result := LapValidityAnalysis{
		SessionID:          session.ID,
		ComputationVersion: lapValidityComputationVersion,
		Temporal: strategyprojection.TemporalSegmentsV1{
			ContractVersion: strategyprojection.ContractVersionTemporalSegmentsV1,
			Segments:        []strategyprojection.ContinuousSegment{},
			Gaps:            []strategyprojection.CoverageGap{},
			LapBoundaries:   []strategyprojection.LapBoundary{},
			StintBoundaries: []strategyprojection.StintBoundary{},
		},
		Laps: []AnalyzedLap{},
		Diagnostics: LapValidityDiagnostics{
			TemporalBridge:   alignment.Bridge,
			TemporalChannels: alignment.Channels,
		},
	}
	result.Diagnostics.LapEventRows = len(lapEvents)
	result.Diagnostics.DuplicateLapEvents = duplicateLapEvents
	result.Diagnostics.LapDistResets = len(resets)
	if len(lapEvents) > 1 {
		for index := 1; index < len(lapEvents); index++ {
			if lapEvents[index].lapNumber < lapEvents[index-1].lapNumber {
				return LapValidityAnalysis{}, fmt.Errorf("%w: decreasing lap numbers", ErrInvalidLapValidityInput)
			}
		}
		result.Diagnostics.ReconciledLaps = lapEvents[len(lapEvents)-1].lapNumber - lapEvents[0].lapNumber
	} else if len(resets) > 0 {
		result.Diagnostics.ReconciledLaps = alignedResetCount(resets)
	}

	provenance := strategyprojection.Provenance{
		Kind:     strategyprojection.ProvenanceDerived,
		SourceID: session.ID,
	}
	result.Temporal.LapBoundaries = reconcileLapBoundaries(lapEvents, resets, resetFrequency, alignment.Bridge.Aligned, provenance)
	result.Laps, result.Diagnostics.UsableLapTimeRows = buildLapRecords(
		lapEvents,
		readEvents(grouped["lap time"]),
	)
	if len(lapEvents) == 0 {
		result.Laps = buildResetOnlyLapRecords(resets)
	}

	labelPitLaps(result.Laps, readEvents(grouped["in pits"]))
	labelIncidentLaps(result.Laps, readEvents(grouped["lastimpactmagnitude"]))
	labelTrafficLaps(
		result.Laps,
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
		grouped["fuel level"],
	)
	addCoverage(session.ID, &result.Temporal, continuousStart, continuousEnd, hasContinuousCoverage, lapEvents)
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

func readLapEvents(pages []HistoricalPage) ([]observedLapEvent, int) {
	var events []observedLapEvent
	for _, page := range pages {
		for _, sample := range page.Samples {
			value, ok := firstNumber(sample.Values)
			if sample.TimestampSeconds == nil || !ok || value < 0 || value > math.MaxInt32 {
				continue
			}
			validValue, qualityValid := singleValidNumber(sample.Values)
			events = append(events, observedLapEvent{
				index: sample.Index, seconds: *sample.TimestampSeconds, lapNumber: int(value),
				qualityValid: qualityValid && validValue == value && value == math.Trunc(value),
			})
		}
	}
	sort.Slice(events, func(i, j int) bool {
		if events[i].seconds == events[j].seconds {
			return events[i].index < events[j].index
		}
		return events[i].seconds < events[j].seconds
	})
	deduped := events[:0]
	duplicates := 0
	for index, event := range events {
		if index > 0 && event.lapNumber == events[index-1].lapNumber {
			duplicates++
			continue
		}
		deduped = append(deduped, event)
	}
	return deduped, duplicates
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

func readLapDistResetObservations(pages []HistoricalPage) ([]observedLapReset, int) {
	// Recorded pages arrive in sample order. Keep only the previous sample on
	// that path; retain the sorted path for callers with unordered pages.
	var scan orderedLapDistResetScan
	for _, page := range pages {
		if !scan.accept(page) {
			return readUnorderedLapDistResetObservations(pages)
		}
	}
	return scan.finish()
}

// The authorized reader supplies Lap Dist pages in index order. This state can
// consume them as they arrive without retaining the continuous signal. Raw LMU
// pages still need GPS alignment before their reset timestamps can be used.
type orderedLapDistResetScan struct {
	resets       []observedLapReset
	previous     HistoricalSample
	havePrevious bool
	frequency    int
	invalid      bool
}

func (scan *orderedLapDistResetScan) accept(page HistoricalPage) bool {
	if scan.invalid || page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz <= 0 {
		return true
	}
	if scan.frequency == 0 {
		scan.frequency = page.Sampling.FrequencyHz
	}
	if page.Sampling.FrequencyHz != scan.frequency {
		scan.invalid = true
		return true
	}
	for _, sample := range page.Samples {
		if page.Sampling.Origin != TimeOriginSourceTimestamp {
			sample.TimestampSeconds = nil
		}
		if scan.havePrevious && sample.Index <= scan.previous.Index {
			return false
		}
		if scan.havePrevious {
			if reset, ok := lapDistResetBetween(scan.previous, sample); ok {
				scan.resets = append(scan.resets, reset)
			}
		}
		scan.previous, scan.havePrevious = sample, true
	}
	return true
}

func (scan orderedLapDistResetScan) finish() ([]observedLapReset, int) {
	if scan.invalid {
		return nil, 0
	}
	return scan.resets, scan.frequency
}

func readUnorderedLapDistResetObservations(pages []HistoricalPage) ([]observedLapReset, int) {
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
			return nil, 0
		}
		for _, sample := range page.Samples {
			if page.Sampling.Origin != TimeOriginSourceTimestamp {
				sample.TimestampSeconds = nil
			}
			samples = append(samples, sample)
		}
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i].Index < samples[j].Index })
	var resets []observedLapReset
	for index := 1; index < len(samples); index++ {
		left, right := samples[index-1], samples[index]
		if reset, ok := lapDistResetBetween(left, right); ok {
			resets = append(resets, reset)
		}
	}
	return resets, frequency
}

func lapDistResetBetween(left, right HistoricalSample) (observedLapReset, bool) {
	if right.Index != left.Index+1 {
		return observedLapReset{}, false
	}
	before, beforeOK := firstNumber(left.Values)
	after, afterOK := firstNumber(right.Values)
	if !beforeOK || !afterOK || !(before-after > lapDistResetMinimumMeters) {
		return observedLapReset{}, false
	}
	validBefore, leftValid := singleValidNumber(left.Values)
	validAfter, rightValid := singleValidNumber(right.Values)
	reset := observedLapReset{index: right.Index, qualityValid: leftValid && rightValid && validBefore == before && validAfter == after}
	if right.TimestampSeconds != nil {
		seconds := *right.TimestampSeconds
		reset.seconds = &seconds
	}
	return reset, true
}

func readLapDistResets(pages []HistoricalPage) ([]int64, int, float64) {
	resets, frequency := readLapDistResetObservations(pages)
	indices := make([]int64, 0, len(resets))
	for _, reset := range resets {
		indices = append(indices, reset.index)
	}
	continuousEnd := 0.0
	for _, page := range pages {
		for _, sample := range page.Samples {
			if frequency > 0 {
				continuousEnd = math.Max(continuousEnd, float64(sample.Index+1)/float64(frequency))
			}
		}
	}
	return indices, frequency, continuousEnd
}

func continuousCoverageWindow(channels ...[]HistoricalPage) (float64, float64, bool) {
	for _, pages := range channels {
		if start, end, ok := channelCoverageWindow(pages); ok {
			return start, end, true
		}
	}
	return 0, 0, false
}

func channelCoverageWindow(pages []HistoricalPage) (float64, float64, bool) {
	var scan orderedCoverageScan
	for _, page := range pages {
		if !scan.accept(page) {
			return unorderedChannelCoverageWindow(pages)
		}
	}
	return scan.finish()
}

// orderedCoverageScan keeps only the endpoints and previous aligned sample.
// A page visitor can feed it without retaining the continuous signal.
type orderedCoverageScan struct {
	frequency int
	first     float64
	last      float64
	lastIndex int64
	count     int
	invalid   bool
}

// false means the input is out of index order; in-memory callers retain the
// sorted fallback. Authorized correction pages arrive in index order.
func (scan *orderedCoverageScan) accept(page HistoricalPage) bool {
	if page.Sampling.Kind != SamplingContinuousImplicitFrequency ||
		page.Sampling.Origin != TimeOriginSourceTimestamp || page.Sampling.FrequencyHz <= 0 ||
		(scan.frequency != 0 && page.Sampling.FrequencyHz != scan.frequency) {
		scan.invalid = true
		return true
	}
	if scan.frequency == 0 {
		scan.frequency = page.Sampling.FrequencyHz
	}
	for _, sample := range page.Samples {
		if scan.count > 0 && sample.Index <= scan.lastIndex {
			return false
		}
		if sample.TimestampSeconds == nil ||
			(scan.count > 0 && (sample.Index != scan.lastIndex+1 || *sample.TimestampSeconds <= scan.last)) {
			scan.invalid = true
		}
		if scan.count == 0 && sample.TimestampSeconds != nil {
			scan.first = *sample.TimestampSeconds
		}
		if sample.TimestampSeconds != nil {
			scan.last = *sample.TimestampSeconds
		}
		scan.lastIndex = sample.Index
		scan.count++
	}
	return true
}

func (scan orderedCoverageScan) finish() (float64, float64, bool) {
	if scan.invalid || scan.count < 2 {
		return 0, 0, false
	}
	return scan.first, scan.last, true
}

func unorderedChannelCoverageWindow(pages []HistoricalPage) (float64, float64, bool) {
	var samples []HistoricalSample
	frequency := 0
	for _, page := range pages {
		if page.Sampling.Kind != SamplingContinuousImplicitFrequency ||
			page.Sampling.Origin != TimeOriginSourceTimestamp || page.Sampling.FrequencyHz <= 0 {
			return 0, 0, false
		}
		if frequency == 0 {
			frequency = page.Sampling.FrequencyHz
		}
		if page.Sampling.FrequencyHz != frequency {
			return 0, 0, false
		}
		samples = append(samples, page.Samples...)
	}
	if len(samples) < 2 {
		return 0, 0, false
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i].Index < samples[j].Index })
	for index, sample := range samples {
		if sample.TimestampSeconds == nil ||
			(index > 0 && (sample.Index != samples[index-1].Index+1 ||
				*sample.TimestampSeconds <= *samples[index-1].TimestampSeconds)) {
			return 0, 0, false
		}
	}
	return *samples[0].TimestampSeconds, *samples[len(samples)-1].TimestampSeconds, true
}

func reconcileLapBoundaries(
	events []observedLapEvent,
	resets []observedLapReset,
	resetFrequency int,
	bridgeAligned bool,
	provenance strategyprojection.Provenance,
) []strategyprojection.LapBoundary {
	boundaries := make([]strategyprojection.LapBoundary, 0, max(len(events), alignedResetCount(resets)))
	for index, event := range events {
		boundaries = append(boundaries, strategyprojection.LapBoundary{
			LapNumber:  event.lapNumber,
			Timestamp:  secondsTimestamp(event.seconds),
			Source:     strategyprojection.LapBoundarySourceLapEvent,
			Quality:    reconciledLapEventQuality(events, resets, resetFrequency, bridgeAligned, index),
			Provenance: provenance,
			Confidence: strategyprojection.Confidence{
				SampleSize: 1, ComputationVersion: lapValidityComputationVersion,
			},
			Location: strategyprojection.TrackLocation{
				NormalizedDistance: 0,
				Presence:           strategyprojection.PresenceMissing,
			},
		})
	}
	if len(events) == 0 {
		for _, reset := range resets {
			if reset.seconds == nil {
				continue
			}
			boundaries = append(boundaries, strategyprojection.LapBoundary{
				LapNumber:  len(boundaries) + 1,
				Timestamp:  secondsTimestamp(*reset.seconds),
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

// An event anchors the boundary; an independent, clock-aligned distance reset
// must corroborate the crossing within one distance sample and match no other
// event. The first event is only the recorded initial state.
func reconciledLapEventQuality(events []observedLapEvent, resets []observedLapReset, frequency int, bridgeAligned bool, index int) strategyprojection.Presence {
	if !bridgeAligned || frequency <= 0 || index == 0 || !events[index].qualityValid ||
		events[index].lapNumber != events[index-1].lapNumber+1 || events[index].seconds <= events[index-1].seconds {
		return strategyprojection.PresenceUnknown
	}
	tolerance := 1 / float64(frequency)
	matched := -1
	for resetIndex, reset := range resets {
		if reset.seconds == nil || !reset.qualityValid || math.Abs(*reset.seconds-events[index].seconds) > tolerance {
			continue
		}
		if matched >= 0 {
			return strategyprojection.PresenceUnknown
		}
		matched = resetIndex
	}
	if matched < 0 {
		return strategyprojection.PresenceUnknown
	}
	for other := 1; other < len(events); other++ {
		if other != index && math.Abs(*resets[matched].seconds-events[other].seconds) <= tolerance {
			return strategyprojection.PresenceUnknown
		}
	}
	return strategyprojection.PresenceValid
}

func singleValidNumber(values []HistoricalValue) (float64, bool) {
	if len(values) != 1 {
		return 0, false
	}
	return numericHistoricalValue(values[0])
}

func alignedResetCount(resets []observedLapReset) int {
	count := 0
	for _, reset := range resets {
		if reset.seconds != nil {
			count++
		}
	}
	return count
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

func buildResetOnlyLapRecords(resets []observedLapReset) []AnalyzedLap {
	laps := make([]AnalyzedLap, 0, alignedResetCount(resets))
	for _, reset := range resets {
		if reset.seconds == nil {
			continue
		}
		lap := AnalyzedLap{
			Number: len(laps) + 1,
			End:    secondsTimestamp(*reset.seconds),
			Labels: []LapLabel{LapLabelIncomplete},
		}
		if len(laps) == 0 {
			addLapLabel(&lap, LapLabelOutLap)
		} else {
			start := laps[len(laps)-1].End
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
	// End-of-lap state misses a complete pit visit between two boundaries.
	// Keep that state-based labeling and include observed transitions too.
	previousEventPit := false
	for _, event := range events {
		pit, ok := firstBoolean(event.values)
		if !ok {
			continue
		}
		wasPit := previousEventPit
		previousEventPit = pit
		index := lapIndexAt(laps, event.seconds)
		if index >= len(laps) || laps[index].Start != nil && event.seconds < timestampSeconds(*laps[index].Start) {
			continue
		}
		if pit {
			addLapLabel(&laps[index], LapLabelPit)
			if !wasPit && index > 0 {
				addLapLabel(&laps[index], LapLabelInLap)
			}
		} else if wasPit {
			addLapLabel(&laps[index], LapLabelOutLap)
		}
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

func labelTrafficLaps(laps []AnalyzedLap, pages []HistoricalPage) {
	for _, page := range pages {
		if page.Sampling.Origin != TimeOriginSourceTimestamp {
			continue
		}
		for _, sample := range page.Samples {
			gap, ok := firstNumber(sample.Values)
			if sample.TimestampSeconds == nil || !ok || math.Abs(gap) < 0.05 || math.Abs(gap) > trafficMaximumGapSeconds {
				continue
			}
			lapIndex := lapIndexAt(laps, *sample.TimestampSeconds)
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
	for _, rise := range observedFuelRises(fuelPages) {
		boundarySeconds := rise.seconds
		if entry, inside, observedEntry := pitIntervalAt(pitEvents, rise.seconds); inside && !observedEntry {
			continue
		} else if inside {
			boundarySeconds = entry
		}
		if boundarySeconds <= firstLapSeconds(lapEvents) {
			continue
		}
		index := lapEventIndexAtOrAfter(lapEvents, boundarySeconds)
		if index >= len(lapEvents) {
			continue
		}
		candidateDelta := rise.delta
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
	continuousStart float64,
	continuousEnd float64,
	hasContinuousCoverage bool,
	lapEvents []observedLapEvent,
) {
	if !hasContinuousCoverage || len(lapEvents) == 0 {
		return
	}
	eventStart := lapEvents[0].seconds
	eventEnd := lapEvents[len(lapEvents)-1].seconds
	coveredStart := math.Max(continuousStart, eventStart)
	coveredEnd := math.Min(continuousEnd, eventEnd)
	if coveredEnd <= coveredStart {
		return
	}
	start := secondsTimestamp(coveredStart)
	end := secondsTimestamp(coveredEnd)
	duration := coveredEnd - coveredStart
	temporal.Segments = append(temporal.Segments, strategyprojection.ContinuousSegment{
		SegmentID: "continuous-1", SessionStartTs: start, SessionEndTs: end,
		Reason: "local_driver_window", Presence: strategyprojection.PresenceValid,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceObserved, SourceID: sessionID},
		Confidence: strategyprojection.Confidence{
			SampleSize: 1, RangeLower: floatPointer(duration), RangeUpper: floatPointer(duration),
			ComputationVersion: lapValidityComputationVersion,
		},
	})
	gapOrdinal := 1
	if math.Abs(continuousStart-eventStart) > coverageClockToleranceSeconds {
		appendCoverageGap(sessionID, temporal, gapOrdinal, math.Min(continuousStart, eventStart), coveredStart)
		gapOrdinal++
	}
	if math.Abs(continuousEnd-eventEnd) > coverageClockToleranceSeconds {
		appendCoverageGap(sessionID, temporal, gapOrdinal, coveredEnd, math.Max(continuousEnd, eventEnd))
	}
}

func appendCoverageGap(sessionID string, temporal *strategyprojection.TemporalSegmentsV1, ordinal int, start, end float64) {
	if end <= start {
		return
	}
	temporal.Gaps = append(temporal.Gaps, strategyprojection.CoverageGap{
		GapID: fmt.Sprintf("coverage-gap-%d", ordinal), StartTs: secondsTimestamp(start), EndTs: secondsTimestamp(end),
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

type fuelRise struct {
	seconds float64
	delta   float64
}

func observedFuelRises(pages []HistoricalPage) []fuelRise {
	// The authorized reader supplies fuel pages in increasing sample order.
	// Keep only the previous value and completed rises on that path; pure
	// callers with unordered pages retain the original sorted behavior.
	var scan orderedFuelRiseScan
	for _, page := range pages {
		if !scan.accept(page) {
			return unorderedFuelRises(pages)
		}
	}
	return scan.finish()
}

type orderedFuelRiseScan struct {
	rises         []fuelRise
	current       fuelRise
	previousIndex int64
	previousValue float64
	previousValid bool
	lastIndex     int64
	seen          bool
}

func (scan *orderedFuelRiseScan) accept(page HistoricalPage) bool {
	if page.Sampling.Origin != TimeOriginSourceTimestamp {
		return true
	}
	for _, sample := range page.Samples {
		if scan.seen && sample.Index <= scan.lastIndex {
			return false
		}
		scan.lastIndex, scan.seen = sample.Index, true
		scan.consume(sample)
	}
	return true
}

func (scan *orderedFuelRiseScan) flush() {
	if scan.current.delta > fuelJumpMinimumLitres {
		scan.rises = append(scan.rises, scan.current)
	}
	scan.current = fuelRise{}
}

func (scan *orderedFuelRiseScan) consume(sample HistoricalSample) {
	value, ok := firstNumber(sample.Values)
	if !ok || sample.TimestampSeconds == nil {
		scan.flush()
		scan.previousValid = false
		return
	}
	if !scan.previousValid || sample.Index != scan.previousIndex+1 {
		scan.flush()
		scan.previousIndex, scan.previousValue, scan.previousValid = sample.Index, value, true
		return
	}
	delta := value - scan.previousValue
	if delta > 0 {
		if scan.current.delta == 0 {
			scan.current.seconds = *sample.TimestampSeconds
		}
		scan.current.delta += delta
	} else if delta < 0 {
		scan.flush()
	}
	scan.previousIndex, scan.previousValue = sample.Index, value
}

func (scan *orderedFuelRiseScan) finish() []fuelRise {
	scan.flush()
	return scan.rises
}

func unorderedFuelRises(pages []HistoricalPage) []fuelRise {
	var samples []HistoricalSample
	for _, page := range pages {
		if page.Sampling.Origin != TimeOriginSourceTimestamp {
			continue
		}
		samples = append(samples, page.Samples...)
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i].Index < samples[j].Index })
	var scan orderedFuelRiseScan
	for _, sample := range samples {
		scan.consume(sample)
	}
	return scan.finish()
}

func pitIntervalAt(events []observedEvent, seconds float64) (float64, bool, bool) {
	initialized, active, observedEntry := false, false, false
	entry := 0.0
	for _, event := range events {
		state, ok := firstBoolean(event.values)
		if !ok {
			continue
		}
		if !initialized {
			initialized, active = true, state
			if state {
				entry = event.seconds
			}
			continue
		}
		if state && !active {
			entry, observedEntry = event.seconds, true
		}
		if !state && active {
			if seconds >= entry && seconds <= event.seconds {
				return entry, true, observedEntry
			}
			observedEntry = false
		}
		active = state
	}
	return entry, active && seconds >= entry, observedEntry
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
	previous, initialized := false, false
	for _, event := range events {
		active, ok := firstBoolean(event.values)
		if !ok {
			continue
		}
		if initialized && active && !previous {
			entries = append(entries, event)
		}
		previous, initialized = active, true
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
