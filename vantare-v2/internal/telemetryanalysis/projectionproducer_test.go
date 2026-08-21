package telemetryanalysis

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type projectionProducerExpected struct {
	ContractVersion string                        `json:"contractVersion"`
	CombinationID   string                        `json:"combinationId"`
	SourceSessions  []string                      `json:"sourceSessions"`
	Families        map[string]expectedFamilyAxes `json:"families"`
}

type expectedFamilyAxes struct {
	Presence   strategyprojection.Presence       `json:"presence"`
	Provenance strategyprojection.ProvenanceKind `json:"provenance"`
	SampleSize int                               `json:"sampleSize"`
	Reason     string                            `json:"reason"`
}

type actualFamilyAxes struct {
	presence   strategyprojection.Presence
	provenance strategyprojection.ProvenanceKind
	confidence strategyprojection.Confidence
	reason     string
}

func TestProduceStrategyInputProjectionV2ComposesIndependentFamilies(t *testing.T) {
	data, err := os.ReadFile("testdata/projection-producer-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var want projectionProducerExpected
	if err := json.Unmarshal(data, &want); err != nil {
		t.Fatal(err)
	}

	request := projectionProducerFixture()
	got, err := ProduceStrategyInputProjectionV2(request)
	if err != nil {
		t.Fatalf("produce projection: %v", err)
	}
	if string(got.ContractVersion) != want.ContractVersion || got.CombinationID != want.CombinationID {
		t.Fatalf("projection identity = %q/%q", got.ContractVersion, got.CombinationID)
	}
	if len(got.SourceSessions) != len(want.SourceSessions) {
		t.Fatalf("source sessions = %#v", got.SourceSessions)
	}
	for index := range want.SourceSessions {
		if got.SourceSessions[index] != want.SourceSessions[index] {
			t.Fatalf("source sessions = %#v", got.SourceSessions)
		}
	}

	actual := projectionFamilyAxes(got)
	for name, expected := range want.Families {
		t.Run(name, func(t *testing.T) {
			family, ok := actual[name]
			if !ok {
				t.Fatalf("family %q absent", name)
			}
			if family.presence != expected.Presence || family.provenance != expected.Provenance ||
				family.confidence.SampleSize != expected.SampleSize || family.reason != expected.Reason {
				t.Fatalf("axes = %#v, want %#v", family, expected)
			}
			if family.confidence.ComputationVersion == "" {
				t.Fatal("computation version must be explicit")
			}
		})
	}
	if len(actual) != len(want.Families) {
		t.Fatalf("family inventory = %d, want %d", len(actual), len(want.Families))
	}
	if got.FuelConsumption.ByClimateBucket[strategyprojection.ClimateBucketDry] != 3.0 {
		t.Fatalf("dry fuel = %#v", got.FuelConsumption.ByClimateBucket)
	}
	if got.VirtualEnergyConsumption.ByClimateBucket[strategyprojection.ClimateBucketHumid] != 1.5 {
		t.Fatalf("humid VE from independent session = %#v", got.VirtualEnergyConsumption.ByClimateBucket)
	}
	if len(got.Pit.ObservedIntervals) != 1 || !got.Pit.ObservedIntervals[0].Ambiguous {
		t.Fatalf("degraded pit not preserved: %#v", got.Pit)
	}
	if len(got.Temporal.Segments) != 1 || len(got.Temporal.Gaps) != 1 {
		t.Fatalf("temporal evidence = %#v", got.Temporal)
	}
}

func TestProjectionProducerConsumerContractOldAndNewFixtures(t *testing.T) {
	produced, err := ProduceStrategyInputProjectionV2(projectionProducerFixture())
	if err != nil {
		t.Fatal(err)
	}
	wire, err := json.Marshal(produced)
	if err != nil {
		t.Fatal(err)
	}
	var consumed strategyprojection.StrategyInputProjectionV2
	if err := json.Unmarshal(wire, &consumed); err != nil {
		t.Fatalf("new producer -> v2 consumer decode: %v", err)
	}
	if err := consumed.Validate(); err != nil {
		t.Fatalf("new producer -> v2 consumer validate: %v", err)
	}

	for _, tc := range []struct {
		name      string
		path      string
		wantValid bool
	}{
		{
			name:      "existing new fixture",
			path:      "strategyprojection/testdata/strategyinputprojection_v2_new.json",
			wantValid: true,
		},
		{
			name:      "existing old fixture",
			path:      "strategyprojection/testdata/strategyinputprojection_v1_old.json",
			wantValid: false,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data, err := os.ReadFile(tc.path)
			if err != nil {
				t.Fatal(err)
			}
			var projection strategyprojection.StrategyInputProjectionV2
			if err := json.Unmarshal(data, &projection); err != nil {
				t.Fatal(err)
			}
			err = projection.Validate()
			if tc.wantValid && err != nil {
				t.Fatalf("fixture should validate: %v", err)
			}
			if !tc.wantValid && err == nil {
				t.Fatal("old wire contract must fail closed in v2 consumer")
			}
		})
	}
}

