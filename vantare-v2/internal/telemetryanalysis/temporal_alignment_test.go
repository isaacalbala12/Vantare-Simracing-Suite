package telemetryanalysis

import (
	"math"
	"testing"
)

func TestBuildTemporalAlignmentUsesExactGPSClock(t *testing.T) {
	session, pages := temporalAlignmentFixture(100, 20)
	result := BuildTemporalAlignment(session, pages)

	if !result.Bridge.Aligned || result.Bridge.Reason != "aligned" {
		t.Fatalf("bridge = %+v", result.Bridge)
	}
	if status := result.Channels["fuel"]; !status.Aligned || status.Reason != "aligned" {
		t.Fatalf("fuel status = %+v", status)
	}
	got := result.Pages[1].Samples[1].TimestampSeconds
	if got == nil || math.Abs(*got-1000.051) > 1e-9 {
		t.Fatalf("aligned timestamp = %v, want 1000.051", got)
	}
	if result.Pages[1].Samples[1].RelativeTimeSeconds == *got {
		t.Fatal("alignment reused the relative clock")
	}
	if result.Pages[1].Sampling.Origin != TimeOriginSourceTimestamp || result.Session.Channels[1].Sampling.Origin != TimeOriginSourceTimestamp {
		t.Fatal("aligned sampling origin was not exposed")
	}
	if result.Session.Channels[1].Provenance.TimeOrigin != TimeOriginUnknown {
		t.Fatal("source provenance was rewritten")
	}
}

func TestBuildTemporalAlignmentFailsClosedForInvalidBridge(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*HistoricalSession, *[]HistoricalPage)
		reason string
	}{
		{name: "absent", mutate: func(session *HistoricalSession, pages *[]HistoricalPage) {
			session.Channels = session.Channels[1:]
			*pages = (*pages)[1:]
		}, reason: "bridge_absent"},
		{name: "backwards", mutate: func(_ *HistoricalSession, pages *[]HistoricalPage) {
			(*pages)[0].Samples[2].Values[0].Scalar.Number = 999
		}, reason: "bridge_non_monotonic"},
		{name: "duplicate timestamp", mutate: func(_ *HistoricalSession, pages *[]HistoricalPage) {
			(*pages)[0].Samples[2].Values[0].Scalar.Number = (*pages)[0].Samples[1].Values[0].Scalar.Number
		}, reason: "bridge_non_monotonic"},
		{name: "non finite", mutate: func(_ *HistoricalSession, pages *[]HistoricalPage) {
			(*pages)[0].Samples[2].Values[0].Scalar.Number = math.Inf(1)
		}, reason: "bridge_invalid_value"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			session, pages := temporalAlignmentFixture(100, 20)
			test.mutate(&session, &pages)
			result := BuildTemporalAlignment(session, pages)
			if result.Bridge.Aligned || result.Bridge.Reason != test.reason {
				t.Fatalf("bridge = %+v, want %q", result.Bridge, test.reason)
			}
			for _, page := range result.Pages {
				if page.Sampling.Kind == SamplingContinuousImplicitFrequency && page.Sampling.Origin == TimeOriginSourceTimestamp {
					t.Fatalf("continuous page %q aligned after bridge failure", page.ChannelID)
				}
			}
		})
	}
}

func TestBuildTemporalAlignmentReportsPerChannelFailures(t *testing.T) {
	t.Run("incompatible frequency", func(t *testing.T) {
		session, pages := temporalAlignmentFixture(100, 30)
		session.Channels = append(session.Channels, HistoricalChannel{ID: "speed", SourceName: "Speed", Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginUnknown}, Columns: []HistoricalColumn{{Name: "Speed", Type: ScalarNumber}}})
		pages = append(pages, HistoricalPage{ChannelID: "speed", Sampling: session.Channels[2].Sampling, Samples: []HistoricalSample{{Index: 1, Values: []HistoricalValue{numberValue("Speed", 42)}}}})
		result := BuildTemporalAlignment(session, pages)
		if !result.Bridge.Aligned {
			t.Fatalf("bridge = %+v", result.Bridge)
		}
		if status := result.Channels["fuel"]; status.Aligned || status.Reason != "incompatible_frequency" {
			t.Fatalf("fuel status = %+v", status)
		}
		if status := result.Channels["speed"]; !status.Aligned || status.Reason != "aligned" {
			t.Fatalf("speed status = %+v; one bad channel invalidated another", status)
		}
	})

	t.Run("truncated coverage", func(t *testing.T) {
		session, pages := temporalAlignmentFixture(100, 20)
		pages[0].Samples = pages[0].Samples[:5]
		result := BuildTemporalAlignment(session, pages)
		if status := result.Channels["fuel"]; status.Aligned || status.Reason != "truncated_coverage" {
			t.Fatalf("fuel status = %+v", status)
		}
	})
}

