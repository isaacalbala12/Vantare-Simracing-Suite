package telemetryanalysis

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const (
	derivedCurvesComputationVersion = "derived-curves.v1"
	wearLifeThresholdPercent        = 20.0
	identifiabilityMinimumStints    = 3
	identifiabilityMinimumSamples   = 15
	identifiabilityMinimumAges      = 3
	identifiabilityFuelSpanLitres   = 10.0
	identifiabilityMaximumAbsCorr   = 0.80
	identifiabilityResidualRatio    = 0.25
	abMinimumLapsPerLevel           = 5
	vectorBoundaryToleranceSeconds  = 0.11
)

const (
	GateReasonPassed                  = "crossed_design_passed"
	GateReasonInsufficientStints      = "insufficient_stints"
	GateReasonInsufficientSamples     = "insufficient_clean_samples"
	GateReasonInsufficientCrossedFuel = "insufficient_crossed_fuel_variation"
	GateReasonFuelAgeCollinear        = "fuel_age_collinearity"
	GateReasonSingularRegression      = "singular_regression"
	SavingReasonMissingMixtureLevels  = "missing_fuel_mixture_levels"
	SavingReasonMissingCompoundState  = "missing_compound_state"
	SavingReasonInsufficientLaps      = "insufficient_ab_laps"
	SavingReasonNotAlternating        = "levels_not_alternating"
	compoundMappingUnsupportedReason  = "unsupported: TyresCompound codes 0-2 have no semantic mapping"
)

var ErrInvalidDerivedCurvesInput = errors.New("invalid derived curves input")

// IdentifiabilityGateResult documents the numeric evidence used before
// publishing separate fuel-weight and tyre-age curves. The gate requires at
// least three stints and fifteen clean laps, three shared lap ages whose fuel
// span is at least 10 L, |corr(fuel, age)| <= 0.80, and at least 25% residual
// fuel variance after removing the linear age trend.
type IdentifiabilityGateResult struct {
	Passed               bool    `json:"passed"`
	Reason               string  `json:"reason"`
	StintCount           int     `json:"stintCount"`
	SampleSize           int     `json:"sampleSize"`
	SharedCrossedAges    int     `json:"sharedCrossedAges"`
	FuelAgeCorrelation   float64 `json:"fuelAgeCorrelation"`
	FuelResidualVariance float64 `json:"fuelResidualVarianceRatio"`
}

type StintDerivedCurve struct {
	StintNumber   int                                       `json:"stintNumber"`
	ClimateBucket strategyprojection.ClimateBucket          `json:"climateBucket"`
	Curve         strategyprojection.CombinedStintPaceCurve `json:"curve"`
}

type ClimateDerivedCurves struct {
	CombinedStintPaceCurve strategyprojection.CombinedStintPaceCurve `json:"combinedStintPaceCurve"`
	IdentifiabilityGate    IdentifiabilityGateResult                 `json:"identifiabilityGate"`
	FuelWeightCurve        *strategyprojection.SeparableCurve        `json:"fuelWeightCurve,omitempty"`
	TyreAgeCurve           *strategyprojection.SeparableCurve        `json:"tyreAgeCurve,omitempty"`
}

type SessionDerivedCurves struct {
	SessionID       string                                                    `json:"sessionId"`
	CombinationID   string                                                    `json:"combinationId"`
	Stints          []StintDerivedCurve                                       `json:"stints"`
	ByClimateBucket map[strategyprojection.ClimateBucket]ClimateDerivedCurves `json:"byClimateBucket"`
	TyreDegradation strategyprojection.TyreDegradationFamily                  `json:"tyreDegradation"`
	SavingCost      strategyprojection.SavingCostFamily                       `json:"savingCost"`
	samples         []curveLapSample
	normalized      []normalizedCurveSample
}

type DerivedCurvesAggregate struct {
	CombinationID   string                                                    `json:"combinationId"`
	SourceSessions  []string                                                  `json:"sourceSessions"`
	ByClimateBucket map[strategyprojection.ClimateBucket]ClimateDerivedCurves `json:"byClimateBucket"`
}

type curveLapSample struct {
	stint           int
	lapInStint      int
	bucket          strategyprojection.ClimateBucket
	lapSeconds      float64
	fuelLitres      float64
	fuelKnown       bool
	fuelPerLap      float64
	fuelPerLapKnown bool
	mixtureCode     int
	mixtureKnown    bool
	compound        string
	presence        strategyprojection.Presence
	savingEligible  bool
}

type normalizedCurveSample struct {
	stint      int
	lapInStint int
	bucket     strategyprojection.ClimateBucket
	delta      float64
	presence   strategyprojection.Presence
}

type vectorMetricSample struct {
	seconds  float64
	values   [4]float64
	presence strategyprojection.Presence
}

