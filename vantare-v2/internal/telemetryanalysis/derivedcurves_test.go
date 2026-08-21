package telemetryanalysis

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type derivedCurvesFixture struct {
	FixtureVersion string                           `json:"fixtureVersion"`
	FixtureID      string                           `json:"fixtureId"`
	CombinationID  string                           `json:"combinationId"`
	Bucket         strategyprojection.ClimateBucket `json:"bucket"`
	Stints         []derivedCurvesFixtureStint      `json:"stints"`
	Expected       derivedCurvesFixtureExpected     `json:"expected"`
}

type derivedCurvesFixtureStint struct {
	Laps             int     `json:"laps"`
	StartFuelLitres  float64 `json:"startFuelLitres"`
	FuelPerLapLitres float64 `json:"fuelPerLapLitres"`
	BaseLapSeconds   float64 `json:"baseLapSeconds"`
	FuelSecondsPerL  float64 `json:"fuelSecondsPerLitre"`
	AgeSecondsPerLap float64 `json:"ageSecondsPerLap"`
	WearPerLap       float64 `json:"wearPerLapPercent"`
	MixtureCodes     []int   `json:"mixtureCodes,omitempty"`
	MixtureFuelDelta float64 `json:"mixtureFuelDelta,omitempty"`
	MixtureTimeDelta float64 `json:"mixtureTimeDelta,omitempty"`
}

type derivedCurvesFixtureExpected struct {
	Identifiability strategyprojection.Identifiability `json:"identifiability"`
	GateReason      string                             `json:"gateReason"`
	StintCurves     int                                `json:"stintCurves"`
	CombinedPoints  int                                `json:"combinedPoints"`
	WearSlope       float64                            `json:"wearSlope"`
	SavingPresence  strategyprojection.Presence        `json:"savingPresence"`
	SavingReason    string                             `json:"savingReason"`
	SavingFuel      float64                            `json:"savingFuel,omitempty"`
	SavingTime      float64                            `json:"savingTime,omitempty"`
}

