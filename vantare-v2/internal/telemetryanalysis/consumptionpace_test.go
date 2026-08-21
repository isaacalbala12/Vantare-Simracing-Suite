package telemetryanalysis

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type consumptionPaceFixture struct {
	FixtureVersion     string                       `json:"fixtureVersion"`
	FixtureID          string                       `json:"fixtureId"`
	CombinationID      string                       `json:"combinationId"`
	PathWetnessPercent float64                      `json:"pathWetnessPercent"`
	Laps               []consumptionPaceFixtureLap  `json:"laps"`
	Expected           consumptionPaceFixtureExpect `json:"expected"`
}

type consumptionPaceFixtureLap struct {
	Number    int        `json:"number"`
	Start     float64    `json:"start"`
	End       float64    `json:"end"`
	Labels    []LapLabel `json:"labels"`
	FuelStart float64    `json:"fuelStart"`
	FuelEnd   float64    `json:"fuelEnd"`
	VEStart   float64    `json:"veStart"`
	VEEnd     float64    `json:"veEnd"`
}

type consumptionPaceFixtureExpect struct {
	Bucket         strategyprojection.ClimateBucket `json:"bucket"`
	FuelSampleSize int                              `json:"fuelSampleSize"`
	FuelMean       float64                          `json:"fuelMean"`
	FuelVariance   float64                          `json:"fuelVariance"`
	VESampleSize   int                              `json:"veSampleSize"`
	VEMean         float64                          `json:"veMean"`
	VEVariance     float64                          `json:"veVariance"`
	PaceSampleSize int                              `json:"paceSampleSize"`
	PaceMedian     float64                          `json:"paceMedian"`
	PaceVariance   float64                          `json:"paceVariance"`
	TrafficLap     int                              `json:"trafficLap"`
}

func TestDeriveSessionConsumptionPaceVersionedFixtures(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		file string
	}{
		{name: "seco", file: "consumption-pace-dry-v1.json"},
		{name: "llovizna S040", file: "consumption-pace-s040-drizzle-v1.json"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			fixture := loadConsumptionPaceFixture(t, test.file)
			session, pages, classified, validity := consumptionPaceFixtureInput(fixture)

			got, err := DeriveSessionConsumptionPace(session, pages, classified, validity)
			if err != nil {
				t.Fatalf("DeriveSessionConsumptionPace() error = %v", err)
			}
			bucket, ok := got.ByClimateBucket[fixture.Expected.Bucket]
			if !ok || len(got.ByClimateBucket) != 1 {
				t.Fatalf("climate buckets = %+v", got.ByClimateBucket)
			}
			assertResourceFamily(t, bucket.FuelConsumption, fixture.Expected.FuelSampleSize, fixture.Expected.FuelMean, fixture.Expected.FuelVariance)
			assertResourceFamily(t, bucket.VirtualEnergyConsumption, fixture.Expected.VESampleSize, fixture.Expected.VEMean, fixture.Expected.VEVariance)
			assertDerivedAxes(t, bucket.RepresentativePace.Presence, bucket.RepresentativePace.Provenance, bucket.RepresentativePace.Confidence)
			assertNear(t, bucket.RepresentativePace.MedianLapSeconds, fixture.Expected.PaceMedian)
			if bucket.RepresentativePace.Confidence.SampleSize != fixture.Expected.PaceSampleSize || bucket.RepresentativePace.Confidence.Variance == nil {
				t.Fatalf("pace confidence = %+v", bucket.RepresentativePace.Confidence)
			}
			assertNear(t, *bucket.RepresentativePace.Confidence.Variance, fixture.Expected.PaceVariance)

			traffic := findDerivedLap(t, got.Laps, fixture.Expected.TrafficLap)
			if !traffic.HasLabel(LapLabelTraffic) || traffic.RepresentativePace != nil {
				t.Fatalf("traffic lap must stay tagged and be excluded only from representative pace: %+v", traffic)
			}
			if traffic.FuelConsumption == nil || traffic.VirtualEnergyConsumption == nil {
				t.Fatalf("traffic lap must remain usable for consumption: %+v", traffic)
			}
			for _, lap := range got.Laps {
				for _, value := range []*DerivedMetric{lap.FuelConsumption, lap.VirtualEnergyConsumption, lap.RepresentativePace} {
					if value != nil {
						assertDerivedAxes(t, value.Presence, value.Provenance, value.Confidence)
					}
				}
			}
		})
	}
}