// DeriveSessionCurves consumes F3-a2 segmentation and F3-a3 clean-lap
// observations. It does not infer laps, stints, weather buckets or pace again.
func DeriveSessionCurves(
	session HistoricalSession,
	pages []HistoricalPage,
	classified ClassifiedSession,
	validity LapValidityAnalysis,
	pace SessionConsumptionPace,
) (SessionDerivedCurves, error) {
	if strings.TrimSpace(session.ID) == "" || classified.SessionID != session.ID || pace.SessionID != session.ID ||
		strings.TrimSpace(classified.Combination.ID) == "" || pace.CombinationID != classified.Combination.ID {
		return SessionDerivedCurves{}, fmt.Errorf("%w: session identity", ErrInvalidDerivedCurvesInput)
	}
	if validity.Temporal.ContractVersion != strategyprojection.ContractVersionTemporalSegmentsV1 {
		return SessionDerivedCurves{}, fmt.Errorf("%w: temporal contract", ErrInvalidDerivedCurvesInput)
	}
	grouped, err := groupPagesBySource(session, pages)
	if err != nil {
		return SessionDerivedCurves{}, fmt.Errorf("%w: %v", ErrInvalidDerivedCurvesInput, err)
	}

	result := SessionDerivedCurves{
		SessionID: session.ID, CombinationID: classified.Combination.ID,
		Stints:          []StintDerivedCurve{},
		ByClimateBucket: make(map[strategyprojection.ClimateBucket]ClimateDerivedCurves),
	}
	result.samples = collectCurveLapSamples(validity, pace, grouped)
	result.Stints, result.normalized = buildStintCurves(session.ID, result.samples)
	result.ByClimateBucket = summarizeDerivedBuckets("session:"+session.ID, result.samples, result.normalized)
	result.TyreDegradation = deriveTyreDegradation(session.ID, validity, grouped["tyres wear"])
	result.SavingCost = deriveSavingCost(session.ID, result.samples)
	return result, nil
}

func collectCurveLapSamples(
	validity LapValidityAnalysis,
	pace SessionConsumptionPace,
	grouped map[string][]HistoricalPage,
) []curveLapSample {
	fuel := continuousSeries(grouped["fuel level"])
	mixture := timestampedSeries(grouped["fuelmixturemap"])
	compounds := timestampedVectorSeries(grouped["tyrescompound"])
	validityByNumber := make(map[int]AnalyzedLap, len(validity.Laps))
	stintByNumber, lapInStintByNumber := stintLapIndices(validity)
	for _, lap := range validity.Laps {
		validityByNumber[lap.Number] = lap
	}
	var result []curveLapSample
	for _, derivedLap := range pace.Laps {
		lap, ok := validityByNumber[derivedLap.Number]
		if !ok || lap.Start == nil || derivedLap.ClimateBucket == nil || derivedLap.RepresentativePace == nil ||
			!familyIncluded(lap, FamilyCombinedStintPaceCurve) || lap.HasLabel(LapLabelTraffic) ||
			presenceWeight(derivedLap.RepresentativePace.Presence) == 0 {
			continue
		}
		seconds := timestampSeconds(*lap.Start)
		sample := curveLapSample{
			stint: stintByNumber[lap.Number], lapInStint: lapInStintByNumber[lap.Number], bucket: *derivedLap.ClimateBucket,
			lapSeconds: derivedLap.RepresentativePace.Value, presence: derivedLap.RepresentativePace.Presence,
			savingEligible: familyIncluded(lap, FamilySavingCost) && !lap.HasLabel(LapLabelTraffic),
		}
		if value, presence, found := continuousNearestValueAt(fuel, seconds+0.001, vectorBoundaryToleranceSeconds); found {
			sample.fuelLitres, sample.fuelKnown = value, true
			sample.presence = weakestPresence(sample.presence, presence)
		}
		if derivedLap.FuelConsumption != nil && presenceWeight(derivedLap.FuelConsumption.Presence) > 0 {
			sample.fuelPerLap, sample.fuelPerLapKnown = derivedLap.FuelConsumption.Value, true
			sample.presence = weakestPresence(sample.presence, derivedLap.FuelConsumption.Presence)
		}
		stateSeconds := seconds + vectorBoundaryToleranceSeconds
		if value, presence, found := valueAt(mixture, stateSeconds); found {
			sample.mixtureCode, sample.mixtureKnown = int(math.Round(value)), true
			sample.presence = weakestPresence(sample.presence, presence)
		}
		if values, presence, found := vectorValueAt(compounds, stateSeconds, math.Inf(1)); found {
			sample.compound = vectorSignature(values)
			sample.presence = weakestPresence(sample.presence, presence)
		}
		result = append(result, sample)
	}
	return result
}

