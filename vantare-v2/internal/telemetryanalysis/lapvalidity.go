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
	lapValidityComputationVersion = "lap-validity.v2"
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
	ReconciledLaps    int                                `json:"reconciledLaps"`
	LapEventRows      int                                `json:"lapEventRows"`
	UsableLapTimeRows int                                `json:"usableLapTimeRows"`
	LapDistResets     int                                `json:"lapDistResets"`
	TemporalBridge    TemporalAlignmentStatus            `json:"temporalBridge"`
	TemporalChannels  map[string]TemporalAlignmentStatus `json:"temporalChannels,omitempty"`
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
	index     int64
	seconds   float64
	lapNumber int
}

type observedEvent struct {
	seconds float64
	values  []HistoricalValue
}

type observedLapReset struct {
	index   int64
	seconds *float64
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

	lapEvents := readLapEvents(grouped["lap"])
	resets, _ := readLapDistResetObservations(grouped["lap dist"])
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
	result.Temporal.LapBoundaries = reconcileLapBoundaries(lapEvents, resets, provenance)
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

func readLapDistResetObservations(pages []HistoricalPage) ([]observedLapReset, int) {
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
		if right.Index != left.Index+1 {
			continue
		}
		before, beforeOK := firstNumber(left.Values)
		after, afterOK := firstNumber(right.Values)
		if beforeOK && afterOK && before-after > lapDistResetMinimumMeters {
			reset := observedLapReset{index: right.Index}
			if right.TimestampSeconds != nil {
				seconds := *right.TimestampSeconds
				reset.seconds = &seconds
			}
			resets = append(resets, reset)
		}
	}
	return resets, frequency
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
	provenance strategyprojection.Provenance,
) []strategyprojection.LapBoundary {
	boundaries := make([]strategyprojection.LapBoundary, 0, max(len(events), alignedResetCount(resets)))
	for _, event := range events {
		boundaries = append(boundaries, strategyprojection.LapBoundary{
			LapNumber:  event.lapNumber,
			Timestamp:  secondsTimestamp(event.seconds),
			Source:     strategyprojection.LapBoundarySourceLapEvent,
			Quality:    strategyprojection.PresenceUnknown,
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
	var samples []HistoricalSample
	for _, page := range pages {
		if page.Sampling.Origin != TimeOriginSourceTimestamp {
			continue
		}
		samples = append(samples, page.Samples...)
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i].Index < samples[j].Index })
	var rises []fuelRise
	var previous HistoricalSample
	previousValue := 0.0
	previousValid := false
	current := fuelRise{}
	flush := func() {
		if current.delta > fuelJumpMinimumLitres {
			rises = append(rises, current)
		}
		current = fuelRise{}
	}
	for _, sample := range samples {
		value, ok := firstNumber(sample.Values)
		if !ok || sample.TimestampSeconds == nil {
			flush()
			previousValid = false
			continue
		}
		if !previousValid || sample.Index != previous.Index+1 {
			flush()
			previous, previousValue, previousValid = sample, value, true
			continue
		}
		delta := value - previousValue
		if delta > 0 {
			if current.delta == 0 {
				current.seconds = *sample.TimestampSeconds
			}
			current.delta += delta
		} else if delta < 0 {
			flush()
		}
		previous, previousValue = sample, value
	}
	flush()
	return rises
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
