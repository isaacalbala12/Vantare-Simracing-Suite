package manual

import (
	"errors"
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

func TestCalculatePitStopSeparatesFixedVariableAndOverlap(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceHigh, "timed manually")
	repair := sourcedDuration(t, 4, manual)
	penalty := sourcedDuration(t, 2, manual)
	base := PitStopInput{
		Entry:         sourcedDuration(t, 5, manual),
		Transit:       sourcedDuration(t, 10, manual),
		Exit:          sourcedDuration(t, 5, manual),
		Refuel:        sourcedDuration(t, 30, manual),
		Tyres:         sourcedDuration(t, 20, manual),
		Repair:        &repair,
		Penalty:       &penalty,
		ModeSelection: manual,
	}

	tests := []struct {
		name         string
		mode         PitServiceMode
		wantFixed    float64
		wantVariable float64
		wantOverlap  float64
		wantTotal    float64
	}{
		{name: "parallel core service", mode: PitServiceParallel, wantFixed: 22, wantVariable: 34, wantOverlap: 20, wantTotal: 56},
		{name: "sequential core service", mode: PitServiceSequential, wantFixed: 22, wantVariable: 54, wantOverlap: 0, wantTotal: 76},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			input := base
			input.ServiceMode = test.mode
			got, err := CalculatePitStop(input)
			if err != nil {
				t.Fatalf("CalculatePitStop: %v", err)
			}
			if got.FixedSeconds.Value() != test.wantFixed || got.VariableSeconds.Value() != test.wantVariable || got.OverlapSavedSeconds.Value() != test.wantOverlap || got.TotalSeconds.Value() != test.wantTotal {
				t.Fatalf("unexpected breakdown: %#v", got)
			}
			if got.CoreServiceSeconds.Value()+got.RepairSeconds.Value() != got.VariableSeconds.Value() {
				t.Fatal("variable time must contain core service exactly once plus repair")
			}
			if got.TravelSeconds.Value()+got.PenaltySeconds.Value() != got.FixedSeconds.Value() {
				t.Fatal("fixed time must contain travel exactly once plus penalty")
			}
			if len(got.Assumptions) != 8 {
				t.Fatalf("all used pit assumptions must be visible, got %d", len(got.Assumptions))
			}
		})
	}
}

func TestCalculatePitStopIncludesVirtualEnergyInServiceOverlap(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceHigh, "timed manually")
	virtualEnergy := sourcedDuration(t, 25, manual)
	input := PitStopInput{
		Entry: sourcedDuration(t, 5, manual), Transit: sourcedDuration(t, 10, manual), Exit: sourcedDuration(t, 5, manual),
		Refuel: sourcedDuration(t, 30, manual), VirtualEnergy: &virtualEnergy, Tyres: sourcedDuration(t, 20, manual),
		ServiceMode: PitServiceParallel, ModeSelection: manual,
	}

	parallel, err := CalculatePitStop(input)
	if err != nil {
		t.Fatalf("CalculatePitStop parallel: %v", err)
	}
	if parallel.CoreServiceSeconds.Value() != 30 || parallel.OverlapSavedSeconds.Value() != 45 || parallel.TotalSeconds.Value() != 50 {
		t.Fatalf("parallel breakdown = %+v", parallel)
	}

	input.ServiceMode = PitServiceSequential
	sequential, err := CalculatePitStop(input)
	if err != nil {
		t.Fatalf("CalculatePitStop sequential: %v", err)
	}
	if sequential.CoreServiceSeconds.Value() != 75 || sequential.OverlapSavedSeconds.Value() != 0 || sequential.TotalSeconds.Value() != 95 {
		t.Fatalf("sequential breakdown = %+v", sequential)
	}
}

func TestCalculatePitScheduleSumsEachStopOnce(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceMedium, "estimated pit timings")
	stop := PitStopInput{
		Entry:         sourcedDuration(t, 2, manual),
		Transit:       sourcedDuration(t, 8, manual),
		Exit:          sourcedDuration(t, 2, manual),
		Refuel:        sourcedDuration(t, 12, manual),
		Tyres:         sourcedDuration(t, 10, manual),
		ServiceMode:   PitServiceParallel,
		ModeSelection: manual,
	}
	got, err := CalculatePitSchedule([]PitStopInput{stop, stop})
	if err != nil {
		t.Fatalf("CalculatePitSchedule: %v", err)
	}
	if len(got.Stops) != 2 || got.TotalSeconds.Value() != 48 || got.FixedSeconds.Value() != 24 || got.VariableSeconds.Value() != 24 {
		t.Fatalf("unexpected schedule: %#v", got)
	}
}

func TestCalculatePitStopRejectsInvalidInputs(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "user", contract.ConfidenceHigh, "timed manually")
	base := PitStopInput{
		Entry:         sourcedDuration(t, 0, manual),
		Transit:       sourcedDuration(t, 0, manual),
		Exit:          sourcedDuration(t, 0, manual),
		Refuel:        sourcedDuration(t, 0, manual),
		Tyres:         sourcedDuration(t, 0, manual),
		ModeSelection: manual,
	}
	_, err := CalculatePitStop(base)
	var calculationErr *CalculationError
	if !errors.As(err, &calculationErr) || calculationErr.Field != "pit.serviceMode" {
		t.Fatalf("missing mode: got %v", err)
	}

	base.ServiceMode = PitServiceParallel
	base.Refuel = Sourced[contract.DurationSeconds]{Value: contract.DurationSeconds(math.Inf(1)), Evidence: manual}
	if _, err := CalculatePitStop(base); err == nil {
		t.Fatal("infinite service must fail")
	}
}