func TestDeriveSessionConsumptionPaceNeverCrossesGapOrPit(t *testing.T) {
	fixture := loadConsumptionPaceFixture(t, "consumption-pace-dry-v1.json")
	session, pages, classified, validity := consumptionPaceFixtureInput(fixture)
	gapStart, gapEnd := fixtureTime(30), fixtureTime(32)
	validity.Temporal.Segments = []strategyprojection.ContinuousSegment{
		fixtureSegment("before", 0, 30), fixtureSegment("after", 32, 56),
	}
	validity.Temporal.Gaps = []strategyprojection.CoverageGap{{
		GapID: "gap", StartTs: gapStart, EndTs: gapEnd,
		Presence:   strategyprojection.PresenceMissing,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: fixture.FixtureID},
	}}

	got, err := DeriveSessionConsumptionPace(session, pages, classified, validity)
	if err != nil {
		t.Fatal(err)
	}
	gapLap := findDerivedLap(t, got.Laps, 3)
	if gapLap.FuelConsumption != nil || gapLap.VirtualEnergyConsumption != nil || gapLap.RepresentativePace != nil {
		t.Fatalf("lap crossing CoverageGap produced values: %+v", gapLap)
	}
	pitLap := findDerivedLap(t, got.Laps, 5)
	if pitLap.FuelConsumption != nil || pitLap.VirtualEnergyConsumption != nil || pitLap.RepresentativePace != nil {
		t.Fatalf("pit lap produced values: %+v", pitLap)
	}
}

func TestDeriveSessionConsumptionPaceRejectsInvalidSegmentQuality(t *testing.T) {
	fixture := loadConsumptionPaceFixture(t, "consumption-pace-dry-v1.json")
	session, pages, classified, validity := consumptionPaceFixtureInput(fixture)
	validity.Temporal.Segments[0].Presence = strategyprojection.PresenceInvalid

	got, err := DeriveSessionConsumptionPace(session, pages, classified, validity)
	if err != nil {
		t.Fatal(err)
	}
	bucket, ok := got.ByClimateBucket[strategyprojection.ClimateBucketDry]
	if !ok || bucket.FuelConsumption.Presence != strategyprojection.PresenceMissing ||
		bucket.VirtualEnergyConsumption.Presence != strategyprojection.PresenceMissing ||
		bucket.RepresentativePace.Presence != strategyprojection.PresenceMissing {
		t.Fatalf("invalid segment quality did not declare missing families: %+v", got.ByClimateBucket)
	}
	for _, lap := range got.Laps {
		if lap.FuelConsumption != nil || lap.VirtualEnergyConsumption != nil || lap.RepresentativePace != nil {
			t.Fatalf("invalid segment quality produced values: %+v", lap)
		}
	}
}

func TestAggregateConsumptionPaceWeightsQualityAndScopesHistory(t *testing.T) {
	current := aggregateFixtureSession("current", "combo", strategyprojection.PresenceValid, 2, 10)
	historyUnknown := aggregateFixtureSession("history-unknown", "combo", strategyprojection.PresenceUnknown, 4, 12)
	historyOtherCombo := aggregateFixtureSession("other", "other-combo", strategyprojection.PresenceValid, 100, 20)

	got, err := AggregateConsumptionPace(current, []SessionConsumptionPace{historyUnknown, historyOtherCombo})
	if err != nil {
		t.Fatal(err)
	}
	bucket := got.ByClimateBucket[strategyprojection.ClimateBucketDry]
	// valid weighs 1 and unknown weighs 0.5: (2*1 + 4*0.5) / 1.5.
	assertNear(t, bucket.FuelConsumption.MeanPerLap, 8.0/3.0)
	if bucket.FuelConsumption.Confidence.SampleSize != 2 {
		t.Fatalf("aggregate N = %d, expected two matching sessions", bucket.FuelConsumption.Confidence.SampleSize)
	}
	if got.SourceSessions[0] != "current" || got.SourceSessions[1] != "history-unknown" || len(got.SourceSessions) != 2 {
		t.Fatalf("source sessions leaked another combination: %v", got.SourceSessions)
	}
	if bucket.PacePercentile == nil {
		t.Fatal("missing current pace percentile")
	}
	assertDerivedAxes(t, bucket.PacePercentile.Presence, bucket.PacePercentile.Provenance, bucket.PacePercentile.Confidence)
	assertNear(t, bucket.PacePercentile.Value, 100) // 10 s is faster than the 12 s history.
}