func TestBuildTemporalAlignmentDeepClonesInputs(t *testing.T) {
	session, pages := temporalAlignmentFixture(100, 20)
	originalEnd := *session.Laps[0].EndSeconds
	originalValue := pages[1].Samples[0].Values[0].Scalar.Number
	result := BuildTemporalAlignment(session, pages)

	result.Session.Metadata[0].Value = "changed"
	*result.Session.Laps[0].EndSeconds = 99
	result.Session.Channels[0].Columns[0].Name = "changed"
	result.Pages[1].Samples[0].Values[0].Scalar.Number = 99
	*result.Pages[1].Samples[0].TimestampSeconds = 99

	if session.Metadata[0].Value != "original" || *session.Laps[0].EndSeconds != originalEnd || session.Channels[0].Columns[0].Name != "GPS Time" {
		t.Fatal("result session aliases input session")
	}
	if pages[1].Samples[0].Values[0].Scalar.Number != originalValue || pages[1].Samples[0].TimestampSeconds != nil {
		t.Fatal("result pages alias input pages")
	}
}

func temporalAlignmentFixture(gpsHz, fuelHz int) (HistoricalSession, []HistoricalPage) {
	end := 10.0
	session := HistoricalSession{
		Metadata: []HistoricalMetadata{{Key: "fixture", Value: "original"}},
		Laps:     []HistoricalLap{{Number: 1, EndSeconds: &end}},
		Channels: []HistoricalChannel{
			{ID: "gps", SourceName: " GPS Time ", Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: gpsHz, Origin: TimeOriginUnknown}, Columns: []HistoricalColumn{{Name: "GPS Time", Type: ScalarNumber}}, Provenance: ChannelProvenance{TimeOrigin: TimeOriginUnknown}},
			{ID: "fuel", SourceName: "Fuel Level", Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: fuelHz, Origin: TimeOriginUnknown}, Columns: []HistoricalColumn{{Name: "Fuel Level", Type: ScalarNumber}}, Provenance: ChannelProvenance{TimeOrigin: TimeOriginUnknown}},
		},
	}
	gpsSamples := make([]HistoricalSample, 0, 11)
	for index := int64(0); index <= 10; index++ {
		gpsSamples = append(gpsSamples, HistoricalSample{Index: index, RelativeTimeSeconds: float64(index) / float64(gpsHz), Values: []HistoricalValue{numberValue("GPS Time", 1000.001+float64(index)*0.01)}})
	}
	pages := []HistoricalPage{
		{ChannelID: "gps", Sampling: session.Channels[0].Sampling, Samples: gpsSamples},
		{ChannelID: "fuel", Sampling: session.Channels[1].Sampling, Samples: []HistoricalSample{
			{Index: 0, RelativeTimeSeconds: 0, Values: []HistoricalValue{numberValue("Fuel Level", 100)}},
			{Index: 1, RelativeTimeSeconds: 1 / float64(fuelHz), Values: []HistoricalValue{numberValue("Fuel Level", 99)}},
			{Index: 2, RelativeTimeSeconds: 2 / float64(fuelHz), Values: []HistoricalValue{numberValue("Fuel Level", 98)}},
		}},
	}
	return session, pages
}

func numberValue(column string, value float64) HistoricalValue {
	return HistoricalValue{Column: column, Present: true, Quality: QualityValid, Scalar: HistoricalScalar{Kind: ScalarNumber, Number: value}}
}