func stintLapIndices(validity LapValidityAnalysis) (map[int]int, map[int]int) {
	boundaries := append([]strategyprojection.StintBoundary(nil), validity.Temporal.StintBoundaries...)
	sort.SliceStable(boundaries, func(i, j int) bool { return boundaries[i].Timestamp.Before(boundaries[j].Timestamp) })
	laps := append([]AnalyzedLap(nil), validity.Laps...)
	sort.SliceStable(laps, func(i, j int) bool { return laps[i].End.Before(laps[j].End) })
	stints := make(map[int]int, len(laps))
	indices := make(map[int]int, len(laps))
	counts := make(map[int]int)
	for _, lap := range laps {
		stint := 1
		if lap.Start != nil {
			for _, boundary := range boundaries {
				if boundary.Timestamp.After(*lap.Start) {
					break
				}
				if boundary.StintNumber > stint {
					stint = boundary.StintNumber
				} else {
					stint++
				}
			}
		}
		counts[stint]++
		stints[lap.Number], indices[lap.Number] = stint, counts[stint]
	}
	return stints, indices
}

func buildStintCurves(sessionID string, samples []curveLapSample) ([]StintDerivedCurve, []normalizedCurveSample) {
	groups := make(map[string][]curveLapSample)
	for _, sample := range samples {
		key := strconv.Itoa(sample.stint) + "|" + string(sample.bucket)
		groups[key] = append(groups[key], sample)
	}
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var curves []StintDerivedCurve
	var normalized []normalizedCurveSample
	for _, key := range keys {
		group := groups[key]
		sort.SliceStable(group, func(i, j int) bool { return group[i].lapInStint < group[j].lapInStint })
		baselineCount := min(3, len(group))
		baselineValues := make([]float64, baselineCount)
		for index := range baselineValues {
			baselineValues[index] = group[index].lapSeconds
		}
		baseline := medianFloat(baselineValues)
		points := make([]strategyprojection.PacePoint, 0, len(group))
		presence := strategyprojection.PresenceValid
		for _, sample := range group {
			delta := sample.lapSeconds - baseline
			points = append(points, strategyprojection.PacePoint{
				LapInStint: sample.lapInStint, DeltaSeconds: delta, SampleSize: 1,
				RangeLower: floatPointer(delta), RangeUpper: floatPointer(delta),
			})
			normalized = append(normalized, normalizedCurveSample{
				stint: sample.stint, lapInStint: sample.lapInStint, bucket: sample.bucket, delta: delta, presence: sample.presence,
			})
			presence = weakestPresence(presence, sample.presence)
		}
		curves = append(curves, StintDerivedCurve{
			StintNumber: group[0].stint, ClimateBucket: group[0].bucket,
			Curve: strategyprojection.CombinedStintPaceCurve{
				Presence:        presence,
				Provenance:      strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID},
				Confidence:      confidenceForValues(valuesFromNormalized(normalizedForStint(normalized, group[0].stint, group[0].bucket)), len(group), derivedCurvesComputationVersion),
				Identifiability: strategyprojection.IdentifiabilityCombinedOnly,
				Reason:          GateReasonInsufficientStints,
				Points:          points,
			},
		})
	}
	return curves, normalized
}

func summarizeDerivedBuckets(sourceID string, samples []curveLapSample, normalized []normalizedCurveSample) map[strategyprojection.ClimateBucket]ClimateDerivedCurves {
	buckets := make(map[strategyprojection.ClimateBucket]bool)
	for _, sample := range normalized {
		buckets[sample.bucket] = true
	}
	result := make(map[strategyprojection.ClimateBucket]ClimateDerivedCurves, len(buckets))
	for bucket := range buckets {
		bucketSamples := filterCurveSamples(samples, bucket)
		bucketNormalized := filterNormalizedSamples(normalized, bucket)
		gate, coefficients := evaluateIdentifiability(bucketSamples)
		identifiability := strategyprojection.IdentifiabilityCombinedOnly
		if gate.Passed {
			identifiability = strategyprojection.IdentifiabilitySeparable
		}
		family := ClimateDerivedCurves{
			CombinedStintPaceCurve: summarizeCombinedCurve(sourceID, bucketNormalized, identifiability, gate.Reason),
			IdentifiabilityGate:    gate,
		}
		if gate.Passed {
			family.FuelWeightCurve, family.TyreAgeCurve = buildSeparatedCurves(sourceID, bucketSamples, coefficients)
		}
		result[bucket] = family
	}
	return result
}