func loadConsumptionPaceFixture(t *testing.T, name string) consumptionPaceFixture {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	var fixture consumptionPaceFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.FixtureVersion != "consumption-pace-fixture.v1" {
		t.Fatalf("fixture version = %q", fixture.FixtureVersion)
	}
	return fixture
}

func consumptionPaceFixtureInput(fixture consumptionPaceFixture) (HistoricalSession, []HistoricalPage, ClassifiedSession, LapValidityAnalysis) {
	channels := []HistoricalChannel{
		fixtureContinuousChannel("fuel", "Fuel Level"),
		fixtureContinuousChannel("ve", "Virtual Energy"),
		fixtureEventChannel("wetness", "Minimum Path Wetness"),
	}
	session := HistoricalSession{SchemaVersion: HistoricalSchemaVersion, ID: fixture.FixtureID, Channels: channels}
	pages := []HistoricalPage{
		{ChannelID: "fuel", Sampling: channels[0].Sampling},
		{ChannelID: "ve", Sampling: channels[1].Sampling},
		{ChannelID: "wetness", Sampling: channels[2].Sampling, Samples: []HistoricalSample{fixtureEventSample(0, fixture.PathWetnessPercent)}},
	}
	validity := LapValidityAnalysis{Temporal: strategyprojection.TemporalSegmentsV1{
		ContractVersion: strategyprojection.ContractVersionTemporalSegmentsV1,
		Segments:        []strategyprojection.ContinuousSegment{fixtureSegment("whole", 0, fixture.Laps[len(fixture.Laps)-1].End)},
		Gaps:            []strategyprojection.CoverageGap{},
		LapBoundaries:   []strategyprojection.LapBoundary{},
		StintBoundaries: []strategyprojection.StintBoundary{},
	}}
	for _, source := range fixture.Laps {
		pages[0].Samples = append(pages[0].Samples, fixtureContinuousSample(source.Start, source.FuelStart), fixtureContinuousSample(source.End, source.FuelEnd))
		pages[1].Samples = append(pages[1].Samples, fixtureContinuousSample(source.Start, source.VEStart), fixtureContinuousSample(source.End, source.VEEnd))
		start, end := fixtureTime(source.Start), fixtureTime(source.End)
		lapTime := source.End - source.Start
		validity.Laps = append(validity.Laps, AnalyzedLap{
			Number: source.Number, Start: &start, End: end, LapTimeSeconds: &lapTime,
			Complete: true, Labels: append([]LapLabel(nil), source.Labels...),
		})
		validity.Temporal.LapBoundaries = append(validity.Temporal.LapBoundaries, strategyprojection.LapBoundary{
			LapNumber: source.Number, Timestamp: end, Source: strategyprojection.LapBoundarySourceReconciled,
			Quality:    strategyprojection.PresenceValid,
			Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: fixture.FixtureID},
			Confidence: strategyprojection.Confidence{SampleSize: 2, ComputationVersion: "fixture.v1"},
			Location:   strategyprojection.TrackLocation{Presence: strategyprojection.PresenceValid},
		})
	}
	classified := ClassifiedSession{SessionID: fixture.FixtureID, Combination: CombinationIdentity{ID: fixture.CombinationID}}
	return session, pages, classified, validity
}

func fixtureContinuousChannel(id, name string) HistoricalChannel {
	return HistoricalChannel{ID: id, SourceName: name, Sampling: HistoricalSampling{
		Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 1, Origin: TimeOriginUnknown,
	}}
}

