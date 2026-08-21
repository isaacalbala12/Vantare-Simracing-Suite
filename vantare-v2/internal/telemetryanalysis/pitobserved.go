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
	pitObservationComputationVersion   = "pit-observation.v1"
	observedStrategyComputationVersion = "observed-strategy.v1"
	pitRiseMinimum                     = 0.01
	wearRiseMinimumPercent             = 2.0
)

const (
	pitAmbiguityClockUnaligned = "resource_clock_unaligned"
	pitAmbiguityNoRise         = "no_resource_rise_detected"
	pitRatesNote               = "degraded: pit lane interval only; no transit/service breakdown"
	reasonDegradedPit          = "degraded_no_transit_service_breakdown"
)

var (
	ErrInvalidPitObservationInput   = errors.New("invalid pit observation input")
	ErrInvalidObservedStrategyInput = errors.New("invalid observed strategy input")
)

// SessionPitObservation is the degraded A4 result for one session. Private
// samples allow honest recomputation of combination-level rate confidence.
type SessionPitObservation struct {
	SessionID     string                       `json:"sessionId"`
	CombinationID string                       `json:"combinationId"`
	Family        strategyprojection.PitFamily `json:"family"`
	fuelRates     []float64
	veRates       []float64
}

type PitObservationAggregate struct {
	CombinationID  string                       `json:"combinationId"`
	SourceSessions []string                     `json:"sourceSessions"`
	Family         strategyprojection.PitFamily `json:"family"`
}

type pitInterval struct {
	start float64
	end   float64
}

type riseObservation struct {
	delta    float64
	rate     float64
	presence strategyprojection.Presence
}

// DeriveSessionPitObservation never estimates an offset between event and
// continuous clocks. Resource rises are attached only when the source declares
// a shared timestamp origin; otherwise the interval remains explicitly
// ambiguous while still preserving its observed pit-lane duration.
func DeriveSessionPitObservation(
	session HistoricalSession,
	pages []HistoricalPage,
	classified ClassifiedSession,
) (SessionPitObservation, error) {
	if strings.TrimSpace(session.ID) == "" || classified.SessionID != session.ID ||
		strings.TrimSpace(classified.Combination.ID) == "" {
		return SessionPitObservation{}, fmt.Errorf("%w: session identity", ErrInvalidPitObservationInput)
	}
	grouped, err := groupPagesBySource(session, pages)
	if err != nil {
		return SessionPitObservation{}, fmt.Errorf("%w: %v", ErrInvalidPitObservationInput, err)
	}

	intervals := observedPitIntervals(readEvents(grouped["in pits"]))
	result := SessionPitObservation{
		SessionID: session.ID, CombinationID: classified.Combination.ID,
		Family:    missingPitFamily(session.ID, "missing_closed_pit_lane_interval"),
		fuelRates: []float64{}, veRates: []float64{},
	}
	if len(intervals) == 0 {
		return result, nil
	}

	result.Family.Presence = strategyprojection.PresenceUnknown
	result.Family.Reason = reasonDegradedPit
	result.Family.RatesNote = pitRatesNote
	result.Family.Confidence = confidenceForValues(
		pitDurations(intervals),
		len(intervals),
		pitObservationComputationVersion,
	)
	result.Family.ObservedIntervals = make([]strategyprojection.ObservedPitLaneInterval, 0, len(intervals))
	fuelAligned := channelUsesSourceTimestamp(session, "fuel level")
	veAligned := channelUsesSourceTimestamp(session, "virtual energy")
	fuel := continuousSeries(grouped["fuel level"])
	ve := continuousSeries(grouped["virtual energy"])
	for index, observed := range intervals {
		start := secondsTimestamp(observed.start)
		end := secondsTimestamp(observed.end)
		interval := strategyprojection.ObservedPitLaneInterval{
			PitNumber: index + 1, StartTimestamp: &start, EndTimestamp: &end,
			DurationSeconds: observed.end - observed.start,
		}
		if fuelAligned {
			if rise, ok := observeRise(fuel, observed.start, observed.end); ok {
				interval.FuelAddedLiters = floatPointer(rise.delta)
				interval.FuelRateLPerS = floatPointer(rise.rate)
				interval.HasFuelRise = true
				result.fuelRates = append(result.fuelRates, rise.rate)
			}
		}
		if veAligned {
			if rise, ok := observeRise(ve, observed.start, observed.end); ok {
				interval.VEAddedPercent = floatPointer(rise.delta)
				interval.VERatePPerS = floatPointer(rise.rate)
				interval.HasVERise = true
				result.veRates = append(result.veRates, rise.rate)
			}
		}
		switch {
		case !fuelAligned && !veAligned:
			interval.Ambiguous = true
			interval.AmbiguityReason = pitAmbiguityClockUnaligned
		case !interval.HasFuelRise && !interval.HasVERise:
			interval.Ambiguous = true
			interval.AmbiguityReason = pitAmbiguityNoRise
		}
		result.Family.ObservedIntervals = append(result.Family.ObservedIntervals, interval)
	}
	result.Family.FuelRate = summarizeObservedRate(session.ID, result.fuelRates)
	result.Family.VERate = summarizeObservedRate(session.ID, result.veRates)
	return result, nil
}

