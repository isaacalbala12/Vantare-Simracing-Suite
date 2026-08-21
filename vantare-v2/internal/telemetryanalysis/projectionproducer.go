package telemetryanalysis

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const strategyInputProducerComputationVersion = "strategy-input-producer.v1"

const (
	reasonMissingLapValidity = "missing_lap_validity_analysis"
	reasonMissingFuel        = "missing_fuel_consumption"
	reasonMissingVE          = "missing_virtual_energy_consumption"
	reasonMissingCurves      = "missing_combined_stint_pace_curve"
	reasonMissingTyres       = "missing_tyre_degradation"
	reasonMissingPit         = "missing_pit_observation"
	reasonMissingSaving      = "missing_saving_cost"
	reasonMissingClimate     = "missing_path_wetness_buckets"
)

var ErrInvalidProjectionProductionInput = errors.New("invalid strategy input projection production input")

// ProjectionSessionDerivations contains independently optional F3a families.
// A nil family is data, not an error: the producer publishes it as missing and
// continues composing every other demonstrated family.
type ProjectionSessionDerivations struct {
	Classified  ClassifiedSession
	Validity    *LapValidityAnalysis
	Consumption *SessionConsumptionPace
	Curves      *SessionDerivedCurves
	Pit         *SessionPitObservation
}

type ProjectionProductionRequest struct {
	GeneratedAt time.Time
	Combination CombinationIdentity
	Sessions    []ProjectionSessionDerivations
}

// ProduceStrategyInputProjectionV2 composes one selected combination without
// reopening storage or importing Strategy's private domain.
func ProduceStrategyInputProjectionV2(
	request ProjectionProductionRequest,
) (strategyprojection.StrategyInputProjectionV2, error) {
	if err := validateProjectionRequest(request); err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}

	sourceID := "aggregate:" + request.Combination.ID
	projection := strategyprojection.StrategyInputProjectionV2{
		ContractVersion:          strategyprojection.ContractVersionStrategyInputProjectionV2,
		GeneratedAt:              request.GeneratedAt,
		ComputationVersion:       strategyInputProducerComputationVersion,
		SourceSessions:           projectionSourceSessions(request.Sessions),
		CombinationID:            request.Combination.ID,
		SessionClassification:    projectSessionClassification(request, sourceID),
		LapValidity:              missingLapValidityFamily(sourceID),
		FuelConsumption:          missingResourceProjection(sourceID, reasonMissingFuel),
		VirtualEnergyConsumption: missingResourceProjection(sourceID, reasonMissingVE),
		CombinedStintPaceCurve:   missingCombinedCurve(sourceID),
		TyreDegradation:          missingTyreProjection(sourceID),
		Pit:                      missingPitFamily(sourceID, reasonMissingPit),
		SavingCost:               missingSavingProjection(sourceID),
		ClimateBuckets:           missingClimateProjection(sourceID),
		Temporal: strategyprojection.TemporalSegmentsV1{
			ContractVersion: strategyprojection.ContractVersionTemporalSegmentsV1,
			Segments:        []strategyprojection.ContinuousSegment{},
			Gaps:            []strategyprojection.CoverageGap{},
			LapBoundaries:   []strategyprojection.LapBoundary{},
			StintBoundaries: []strategyprojection.StintBoundary{},
		},
	}

	projection.LapValidity, projection.Temporal = projectLapValidity(request.Sessions, sourceID)
	consumption, hasConsumption, err := aggregateSelectedConsumption(request.Sessions)
	if err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}
	if hasConsumption {
		projection.FuelConsumption = projectResourceConsumption(
			consumption,
			sourceID,
			func(bucket ClimateBucketConsumptionPace) strategyprojection.ResourceConsumptionFamily {
				return bucket.FuelConsumption
			},
			reasonMissingFuel,
		)
		projection.VirtualEnergyConsumption = projectResourceConsumption(
			consumption,
			sourceID,
			func(bucket ClimateBucketConsumptionPace) strategyprojection.ResourceConsumptionFamily {
				return bucket.VirtualEnergyConsumption
			},
			reasonMissingVE,
		)
		projection.ClimateBuckets = projectClimateBuckets(consumption, sourceID)
	}

	curves, hasCurves, err := aggregateSelectedCurves(request.Sessions)
	if err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}
	if hasCurves {
		projection.CombinedStintPaceCurve,
			projection.FuelWeightCurve,
			projection.TyreAgeCurve = projectCurves(curves, sourceID)
	}
	projection.TyreDegradation = projectBestTyreFamily(request.Sessions, sourceID)
	projection.SavingCost = projectBestSavingFamily(request.Sessions, sourceID)

	pit, hasPit, err := aggregateSelectedPit(request.Sessions)
	if err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}
	if hasPit {
		projection.Pit = pit.Family
		projection.Pit.Reason = reasonDegradedPit
		projection.Pit.Provenance = strategyprojection.Provenance{
			Kind:     strategyprojection.ProvenanceDerived,
			SourceID: sourceID,
		}
	}
	if err := projection.Validate(); err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, fmt.Errorf(
			"%w: produced contract: %v",
			ErrInvalidProjectionProductionInput,
			err,
		)
	}
	return projection, nil
}

