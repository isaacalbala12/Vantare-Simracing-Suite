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

const consumptionPaceComputationVersion = "consumption-pace.v1"

const resourceBoundaryToleranceSeconds = 0.1

var ErrInvalidConsumptionPaceInput = errors.New("invalid consumption and pace input")

// DerivedMetric keeps presence, provenance and confidence attached to every
// scalar derived by this package.
type DerivedMetric struct {
	Presence   strategyprojection.Presence   `json:"presence"`
	Provenance strategyprojection.Provenance `json:"provenance"`
	Confidence strategyprojection.Confidence `json:"confidence"`
	Value      float64                       `json:"value"`
}

// RepresentativePaceFamily is the median clean-lap pace for one climate bucket.
type RepresentativePaceFamily struct {
	Presence         strategyprojection.Presence   `json:"presence"`
	Provenance       strategyprojection.Provenance `json:"provenance"`
	Confidence       strategyprojection.Confidence `json:"confidence"`
	MedianLapSeconds float64                       `json:"medianLapSeconds"`
}

// LapConsumptionPace preserves F3-a2 labels even when a family excludes the lap.
type LapConsumptionPace struct {
	Number                   int                               `json:"number"`
	Labels                   []LapLabel                        `json:"labels"`
	ClimateBucket            *strategyprojection.ClimateBucket `json:"climateBucket,omitempty"`
	FuelConsumption          *DerivedMetric                    `json:"fuelConsumption,omitempty"`
	VirtualEnergyConsumption *DerivedMetric                    `json:"virtualEnergyConsumption,omitempty"`
	RepresentativePace       *DerivedMetric                    `json:"representativePace,omitempty"`
}

func (l LapConsumptionPace) HasLabel(wanted LapLabel) bool {
	for _, label := range l.Labels {
		if label == wanted {
			return true
		}
	}
	return false
}

// ClimateBucketConsumptionPace groups the three numeric families and the
// optional current-session percentile under one combination and weather bucket.
type ClimateBucketConsumptionPace struct {
	FuelConsumption          strategyprojection.ResourceConsumptionFamily `json:"fuelConsumption"`
	VirtualEnergyConsumption strategyprojection.ResourceConsumptionFamily `json:"virtualEnergyConsumption"`
	RepresentativePace       RepresentativePaceFamily                     `json:"representativePace"`
	PacePercentile           *DerivedMetric                               `json:"pacePercentile,omitempty"`
}

// SessionConsumptionPace is a pure per-session result. It contains no reader
// or Strategy-domain type and can be aggregated without reopening DuckDB.
type SessionConsumptionPace struct {
	SessionID       string                                                            `json:"sessionId"`
	CombinationID   string                                                            `json:"combinationId"`
	Laps            []LapConsumptionPace                                              `json:"laps"`
	ByClimateBucket map[strategyprojection.ClimateBucket]ClimateBucketConsumptionPace `json:"byClimateBucket"`
}

// ConsumptionPaceAggregate combines the current session with matching history.
type ConsumptionPaceAggregate struct {
	CombinationID   string                                                            `json:"combinationId"`
	SourceSessions  []string                                                          `json:"sourceSessions"`
	ByClimateBucket map[strategyprojection.ClimateBucket]ClimateBucketConsumptionPace `json:"byClimateBucket"`
}

type metricSample struct {
	value    float64
	presence strategyprojection.Presence
}