func summarizeCombinedCurve(sourceID string, samples []normalizedCurveSample, identifiability strategyprojection.Identifiability, reason string) strategyprojection.CombinedStintPaceCurve {
	byAge := make(map[int][]normalizedCurveSample)
	stints := make(map[int]bool)
	presence := strategyprojection.PresenceValid
	for _, sample := range samples {
		byAge[sample.lapInStint] = append(byAge[sample.lapInStint], sample)
		stints[sample.stint] = true
		presence = weakestPresence(presence, sample.presence)
	}
	ages := sortedIntKeys(byAge)
	points := make([]strategyprojection.PacePoint, 0, len(ages))
	allValues := make([]float64, 0, len(samples))
	for _, age := range ages {
		values := valuesFromNormalized(byAge[age])
		lower, upper := minMax(values)
		points = append(points, strategyprojection.PacePoint{
			LapInStint: age, DeltaSeconds: medianFloat(values), SampleSize: len(values),
			RangeLower: floatPointer(lower), RangeUpper: floatPointer(upper),
		})
		allValues = append(allValues, values...)
	}
	if len(samples) == 0 {
		presence = strategyprojection.PresenceMissing
	}
	return strategyprojection.CombinedStintPaceCurve{
		Presence:        presence,
		Provenance:      strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence:      confidenceForValues(allValues, len(stints), derivedCurvesComputationVersion),
		Identifiability: identifiability, Reason: reason, Points: points,
	}
}

func evaluateIdentifiability(samples []curveLapSample) (IdentifiabilityGateResult, [3]float64) {
	result := IdentifiabilityGateResult{Reason: GateReasonInsufficientStints}
	stints := make(map[int]bool)
	var usable []curveLapSample
	for _, sample := range samples {
		if sample.fuelKnown {
			usable = append(usable, sample)
			stints[sample.stint] = true
		}
	}
	result.StintCount, result.SampleSize = len(stints), len(usable)
	if result.StintCount < identifiabilityMinimumStints {
		return result, [3]float64{}
	}
	if result.SampleSize < identifiabilityMinimumSamples {
		result.Reason = GateReasonInsufficientSamples
		return result, [3]float64{}
	}
	byAge := make(map[int][]curveLapSample)
	for _, sample := range usable {
		byAge[sample.lapInStint] = append(byAge[sample.lapInStint], sample)
	}
	for _, sameAge := range byAge {
		ageStints := make(map[int]bool)
		fuels := make([]float64, 0, len(sameAge))
		for _, sample := range sameAge {
			ageStints[sample.stint] = true
			fuels = append(fuels, sample.fuelLitres)
		}
		lower, upper := minMax(fuels)
		if len(ageStints) >= identifiabilityMinimumStints && upper-lower >= identifiabilityFuelSpanLitres {
			result.SharedCrossedAges++
		}
	}
	if result.SharedCrossedAges < identifiabilityMinimumAges {
		result.Reason = GateReasonInsufficientCrossedFuel
		return result, [3]float64{}
	}
	fuels, ages := make([]float64, len(usable)), make([]float64, len(usable))
	for index, sample := range usable {
		fuels[index], ages[index] = sample.fuelLitres, float64(sample.lapInStint)
	}
	result.FuelAgeCorrelation = correlation(fuels, ages)
	result.FuelResidualVariance = residualVarianceRatio(fuels, ages)
	if math.Abs(result.FuelAgeCorrelation) > identifiabilityMaximumAbsCorr || result.FuelResidualVariance < identifiabilityResidualRatio {
		result.Reason = GateReasonFuelAgeCollinear
		return result, [3]float64{}
	}
	coefficients, ok := fitFuelAgeRegression(usable)
	if !ok {
		result.Reason = GateReasonSingularRegression
		return result, [3]float64{}
	}
	result.Passed, result.Reason = true, GateReasonPassed
	return result, coefficients
}

func fitFuelAgeRegression(samples []curveLapSample) ([3]float64, bool) {
	var augmented [3][4]float64
	for _, sample := range samples {
		x := [3]float64{1, sample.fuelLitres, float64(sample.lapInStint)}
		for row := 0; row < 3; row++ {
			for column := 0; column < 3; column++ {
				augmented[row][column] += x[row] * x[column]
			}
			augmented[row][3] += x[row] * sample.lapSeconds
		}
	}
	for pivot := 0; pivot < 3; pivot++ {
		best := pivot
		for row := pivot + 1; row < 3; row++ {
			if math.Abs(augmented[row][pivot]) > math.Abs(augmented[best][pivot]) {
				best = row
			}
		}
		if math.Abs(augmented[best][pivot]) < 1e-9 {
			return [3]float64{}, false
		}
		augmented[pivot], augmented[best] = augmented[best], augmented[pivot]
		divisor := augmented[pivot][pivot]
		for column := pivot; column < 4; column++ {
			augmented[pivot][column] /= divisor
		}
		for row := 0; row < 3; row++ {
			if row == pivot {
				continue
			}
			factor := augmented[row][pivot]
			for column := pivot; column < 4; column++ {
				augmented[row][column] -= factor * augmented[pivot][column]
			}
		}
	}
	return [3]float64{augmented[0][3], augmented[1][3], augmented[2][3]}, true
}