func TestDeriveSessionCurvesVersionedFixtures(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		file string
	}{
		{name: "diseño cruzado separable", file: "derived-curves-crossed-v1.json"},
		{name: "corpus real colineal", file: "derived-curves-corpus-v1.json"},
		{name: "protocolo A B", file: "derived-curves-ab-v1.json"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			fixture := loadDerivedCurvesFixture(t, test.file)
			session, pages, classified, validity, pace := derivedCurvesFixtureInput(fixture)

			got, err := DeriveSessionCurves(session, pages, classified, validity, pace)
			if err != nil {
				t.Fatalf("DeriveSessionCurves() error = %v", err)
			}
			bucket, ok := got.ByClimateBucket[fixture.Bucket]
			if !ok || len(got.ByClimateBucket) != 1 {
				t.Fatalf("buckets = %+v", got.ByClimateBucket)
			}
			if bucket.CombinedStintPaceCurve.Identifiability != fixture.Expected.Identifiability {
				t.Fatalf("identifiability = %q, want %q", bucket.CombinedStintPaceCurve.Identifiability, fixture.Expected.Identifiability)
			}
			if bucket.IdentifiabilityGate.Reason != fixture.Expected.GateReason {
				t.Fatalf("gate reason = %q, want %q", bucket.IdentifiabilityGate.Reason, fixture.Expected.GateReason)
			}
			if len(got.Stints) != fixture.Expected.StintCurves || len(bucket.CombinedStintPaceCurve.Points) != fixture.Expected.CombinedPoints {
				t.Fatalf("curve sizes = stints %d points %d", len(got.Stints), len(bucket.CombinedStintPaceCurve.Points))
			}
			for _, point := range bucket.CombinedStintPaceCurve.Points {
				if point.SampleSize <= 0 || point.RangeLower == nil || point.RangeUpper == nil {
					t.Fatalf("combined point lacks N/range: %+v", point)
				}
			}
			if fixture.Expected.Identifiability == strategyprojection.IdentifiabilitySeparable {
				if bucket.FuelWeightCurve == nil || bucket.TyreAgeCurve == nil {
					t.Fatalf("separable gate did not publish both curves: %+v", bucket)
				}
			} else if bucket.FuelWeightCurve != nil || bucket.TyreAgeCurve != nil {
				t.Fatalf("combined-only gate published separated curves: %+v", bucket)
			}

			assertNear(t, got.TyreDegradation.ByWheel[strategyprojection.TyreWheelFL], fixture.Expected.WearSlope)
			assertNear(t, got.TyreDegradation.ByWheel[strategyprojection.TyreWheelRR], fixture.Expected.WearSlope)
			if got.TyreDegradation.Confidence.SampleSize == 0 || got.TyreDegradation.Confidence.RangeLower == nil ||
				got.TyreDegradation.Confidence.RangeUpper == nil || got.TyreDegradation.LifeLapsEstimate == nil {
				t.Fatalf("wear lacks range/confidence/life: %+v", got.TyreDegradation)
			}
			if got.TyreDegradation.CompoundPresence != strategyprojection.PresenceUnsupported || got.TyreDegradation.CompoundMappingNote == "" {
				t.Fatalf("compound degradation must be unsupported with reason: %+v", got.TyreDegradation)
			}

			if got.SavingCost.Presence != fixture.Expected.SavingPresence {
				t.Fatalf("saving presence = %q, want %q (%s)", got.SavingCost.Presence, fixture.Expected.SavingPresence, got.SavingCost.ManualNote)
			}
			if fixture.Expected.SavingPresence == strategyprojection.PresenceValid {
				if len(got.SavingCost.Levels) != 2 {
					t.Fatalf("saving levels = %+v", got.SavingCost.Levels)
				}
				saved := savingLevel(t, got.SavingCost.Levels, 1)
				assertNear(t, saved.FuelSavedPerLap, fixture.Expected.SavingFuel)
				assertNear(t, saved.TimeCostPerLap, fixture.Expected.SavingTime)
			} else if got.SavingCost.ManualNote != fixture.Expected.SavingReason || len(got.SavingCost.Levels) != 0 {
				t.Fatalf("missing saving reason/levels = %+v", got.SavingCost)
			}
		})
	}
}

func TestAggregateDerivedCurvesScopesCombinationAndBucket(t *testing.T) {
	fixture := loadDerivedCurvesFixture(t, "derived-curves-crossed-v1.json")
	session, pages, classified, validity, pace := derivedCurvesFixtureInput(fixture)
	current, err := DeriveSessionCurves(session, pages, classified, validity, pace)
	if err != nil {
		t.Fatal(err)
	}
	matching := current
	matching.SessionID = "matching-history"
	otherCombination := current
	otherCombination.SessionID = "other-combination"
	otherCombination.CombinationID = "other"

	got, err := AggregateDerivedCurves(current, []SessionDerivedCurves{matching, otherCombination})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.SourceSessions) != 2 || got.SourceSessions[0] != fixture.FixtureID || got.SourceSessions[1] != "matching-history" {
		t.Fatalf("sources = %v", got.SourceSessions)
	}
	bucket := got.ByClimateBucket[fixture.Bucket]
	if bucket.CombinedStintPaceCurve.Confidence.SampleSize != 6 {
		t.Fatalf("aggregate stint N = %d, want 6", bucket.CombinedStintPaceCurve.Confidence.SampleSize)
	}
}

func TestSavingCostRejectsFivePlusFiveGroupedButNotAlternating(t *testing.T) {
	fixture := loadDerivedCurvesFixture(t, "derived-curves-ab-v1.json")
	fixture.Stints[0].MixtureCodes = []int{0, 0, 0, 0, 0, 1, 1, 1, 1, 1}
	session, pages, classified, validity, pace := derivedCurvesFixtureInput(fixture)

	got, err := DeriveSessionCurves(session, pages, classified, validity, pace)
	if err != nil {
		t.Fatal(err)
	}
	if got.SavingCost.Presence != strategyprojection.PresenceMissing || got.SavingCost.ManualNote != SavingReasonNotAlternating {
		t.Fatalf("grouped A/B must be missing with reason: %+v", got.SavingCost)
	}
}

