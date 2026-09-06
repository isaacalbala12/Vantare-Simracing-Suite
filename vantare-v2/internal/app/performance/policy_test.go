package performance

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

func TestCadenceForLevelTwoMatchesCurrentDefault(t *testing.T) {
	want := overlayv2.DefaultSectionCadence()
	for _, level := range []Level{LevelHigh} {
		if got := CadenceFor(level); !reflect.DeepEqual(got, want) {
			t.Fatalf("CadenceFor(%d) = %+v, want paridad exacta %+v", level, got, want)
		}
	}
}

func TestMaximumCadenceServesFastestSharedConsumer(t *testing.T) {
	c := CadenceFor(LevelMaximum)
	for section, hz := range map[overlayv2.Section]int{
		overlayv2.SectionPlayer: 60, overlayv2.SectionControls: 60,
		overlayv2.SectionDelta: 60, overlayv2.SectionRelative: 30,
		overlayv2.SectionStandings: 30, // map shares standings positions
		overlayv2.SectionFuel:      2,
	} {
		if got := c.IntervalFor(section); got != time.Second/time.Duration(hz) {
			t.Errorf("%s interval=%v want %dHz", section, got, hz)
		}
	}
	if c.Spotter != overlayv2.DefaultSectionCadence().Spotter || c.Session != overlayv2.DefaultSectionCadence().Session {
		t.Fatal("safety cadence changed")
	}
}

func TestApprovedWidgetCeilings(t *testing.T) {
	for widget, capHz := range map[string]int{"standings": 4, "relative": 30, "track-map": 30, "pedals": 60, "delta": 60, "fuel-strategy": 2} {
		for level := LevelMaximum; level <= LevelMinimum; level++ {
			rate := WidgetHzFor(level)[widget]
			if hz, ok := rate.Hertz(); ok && hz > capHz || rate.IsMonitor() {
				t.Errorf("%s level%d exceeds %dHz: %+v", widget, level, capHz, rate)
			}
		}
		if hz, ok := WidgetHzFor(LevelMaximum)[widget].Hertz(); !ok || hz != capHz {
			t.Errorf("maximum %s want %dHz", widget, capHz)
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

func TestResolveUsesProfileAndAcceptsAutomaticControllerDecision(t *testing.T) {
	app := Policy{Mode: ModeLevel, Level: LevelSaving, SourceHz: 60}
	profile := &Policy{Mode: ModeLevel, Level: LevelHigh, SourceHz: 50}
	got := Resolve(app, profile)
	if got.Level != LevelHigh || got.Mode != ModeLevel || got.SourceHz != 50 || got.RafCap == nil || *got.RafCap != 60 {
		t.Fatalf("override resuelto = %+v", got)
	}

	auto := ResolveAuto(LevelSaving, ReasonCPU)
	if auto.Level != LevelSaving || auto.Mode != ModeAuto || auto.Reason != ReasonCPU {
		t.Fatalf("auto resuelto = %+v", auto)
	}
	invalidAuto := ResolveAuto(LevelMaximum, "")
	if invalidAuto.Level != LevelBalanced || invalidAuto.Reason != "" {
		t.Fatalf("auto inválido = %+v", invalidAuto)
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