// DeriveSessionConsumptionPace consumes the segmentation and lap decisions of
// F3-a2. It deliberately does not infer lap resets, stints or coverage.
func DeriveSessionConsumptionPace(
	session HistoricalSession,
	pages []HistoricalPage,
	classified ClassifiedSession,
	validity LapValidityAnalysis,
) (SessionConsumptionPace, error) {
	if strings.TrimSpace(session.ID) == "" || classified.SessionID != session.ID ||
		strings.TrimSpace(classified.Combination.ID) == "" {
		return SessionConsumptionPace{}, fmt.Errorf("%w: session identity", ErrInvalidConsumptionPaceInput)
	}
	if validity.Temporal.ContractVersion != strategyprojection.ContractVersionTemporalSegmentsV1 {
		return SessionConsumptionPace{}, fmt.Errorf("%w: temporal contract", ErrInvalidConsumptionPaceInput)
	}
	grouped, err := groupPagesBySource(session, pages)
	if err != nil {
		return SessionConsumptionPace{}, fmt.Errorf("%w: %v", ErrInvalidConsumptionPaceInput, err)
	}

	result := SessionConsumptionPace{
		SessionID: session.ID, CombinationID: classified.Combination.ID,
		Laps:            []LapConsumptionPace{},
		ByClimateBucket: make(map[strategyprojection.ClimateBucket]ClimateBucketConsumptionPace),
	}
	fuel := continuousSeries(grouped["fuel level"])
	virtualEnergy := continuousSeries(grouped["virtual energy"])
	wetness := timestampedSeries(grouped["minimum path wetness"])
	boundaries := boundaryQualityByTimestamp(validity.Temporal.LapBoundaries)

	type bucketSamples struct {
		fuel []metricSample
		ve   []metricSample
		pace []metricSample
	}
	samplesByBucket := make(map[strategyprojection.ClimateBucket]*bucketSamples)
	for _, lap := range validity.Laps {
		derivedLap := LapConsumptionPace{Number: lap.Number, Labels: append([]LapLabel(nil), lap.Labels...)}
		if lap.Start == nil || !lap.Complete || lap.LapTimeSeconds == nil || *lap.LapTimeSeconds <= 0 {
			result.Laps = append(result.Laps, derivedLap)
			continue
		}
		segmentPresence, insideSegment := lapSegmentPresence(*lap.Start, lap.End, validity.Temporal.Segments, validity.Temporal.Gaps)
		if !insideSegment {
			result.Laps = append(result.Laps, derivedLap)
			continue
		}
		wetnessValue, wetnessPresence, ok := valueAt(wetness, timestampSeconds(*lap.Start))
		if !ok {
			result.Laps = append(result.Laps, derivedLap)
			continue
		}
		endWetnessValue, endWetnessPresence, endWetnessOK := valueAt(wetness, timestampSeconds(lap.End))
		bucket, startBucketOK := climateBucket(wetnessValue)
		endBucket, endBucketOK := climateBucket(endWetnessValue)
		if !endWetnessOK || !startBucketOK || !endBucketOK || bucket != endBucket {
			result.Laps = append(result.Laps, derivedLap)
			continue
		}
		derivedLap.ClimateBucket = &bucket
		bucketValues := samplesByBucket[bucket]
		if bucketValues == nil {
			bucketValues = &bucketSamples{}
			samplesByBucket[bucket] = bucketValues
		}

		lapPresence := weakestPresence(
			segmentPresence,
			wetnessPresence,
			endWetnessPresence,
			boundaryPresence(boundaries, *lap.Start),
			boundaryPresence(boundaries, lap.End),
		)
		if presenceWeight(lapPresence) == 0 {
			result.Laps = append(result.Laps, derivedLap)
			continue
		}
		if familyIncluded(lap, FamilyFuelConsumption) {
			if metric, ok := resourceDeltaMetric(session.ID, fuel, *lap.Start, lap.End, lapPresence); ok {
				derivedLap.FuelConsumption = &metric
				bucketValues.fuel = append(bucketValues.fuel, metricSample{value: metric.Value, presence: metric.Presence})
			}
		}
		if familyIncluded(lap, FamilyVirtualEnergyConsumption) {
			if metric, ok := resourceDeltaMetric(session.ID, virtualEnergy, *lap.Start, lap.End, lapPresence); ok {
				derivedLap.VirtualEnergyConsumption = &metric
				bucketValues.ve = append(bucketValues.ve, metricSample{value: metric.Value, presence: metric.Presence})
			}
		}
		if familyIncluded(lap, FamilyCombinedStintPaceCurve) && !lap.HasLabel(LapLabelTraffic) {
			metric := newDerivedMetric(session.ID, *lap.LapTimeSeconds, lapPresence)
			derivedLap.RepresentativePace = &metric
			bucketValues.pace = append(bucketValues.pace, metricSample{value: metric.Value, presence: metric.Presence})
		}
		result.Laps = append(result.Laps, derivedLap)
	}

	for bucket, samples := range samplesByBucket {
		result.ByClimateBucket[bucket] = ClimateBucketConsumptionPace{
			FuelConsumption:          summarizeResource(session.ID, bucket, samples.fuel),
			VirtualEnergyConsumption: summarizeResource(session.ID, bucket, samples.ve),
			RepresentativePace:       summarizePace(session.ID, samples.pace),
		}
	}
	return result, nil
}