func validateProjectionRequest(request ProjectionProductionRequest) error {
	if strings.TrimSpace(request.Combination.ID) == "" || len(request.Sessions) == 0 || request.GeneratedAt.IsZero() {
		return fmt.Errorf("%w: selection identity", ErrInvalidProjectionProductionInput)
	}
	seen := make(map[string]bool, len(request.Sessions))
	for _, session := range request.Sessions {
		classified := session.Classified
		invalidIdentity := strings.TrimSpace(classified.SessionID) == "" ||
			classified.Combination.ID != request.Combination.ID ||
			combinationKey(classified.Combination) != combinationKey(request.Combination) ||
			seen[classified.SessionID]
		if invalidIdentity {
			return fmt.Errorf("%w: selected session", ErrInvalidProjectionProductionInput)
		}
		seen[classified.SessionID] = true
	}
	return nil
}

func projectionSourceSessions(sessions []ProjectionSessionDerivations) []string {
	result := make([]string, 0, len(sessions))
	for _, session := range sessions {
		result = append(result, session.Classified.SessionID)
	}
	return result
}

func projectSessionClassification(
	request ProjectionProductionRequest,
	sourceID string,
) strategyprojection.SessionClassificationFamily {
	types := make(map[SessionType]bool)
	weather := make(map[string]bool)
	usable := make(map[string]bool)
	for _, session := range request.Sessions {
		types[session.Classified.Type] = true
		weather[session.Classified.WeatherConditions] = true
		for _, family := range session.Classified.Families {
			if family.Usable {
				usable[string(family.Family)] = true
			}
		}
	}
	return strategyprojection.SessionClassificationFamily{
		Presence:   strategyprojection.PresenceValid,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence: strategyprojection.Confidence{
			SampleSize:         len(request.Sessions),
			ComputationVersion: strategyInputProducerComputationVersion,
		},
		TrackName:         request.Combination.TrackName,
		TrackLayout:       request.Combination.TrackLayout,
		CarName:           request.Combination.CarName,
		CarClass:          request.Combination.CarClass,
		SessionType:       singleSessionType(types),
		WeatherConditions: singleWeatherCondition(weather),
		UsableForFamilies: sortedStringKeys(usable),
	}
}

func singleSessionType(values map[SessionType]bool) string {
	if len(values) != 1 {
		return "mixed"
	}
	for value := range values {
		return string(value)
	}
	return ""
}

func singleWeatherCondition(values map[string]bool) string {
	if len(values) != 1 {
		return "mixed"
	}
	for value := range values {
		return value
	}
	return ""
}

func projectLapValidity(
	sessions []ProjectionSessionDerivations,
	sourceID string,
) (strategyprojection.LapValidityFamily, strategyprojection.TemporalSegmentsV1) {
	family := missingLapValidityFamily(sourceID)
	temporal := strategyprojection.TemporalSegmentsV1{
		ContractVersion: strategyprojection.ContractVersionTemporalSegmentsV1,
		Segments:        []strategyprojection.ContinuousSegment{},
		Gaps:            []strategyprojection.CoverageGap{},
		LapBoundaries:   []strategyprojection.LapBoundary{},
		StintBoundaries: []strategyprojection.StintBoundary{},
	}
	for _, session := range sessions {
		if session.Validity == nil ||
			session.Validity.Temporal.ContractVersion != strategyprojection.ContractVersionTemporalSegmentsV1 {
			continue
		}
		for _, lap := range session.Validity.Laps {
			included, reasons := lapProjectionDecision(lap)
			tags := make([]string, 0, len(lap.Labels))
			for _, label := range lap.Labels {
				tags = append(tags, string(label))
			}
			family.Laps = append(family.Laps, strategyprojection.LapValidity{
				SessionID: session.Classified.SessionID,
				LapNumber: lap.Number,
				Included:  included,
				Reason:    strings.Join(reasons, ","),
				Tags:      tags,
			})
		}
		temporal.Segments = append(temporal.Segments, session.Validity.Temporal.Segments...)
		temporal.Gaps = append(temporal.Gaps, session.Validity.Temporal.Gaps...)
		temporal.LapBoundaries = append(temporal.LapBoundaries, session.Validity.Temporal.LapBoundaries...)
		temporal.StintBoundaries = append(temporal.StintBoundaries, session.Validity.Temporal.StintBoundaries...)
	}
	if len(family.Laps) > 0 {
		family.Presence = strategyprojection.PresenceValid
		family.Reason = ""
		family.Confidence.SampleSize = len(family.Laps)
	}
	return family, temporal
}