func projectionProducerFixture() ProjectionProductionRequest {
	generatedAt := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	combination := CombinationIdentity{
		ID: "combo-real", SimID: SimIDLMU, TrackName: "Fuji", TrackLayout: "Classic",
		CarName: "Hypercar", CarClass: "Hypercar",
	}
	dry := strategyprojection.ClimateBucketDry
	humid := strategyprojection.ClimateBucketHumid
	start := secondsTimestamp(0)
	middle := secondsTimestamp(100)
	end := secondsTimestamp(200)
	gapEnd := secondsTimestamp(250)
	delta := 0.25
	intervalStart := secondsTimestamp(120)
	intervalEnd := secondsTimestamp(150)

	first := ProjectionSessionDerivations{
		Classified: ClassifiedSession{
			SessionID: "race-1", Combination: combination, Type: SessionTypeRace,
			WeatherConditions: "Clear", Status: SessionStatusIdentifiedUsable,
			Families: []FamilyUsability{
				{Family: FamilyFuelConsumption, Usable: true},
				{Family: FamilyCombinedStintPaceCurve, Usable: true},
				{Family: FamilyPit, Usable: true},
			},
		},
		Validity: &LapValidityAnalysis{
			Temporal: strategyprojection.TemporalSegmentsV1{
				ContractVersion: strategyprojection.ContractVersionTemporalSegmentsV1,
				Segments: []strategyprojection.ContinuousSegment{
					{
						SegmentID: "segment-1", SessionStartTs: start, SessionEndTs: end,
						Reason: "local_driver_window", Presence: strategyprojection.PresenceValid,
						Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceObserved, SourceID: "race-1"},
						Confidence: strategyprojection.Confidence{SampleSize: 20, ComputationVersion: "lap-validity.v1"},
					},
				},
				Gaps: []strategyprojection.CoverageGap{
					{
						GapID: "gap-1", StartTs: end, EndTs: gapEnd, Reason: "no_coverage",
						Presence:   strategyprojection.PresenceMissing,
						Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "race-1"},
					},
				},
				LapBoundaries:   []strategyprojection.LapBoundary{},
				StintBoundaries: []strategyprojection.StintBoundary{},
			},
			Laps: []AnalyzedLap{
				{
					Number: 1, Start: &start, End: middle, LapTimeSeconds: floatPointer(100), Complete: true,
					Labels: []LapLabel{LapLabelOutLap},
					FamilyUse: []LapFamilyUse{{
						Family:           FamilyCombinedStintPaceCurve,
						Included:         false,
						ExclusionReasons: []LapExclusionReason{LapExclusionOutLap},
					}},
				},
				{
					Number: 2, Start: &middle, End: end, LapTimeSeconds: floatPointer(100), Complete: true,
					Labels: []LapLabel{}, FamilyUse: []LapFamilyUse{{Family: FamilyCombinedStintPaceCurve, Included: true}},
				},
			},
		},
		Consumption: &SessionConsumptionPace{
			SessionID: "race-1", CombinationID: combination.ID, Laps: []LapConsumptionPace{},
			ByClimateBucket: map[strategyprojection.ClimateBucket]ClimateBucketConsumptionPace{
				dry: {
					FuelConsumption:          resourceFamily("race-1", 3.0, 4, dry),
					VirtualEnergyConsumption: missingResourceFamily("race-1", "missing_virtual_energy_samples"),
					RepresentativePace: RepresentativePaceFamily{
						Presence:         strategyprojection.PresenceValid,
						Provenance:       strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "race-1"},
						Confidence:       strategyprojection.Confidence{SampleSize: 4, ComputationVersion: "consumption-pace.v1"},
						MedianLapSeconds: 100,
					},
				},
			},
		},
		Curves: &SessionDerivedCurves{
			SessionID: "race-1", CombinationID: combination.ID,
			Stints:          []StintDerivedCurve{},
			ByClimateBucket: map[strategyprojection.ClimateBucket]ClimateDerivedCurves{},
			TyreDegradation: strategyprojection.TyreDegradationFamily{
				Presence:            strategyprojection.PresenceValid,
				Provenance:          strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "race-1"},
				Confidence:          strategyprojection.Confidence{SampleSize: 2, ComputationVersion: "derived-curves.v1"},
				ByAxle:              map[strategyprojection.TyreAxle]float64{strategyprojection.TyreAxleFront: 0.02},
				ByWheel:             map[strategyprojection.TyreWheel]float64{},
				LifeLapsByWheel:     map[strategyprojection.TyreWheel]float64{},
				CompoundPresence:    strategyprojection.PresenceUnsupported,
				CompoundMappingNote: "unsupported raw compound mapping",
			},
			SavingCost: strategyprojection.SavingCostFamily{
				Presence:   strategyprojection.PresenceMissing,
				Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "race-1"},
				Confidence: strategyprojection.Confidence{ComputationVersion: "derived-curves.v1"},
				ManualNote: "missing_fuel_mixture_levels", Levels: []strategyprojection.SavingLevel{},
			},
			normalized: []normalizedCurveSample{
				{stint: 1, lapInStint: 1, bucket: dry, delta: delta, presence: strategyprojection.PresenceValid},
			},
		},
		Pit: &SessionPitObservation{
			SessionID: "race-1", CombinationID: combination.ID,
			Family: strategyprojection.PitFamily{
				Presence:   strategyprojection.PresenceUnknown,
				Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "race-1"},
				Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "pit-observation.v1"},
				ObservedIntervals: []strategyprojection.ObservedPitLaneInterval{
					{
						PitNumber: 1, StartTimestamp: &intervalStart, EndTimestamp: &intervalEnd,
						DurationSeconds: 30, Ambiguous: true, AmbiguityReason: "no_resource_rise_detected",
					},
				},
				RatesNote: pitRatesNote,
			},
		},
	}
	second := ProjectionSessionDerivations{
		Classified: ClassifiedSession{
			SessionID: "practice-2", Combination: combination, Type: SessionTypePractice,
			WeatherConditions: "Drizzle", Status: SessionStatusIdentifiedUsable,
			Families: []FamilyUsability{{Family: FamilyVirtualEnergyConsumption, Usable: true}},
		},
		Consumption: &SessionConsumptionPace{
			SessionID: "practice-2", CombinationID: combination.ID, Laps: []LapConsumptionPace{},
			ByClimateBucket: map[strategyprojection.ClimateBucket]ClimateBucketConsumptionPace{
				humid: {
					FuelConsumption:          missingResourceFamily("practice-2", "missing_fuel_samples"),
					VirtualEnergyConsumption: resourceFamily("practice-2", 1.5, 3, humid),
					RepresentativePace: RepresentativePaceFamily{
						Presence:   strategyprojection.PresenceMissing,
						Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: "practice-2"},
						Confidence: strategyprojection.Confidence{ComputationVersion: "consumption-pace.v1"},
					},
				},
			},
		},
	}
	return ProjectionProductionRequest{
		GeneratedAt: generatedAt,
		Combination: combination,
		Sessions:    []ProjectionSessionDerivations{first, second},
	}
}