func buildSeparatedCurves(sourceID string, samples []curveLapSample, coefficients [3]float64) (*strategyprojection.SeparableCurve, *strategyprojection.SeparableCurve) {
	byAge := make(map[int][]curveLapSample)
	var allFuels []float64
	presence := strategyprojection.PresenceValid
	for _, sample := range samples {
		if !sample.fuelKnown {
			continue
		}
		byAge[sample.lapInStint] = append(byAge[sample.lapInStint], sample)
		allFuels = append(allFuels, sample.fuelLitres)
		presence = weakestPresence(presence, sample.presence)
	}
	referenceFuel := medianFloat(allFuels)
	ages := sortedIntKeys(byAge)
	fuelPoints := make([]strategyprojection.PacePoint, 0, len(ages))
	agePoints := make([]strategyprojection.PacePoint, 0, len(ages))
	for _, age := range ages {
		fuels := make([]float64, 0, len(byAge[age]))
		for _, sample := range byAge[age] {
			fuels = append(fuels, sample.fuelLitres)
		}
		fuelEffects := make([]float64, len(fuels))
		for index, fuel := range fuels {
			fuelEffects[index] = coefficients[1] * (fuel - referenceFuel)
		}
		lower, upper := minMax(fuelEffects)
		fuelPoints = append(fuelPoints, strategyprojection.PacePoint{
			LapInStint: age, DeltaSeconds: medianFloat(fuelEffects), SampleSize: len(fuels),
			RangeLower: floatPointer(lower), RangeUpper: floatPointer(upper),
		})
		ageEffect := coefficients[2] * float64(age-1)
		agePoints = append(agePoints, strategyprojection.PacePoint{
			LapInStint: age, DeltaSeconds: ageEffect, SampleSize: len(fuels),
			RangeLower: floatPointer(ageEffect), RangeUpper: floatPointer(ageEffect),
		})
	}
	provenance := strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID}
	confidence := confidenceForValues(allFuels, len(samples), derivedCurvesComputationVersion)
	return &strategyprojection.SeparableCurve{Presence: presence, Provenance: provenance, Confidence: confidence, Points: fuelPoints},
		&strategyprojection.SeparableCurve{Presence: presence, Provenance: provenance, Confidence: confidence, Points: agePoints}
}

func deriveTyreDegradation(sessionID string, validity LapValidityAnalysis, pages []HistoricalPage) strategyprojection.TyreDegradationFamily {
	provenance := strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID}
	family := strategyprojection.TyreDegradationFamily{
		Presence: strategyprojection.PresenceMissing, Provenance: provenance,
		Confidence: strategyprojection.Confidence{ComputationVersion: derivedCurvesComputationVersion},
		Reason:     "missing_clean_tyres_wear_laps", ByAxle: map[strategyprojection.TyreAxle]float64{},
		ByWheel: map[strategyprojection.TyreWheel]float64{}, LifeLapsByWheel: map[strategyprojection.TyreWheel]float64{},
		LifeThresholdPercent: wearLifeThresholdPercent,
		CompoundPresence:     strategyprojection.PresenceUnsupported, CompoundMappingNote: compoundMappingUnsupportedReason,
	}
	series := continuousVectorSeries(pages)
	wheels := []strategyprojection.TyreWheel{
		strategyprojection.TyreWheelFL, strategyprojection.TyreWheelFR,
		strategyprojection.TyreWheelRL, strategyprojection.TyreWheelRR,
	}
	byWheel := make(map[strategyprojection.TyreWheel][]float64, len(wheels))
	lastWear := make(map[strategyprojection.TyreWheel]float64, len(wheels))
	presence := strategyprojection.PresenceValid
	usableLaps := 0
	var allSlopes []float64
	for _, lap := range validity.Laps {
		if lap.Start == nil || !familyIncluded(lap, FamilyTyreDegradation) {
			continue
		}
		start, startPresence, startOK := vectorValueAt(series, timestampSeconds(*lap.Start), vectorBoundaryToleranceSeconds)
		end, endPresence, endOK := vectorValueAt(series, timestampSeconds(lap.End), vectorBoundaryToleranceSeconds)
		if !startOK || !endOK {
			continue
		}
		valid := true
		lapSlopes := make([]float64, 0, len(wheels))
		for index := range wheels {
			slope := start[index] - end[index]
			if slope < 0 || math.IsNaN(slope) || math.IsInf(slope, 0) {
				valid = false
				break
			}
			lapSlopes = append(lapSlopes, slope)
		}
		if valid {
			for index, wheel := range wheels {
				byWheel[wheel] = append(byWheel[wheel], lapSlopes[index])
				lastWear[wheel] = end[index]
				allSlopes = append(allSlopes, lapSlopes[index])
			}
			usableLaps++
			presence = weakestPresence(presence, startPresence, endPresence)
		}
	}
	if usableLaps == 0 {
		return family
	}
	family.Presence, family.Reason = presence, ""
	family.Confidence = confidenceForValues(allSlopes, usableLaps, derivedCurvesComputationVersion)
	for _, wheel := range wheels {
		mean := meanFloat(byWheel[wheel])
		family.ByWheel[wheel] = mean
		if mean > 0 && lastWear[wheel] > wearLifeThresholdPercent {
			family.LifeLapsByWheel[wheel] = (lastWear[wheel] - wearLifeThresholdPercent) / mean
		}
	}
	family.ByAxle[strategyprojection.TyreAxleFront] = (family.ByWheel[strategyprojection.TyreWheelFL] + family.ByWheel[strategyprojection.TyreWheelFR]) / 2
	family.ByAxle[strategyprojection.TyreAxleRear] = (family.ByWheel[strategyprojection.TyreWheelRL] + family.ByWheel[strategyprojection.TyreWheelRR]) / 2
	minimumLife := math.Inf(1)
	maximumLife := math.Inf(-1)
	for _, life := range family.LifeLapsByWheel {
		minimumLife = math.Min(minimumLife, life)
		maximumLife = math.Max(maximumLife, life)
	}
	if !math.IsInf(minimumLife, 1) {
		life := int(math.Floor(minimumLife))
		family.LifeLapsEstimate = &life
		family.LifeLapsRangeLower, family.LifeLapsRangeUpper = floatPointer(minimumLife), floatPointer(maximumLife)
	}
	return family
}