func lapProjectionDecision(lap AnalyzedLap) (bool, []string) {
	for _, use := range lap.FamilyUse {
		if use.Family != FamilyCombinedStintPaceCurve {
			continue
		}
		reasons := make([]string, 0, len(use.ExclusionReasons))
		for _, reason := range use.ExclusionReasons {
			reasons = append(reasons, string(reason))
		}
		return use.Included, reasons
	}
	return lap.Complete, []string{}
}

func aggregateSelectedConsumption(
	sessions []ProjectionSessionDerivations,
) (ConsumptionPaceAggregate, bool, error) {
	selected := make([]SessionConsumptionPace, 0, len(sessions))
	for _, session := range sessions {
		if session.Consumption == nil {
			continue
		}
		if session.Consumption.SessionID != session.Classified.SessionID ||
			session.Consumption.CombinationID != session.Classified.Combination.ID {
			return ConsumptionPaceAggregate{}, false, fmt.Errorf("%w: consumption identity", ErrInvalidProjectionProductionInput)
		}
		selected = append(selected, *session.Consumption)
	}
	if len(selected) == 0 {
		return ConsumptionPaceAggregate{}, false, nil
	}
	aggregate, err := AggregateConsumptionPace(selected[0], selected[1:])
	return aggregate, true, err
}

func projectResourceConsumption(
	aggregate ConsumptionPaceAggregate,
	sourceID string,
	selectFamily func(ClimateBucketConsumptionPace) strategyprojection.ResourceConsumptionFamily,
	missingReason string,
) strategyprojection.ResourceConsumptionFamily {
	result := missingResourceProjection(sourceID, missingReason)
	bestSamples := -1
	for _, bucket := range orderedClimateBuckets() {
		value, ok := aggregate.ByClimateBucket[bucket]
		if !ok {
			continue
		}
		family := selectFamily(value)
		if presenceWeight(family.Presence) == 0 || family.Confidence.SampleSize <= 0 {
			continue
		}
		result.ByClimateBucket[bucket] = family.MeanPerLap
		if family.Confidence.SampleSize > bestSamples {
			result = family
			bestSamples = family.Confidence.SampleSize
		}
	}
	if bestSamples < 0 {
		return missingResourceProjection(sourceID, missingReason)
	}
	allBuckets := make(map[strategyprojection.ClimateBucket]float64)
	for _, bucket := range orderedClimateBuckets() {
		value, ok := aggregate.ByClimateBucket[bucket]
		if !ok {
			continue
		}
		family := selectFamily(value)
		if presenceWeight(family.Presence) > 0 && family.Confidence.SampleSize > 0 {
			allBuckets[bucket] = family.MeanPerLap
		}
	}
	result.ByClimateBucket = allBuckets
	result.Provenance = strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID}
	result.Reason = ""
	return result
}

func aggregateSelectedCurves(
	sessions []ProjectionSessionDerivations,
) (DerivedCurvesAggregate, bool, error) {
	selected := make([]SessionDerivedCurves, 0, len(sessions))
	for _, session := range sessions {
		if session.Curves == nil {
			continue
		}
		if session.Curves.SessionID != session.Classified.SessionID ||
			session.Curves.CombinationID != session.Classified.Combination.ID {
			return DerivedCurvesAggregate{}, false, fmt.Errorf("%w: curves identity", ErrInvalidProjectionProductionInput)
		}
		selected = append(selected, *session.Curves)
	}
	if len(selected) == 0 {
		return DerivedCurvesAggregate{}, false, nil
	}
	aggregate, err := AggregateDerivedCurves(selected[0], selected[1:])
	return aggregate, true, err
}