type timedMetricSample struct {
	seconds  float64
	value    float64
	presence strategyprojection.Presence
}

func continuousSeries(pages []HistoricalPage) []timedMetricSample {
	var result []timedMetricSample
	for _, page := range pages {
		if page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz <= 0 {
			continue
		}
		for _, sample := range page.Samples {
			seconds := sample.RelativeTimeSeconds
			if seconds == 0 && sample.Index != 0 {
				seconds = float64(sample.Index) / float64(page.Sampling.FrequencyHz)
			}
			if value, presence, ok := numericValue(sample.Values); ok {
				result = append(result, timedMetricSample{seconds: seconds, value: value, presence: presence})
			}
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].seconds < result[j].seconds })
	return result
}

func timestampedSeries(pages []HistoricalPage) []timedMetricSample {
	var result []timedMetricSample
	for _, page := range pages {
		if page.Sampling.Kind != SamplingEventTimestamped {
			continue
		}
		for _, sample := range page.Samples {
			if sample.TimestampSeconds == nil {
				continue
			}
			if value, presence, ok := numericValue(sample.Values); ok {
				result = append(result, timedMetricSample{seconds: *sample.TimestampSeconds, value: value, presence: presence})
			}
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].seconds < result[j].seconds })
	return result
}

func numericValue(values []HistoricalValue) (float64, strategyprojection.Presence, bool) {
	for _, value := range values {
		if !value.Present || value.Quality == QualityMissing || value.Quality == QualityInvalid {
			continue
		}
		presence := historicalQualityPresence(value.Quality)
		switch value.Scalar.Kind {
		case ScalarNumber:
			if !math.IsNaN(value.Scalar.Number) && !math.IsInf(value.Scalar.Number, 0) {
				return value.Scalar.Number, presence, true
			}
		case ScalarInteger:
			return float64(value.Scalar.Integer), presence, true
		}
	}
	return 0, strategyprojection.PresenceMissing, false
}

func valueAt(samples []timedMetricSample, seconds float64) (float64, strategyprojection.Presence, bool) {
	position := sort.Search(len(samples), func(index int) bool { return samples[index].seconds > seconds }) - 1
	if position < 0 {
		return 0, strategyprojection.PresenceMissing, false
	}
	sample := samples[position]
	return sample.value, sample.presence, true
}

func resourceDeltaMetric(sessionID string, samples []timedMetricSample, start, end time.Time, lapPresence strategyprojection.Presence) (DerivedMetric, bool) {
	startValue, startPresence, startOK := continuousValueAt(samples, timestampSeconds(start))
	endValue, endPresence, endOK := continuousValueAt(samples, timestampSeconds(end))
	if !startOK || !endOK {
		return DerivedMetric{}, false
	}
	delta := startValue - endValue
	if delta < 0 || math.IsNaN(delta) || math.IsInf(delta, 0) {
		return DerivedMetric{}, false
	}
	return newDerivedMetric(sessionID, delta, weakestPresence(lapPresence, startPresence, endPresence)), true
}

