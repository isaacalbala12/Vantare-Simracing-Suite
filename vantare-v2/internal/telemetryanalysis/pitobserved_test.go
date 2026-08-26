package telemetryanalysis

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type pitExpectedFixture struct {
	Cases []struct {
		Name                string                      `json:"name"`
		Origin              TimeOrigin                  `json:"origin"`
		FuelValues          []float64                   `json:"fuelValues"`
		VEValues            []float64                   `json:"veValues"`
		Presence            strategyprojection.Presence `json:"presence"`
		Ambiguous           bool                        `json:"ambiguous"`
		AmbiguityReason     string                      `json:"ambiguityReason"`
		FuelAddedLiters     *float64                    `json:"fuelAddedLiters"`
		FuelRateLPerS       *float64                    `json:"fuelRateLPerS"`
		VEAddedPercent      *float64                    `json:"veAddedPercent"`
		VERatePercentPerSec *float64                    `json:"veRatePercentPerSec"`
	} `json:"cases"`
}

func TestDeriveSessionPitObservationKeepsDegradedBoundary(t *testing.T) {
	data, err := os.ReadFile("testdata/pit-observed-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture pitExpectedFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}

	for _, tc := range fixture.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			session, classified, pages := pitFixtureSession(tc.Origin, tc.FuelValues, tc.VEValues)
			got, err := DeriveSessionPitObservation(session, pages, classified)
			if err != nil {
				t.Fatalf("derive pit: %v", err)
			}
			if got.Family.Presence != tc.Presence {
				t.Fatalf("presence = %q, want %q", got.Family.Presence, tc.Presence)
			}
			if len(got.Family.ObservedIntervals) != 1 {
				t.Fatalf("interval count = %d, want 1", len(got.Family.ObservedIntervals))
			}
			interval := got.Family.ObservedIntervals[0]
			if interval.Ambiguous != tc.Ambiguous || interval.AmbiguityReason != tc.AmbiguityReason {
				t.Fatalf(
					"ambiguity = %v/%q, want %v/%q",
					interval.Ambiguous,
					interval.AmbiguityReason,
					tc.Ambiguous,
					tc.AmbiguityReason,
				)
			}
			assertOptionalFloat(t, "fuel added", interval.FuelAddedLiters, tc.FuelAddedLiters)
			assertOptionalFloat(t, "fuel rate", interval.FuelRateLPerS, tc.FuelRateLPerS)
			assertOptionalFloat(t, "VE added", interval.VEAddedPercent, tc.VEAddedPercent)
			assertOptionalFloat(t, "VE rate", interval.VERatePPerS, tc.VERatePercentPerSec)
		})
	}
}

func TestAggregatePitObservationsFiltersCombinationAndKeepsRateAxes(t *testing.T) {
	current := pitObservationFixture("race-a", "combo-a", 2.0, 2.5)
	history := []SessionPitObservation{
		pitObservationFixture("race-b", "combo-a", 4.0, 2.4),
		pitObservationFixture("other", "combo-b", 9.0, 9.0),
		pitObservationFixture("race-a", "combo-a", 3.0, 3.0),
	}

	got, err := AggregatePitObservations(current, history)
	if err != nil {
		t.Fatalf("aggregate pit: %v", err)
	}
	if len(got.SourceSessions) != 2 || got.SourceSessions[0] != "race-a" || got.SourceSessions[1] != "race-b" {
		t.Fatalf("source sessions = %#v", got.SourceSessions)
	}
	if got.Family.FuelRate.Confidence.SampleSize != 2 || got.Family.FuelRate.Mean != 3.0 {
		t.Fatalf("fuel rate summary = %#v", got.Family.FuelRate)
	}
	if got.Family.FuelRate.Confidence.RangeLower == nil || *got.Family.FuelRate.Confidence.RangeLower != 2.0 ||
		got.Family.FuelRate.Confidence.RangeUpper == nil || *got.Family.FuelRate.Confidence.RangeUpper != 4.0 {
		t.Fatalf("fuel range = %#v", got.Family.FuelRate.Confidence)
	}
	wrongVESampleSize := got.Family.VERate.Confidence.SampleSize != 2
	wrongVEProvenance := got.Family.VERate.Provenance.Kind != strategyprojection.ProvenanceDerived
	if wrongVESampleSize || wrongVEProvenance {
		t.Fatalf("VE rate axes = %#v", got.Family.VERate)
	}
}