func projectCurves(
	aggregate DerivedCurvesAggregate,
	sourceID string,
) (strategyprojection.CombinedStintPaceCurve, *strategyprojection.SeparableCurve, *strategyprojection.SeparableCurve) {
	bestSamples := -1
	var selected ClimateDerivedCurves
	for _, bucket := range orderedClimateBuckets() {
		candidate, ok := aggregate.ByClimateBucket[bucket]
		if !ok || candidate.CombinedStintPaceCurve.Confidence.SampleSize <= bestSamples {
			continue
		}
		selected = candidate
		bestSamples = candidate.CombinedStintPaceCurve.Confidence.SampleSize
	}
	if bestSamples < 0 {
		return missingCombinedCurve(sourceID), nil, nil
	}
	aggregateProvenance := strategyprojection.Provenance{
		Kind:     strategyprojection.ProvenanceDerived,
		SourceID: sourceID,
	}
	selected.CombinedStintPaceCurve.Provenance = aggregateProvenance
	if selected.FuelWeightCurve != nil {
		selected.FuelWeightCurve.Provenance = aggregateProvenance
	}
	if selected.TyreAgeCurve != nil {
		selected.TyreAgeCurve.Provenance = aggregateProvenance
	}
	return selected.CombinedStintPaceCurve, selected.FuelWeightCurve, selected.TyreAgeCurve
}

func projectBestTyreFamily(
	sessions []ProjectionSessionDerivations,
	sourceID string,
) strategyprojection.TyreDegradationFamily {
	result := missingTyreProjection(sourceID)
	bestRank, bestSamples := -1, -1
	for _, session := range sessions {
		if session.Curves == nil {
			continue
		}
		candidate := session.Curves.TyreDegradation
		rank := presenceRank(candidate.Presence)
		if rank < bestRank || rank == bestRank && candidate.Confidence.SampleSize <= bestSamples {
			continue
		}
		result, bestRank, bestSamples = candidate, rank, candidate.Confidence.SampleSize
	}
	result.Provenance = strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID}
	if !result.Presence.Valid() {
		return missingTyreProjection(sourceID)
	}
	return result
}

func projectBestSavingFamily(
	sessions []ProjectionSessionDerivations,
	sourceID string,
) strategyprojection.SavingCostFamily {
	result := missingSavingProjection(sourceID)
	bestRank, bestSamples := -1, -1
	for _, session := range sessions {
		if session.Curves == nil {
			continue
		}
		candidate := session.Curves.SavingCost
		rank := presenceRank(candidate.Presence)
		if rank < bestRank || rank == bestRank && candidate.Confidence.SampleSize <= bestSamples {
			continue
		}
		result, bestRank, bestSamples = candidate, rank, candidate.Confidence.SampleSize
	}
	if !result.Presence.Valid() {
		return missingSavingProjection(sourceID)
	}
	result.Provenance = strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID}
	if result.Reason == "" {
		result.Reason = result.ManualNote
	}
	return result
}

func aggregateSelectedPit(
	sessions []ProjectionSessionDerivations,
) (PitObservationAggregate, bool, error) {
	selected := make([]SessionPitObservation, 0, len(sessions))
	for _, session := range sessions {
		if session.Pit == nil {
			continue
		}
		if session.Pit.SessionID != session.Classified.SessionID ||
			session.Pit.CombinationID != session.Classified.Combination.ID {
			return PitObservationAggregate{}, false, fmt.Errorf("%w: pit identity", ErrInvalidProjectionProductionInput)
		}
		selected = append(selected, *session.Pit)
	}
	if len(selected) == 0 {
		return PitObservationAggregate{}, false, nil
	}
	aggregate, err := AggregatePitObservations(selected[0], selected[1:])
	return aggregate, true, err
}