func loadDerivedCurvesFixture(t *testing.T, name string) derivedCurvesFixture {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	var fixture derivedCurvesFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.FixtureVersion != "derived-curves-fixture.v1" {
		t.Fatalf("fixture version = %q", fixture.FixtureVersion)
	}
	return fixture
}

func derivedCurvesFixtureInput(fixture derivedCurvesFixture) (HistoricalSession, []HistoricalPage, ClassifiedSession, LapValidityAnalysis, SessionConsumptionPace) {
	channels := []HistoricalChannel{
		fixtureContinuousChannel("fuel", "Fuel Level"),
		fixtureContinuousChannel("wear", "Tyres Wear"),
		fixtureEventChannel("mixture", "FuelMixtureMap"),
		fixtureEventChannel("compound", "TyresCompound"),
	}
	channels[1].Sampling.FrequencyHz = 10
	session := HistoricalSession{SchemaVersion: HistoricalSchemaVersion, ID: fixture.FixtureID, Channels: channels}
	pages := []HistoricalPage{
		{ChannelID: "fuel", Sampling: channels[0].Sampling},
		{ChannelID: "wear", Sampling: channels[1].Sampling},
		{ChannelID: "mixture", Sampling: channels[2].Sampling},
		{ChannelID: "compound", Sampling: channels[3].Sampling, Samples: []HistoricalSample{fixtureVectorEventSample(0, []float64{1, 1, 1, 1})}},
	}
	validity := LapValidityAnalysis{Temporal: strategyprojection.TemporalSegmentsV1{
		ContractVersion: strategyprojection.ContractVersionTemporalSegmentsV1,
		Segments:        []strategyprojection.ContinuousSegment{},
		Gaps:            []strategyprojection.CoverageGap{},
		LapBoundaries:   []strategyprojection.LapBoundary{},
		StintBoundaries: []strategyprojection.StintBoundary{},
	}}
	pace := SessionConsumptionPace{
		SessionID: fixture.FixtureID, CombinationID: fixture.CombinationID,
		Laps: []LapConsumptionPace{}, ByClimateBucket: map[strategyprojection.ClimateBucket]ClimateBucketConsumptionPace{},
	}
	seconds := 0.0
	lapNumber := 1
	for stintIndex, stint := range fixture.Stints {
		if stintIndex > 0 {
			validity.Temporal.StintBoundaries = append(validity.Temporal.StintBoundaries, strategyprojection.StintBoundary{
				StintNumber: stintIndex + 1, Timestamp: fixtureTime(seconds), Cause: strategyprojection.StintCausePit,
				Presence:   strategyprojection.PresenceValid,
				Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: fixture.FixtureID},
				Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "fixture.v1"},
			})
		}
		for lapInStint := 1; lapInStint <= stint.Laps; lapInStint++ {
			start := seconds
			fuelStart := stint.StartFuelLitres - float64(lapInStint-1)*stint.FuelPerLapLitres
			fuelPerLap := stint.FuelPerLapLitres
			mixtureCode := 0
			mixtureTime := 0.0
			if len(stint.MixtureCodes) > 0 {
				mixtureCode = stint.MixtureCodes[lapInStint-1]
				if mixtureCode == 1 {
					fuelPerLap -= stint.MixtureFuelDelta
					mixtureTime = stint.MixtureTimeDelta
				}
				pages[2].Samples = append(pages[2].Samples, fixtureEventSample(start, float64(mixtureCode)))
			}
			lapTime := stint.BaseLapSeconds + stint.FuelSecondsPerL*fuelStart + stint.AgeSecondsPerLap*float64(lapInStint) + mixtureTime
			seconds += lapTime
			end := seconds
			wearStart := 100 - float64(lapInStint-1)*stint.WearPerLap
			wearEnd := wearStart - stint.WearPerLap
			pages[0].Samples = append(pages[0].Samples, fixtureContinuousSample(start, fuelStart), fixtureContinuousSample(end, fuelStart-fuelPerLap))
			pages[1].Samples = append(pages[1].Samples,
				fixtureVectorContinuousSample(start, 10, []float64{wearStart, wearStart, wearStart, wearStart}),
				fixtureVectorContinuousSample(end, 10, []float64{wearEnd, wearEnd, wearEnd, wearEnd}),
			)
			startTime, endTime := fixtureTime(start), fixtureTime(end)
			lapTimeCopy := lapTime
			validity.Laps = append(validity.Laps, AnalyzedLap{
				Number: lapNumber, Start: &startTime, End: endTime, LapTimeSeconds: &lapTimeCopy,
				Complete: true, Labels: []LapLabel{}, FamilyUse: cleanFixtureFamilyUses(),
			})
			validity.Temporal.LapBoundaries = append(validity.Temporal.LapBoundaries, strategyprojection.LapBoundary{
				LapNumber: lapNumber, Timestamp: endTime, Source: strategyprojection.LapBoundarySourceReconciled,
				Quality:    strategyprojection.PresenceValid,
				Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: fixture.FixtureID},
				Confidence: strategyprojection.Confidence{SampleSize: 2, ComputationVersion: "fixture.v1"},
				Location:   strategyprojection.TrackLocation{Presence: strategyprojection.PresenceValid},
			})
			bucket := fixture.Bucket
			pace.Laps = append(pace.Laps, LapConsumptionPace{
				Number: lapNumber, Labels: []LapLabel{}, ClimateBucket: &bucket,
				FuelConsumption:    &DerivedMetric{Presence: strategyprojection.PresenceValid, Value: fuelPerLap},
				RepresentativePace: &DerivedMetric{Presence: strategyprojection.PresenceValid, Value: lapTime},
			})
			lapNumber++
		}
	}
	validity.Temporal.Segments = append(validity.Temporal.Segments, fixtureSegment("whole", 0, seconds))
	classified := ClassifiedSession{SessionID: fixture.FixtureID, Combination: CombinationIdentity{ID: fixture.CombinationID}}
	return session, pages, classified, validity, pace
}