func AggregatePitObservations(
	current SessionPitObservation,
	history []SessionPitObservation,
) (PitObservationAggregate, error) {
	if strings.TrimSpace(current.SessionID) == "" || strings.TrimSpace(current.CombinationID) == "" {
		return PitObservationAggregate{}, fmt.Errorf("%w: current session", ErrInvalidPitObservationInput)
	}
	sessions := []SessionPitObservation{current}
	seen := map[string]bool{current.SessionID: true}
	for _, candidate := range history {
		wrongCombination := candidate.CombinationID != current.CombinationID
		invalidSession := strings.TrimSpace(candidate.SessionID) == "" || seen[candidate.SessionID]
		if wrongCombination || invalidSession {
			continue
		}
		seen[candidate.SessionID] = true
		sessions = append(sessions, candidate)
	}

	sourceID := "aggregate:" + current.CombinationID
	result := PitObservationAggregate{
		CombinationID:  current.CombinationID,
		SourceSessions: make([]string, 0, len(sessions)),
		Family:         missingPitFamily(sourceID, "missing_closed_pit_lane_interval"),
	}
	durations := []float64{}
	fuelRates := []float64{}
	veRates := []float64{}
	for _, session := range sessions {
		result.SourceSessions = append(result.SourceSessions, session.SessionID)
		for _, interval := range session.Family.ObservedIntervals {
			interval.PitNumber = len(result.Family.ObservedIntervals) + 1
			result.Family.ObservedIntervals = append(result.Family.ObservedIntervals, interval)
			durations = append(durations, interval.DurationSeconds)
			if interval.FuelRateLPerS != nil {
				fuelRates = append(fuelRates, *interval.FuelRateLPerS)
			}
			if interval.VERatePPerS != nil {
				veRates = append(veRates, *interval.VERatePPerS)
			}
		}
		fuelRates = append(fuelRates, ratesNotInIntervals(session.fuelRates, session.Family.ObservedIntervals, true)...)
		veRates = append(veRates, ratesNotInIntervals(session.veRates, session.Family.ObservedIntervals, false)...)
	}
	if len(durations) > 0 {
		result.Family.Presence = strategyprojection.PresenceUnknown
		result.Family.Reason = reasonDegradedPit
		result.Family.RatesNote = pitRatesNote
		result.Family.Confidence = confidenceForValues(durations, len(durations), pitObservationComputationVersion)
	}
	result.Family.FuelRate = summarizeObservedRate(sourceID, fuelRates)
	result.Family.VERate = summarizeObservedRate(sourceID, veRates)
	return result, nil
}

func missingPitFamily(sourceID, reason string) strategyprojection.PitFamily {
	return strategyprojection.PitFamily{
		Presence:          strategyprojection.PresenceMissing,
		Provenance:        strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence:        strategyprojection.Confidence{ComputationVersion: pitObservationComputationVersion},
		Reason:            reason,
		ObservedIntervals: []strategyprojection.ObservedPitLaneInterval{},
		FuelRate:          summarizeObservedRate(sourceID, nil),
		VERate:            summarizeObservedRate(sourceID, nil),
		RatesNote:         pitRatesNote + "; " + reason,
	}
}

func observedPitIntervals(events []observedEvent) []pitInterval {
	result := []pitInterval{}
	var start *float64
	for _, event := range events {
		active, ok := firstBoolean(event.values)
		if !ok {
			continue
		}
		if active && start == nil {
			value := event.seconds
			start = &value
			continue
		}
		if !active && start != nil && event.seconds > *start {
			result = append(result, pitInterval{start: *start, end: event.seconds})
			start = nil
		}
	}
	return result
}