func projectClimateBuckets(
	aggregate ConsumptionPaceAggregate,
	sourceID string,
) strategyprojection.ClimateBucketsFamily {
	result := missingClimateProjection(sourceID)
	totalSamples := 0
	for _, bucket := range orderedClimateBuckets() {
		value, ok := aggregate.ByClimateBucket[bucket]
		if !ok {
			continue
		}
		sampleSize := max(
			value.FuelConsumption.Confidence.SampleSize,
			value.VirtualEnergyConsumption.Confidence.SampleSize,
			value.RepresentativePace.Confidence.SampleSize,
		)
		if sampleSize <= 0 {
			continue
		}
		result.Buckets = append(result.Buckets, strategyprojection.ClimateBucketPoint{
			Bucket: bucket, PathWetnessPercent: representativeWetness(bucket), SampleSize: sampleSize,
		})
		totalSamples += sampleSize
	}
	if totalSamples == 0 {
		return result
	}
	result.Presence = strategyprojection.PresenceValid
	result.Reason = ""
	result.Confidence.SampleSize = totalSamples
	return result
}

func representativeWetness(bucket strategyprojection.ClimateBucket) float64 {
	switch bucket {
	case strategyprojection.ClimateBucketDry:
		return 0
	case strategyprojection.ClimateBucketHumid:
		return 5
	case strategyprojection.ClimateBucketWet:
		return 12.5
	default:
		return 0
	}
}

func missingLapValidityFamily(sourceID string) strategyprojection.LapValidityFamily {
	return strategyprojection.LapValidityFamily{
		Presence:   strategyprojection.PresenceMissing,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence: strategyprojection.Confidence{ComputationVersion: strategyInputProducerComputationVersion},
		Reason:     reasonMissingLapValidity,
		Laps:       []strategyprojection.LapValidity{},
	}
}

func missingResourceProjection(sourceID, reason string) strategyprojection.ResourceConsumptionFamily {
	return strategyprojection.ResourceConsumptionFamily{
		Presence:        strategyprojection.PresenceMissing,
		Provenance:      strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence:      strategyprojection.Confidence{ComputationVersion: strategyInputProducerComputationVersion},
		Reason:          reason,
		ByClimateBucket: map[strategyprojection.ClimateBucket]float64{},
		ByMixture:       map[int]float64{},
	}
}

func missingCombinedCurve(sourceID string) strategyprojection.CombinedStintPaceCurve {
	return strategyprojection.CombinedStintPaceCurve{
		Presence:        strategyprojection.PresenceMissing,
		Provenance:      strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence:      strategyprojection.Confidence{ComputationVersion: strategyInputProducerComputationVersion},
		Identifiability: strategyprojection.IdentifiabilityCombinedOnly,
		Reason:          reasonMissingCurves,
		Points:          []strategyprojection.PacePoint{},
	}
}

func missingTyreProjection(sourceID string) strategyprojection.TyreDegradationFamily {
	return strategyprojection.TyreDegradationFamily{
		Presence:            strategyprojection.PresenceMissing,
		Provenance:          strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence:          strategyprojection.Confidence{ComputationVersion: strategyInputProducerComputationVersion},
		Reason:              reasonMissingTyres,
		ByAxle:              map[strategyprojection.TyreAxle]float64{},
		ByWheel:             map[strategyprojection.TyreWheel]float64{},
		ByCorner:            map[string]float64{},
		LifeLapsByWheel:     map[strategyprojection.TyreWheel]float64{},
		CompoundPresence:    strategyprojection.PresenceUnsupported,
		CompoundMappingNote: "unsupported: TyresCompound codes 0-2 have no semantic mapping",
	}
}

func missingSavingProjection(sourceID string) strategyprojection.SavingCostFamily {
	return strategyprojection.SavingCostFamily{
		Presence:   strategyprojection.PresenceMissing,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence: strategyprojection.Confidence{ComputationVersion: strategyInputProducerComputationVersion},
		Reason:     reasonMissingSaving,
		ManualNote: "A5 INVALID: manual input or controlled A/B capture required",
		Levels:     []strategyprojection.SavingLevel{},
	}
}

func missingClimateProjection(sourceID string) strategyprojection.ClimateBucketsFamily {
	return strategyprojection.ClimateBucketsFamily{
		Presence:   strategyprojection.PresenceMissing,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence: strategyprojection.Confidence{ComputationVersion: strategyInputProducerComputationVersion},
		Reason:     reasonMissingClimate,
		Buckets:    []strategyprojection.ClimateBucketPoint{},
	}
}

func orderedClimateBuckets() []strategyprojection.ClimateBucket {
	return []strategyprojection.ClimateBucket{
		strategyprojection.ClimateBucketDry,
		strategyprojection.ClimateBucketHumid,
		strategyprojection.ClimateBucketWet,
	}
}

func sortedStringKeys(values map[string]bool) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
