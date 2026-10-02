package lmu

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

func TestRESTCurrentWeatherFieldValidation(t *testing.T) {
	wall := time.Unix(100, 0).UTC()
	stamp := monotonicStamp{set: true}
	for _, test := range []struct {
		name, raw string
		quality   schema.Freshness
	}{
		{"missing", "", schema.FreshnessMissing},
		{"null", "null", schema.FreshnessMissing},
		{"dry is observed", "0", schema.FreshnessFresh},
		{"maximum", "1", schema.FreshnessFresh},
		{"partial", "0.25", schema.FreshnessFresh},
		{"negative", "-0.1", schema.FreshnessInvalid},
		{"percent is not fraction", "25", schema.FreshnessInvalid},
		{"string", `"0.2"`, schema.FreshnessInvalid},
		{"boolean", "false", schema.FreshnessInvalid},
		{"overflow", "1e999", schema.FreshnessInvalid},
	} {
		t.Run(test.name, func(t *testing.T) {
			got := parseRESTWeatherNumber[weather.Fraction](json.RawMessage(test.raw), 0, 1, wall, stamp)
			if got.Field.Freshness() != test.quality {
				t.Fatalf("quality = %v", got.Field.Freshness())
			}
		})
	}
}

func TestCurrentWeatherCacheFusionAndSessionLifetime(t *testing.T) {
	wall := time.Unix(100, 0).UTC()
	stamp := monotonicStamp{set: true}
	var info restSessionInfo
	if err := json.Unmarshal([]byte(`{"trackName":"Track-A","session":"RACE1","currentEventTime":10,"raining":0.25,"averagePathWetness":0.5,"windSpeed":{"x":3,"y":0,"z":4}}`), &info); err != nil {
		t.Fatal(err)
	}
	fields, err := validateSessionFields(info, wall, stamp)
	if err != nil {
		t.Fatal(err)
	}
	cache := restCache{}
	cache.applySession(fields)
	rest := restObservation(wall, 0, "Track-A")
	snapshot := cache.snapshot()
	rest.REST.WetnessFraction = snapshot.WetnessFraction
	fusion := new(Fusion)
	merged := fusion.Merge(wall, 0, sharedObservation(wall, "Track-A"), rest)
	assertFieldValue(t, merged.WetnessFraction, weather.Fraction(0.5))
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, merged, sink)
	batch := sink.last(t)
	assertFieldValue(t, batch.State.WetnessFraction, weather.Fraction(0.5))
	stale := fusion.Merge(wall, 3*time.Second, sharedObservation(wall, "Track-A"))
	if stale.WetnessFraction.Freshness() != schema.FreshnessStale {
		t.Fatal("weather did not expire")
	}
	changed := fusion.Merge(wall, 4*time.Second, sharedObservation(wall, "Track-B"))
	if changed.WetnessFraction.Freshness() != schema.FreshnessMissing {
		t.Fatal("previous-session weather survived")
	}
}