func observeRise(samples []timedMetricSample, start, end float64) (riseObservation, bool) {
	window := make([]timedMetricSample, 0)
	for _, sample := range samples {
		if sample.seconds >= start && sample.seconds <= end {
			window = append(window, sample)
		}
	}
	if len(window) < 2 {
		return riseObservation{}, false
	}
	delta := 0.0
	firstRise := -1
	lastRise := -1
	presence := strategyprojection.PresenceValid
	step := math.Inf(1)
	for index := 1; index < len(window); index++ {
		duration := window[index].seconds - window[index-1].seconds
		if duration > 0 {
			step = math.Min(step, duration)
		}
		increment := window[index].value - window[index-1].value
		if increment <= pitRiseMinimum {
			continue
		}
		if firstRise < 0 {
			firstRise = index
		}
		lastRise = index
		delta += increment
		presence = weakestPresence(presence, window[index-1].presence, window[index].presence)
	}
	if firstRise < 0 || !isFinitePositive(delta) {
		return riseObservation{}, false
	}
	if math.IsInf(step, 1) {
		return riseObservation{}, false
	}
	duration := window[lastRise].seconds - window[firstRise].seconds + step
	if !isFinitePositive(duration) {
		return riseObservation{}, false
	}
	return riseObservation{delta: delta, rate: delta / duration, presence: presence}, true
}

func summarizeObservedRate(sourceID string, values []float64) strategyprojection.ObservedRateFamily {
	result := strategyprojection.ObservedRateFamily{
		Presence:   strategyprojection.PresenceMissing,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence: strategyprojection.Confidence{ComputationVersion: pitObservationComputationVersion},
		Reason:     "missing_observed_rate",
	}
	if len(values) == 0 {
		return result
	}
	result.Presence = strategyprojection.PresenceUnknown
	result.Reason = ""
	result.Mean = meanFloat(values)
	result.Confidence = confidenceForValues(values, len(values), pitObservationComputationVersion)
	return result
}

func pitDurations(intervals []pitInterval) []float64 {
	result := make([]float64, 0, len(intervals))
	for _, interval := range intervals {
		result = append(result, interval.end-interval.start)
	}
	return result
}

func channelUsesSourceTimestamp(session HistoricalSession, sourceName string) bool {
	for _, channel := range session.Channels {
		if strings.EqualFold(strings.TrimSpace(channel.SourceName), sourceName) {
			return channel.Sampling.Origin == TimeOriginSourceTimestamp
		}
	}
	return false
}

func ratesNotInIntervals(
	rates []float64,
	intervals []strategyprojection.ObservedPitLaneInterval,
	fuel bool,
) []float64 {
	if len(rates) == 0 {
		return nil
	}
	observed := 0
	for _, interval := range intervals {
		if fuel && interval.FuelRateLPerS != nil {
			observed++
		}
		if !fuel && interval.VERatePPerS != nil {
			observed++
		}
	}
	if observed >= len(rates) {
		return nil
	}
	return rates[observed:]
}

func isFinitePositive(value float64) bool {
	return value > 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}