func continuousValueAt(samples []timedMetricSample, seconds float64) (float64, strategyprojection.Presence, bool) {
	position := sort.Search(len(samples), func(index int) bool { return samples[index].seconds > seconds }) - 1
	if position < 0 || seconds-samples[position].seconds > resourceBoundaryToleranceSeconds {
		return 0, strategyprojection.PresenceMissing, false
	}
	sample := samples[position]
	return sample.value, sample.presence, true
}

func newDerivedMetric(sessionID string, value float64, presence strategyprojection.Presence) DerivedMetric {
	return DerivedMetric{
		Presence:   presence,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID},
		Confidence: strategyprojection.Confidence{
			SampleSize: 1, RangeLower: floatPointer(value), RangeUpper: floatPointer(value),
			Variance: floatPointer(0), ComputationVersion: consumptionPaceComputationVersion,
		},
		Value: value,
	}
}

func familyIncluded(lap AnalyzedLap, family DerivationFamily) bool {
	for _, use := range lap.FamilyUse {
		if use.Family == family {
			return use.Included
		}
	}
	if !lap.Complete {
		return false
	}
	if hasAnyLabel(lap, LapLabelOutLap, LapLabelInLap, LapLabelPit, LapLabelIncidentOfftrack) {
		return false
	}
	if family == FamilyCombinedStintPaceCurve && lap.HasLabel(LapLabelPaceOutlier) {
		return false
	}
	return true
}

func lapSegmentPresence(
	start, end time.Time,
	segments []strategyprojection.ContinuousSegment,
	gaps []strategyprojection.CoverageGap,
) (strategyprojection.Presence, bool) {
	if end.Before(start) {
		return strategyprojection.PresenceInvalid, false
	}
	for _, gap := range gaps {
		if start.Before(gap.EndTs) && end.After(gap.StartTs) {
			return strategyprojection.PresenceMissing, false
		}
	}
	for _, segment := range segments {
		if !start.Before(segment.SessionStartTs) && !end.After(segment.SessionEndTs) {
			return segment.Presence, true
		}
	}
	return strategyprojection.PresenceMissing, false
}

func boundaryQualityByTimestamp(boundaries []strategyprojection.LapBoundary) map[int64]strategyprojection.Presence {
	result := make(map[int64]strategyprojection.Presence, len(boundaries))
	for _, boundary := range boundaries {
		result[boundary.Timestamp.UnixMilli()] = boundary.Quality
	}
	return result
}

func boundaryPresence(boundaries map[int64]strategyprojection.Presence, timestamp time.Time) strategyprojection.Presence {
	if presence, ok := boundaries[timestamp.UnixMilli()]; ok {
		return presence
	}
	return strategyprojection.PresenceUnknown
}

func climateBucket(pathWetnessPercent float64) (strategyprojection.ClimateBucket, bool) {
	if math.IsNaN(pathWetnessPercent) || math.IsInf(pathWetnessPercent, 0) || pathWetnessPercent < 0 {
		return "", false
	}
	switch {
	case pathWetnessPercent == 0:
		return strategyprojection.ClimateBucketDry, true
	case pathWetnessPercent <= 5:
		return strategyprojection.ClimateBucketHumid, true
	default:
		return strategyprojection.ClimateBucketWet, true
	}
}

func summarizeResource(sessionID string, bucket strategyprojection.ClimateBucket, samples []metricSample) strategyprojection.ResourceConsumptionFamily {
	mean, lower, upper, variance, presence := weightedSummary(samples)
	provenance := strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID}
	confidence := strategyprojection.Confidence{SampleSize: len(samples), ComputationVersion: consumptionPaceComputationVersion}
	if len(samples) > 0 {
		confidence.RangeLower, confidence.RangeUpper, confidence.Variance = floatPointer(lower), floatPointer(upper), floatPointer(variance)
	}
	return strategyprojection.ResourceConsumptionFamily{
		Presence: presence, Provenance: provenance, Confidence: confidence,
		MeanPerLap: mean, RangeLower: lower, RangeUpper: upper,
		ByClimateBucket: map[strategyprojection.ClimateBucket]float64{bucket: mean},
	}
}