func TestDeriveObservedStrategyFromRaceStintsAndObservableChanges(t *testing.T) {
	data, err := os.ReadFile("testdata/observed-strategy-derived-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var want strategyprojection.ObservedStrategyV1
	if err := json.Unmarshal(data, &want); err != nil {
		t.Fatal(err)
	}

	session, classified, pages, validity, pit := observedStrategyFixture()
	got, err := DeriveObservedStrategy(
		session,
		pages,
		classified,
		validity,
		pit,
		want.GeneratedAt,
	)
	if err != nil {
		t.Fatalf("derive observed strategy: %v", err)
	}
	gotJSON, err := json.MarshalIndent(got, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	wantJSON, err := json.MarshalIndent(want, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("observed strategy differs\n got: %s\nwant: %s", gotJSON, wantJSON)
	}
	if err := got.Validate(); err != nil {
		t.Fatalf("validate observed strategy: %v", err)
	}
}

func pitFixtureSession(
	origin TimeOrigin,
	fuelValues []float64,
	veValues []float64,
) (HistoricalSession, ClassifiedSession, []HistoricalPage) {
	channels := []HistoricalChannel{
		pitEventChannel("pit", "In Pits"),
		pitContinuousChannel("fuel", "Fuel Level", origin),
		pitContinuousChannel("ve", "Virtual Energy", origin),
	}
	session := HistoricalSession{ID: "race-a", Channels: channels}
	classified := ClassifiedSession{
		SessionID:   session.ID,
		Combination: CombinationIdentity{ID: "combo-a"},
		Type:        SessionTypeRace,
	}
	pages := []HistoricalPage{
		pitEventPage("pit", []pitEventValue{{seconds: 2, value: true}, {seconds: 6, value: false}}),
		pitContinuousPage("fuel", origin, fuelValues),
		pitContinuousPage("ve", origin, veValues),
	}
	return session, classified, pages
}

func pitObservationFixture(sessionID, combinationID string, fuelRate, veRate float64) SessionPitObservation {
	interval := strategyprojection.ObservedPitLaneInterval{
		PitNumber: 1, DurationSeconds: 4, FuelRateLPerS: floatPointer(fuelRate), VERatePPerS: floatPointer(veRate),
		HasFuelRise: true, HasVERise: true,
	}
	return SessionPitObservation{
		SessionID: sessionID, CombinationID: combinationID,
		Family:    strategyprojection.PitFamily{ObservedIntervals: []strategyprojection.ObservedPitLaneInterval{interval}},
		fuelRates: []float64{fuelRate}, veRates: []float64{veRate},
	}
}

func observedStrategyFixture() (
	HistoricalSession,
	ClassifiedSession,
	[]HistoricalPage,
	LapValidityAnalysis,
	SessionPitObservation,
) {
	origin := TimeOriginSourceTimestamp
	session := HistoricalSession{
		ID: "race-observed",
		Channels: []HistoricalChannel{
			pitEventChannel("compound", "TyresCompound"),
			pitEventChannel("finish", "Finish Status"),
			pitContinuousChannelAtFrequency("wear", "Tyres Wear", origin, 1),
			pitContinuousChannelAtFrequency("lap-dist", "Lap Dist", origin, 1),
		},
	}
	classified := ClassifiedSession{
		SessionID:   session.ID,
		Combination: CombinationIdentity{ID: "combo-a"},
		Type:        SessionTypeRace,
	}
	pages := []HistoricalPage{
		{
			ChannelID: "compound", Sampling: session.Channels[0].Sampling,
			Samples: []HistoricalSample{
				pitVectorEventSample(0, 0, 0, 0, 0),
				pitVectorEventSample(40, 1, 1, 1, 1),
			},
		},
		pitEventPage("finish", []pitEventValue{{seconds: 60, value: true}}),
		pitWearPage("wear", origin),
		pitLapDistancePage("lap-dist", origin),
	}
	laps := make([]AnalyzedLap, 0, 6)
	for number := 1; number <= 6; number++ {
		start := secondsTimestamp(float64((number - 1) * 10))
		lapSeconds := 100.0
		laps = append(laps, AnalyzedLap{
			Number: number, Start: &start, End: secondsTimestamp(float64(number * 10)),
			LapTimeSeconds: &lapSeconds, Complete: true, Labels: []LapLabel{},
		})
	}
	validity := LapValidityAnalysis{
		Temporal: strategyprojection.TemporalSegmentsV1{
			ContractVersion: strategyprojection.ContractVersionTemporalSegmentsV1,
			StintBoundaries: []strategyprojection.StintBoundary{
				{
					StintNumber: 2, Timestamp: secondsTimestamp(20), Cause: strategyprojection.StintCauseFuelJump,
					Presence:   strategyprojection.PresenceUnknown,
					Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: session.ID},
					Confidence: strategyprojection.Confidence{
						SampleSize: 2, RangeLower: floatPointer(20), RangeUpper: floatPointer(20),
						ComputationVersion: "lap-validity.v1",
					},
				},
				{
					StintNumber: 3, Timestamp: secondsTimestamp(40), Cause: strategyprojection.StintCauseTyreChange,
					Presence:   strategyprojection.PresenceValid,
					Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceDerived, SourceID: session.ID},
					Confidence: strategyprojection.Confidence{SampleSize: 2, ComputationVersion: "lap-validity.v1"},
				},
			},
		},
		Laps: laps,
	}
	start, end := secondsTimestamp(20), secondsTimestamp(24)
	pit := SessionPitObservation{
		SessionID: session.ID, CombinationID: "combo-a",
		Family: strategyprojection.PitFamily{
			Presence: strategyprojection.PresenceUnknown,
			ObservedIntervals: []strategyprojection.ObservedPitLaneInterval{
				{
					PitNumber: 1, StartTimestamp: &start, EndTimestamp: &end, DurationSeconds: 4,
					FuelAddedLiters: floatPointer(20), FuelRateLPerS: floatPointer(4), HasFuelRise: true,
				},
			},
		},
	}
	return session, classified, pages, validity, pit
}