// DeriveObservedStrategy extracts only first-class race observations. It uses
// F3-a2 stint boundaries and never turns an absent result, compound or resource
// jump into a synthetic value.
func DeriveObservedStrategy(
	session HistoricalSession,
	pages []HistoricalPage,
	classified ClassifiedSession,
	validity LapValidityAnalysis,
	pit SessionPitObservation,
	generatedAt time.Time,
) (strategyprojection.ObservedStrategyV1, error) {
	identityMismatch := strings.TrimSpace(session.ID) == "" || classified.SessionID != session.ID ||
		pit.SessionID != session.ID || pit.CombinationID != classified.Combination.ID
	if identityMismatch || classified.Type != SessionTypeRace ||
		validity.Temporal.ContractVersion != strategyprojection.ContractVersionTemporalSegmentsV1 {
		return strategyprojection.ObservedStrategyV1{}, fmt.Errorf("%w: race identity", ErrInvalidObservedStrategyInput)
	}
	grouped, err := groupPagesBySource(session, pages)
	if err != nil {
		return strategyprojection.ObservedStrategyV1{}, fmt.Errorf("%w: %v", ErrInvalidObservedStrategyInput, err)
	}

	laps := completedLaps(validity.Laps)
	result := strategyprojection.ObservedStrategyV1{
		ContractVersion: strategyprojection.ContractVersionObservedStrategyV1,
		SessionID:       session.ID,
		GeneratedAt:     generatedAt,
		Presence:        strategyprojection.PresenceMissing,
		Provenance:      strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: session.ID},
		Confidence: strategyprojection.Confidence{
			SampleSize:         len(laps),
			ComputationVersion: observedStrategyComputationVersion,
		},
		Stints:   []strategyprojection.ObservedStint{},
		PitStops: []strategyprojection.ObservedPitStop{},
		Changes:  []strategyprojection.ObservedChange{},
	}
	if len(laps) == 0 {
		return result, nil
	}
	result.Presence = strategyprojection.PresenceValid
	boundaries := append([]strategyprojection.StintBoundary(nil), validity.Temporal.StintBoundaries...)
	sort.SliceStable(boundaries, func(i, j int) bool { return boundaries[i].Timestamp.Before(boundaries[j].Timestamp) })
	compounds := timestampedVectorSeries(grouped["tyrescompound"])
	result.Stints = observedStints(session.ID, laps, boundaries, compounds)
	result.Changes = observedBoundaryChanges(session.ID, laps, boundaries)
	result.Changes = append(result.Changes, observedWearChanges(session.ID, grouped)...)
	sortObservedChanges(result.Changes)
	result.PitStops = observedPitStops(session.ID, laps, pit.Family.ObservedIntervals)
	for _, boundary := range boundaries {
		result.Presence = weakestPresence(result.Presence, boundary.Presence)
	}
	if len(result.PitStops) > 0 {
		result.Presence = weakestPresence(result.Presence, pit.Family.Presence)
	}
	result.Result = observedRaceResult(laps, readEvents(grouped["finish status"]))
	return result, nil
}

func completedLaps(laps []AnalyzedLap) []AnalyzedLap {
	result := []AnalyzedLap{}
	for _, lap := range laps {
		if lap.Complete && lap.LapTimeSeconds != nil && *lap.LapTimeSeconds > 0 {
			result = append(result, lap)
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].Number < result[j].Number })
	return result
}

func observedStints(
	sessionID string,
	laps []AnalyzedLap,
	boundaries []strategyprojection.StintBoundary,
	compounds []vectorMetricSample,
) []strategyprojection.ObservedStint {
	ends := make([]int, 0, len(boundaries)+1)
	for _, boundary := range boundaries {
		if lapNumber := lapNumberAt(laps, timestampSeconds(boundary.Timestamp)); lapNumber > 0 {
			ends = append(ends, lapNumber)
		}
	}
	ends = append(ends, laps[len(laps)-1].Number)
	result := make([]strategyprojection.ObservedStint, 0, len(ends))
	startLap := laps[0].Number
	for index, endLap := range ends {
		if endLap < startLap {
			continue
		}
		startSeconds := timestampSeconds(laps[0].End)
		for _, lap := range laps {
			if lap.Number == startLap && lap.Start != nil {
				startSeconds = timestampSeconds(*lap.Start)
				break
			}
		}
		compound, compoundPresence, note := observedCompoundAt(compounds, startSeconds)
		result = append(result, strategyprojection.ObservedStint{
			StintNumber: index + 1, StartLap: startLap, EndLap: endLap,
			CompoundRaw: compound, CompoundNote: note, Presence: compoundPresence,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceObserved, SourceID: sessionID},
		})
		startLap = endLap + 1
	}
	return result
}

func observedCompoundAt(samples []vectorMetricSample, seconds float64) (*int, strategyprojection.Presence, string) {
	values, presence, ok := vectorValueAt(samples, seconds, math.Inf(1))
	if !ok || values[0] != values[1] || values[0] != values[2] || values[0] != values[3] {
		return nil, strategyprojection.PresenceMissing, "raw compound unavailable or differs by wheel"
	}
	rounded := math.Round(values[0])
	if rounded != values[0] || rounded < 0 || rounded > math.MaxInt32 {
		return nil, strategyprojection.PresenceInvalid, "raw compound is not an integer code"
	}
	value := int(rounded)
	return &value, presence, fmt.Sprintf("raw %d without semantic mapping", value)
}