func deriveSavingCost(sessionID string, samples []curveLapSample) strategyprojection.SavingCostFamily {
	missing := func(reason string) strategyprojection.SavingCostFamily {
		return strategyprojection.SavingCostFamily{
			Presence:   strategyprojection.PresenceMissing,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID},
			Confidence: strategyprojection.Confidence{ComputationVersion: derivedCurvesComputationVersion},
			ManualNote: reason, Levels: []strategyprojection.SavingLevel{},
		}
	}
	mixtureSeen, compoundMissing := false, false
	groups := make(map[string][]curveLapSample)
	for _, sample := range samples {
		if !sample.savingEligible || !sample.mixtureKnown || !sample.fuelPerLapKnown {
			continue
		}
		mixtureSeen = true
		if sample.compound == "" {
			compoundMissing = true
			continue
		}
		key := strconv.Itoa(sample.stint) + "|" + string(sample.bucket) + "|" + sample.compound
		groups[key] = append(groups[key], sample)
	}
	if !mixtureSeen {
		return missing(SavingReasonMissingMixtureLevels)
	}
	if len(groups) == 0 && compoundMissing {
		return missing(SavingReasonMissingCompoundState)
	}
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	insufficient, notAlternating := false, false
	for _, key := range keys {
		group := groups[key]
		levels := make(map[int][]curveLapSample)
		for _, sample := range group {
			levels[sample.mixtureCode] = append(levels[sample.mixtureCode], sample)
		}
		if len(levels) != 2 {
			insufficient = true
			continue
		}
		levelCodes := sortedIntKeys(levels)
		if len(levels[levelCodes[0]]) < abMinimumLapsPerLevel || len(levels[levelCodes[1]]) < abMinimumLapsPerLevel {
			insufficient = true
			continue
		}
		alternating := true
		for index := 1; index < len(group); index++ {
			if group[index].mixtureCode == group[index-1].mixtureCode {
				alternating = false
				break
			}
		}
		if !alternating {
			notAlternating = true
			continue
		}
		meansFuel := map[int]float64{}
		meansTime := map[int]float64{}
		presence := strategyprojection.PresenceValid
		for _, code := range levelCodes {
			fuels, times := make([]float64, 0, len(levels[code])), make([]float64, 0, len(levels[code]))
			for _, sample := range levels[code] {
				fuels, times = append(fuels, sample.fuelPerLap), append(times, sample.lapSeconds)
				presence = weakestPresence(presence, sample.presence)
			}
			meansFuel[code], meansTime[code] = meanFloat(fuels), meanFloat(times)
		}
		baseline := levelCodes[0]
		if meansFuel[levelCodes[1]] > meansFuel[baseline] {
			baseline = levelCodes[1]
		}
		output := strategyprojection.SavingCostFamily{
			Presence:   presence,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sessionID},
			Confidence: strategyprojection.Confidence{SampleSize: len(group), ComputationVersion: derivedCurvesComputationVersion},
			ManualNote: "derived_from_controlled_ab_protocol", Levels: make([]strategyprojection.SavingLevel, 0, 2),
		}
		for _, code := range levelCodes {
			output.Levels = append(output.Levels, strategyprojection.SavingLevel{
				MixtureCode: code, FuelSavedPerLap: meansFuel[baseline] - meansFuel[code], TimeCostPerLap: meansTime[code] - meansTime[baseline],
			})
		}
		fuelEffects := []float64{output.Levels[0].FuelSavedPerLap, output.Levels[1].FuelSavedPerLap}
		lower, upper := minMax(fuelEffects)
		output.Confidence.RangeLower, output.Confidence.RangeUpper = floatPointer(lower), floatPointer(upper)
		return output
	}
	if notAlternating {
		return missing(SavingReasonNotAlternating)
	}
	if insufficient {
		return missing(SavingReasonInsufficientLaps)
	}
	return missing(SavingReasonMissingMixtureLevels)
}