func summarizePace(sessionID string, samples []metricSample) RepresentativePaceFamily {
	_, lower, upper, variance, presence := weightedSummary(samples)
	provenance := strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID}
	confidence := strategyprojection.Confidence{SampleSize: len(samples), ComputationVersion: consumptionPaceComputationVersion}
	median := 0.0
	if len(samples) > 0 {
		median = weightedMedian(samples)
		confidence.RangeLower, confidence.RangeUpper, confidence.Variance = floatPointer(lower), floatPointer(upper), floatPointer(variance)
	}
	return RepresentativePaceFamily{Presence: presence, Provenance: provenance, Confidence: confidence, MedianLapSeconds: median}
}

func weightedSummary(samples []metricSample) (mean, lower, upper, variance float64, presence strategyprojection.Presence) {
	if len(samples) == 0 {
		return 0, 0, 0, 0, strategyprojection.PresenceMissing
	}
	lower, upper = samples[0].value, samples[0].value
	presence = samples[0].presence
	weightSum := 0.0
	for _, sample := range samples {
		weight := presenceWeight(sample.presence)
		weightSum += weight
		mean += weight * sample.value
		lower = math.Min(lower, sample.value)
		upper = math.Max(upper, sample.value)
		presence = weakestPresence(presence, sample.presence)
	}
	if weightSum == 0 {
		return 0, lower, upper, 0, strategyprojection.PresenceInvalid
	}
	mean /= weightSum
	weightSquareSum := 0.0
	for _, sample := range samples {
		weight := presenceWeight(sample.presence)
		difference := sample.value - mean
		variance += weight * difference * difference
		weightSquareSum += weight * weight
	}
	denominator := weightSum - weightSquareSum/weightSum
	if denominator > 0 {
		variance /= denominator
	} else {
		variance = 0
	}
	return mean, lower, upper, variance, presence
}

func weightedMedian(samples []metricSample) float64 {
	ordered := append([]metricSample(nil), samples...)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].value < ordered[j].value })
	total := 0.0
	for _, sample := range ordered {
		total += presenceWeight(sample.presence)
	}
	threshold := total / 2
	accumulated := 0.0
	for index, sample := range ordered {
		accumulated += presenceWeight(sample.presence)
		if accumulated > threshold {
			return sample.value
		}
		if accumulated == threshold && index+1 < len(ordered) {
			return (sample.value + ordered[index+1].value) / 2
		}
	}
	return ordered[len(ordered)-1].value
}

func historicalQualityPresence(quality Quality) strategyprojection.Presence {
	switch quality {
	case QualityValid:
		return strategyprojection.PresenceValid
	case QualityStale:
		return strategyprojection.PresenceStale
	case QualityInvalid:
		return strategyprojection.PresenceInvalid
	case QualityMissing:
		return strategyprojection.PresenceMissing
	default:
		return strategyprojection.PresenceUnknown
	}
}

func weakestPresence(values ...strategyprojection.Presence) strategyprojection.Presence {
	weakest := strategyprojection.PresenceValid
	for _, value := range values {
		if presenceRank(value) < presenceRank(weakest) {
			weakest = value
		}
	}
	return weakest
}

func presenceRank(presence strategyprojection.Presence) int {
	switch presence {
	case strategyprojection.PresenceValid:
		return 5
	case strategyprojection.PresenceStale:
		return 4
	case strategyprojection.PresenceUnknown:
		return 3
	case strategyprojection.PresenceMissing:
		return 2
	case strategyprojection.PresenceUnsupported:
		return 1
	default:
		return 0
	}
}