func observedBoundaryChanges(
	sessionID string,
	laps []AnalyzedLap,
	boundaries []strategyprojection.StintBoundary,
) []strategyprojection.ObservedChange {
	result := []strategyprojection.ObservedChange{}
	for _, boundary := range boundaries {
		lapNumber := lapNumberAt(laps, timestampSeconds(boundary.Timestamp))
		if lapNumber <= 0 {
			continue
		}
		change := strategyprojection.ObservedChange{
			LapNumber: lapNumber, Presence: boundary.Presence,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID},
		}
		switch boundary.Cause {
		case strategyprojection.StintCauseFuelJump:
			change.Kind = strategyprojection.ObservedChangeFuelRise
			if boundary.Confidence.RangeLower != nil && boundary.Confidence.RangeUpper != nil &&
				*boundary.Confidence.RangeLower == *boundary.Confidence.RangeUpper {
				change.Delta = floatPointer(*boundary.Confidence.RangeLower)
			}
		case strategyprojection.StintCauseTyreChange:
			change.Kind = strategyprojection.ObservedChangeTyreChange
		default:
			continue
		}
		result = append(result, change)
	}
	return result
}

func observedWearChanges(sessionID string, grouped map[string][]HistoricalPage) []strategyprojection.ObservedChange {
	resets, lapDistFrequency, _ := readLapDistResets(grouped["lap dist"])
	if lapDistFrequency <= 0 || len(resets) < 2 {
		return []strategyprojection.ObservedChange{}
	}
	wear := continuousVectorSeries(grouped["tyres wear"])
	result := []strategyprojection.ObservedChange{}
	var previous [4]float64
	previousOK := false
	for index, reset := range resets {
		seconds := float64(reset) / float64(lapDistFrequency)
		values, presence, ok := vectorValueAt(wear, seconds, vectorBoundaryToleranceSeconds)
		if !ok {
			previousOK = false
			continue
		}
		if previousOK {
			delta := meanVector(values) - meanVector(previous)
			if delta > wearRiseMinimumPercent {
				result = append(result, strategyprojection.ObservedChange{
					LapNumber: index + 1, Kind: strategyprojection.ObservedChangeWearRise,
					Delta: floatPointer(delta), Presence: weakestPresence(strategyprojection.PresenceUnknown, presence),
					Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID},
				})
			}
		}
		previous = values
		previousOK = true
	}
	return result
}

func meanVector(values [4]float64) float64 {
	return (values[0] + values[1] + values[2] + values[3]) / 4
}

func observedPitStops(
	sessionID string,
	laps []AnalyzedLap,
	intervals []strategyprojection.ObservedPitLaneInterval,
) []strategyprojection.ObservedPitStop {
	result := []strategyprojection.ObservedPitStop{}
	for _, interval := range intervals {
		if interval.StartTimestamp == nil {
			continue
		}
		lapNumber := lapNumberAt(laps, timestampSeconds(*interval.StartTimestamp))
		if lapNumber <= 0 {
			continue
		}
		result = append(result, strategyprojection.ObservedPitStop{
			LapNumber: lapNumber, PitLaneSeconds: interval.DurationSeconds,
			FuelAddedLiters: interval.FuelAddedLiters, VEAddedPercent: interval.VEAddedPercent,
			Presence:   strategyprojection.PresenceUnknown,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceObserved, SourceID: sessionID},
		})
	}
	return result
}

func observedRaceResult(laps []AnalyzedLap, finishEvents []observedEvent) *strategyprojection.ObservedResult {
	if len(laps) == 0 {
		return nil
	}
	total := 0.0
	for _, lap := range laps {
		total += *lap.LapTimeSeconds
	}
	completed := false
	for _, event := range finishEvents {
		if value, ok := firstBoolean(event.values); ok {
			completed = value
		}
	}
	return &strategyprojection.ObservedResult{
		CompletedLaps: len(laps), TotalTimeSeconds: total, Completed: completed,
	}
}

func lapNumberAt(laps []AnalyzedLap, seconds float64) int {
	index := lapIndexAt(laps, seconds)
	if index < 0 || index >= len(laps) {
		return 0
	}
	return laps[index].Number
}

func sortObservedChanges(changes []strategyprojection.ObservedChange) {
	priority := map[strategyprojection.ObservedChangeKind]int{
		strategyprojection.ObservedChangeFuelRise:   1,
		strategyprojection.ObservedChangeTyreChange: 2,
		strategyprojection.ObservedChangeWearRise:   3,
	}
	sort.SliceStable(changes, func(i, j int) bool {
		if changes[i].LapNumber == changes[j].LapNumber {
			return priority[changes[i].Kind] < priority[changes[j].Kind]
		}
		return changes[i].LapNumber < changes[j].LapNumber
	})
}