// AggregateDerivedCurves combines only sessions from the same combination and
// recomputes the bucket gate from their clean lap observations.
func AggregateDerivedCurves(current SessionDerivedCurves, history []SessionDerivedCurves) (DerivedCurvesAggregate, error) {
	if strings.TrimSpace(current.SessionID) == "" || strings.TrimSpace(current.CombinationID) == "" {
		return DerivedCurvesAggregate{}, fmt.Errorf("%w: current session", ErrInvalidDerivedCurvesInput)
	}
	result := DerivedCurvesAggregate{
		CombinationID: current.CombinationID, SourceSessions: []string{current.SessionID},
		ByClimateBucket: map[strategyprojection.ClimateBucket]ClimateDerivedCurves{},
	}
	samples := append([]curveLapSample(nil), current.samples...)
	normalized := append([]normalizedCurveSample(nil), current.normalized...)
	stintOffset := maximumStint(samples, normalized)
	seen := map[string]bool{current.SessionID: true}
	for _, candidate := range history {
		if candidate.CombinationID != current.CombinationID || strings.TrimSpace(candidate.SessionID) == "" || seen[candidate.SessionID] {
			continue
		}
		seen[candidate.SessionID] = true
		result.SourceSessions = append(result.SourceSessions, candidate.SessionID)
		candidateMaximum := maximumStint(candidate.samples, candidate.normalized)
		for _, sample := range candidate.samples {
			sample.stint += stintOffset
			samples = append(samples, sample)
		}
		for _, sample := range candidate.normalized {
			sample.stint += stintOffset
			normalized = append(normalized, sample)
		}
		stintOffset += candidateMaximum
	}
	result.ByClimateBucket = summarizeDerivedBuckets("aggregate:"+current.CombinationID, samples, normalized)
	return result, nil
}

func continuousVectorSeries(pages []HistoricalPage) []vectorMetricSample {
	var result []vectorMetricSample
	for _, page := range pages {
		if page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz <= 0 {
			continue
		}
		for _, sample := range page.Samples {
			values, presence, ok := numericVector(sample.Values)
			if !ok {
				continue
			}
			seconds := sample.RelativeTimeSeconds
			if seconds == 0 && sample.Index != 0 {
				seconds = float64(sample.Index) / float64(page.Sampling.FrequencyHz)
			}
			result = append(result, vectorMetricSample{seconds: seconds, values: values, presence: presence})
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].seconds < result[j].seconds })
	return result
}

func timestampedVectorSeries(pages []HistoricalPage) []vectorMetricSample {
	var result []vectorMetricSample
	for _, page := range pages {
		if page.Sampling.Kind != SamplingEventTimestamped {
			continue
		}
		for _, sample := range page.Samples {
			if sample.TimestampSeconds == nil {
				continue
			}
			values, presence, ok := numericVector(sample.Values)
			if ok {
				result = append(result, vectorMetricSample{seconds: *sample.TimestampSeconds, values: values, presence: presence})
			}
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].seconds < result[j].seconds })
	return result
}

func numericVector(values []HistoricalValue) ([4]float64, strategyprojection.Presence, bool) {
	if len(values) < 4 {
		return [4]float64{}, strategyprojection.PresenceMissing, false
	}
	result := [4]float64{}
	presence := strategyprojection.PresenceValid
	for index := 0; index < 4; index++ {
		value, valuePresence, ok := numericValue([]HistoricalValue{values[index]})
		if !ok {
			return [4]float64{}, strategyprojection.PresenceMissing, false
		}
		result[index] = value
		presence = weakestPresence(presence, valuePresence)
	}
	return result, presence, true
}

func vectorValueAt(samples []vectorMetricSample, seconds, tolerance float64) ([4]float64, strategyprojection.Presence, bool) {
	position := sort.Search(len(samples), func(index int) bool { return samples[index].seconds > seconds }) - 1
	if position < 0 || seconds-samples[position].seconds > tolerance {
		return [4]float64{}, strategyprojection.PresenceMissing, false
	}
	return samples[position].values, samples[position].presence, true
}

func vectorSignature(values [4]float64) string {
	parts := make([]string, 4)
	for index, value := range values {
		parts[index] = strconv.FormatFloat(value, 'g', -1, 64)
	}
	return strings.Join(parts, "/")
}