func presenceWeight(presence strategyprojection.Presence) float64 {
	switch presence {
	case strategyprojection.PresenceValid:
		return 1
	case strategyprojection.PresenceStale:
		return 0.75
	case strategyprojection.PresenceUnknown:
		return 0.5
	default:
		return 0
	}
}

// AggregateConsumptionPace combines only matching combinations. The caller
// supplies history belonging to the same pilot; no unavailable driver identity
// is inferred. A faster current median maps to a higher percentile.
func AggregateConsumptionPace(current SessionConsumptionPace, history []SessionConsumptionPace) (ConsumptionPaceAggregate, error) {
	if strings.TrimSpace(current.SessionID) == "" || strings.TrimSpace(current.CombinationID) == "" {
		return ConsumptionPaceAggregate{}, fmt.Errorf("%w: current session", ErrInvalidConsumptionPaceInput)
	}
	sessions := []SessionConsumptionPace{current}
	sources := []string{current.SessionID}
	seen := map[string]bool{current.SessionID: true}
	for _, candidate := range history {
		if candidate.CombinationID != current.CombinationID || strings.TrimSpace(candidate.SessionID) == "" || seen[candidate.SessionID] {
			continue
		}
		sessions = append(sessions, candidate)
		sources = append(sources, candidate.SessionID)
		seen[candidate.SessionID] = true
	}

	result := ConsumptionPaceAggregate{
		CombinationID: current.CombinationID, SourceSessions: sources,
		ByClimateBucket: make(map[strategyprojection.ClimateBucket]ClimateBucketConsumptionPace),
	}
	buckets := make(map[strategyprojection.ClimateBucket]bool)
	for _, session := range sessions {
		for bucket := range session.ByClimateBucket {
			buckets[bucket] = true
		}
	}
	for bucket := range buckets {
		fuel := aggregateResourceSamples(sessions, bucket, func(value ClimateBucketConsumptionPace) strategyprojection.ResourceConsumptionFamily {
			return value.FuelConsumption
		}, func(lap LapConsumptionPace) *DerivedMetric {
			return lap.FuelConsumption
		})
		ve := aggregateResourceSamples(sessions, bucket, func(value ClimateBucketConsumptionPace) strategyprojection.ResourceConsumptionFamily {
			return value.VirtualEnergyConsumption
		}, func(lap LapConsumptionPace) *DerivedMetric {
			return lap.VirtualEnergyConsumption
		})
		paces := aggregatePaceSamples(sessions, bucket)
		aggregate := ClimateBucketConsumptionPace{
			FuelConsumption:          summarizeResource("aggregate:"+current.CombinationID, bucket, fuel),
			VirtualEnergyConsumption: summarizeResource("aggregate:"+current.CombinationID, bucket, ve),
			RepresentativePace:       summarizePace("aggregate:"+current.CombinationID, paces),
		}
		if currentBucket, ok := current.ByClimateBucket[bucket]; ok {
			aggregate.PacePercentile = pacePercentile(current, currentBucket.RepresentativePace, sessions[1:], bucket)
		}
		result.ByClimateBucket[bucket] = aggregate
	}
	return result, nil
}

func aggregateResourceSamples(
	sessions []SessionConsumptionPace,
	bucket strategyprojection.ClimateBucket,
	selectFamily func(ClimateBucketConsumptionPace) strategyprojection.ResourceConsumptionFamily,
	selectMetric func(LapConsumptionPace) *DerivedMetric,
) []metricSample {
	var samples []metricSample
	for _, session := range sessions {
		lapSamples := resourceLapSamples(session.Laps, bucket, selectMetric)
		if len(lapSamples) > 0 {
			samples = append(samples, lapSamples...)
			continue
		}
		bucketValue, ok := session.ByClimateBucket[bucket]
		if !ok {
			continue
		}
		family := selectFamily(bucketValue)
		if family.Confidence.SampleSize <= 0 || presenceWeight(family.Presence) == 0 {
			continue
		}
		for count := 0; count < family.Confidence.SampleSize; count++ {
			samples = append(samples, metricSample{value: family.MeanPerLap, presence: family.Presence})
		}
	}
	return samples
}