func cleanFixtureFamilyUses() []LapFamilyUse {
	return []LapFamilyUse{
		{Family: FamilyCombinedStintPaceCurve, Included: true},
		{Family: FamilyTyreDegradation, Included: true},
		{Family: FamilySavingCost, Included: true},
	}
}

func fixtureVectorContinuousSample(seconds float64, frequency int, values []float64) HistoricalSample {
	return HistoricalSample{Index: int64(math.Round(seconds * float64(frequency))), RelativeTimeSeconds: seconds, Values: fixtureVectorValues(values)}
}

func fixtureVectorEventSample(seconds float64, values []float64) HistoricalSample {
	return HistoricalSample{Index: int64(seconds), TimestampSeconds: floatPointer(seconds), Values: fixtureVectorValues(values)}
}

func fixtureVectorValues(values []float64) []HistoricalValue {
	result := make([]HistoricalValue, len(values))
	for index, value := range values {
		result[index] = fixtureNumber(value)
		result[index].Column = fmt.Sprintf("value%d", index+1)
	}
	return result
}

func savingLevel(t *testing.T, levels []strategyprojection.SavingLevel, code int) strategyprojection.SavingLevel {
	t.Helper()
	for _, level := range levels {
		if level.MixtureCode == code {
			return level
		}
	}
	t.Fatalf("mixture code %d not found in %+v", code, levels)
	return strategyprojection.SavingLevel{}
}

var _ = time.Time{}
