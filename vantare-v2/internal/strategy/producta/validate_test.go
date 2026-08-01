package producta

import (
	"math"
	"testing"
)

func TestValidateDraftRequiresCompleteRace(t *testing.T) {
	draft := Draft{Race: RaceInput{Kind: RaceByTime}}

	result := ValidateDraft(draft)

	assertDiagnostic(t, result.Errors, "race.duration_required", "race.durationSeconds")
	assertDiagnostic(t, result.Errors, "race.lap_time_required", "race.lapTimeSeconds")
}

func TestValidateDraftTreatsZeroConsumptionAsUnused(t *testing.T) {
	draft := validDraft()
	draft.Fuel = ResourceInput{Enabled: false, Capacity: 0, ConsumptionPerLap: 0}
	draft.VirtualEnergy = ResourceInput{Enabled: false, Capacity: 0, ConsumptionPerLap: 0}

	result := ValidateDraft(draft)

	if len(result.Errors) != 0 {
		t.Fatalf("zero-consumption resources should be valid when unused: %#v", result.Errors)
	}
}

func TestValidateDraftWarnsWhenStartExceedsCapacity(t *testing.T) {
	draft := validDraft()
	draft.Fuel = ResourceInput{Enabled: true, Capacity: 10, StartAmount: 12, ConsumptionPerLap: 1}

	result := ValidateDraft(draft)

	assertDiagnostic(t, result.Warnings, "fuel.start_exceeds_capacity", "fuel.startAmount")
	if len(result.Errors) != 0 {
		t.Fatalf("capacity warning should not make draft invalid: %#v", result.Errors)
	}
}

func TestValidateDraftRejectsNegativeAndNonFiniteOperationalValues(t *testing.T) {
	draft := validDraft()
	draft.Race.Laps = -1
	draft.Race.LapTimeSeconds = math.NaN()
	draft.Fuel = ResourceInput{Enabled: true, Capacity: -1, ConsumptionPerLap: math.Inf(1)}

	result := ValidateDraft(draft)

	assertDiagnostic(t, result.Errors, "race.laps_positive", "race.laps")
	assertDiagnostic(t, result.Errors, "race.lap_time_finite", "race.lapTimeSeconds")
	assertDiagnostic(t, result.Errors, "fuel.capacity_non_negative", "fuel.capacity")
	assertDiagnostic(t, result.Errors, "fuel.consumption_finite", "fuel.consumptionPerLap")
}

func validDraft() Draft {
	return Draft{
		Race: RaceInput{Kind: RaceByLaps, Laps: 30, LapTimeSeconds: 120},
		Fuel: ResourceInput{Enabled: true, Capacity: 100, StartAmount: 50, ConsumptionPerLap: 2},
	}
}

func assertDiagnostic(t *testing.T, diagnostics []Diagnostic, code, field string) {
	t.Helper()
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == code && diagnostic.Field == field && diagnostic.MessageKey != "" {
			return
		}
	}
	t.Fatalf("diagnostic %q for field %q not found in %#v", code, field, diagnostics)
}
