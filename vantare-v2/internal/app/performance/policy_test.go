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

func TestStandingsLevelFiveKeepsNumericTwoHertzCeiling(t *testing.T) {
	rate := WidgetHzFor(LevelMinimum)["standings"]
	hz, ok := rate.Hertz()
	if rate.Signal() != "" || !ok || hz != 2 {
		t.Fatalf("standings nivel 5 = %+v, want 2 Hz", rate)
	}
}

func TestLevelsThreeToFivePublishFullUntilEnduranceVariantsExist(t *testing.T) {
	for level := LevelBalanced; level <= LevelMinimum; level++ {
		resolved := Resolve(Policy{Mode: ModeLevel, Level: level}, nil)
		if resolved.Effects != EffectsFull {
			t.Errorf("nivel %d effects = %q; se esperaba full", level, resolved.Effects)
		}
		if got := Diagnostics(resolved); !reflect.DeepEqual(got, []string{DiagnosticEffectsVariantUnavailable}) {
			t.Errorf("nivel %d diagnósticos = %v", level, got)
		}
	}

	custom := Resolve(Policy{Mode: ModeCustom, Level: LevelMinimum, Effects: EffectsFlat}, nil)
	if custom.Effects != EffectsFull {
		t.Fatalf("custom nivel 5 publicó variante inexistente: %q", custom.Effects)
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
	if auto.Level != LevelBalanced || auto.Mode != ModeAuto || auto.Reason != ReasonUnavailable {
		t.Fatalf("auto resuelto = %+v", auto)
	}
}

func TestResolveNormalizesUnknownReason(t *testing.T) {
	resolved := Resolve(Policy{Mode: ModeLevel, Level: LevelMaximum, Reason: Reason("texto-libre")}, nil)
	if resolved.Reason != ReasonUnavailable {
		t.Fatalf("reason resuelto = %q; se esperaba %q", resolved.Reason, ReasonUnavailable)
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