func projectionFamilyAxes(projection strategyprojection.StrategyInputProjectionV2) map[string]actualFamilyAxes {
	return map[string]actualFamilyAxes{
		"sessionClassification": familyAxes(
			projection.SessionClassification.Presence,
			projection.SessionClassification.Provenance.Kind,
			projection.SessionClassification.Confidence,
			projection.SessionClassification.Reason,
		),
		"lapValidity": familyAxes(
			projection.LapValidity.Presence,
			projection.LapValidity.Provenance.Kind,
			projection.LapValidity.Confidence,
			projection.LapValidity.Reason,
		),
		"fuelConsumption": familyAxes(
			projection.FuelConsumption.Presence,
			projection.FuelConsumption.Provenance.Kind,
			projection.FuelConsumption.Confidence,
			projection.FuelConsumption.Reason,
		),
		"virtualEnergyConsumption": familyAxes(
			projection.VirtualEnergyConsumption.Presence,
			projection.VirtualEnergyConsumption.Provenance.Kind,
			projection.VirtualEnergyConsumption.Confidence,
			projection.VirtualEnergyConsumption.Reason,
		),
		"combinedStintPaceCurve": familyAxes(
			projection.CombinedStintPaceCurve.Presence,
			projection.CombinedStintPaceCurve.Provenance.Kind,
			projection.CombinedStintPaceCurve.Confidence,
			projection.CombinedStintPaceCurve.Reason,
		),
		"tyreDegradation": familyAxes(
			projection.TyreDegradation.Presence,
			projection.TyreDegradation.Provenance.Kind,
			projection.TyreDegradation.Confidence,
			projection.TyreDegradation.Reason,
		),
		"pit": familyAxes(
			projection.Pit.Presence,
			projection.Pit.Provenance.Kind,
			projection.Pit.Confidence,
			projection.Pit.Reason,
		),
		"savingCost": familyAxes(
			projection.SavingCost.Presence,
			projection.SavingCost.Provenance.Kind,
			projection.SavingCost.Confidence,
			projection.SavingCost.Reason,
		),
		"climateBuckets": familyAxes(
			projection.ClimateBuckets.Presence,
			projection.ClimateBuckets.Provenance.Kind,
			projection.ClimateBuckets.Confidence,
			projection.ClimateBuckets.Reason,
		),
	}
}