type pitEventValue struct {
	seconds float64
	value   bool
}

func pitEventChannel(id, name string) HistoricalChannel {
	return HistoricalChannel{
		ID:         id,
		SourceName: name,
		Sampling: HistoricalSampling{
			Kind:   SamplingEventTimestamped,
			Origin: TimeOriginSourceTimestamp,
		},
	}
}

func pitContinuousChannel(id, name string, origin TimeOrigin) HistoricalChannel {
	return pitContinuousChannelAtFrequency(id, name, origin, 2)
}

func pitContinuousChannelAtFrequency(id, name string, origin TimeOrigin, frequency int) HistoricalChannel {
	return HistoricalChannel{
		ID:         id,
		SourceName: name,
		Sampling: HistoricalSampling{
			Kind:        SamplingContinuousImplicitFrequency,
			FrequencyHz: frequency,
			Origin:      origin,
		},
	}
}

func pitEventPage(id string, values []pitEventValue) HistoricalPage {
	samples := make([]HistoricalSample, 0, len(values))
	for index, value := range values {
		seconds := value.seconds
		samples = append(samples, HistoricalSample{
			Index: int64(index), TimestampSeconds: &seconds,
			Values: []HistoricalValue{{
				Present: true,
				Quality: QualityValid,
				Scalar:  HistoricalScalar{Kind: ScalarBoolean, Boolean: value.value},
			}},
		})
	}
	return HistoricalPage{
		ChannelID: id,
		Sampling: HistoricalSampling{
			Kind:   SamplingEventTimestamped,
			Origin: TimeOriginSourceTimestamp,
		},
		Samples: samples,
	}
}

func pitContinuousPage(id string, origin TimeOrigin, values []float64) HistoricalPage {
	samples := make([]HistoricalSample, 0, len(values))
	for index, value := range values {
		samples = append(samples, HistoricalSample{
			Index: int64(index), RelativeTimeSeconds: float64(index) / 2,
			Values: []HistoricalValue{{
				Present: true,
				Quality: QualityValid,
				Scalar:  HistoricalScalar{Kind: ScalarNumber, Number: value},
			}},
		})
	}
	return HistoricalPage{
		ChannelID: id,
		Sampling:  HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 2, Origin: origin},
		Samples:   samples,
	}
}

func pitVectorEventSample(seconds float64, values ...float64) HistoricalSample {
	historical := make([]HistoricalValue, 0, len(values))
	for _, value := range values {
		historical = append(historical, HistoricalValue{
			Present: true,
			Quality: QualityValid,
			Scalar:  HistoricalScalar{Kind: ScalarNumber, Number: value},
		})
	}
	return HistoricalSample{TimestampSeconds: &seconds, Values: historical}
}

func pitWearPage(id string, origin TimeOrigin) HistoricalPage {
	values := make([]float64, 61)
	for index := range values {
		values[index] = 90
	}
	for index := 40; index < len(values); index++ {
		values[index] += 8
	}
	page := pitContinuousPage(id, origin, values)
	page.Sampling.FrequencyHz = 1
	for index := range page.Samples {
		page.Samples[index].Index = int64(index)
		page.Samples[index].RelativeTimeSeconds = float64(index)
		value := page.Samples[index].Values[0]
		page.Samples[index].Values = []HistoricalValue{value, value, value, value}
	}
	return page
}

func pitLapDistancePage(id string, origin TimeOrigin) HistoricalPage {
	values := make([]float64, 61)
	for index := range values {
		values[index] = float64(index%10) * 500
	}
	page := pitContinuousPage(id, origin, values)
	page.Sampling.FrequencyHz = 1
	for index := range page.Samples {
		page.Samples[index].Index = int64(index)
		page.Samples[index].RelativeTimeSeconds = float64(index)
	}
	return page
}

func assertOptionalFloat(t *testing.T, label string, got, want *float64) {
	t.Helper()
	if got == nil || want == nil {
		if got != nil || want != nil {
			t.Fatalf("%s = %v, want %v", label, got, want)
		}
		return
	}
	if *got != *want {
		t.Fatalf("%s = %v, want %v", label, *got, *want)
	}
}

var _ = time.Time{}
