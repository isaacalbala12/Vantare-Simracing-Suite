package producta

import (
	"math"
	"testing"
)

func TestPitDurationSimultaneousExplainsComponents(t *testing.T) {
	breakdown, err := PitDuration(PitStop{
		EntrySeconds:      5,
		TransitSeconds:    10,
		ExitSeconds:       5,
		RefuelSeconds:     30,
		TyreChangeSeconds: 20,
		RepairSeconds:     4,
		PenaltySeconds:    2,
		ServiceMode:       PitServiceSimultaneous,
	})
	if err != nil {
		t.Fatalf("pit duration: %v", err)
	}
	if breakdown.ServiceSeconds != 30 || breakdown.TotalSeconds != 56 {
		t.Fatalf("unexpected simultaneous breakdown: %#v", breakdown)
	}
	assertPitComponent(t, breakdown, "entry", 5)
	assertPitComponent(t, breakdown, "transit", 10)
	assertPitComponent(t, breakdown, "service", 30)
	assertPitComponent(t, breakdown, "repair", 4)
	assertPitComponent(t, breakdown, "penalty", 2)
}

func TestPitDurationSequentialSumsServices(t *testing.T) {
	breakdown, err := PitDuration(PitStop{
		EntrySeconds:      5,
		TransitSeconds:    10,
		ExitSeconds:       5,
		RefuelSeconds:     30,
		TyreChangeSeconds: 20,
		ServiceMode:       PitServiceSequential,
	})
	if err != nil {
		t.Fatalf("pit duration: %v", err)
	}
	if breakdown.ServiceSeconds != 50 || breakdown.TotalSeconds != 70 {
		t.Fatalf("unexpected sequential breakdown: %#v", breakdown)
	}
}

func TestPitDurationAllowsServiceWithoutRefuelOrTyres(t *testing.T) {
	breakdown, err := PitDuration(PitStop{TransitSeconds: 12, PenaltySeconds: 5, ServiceMode: PitServiceSimultaneous})
	if err != nil {
		t.Fatalf("pit duration: %v", err)
	}
	if breakdown.TotalSeconds != 17 || breakdown.ServiceSeconds != 0 {
		t.Fatalf("unexpected service-only breakdown: %#v", breakdown)
	}
}

func TestPitDurationRejectsInvalidValuesAndMode(t *testing.T) {
	if _, err := PitDuration(PitStop{RefuelSeconds: math.NaN()}); err == nil {
		t.Fatal("expected non-finite refuel time to fail")
	}
	if _, err := PitDuration(PitStop{ServiceMode: PitServiceMode("unknown")}); err == nil {
		t.Fatal("expected unknown service mode to fail")
	}
}

func TestLMUPitPresetHasNoUnconfirmedTimingDefaults(t *testing.T) {
	if LMUPitPreset.EntrySeconds != 0 || LMUPitPreset.TransitSeconds != 0 || LMUPitPreset.ExitSeconds != 0 || LMUPitPreset.RefuelSeconds != 0 || LMUPitPreset.TyreChangeSeconds != 0 {
		t.Fatalf("LMU preset must remain neutral until confirmed: %#v", LMUPitPreset)
	}
}

func assertPitComponent(t *testing.T, breakdown PitBreakdown, name string, seconds float64) {
	t.Helper()
	for _, component := range breakdown.Components {
		if component.Name == name && component.Seconds == seconds {
			return
		}
	}
	t.Fatalf("component %q %.2f not found in %#v", name, seconds, breakdown.Components)
}