func continuousNearestValueAt(samples []timedMetricSample, seconds, tolerance float64) (float64, strategyprojection.Presence, bool) {
	position := sort.Search(len(samples), func(index int) bool { return samples[index].seconds >= seconds })
	best := -1
	bestDistance := math.Inf(1)
	for _, candidate := range []int{position - 1, position} {
		if candidate < 0 || candidate >= len(samples) {
			continue
		}
		distance := math.Abs(samples[candidate].seconds - seconds)
		if distance < bestDistance {
			best, bestDistance = candidate, distance
		}
	}
	if best < 0 || bestDistance > tolerance {
		return 0, strategyprojection.PresenceMissing, false
	}
	return samples[best].value, samples[best].presence, true
}

func maximumStint(samples []curveLapSample, normalized []normalizedCurveSample) int {
	maximum := 0
	for _, sample := range samples {
		maximum = max(maximum, sample.stint)
	}
	for _, sample := range normalized {
		maximum = max(maximum, sample.stint)
	}
	return maximum
}

func confidenceForValues(values []float64, sampleSize int, version string) strategyprojection.Confidence {
	confidence := strategyprojection.Confidence{SampleSize: sampleSize, ComputationVersion: version}
	if len(values) == 0 {
		return confidence
	}
	lower, upper := minMax(values)
	variance := sampleVariance(values)
	confidence.RangeLower, confidence.RangeUpper, confidence.Variance = floatPointer(lower), floatPointer(upper), floatPointer(variance)
	return confidence
}

func filterCurveSamples(samples []curveLapSample, bucket strategyprojection.ClimateBucket) []curveLapSample {
	var result []curveLapSample
	for _, sample := range samples {
		if sample.bucket == bucket {
			result = append(result, sample)
		}
	}
	return result
}

func filterNormalizedSamples(samples []normalizedCurveSample, bucket strategyprojection.ClimateBucket) []normalizedCurveSample {
	var result []normalizedCurveSample
	for _, sample := range samples {
		if sample.bucket == bucket {
			result = append(result, sample)
		}
	}
	return result
}

func normalizedForStint(samples []normalizedCurveSample, stint int, bucket strategyprojection.ClimateBucket) []normalizedCurveSample {
	var result []normalizedCurveSample
	for _, sample := range samples {
		if sample.stint == stint && sample.bucket == bucket {
			result = append(result, sample)
		}
	}
	return result
}

func valuesFromNormalized(samples []normalizedCurveSample) []float64 {
	values := make([]float64, len(samples))
	for index, sample := range samples {
		values[index] = sample.delta
	}
	return values
}

func sortedIntKeys[T any](values map[int]T) []int {
	keys := make([]int, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Ints(keys)
	return keys
}

func minMax(values []float64) (float64, float64) {
	if len(values) == 0 {
		return 0, 0
	}
	lower, upper := values[0], values[0]
	for _, value := range values[1:] {
		lower, upper = math.Min(lower, value), math.Max(upper, value)
	}
	return lower, upper
}

func meanFloat(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

func sampleVariance(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}
	mean := meanFloat(values)
	total := 0.0
	for _, value := range values {
		difference := value - mean
		total += difference * difference
	}
	return total / float64(len(values)-1)
}

func correlation(left, right []float64) float64 {
	if len(left) != len(right) || len(left) < 2 {
		return 0
	}
	leftMean, rightMean := meanFloat(left), meanFloat(right)
	numerator, leftSquares, rightSquares := 0.0, 0.0, 0.0
	for index := range left {
		leftDifference, rightDifference := left[index]-leftMean, right[index]-rightMean
		numerator += leftDifference * rightDifference
		leftSquares += leftDifference * leftDifference
		rightSquares += rightDifference * rightDifference
	}
	denominator := math.Sqrt(leftSquares * rightSquares)
	if denominator == 0 {
		return 0
	}
	return numerator / denominator
}

func residualVarianceRatio(values, predictor []float64) float64 {
	if len(values) != len(predictor) || len(values) < 2 {
		return 0
	}
	valueMean, predictorMean := meanFloat(values), meanFloat(predictor)
	covariance, predictorSquares, totalSquares := 0.0, 0.0, 0.0
	for index := range values {
		valueDifference, predictorDifference := values[index]-valueMean, predictor[index]-predictorMean
		covariance += valueDifference * predictorDifference
		predictorSquares += predictorDifference * predictorDifference
		totalSquares += valueDifference * valueDifference
	}
	if totalSquares == 0 || predictorSquares == 0 {
		return 0
	}
	slope := covariance / predictorSquares
	residualSquares := 0.0
	for index := range values {
		predicted := valueMean + slope*(predictor[index]-predictorMean)
		difference := values[index] - predicted
		residualSquares += difference * difference
	}
	return residualSquares / totalSquares
}