func resourceLapSamples(
	laps []LapConsumptionPace,
	bucket strategyprojection.ClimateBucket,
	selectMetric func(LapConsumptionPace) *DerivedMetric,
) []metricSample {
	var samples []metricSample
	for _, lap := range laps {
		if lap.ClimateBucket == nil || *lap.ClimateBucket != bucket {
			continue
		}
		metric := selectMetric(lap)
		if metric != nil && presenceWeight(metric.Presence) > 0 {
			samples = append(samples, metricSample{value: metric.Value, presence: metric.Presence})
		}
	}
	return samples
}

func aggregatePaceSamples(sessions []SessionConsumptionPace, bucket strategyprojection.ClimateBucket) []metricSample {
	var samples []metricSample
	for _, session := range sessions {
		var lapSamples []metricSample
		for _, lap := range session.Laps {
			if lap.ClimateBucket == nil || *lap.ClimateBucket != bucket || lap.RepresentativePace == nil ||
				presenceWeight(lap.RepresentativePace.Presence) == 0 {
				continue
			}
			lapSamples = append(lapSamples, metricSample{value: lap.RepresentativePace.Value, presence: lap.RepresentativePace.Presence})
		}
		if len(lapSamples) > 0 {
			samples = append(samples, lapSamples...)
			continue
		}
		bucketValue, ok := session.ByClimateBucket[bucket]
		if !ok || bucketValue.RepresentativePace.Confidence.SampleSize <= 0 || presenceWeight(bucketValue.RepresentativePace.Presence) == 0 {
			continue
		}
		for count := 0; count < bucketValue.RepresentativePace.Confidence.SampleSize; count++ {
			samples = append(samples, metricSample{value: bucketValue.RepresentativePace.MedianLapSeconds, presence: bucketValue.RepresentativePace.Presence})
		}
	}
	return samples
}

func pacePercentile(
	current SessionConsumptionPace,
	currentPace RepresentativePaceFamily,
	history []SessionConsumptionPace,
	bucket strategyprojection.ClimateBucket,
) *DerivedMetric {
	if currentPace.Confidence.SampleSize <= 0 || presenceWeight(currentPace.Presence) == 0 {
		return nil
	}
	var historical []metricSample
	for _, session := range history {
		bucketValue, ok := session.ByClimateBucket[bucket]
		if !ok || bucketValue.RepresentativePace.Confidence.SampleSize <= 0 || presenceWeight(bucketValue.RepresentativePace.Presence) == 0 {
			continue
		}
		historical = append(historical, metricSample{
			value:    bucketValue.RepresentativePace.MedianLapSeconds,
			presence: bucketValue.RepresentativePace.Presence,
		})
	}
	if len(historical) == 0 {
		return nil
	}
	slowerWeight, equalWeight, totalWeight := 0.0, 0.0, 0.0
	for _, sample := range historical {
		weight := presenceWeight(sample.presence)
		totalWeight += weight
		switch {
		case sample.value > currentPace.MedianLapSeconds:
			slowerWeight += weight
		case sample.value == currentPace.MedianLapSeconds:
			equalWeight += weight
		}
	}
	percentile := 100 * (slowerWeight + equalWeight/2) / totalWeight
	_, lower, upper, variance, historyPresence := weightedSummary(historical)
	return &DerivedMetric{
		Presence:   weakestPresence(currentPace.Presence, historyPresence),
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: current.SessionID},
		Confidence: strategyprojection.Confidence{
			SampleSize: len(historical), RangeLower: floatPointer(lower), RangeUpper: floatPointer(upper),
			Variance: floatPointer(variance), ComputationVersion: consumptionPaceComputationVersion,
		},
		Value: percentile,
	}
}
