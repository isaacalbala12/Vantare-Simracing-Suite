package performance

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

func TestCadenceForLevelsOneAndTwoMatchesCurrentDefault(t *testing.T) {
	want := overlayv2.DefaultSectionCadence()
	for _, level := range []Level{LevelMaximum, LevelHigh} {
		if got := CadenceFor(level); !reflect.DeepEqual(got, want) {
			t.Fatalf("CadenceFor(%d) = %+v, want paridad exacta %+v", level, got, want)
		}
	}
}

func TestCadenceForScalesTiersAndKeepsOneSecondCeiling(t *testing.T) {
	tests := []struct {
		level Level
		want  overlayv2.SectionCadence
	}{
		{LevelBalanced, overlayv2.SectionCadence{Fast: 75 * time.Millisecond, Mid: 150 * time.Millisecond, Slow: 375 * time.Millisecond, Spotter: 100 * time.Millisecond, Session: 250 * time.Millisecond, DirtyCeiling: time.Second}},
		{LevelSaving, overlayv2.SectionCadence{Fast: 100 * time.Millisecond, Mid: 200 * time.Millisecond, Slow: 500 * time.Millisecond, Spotter: 100 * time.Millisecond, Session: 250 * time.Millisecond, DirtyCeiling: time.Second}},
		{LevelMinimum, overlayv2.SectionCadence{Fast: 150 * time.Millisecond, Mid: 300 * time.Millisecond, Slow: 750 * time.Millisecond, Spotter: 100 * time.Millisecond, Session: 250 * time.Millisecond, DirtyCeiling: time.Second}},
	}
	for _, test := range tests {
		if got := CadenceFor(test.level); !reflect.DeepEqual(got, test.want) {
			t.Errorf("CadenceFor(%d) = %+v, want %+v", test.level, got, test.want)
		}
	}
}

func TestSafetyChangesHaveOneTickP99AtLevelsOneAndFive(t *testing.T) {
	for _, level := range []Level{LevelMaximum, LevelMinimum} {
		scheduler := overlayv2.NewSectionScheduler(CadenceFor(level))
		now := time.Unix(0, 0)
		scheduler.Plan(now, overlayv2.AllDirty())
		latencies := make([]int, 100)
		for sample := range latencies {
			now = now.Add(time.Millisecond)
			plan := scheduler.Plan(now, overlayv2.SafetyDirty(overlayv2.SectionSession)|overlayv2.SafetyDirty(overlayv2.SectionSpotter))
			if !plan.Rebuild(overlayv2.SectionSession) || !plan.Rebuild(overlayv2.SectionSpotter) {
				t.Fatalf("nivel %d muestra %d no publicó seguridad en el tick siguiente", level, sample)
			}
			latencies[sample] = 1
		}
		if got := latencies[98]; got != 1 {
			t.Fatalf("nivel %d p99 = %d ticks, want 1", level, got)
		}
		cadence := CadenceFor(level)
		if cadence.IntervalFor(overlayv2.SectionSpotter) != 100*time.Millisecond || cadence.IntervalFor(overlayv2.SectionSession) != 250*time.Millisecond {
			t.Fatalf("nivel %d escaló intervalos de seguridad: %+v", level, cadence)
		}
	}
}

func TestSafetyWidgetsStayEventDrivenAtEveryLevel(t *testing.T) {
	for level := LevelMaximum; level <= LevelMinimum; level++ {
		rates := WidgetHzFor(level)
		for _, widget := range []string{"racing-flags", "engineer-radio"} {
			if got := rates[widget].Signal(); got != "event" {
				t.Errorf("nivel %d %s = %q, want event", level, widget, got)
			}
		}
	}
}

func TestResolveUsesProfileAndKeepsAutoInBalancedUntilSensorExists(t *testing.T) {
	app := Policy{Mode: ModeLevel, Level: LevelSaving, SourceHz: 60}
	profile := &Policy{Mode: ModeLevel, Level: LevelHigh, SourceHz: 50}
	got := Resolve(app, profile)
	if got.Level != LevelHigh || got.Mode != ModeLevel || got.SourceHz != 50 || got.RafCap == nil || *got.RafCap != 60 {
		t.Fatalf("override resuelto = %+v", got)
	}

	auto := Resolve(Policy{Mode: ModeAuto, Level: LevelMinimum}, nil)
	if auto.Level != LevelBalanced || auto.Mode != ModeAuto || auto.Reason != "auto no disponible" {
		t.Fatalf("auto resuelto = %+v", auto)
	}
}

func TestWidgetRateJSONMatchesWireValues(t *testing.T) {
	got, err := json.Marshal([]WidgetRate{Hertz(20), Dirty(), Event(), Monitor()})
	if err != nil {
		t.Fatal(err)
	}
	if want := `[20,"dirty","event",null]`; string(got) != want {
		t.Fatalf("widget rates = %s, want %s", got, want)
	}
}