func familyAxes(
	presence strategyprojection.Presence,
	provenance strategyprojection.ProvenanceKind,
	confidence strategyprojection.Confidence,
	reason string,
) actualFamilyAxes {
	return actualFamilyAxes{
		presence:   presence,
		provenance: provenance,
		confidence: confidence,
		reason:     reason,
	}
}

func resourceFamily(
	sourceID string,
	value float64,
	sampleSize int,
	bucket strategyprojection.ClimateBucket,
) strategyprojection.ResourceConsumptionFamily {
	return strategyprojection.ResourceConsumptionFamily{
		Presence:   strategyprojection.PresenceValid,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence: strategyprojection.Confidence{
			SampleSize: sampleSize, RangeLower: floatPointer(value), RangeUpper: floatPointer(value),
			Variance: floatPointer(0), ComputationVersion: "consumption-pace.v1",
		},
		MeanPerLap: value, RangeLower: value, RangeUpper: value,
		ByClimateBucket: map[strategyprojection.ClimateBucket]float64{bucket: value},
	}
}

func missingResourceFamily(sourceID, reason string) strategyprojection.ResourceConsumptionFamily {
	return strategyprojection.ResourceConsumptionFamily{
		Presence:        strategyprojection.PresenceMissing,
		Provenance:      strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: sourceID},
		Confidence:      strategyprojection.Confidence{ComputationVersion: "consumption-pace.v1"},
		Reason:          reason,
		ByClimateBucket: map[strategyprojection.ClimateBucket]float64{},
	}
}