func fixtureEventChannel(id, name string) HistoricalChannel {
	return HistoricalChannel{ID: id, SourceName: name, Sampling: HistoricalSampling{
		Kind: SamplingEventTimestamped, Origin: TimeOriginSourceTimestamp,
	}}
}

func fixtureContinuousSample(seconds, value float64) HistoricalSample {
	return HistoricalSample{Index: int64(seconds), RelativeTimeSeconds: seconds, Values: []HistoricalValue{fixtureNumber(value)}}
}

func fixtureEventSample(seconds, value float64) HistoricalSample {
	return HistoricalSample{Index: int64(seconds), TimestampSeconds: &seconds, Values: []HistoricalValue{fixtureNumber(value)}}
}

func fixtureNumber(value float64) HistoricalValue {
	return HistoricalValue{Column: "value", Present: true, Quality: QualityValid, Scalar: HistoricalScalar{Kind: ScalarNumber, Number: value}}
}

func fixtureSegment(id string, start, end float64) strategyprojection.ContinuousSegment {
	return strategyprojection.ContinuousSegment{
		SegmentID: id, SessionStartTs: fixtureTime(start), SessionEndTs: fixtureTime(end), Reason: "fixture",
		Presence:   strategyprojection.PresenceValid,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceObserved, SourceID: "fixture"},
		Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "fixture.v1"},
	}
}

func fixtureTime(seconds float64) time.Time { return time.UnixMilli(int64(seconds * 1000)).UTC() }

func assertResourceFamily(t *testing.T, got strategyprojection.ResourceConsumptionFamily, sampleSize int, mean, variance float64) {
	t.Helper()
	assertDerivedAxes(t, got.Presence, got.Provenance, got.Confidence)
	if got.Confidence.SampleSize != sampleSize || got.Confidence.Variance == nil {
		t.Fatalf("resource confidence = %+v", got.Confidence)
	}
	assertNear(t, got.MeanPerLap, mean)
	assertNear(t, *got.Confidence.Variance, variance)
}

func assertDerivedAxes(t *testing.T, presence strategyprojection.Presence, provenance strategyprojection.Provenance, confidence strategyprojection.Confidence) {
	t.Helper()
	if !presence.Valid() || provenance.Kind != strategyprojection.ProvenanceDerived || confidence.ComputationVersion == "" {
		t.Fatalf("incomplete derived axes: presence=%q provenance=%+v confidence=%+v", presence, provenance, confidence)
	}
}

func assertNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-9 {
		t.Fatalf("got %.12f, want %.12f", got, want)
	}
}

func findDerivedLap(t *testing.T, laps []LapConsumptionPace, number int) LapConsumptionPace {
	t.Helper()
	for _, lap := range laps {
		if lap.Number == number {
			return lap
		}
	}
	t.Fatalf("lap %d not found", number)
	return LapConsumptionPace{}
}

func aggregateFixtureSession(id, combination string, presence strategyprojection.Presence, fuel, pace float64) SessionConsumptionPace {
	provenance := strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: id}
	confidence := strategyprojection.Confidence{SampleSize: 1, RangeLower: &fuel, RangeUpper: &fuel, ComputationVersion: "fixture.v1"}
	return SessionConsumptionPace{
		SessionID: id, CombinationID: combination,
		ByClimateBucket: map[strategyprojection.ClimateBucket]ClimateBucketConsumptionPace{
			strategyprojection.ClimateBucketDry: {
				FuelConsumption:          strategyprojection.ResourceConsumptionFamily{Presence: presence, Provenance: provenance, Confidence: confidence, MeanPerLap: fuel, RangeLower: fuel, RangeUpper: fuel},
				VirtualEnergyConsumption: strategyprojection.ResourceConsumptionFamily{Presence: presence, Provenance: provenance, Confidence: confidence, MeanPerLap: fuel, RangeLower: fuel, RangeUpper: fuel},
				RepresentativePace:       RepresentativePaceFamily{Presence: presence, Provenance: provenance, Confidence: confidence, MedianLapSeconds: pace},
			},
		},
	}
}
