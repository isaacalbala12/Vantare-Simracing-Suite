package producta

import "testing"

func TestBuildStintsPreservesResourcesAndPitWindow(t *testing.T) {
	stints, err := BuildStints([]StintInput{
		{
			Laps:  12,
			Fuel:  ResourceService{Amount: 40},
			VE:    ResourceService{Amount: 20},
			Tyres: TyreService{ChangedWheels: 4},
			Pit: PitStopInput{
				Required: true,
				Fuel:     ResourceService{Amount: 40},
				VE:       ResourceService{Amount: 20},
				Tyres:    TyreService{ChangedWheels: 4},
				Window:   PitWindow{Kind: PitWindowExact, Lap: 12},
			},
		},
		{
			Laps: 8,
			Fuel: ResourceService{Amount: 32},
			VE:   ResourceService{Amount: 16},
		},
	})
	if err != nil {
		t.Fatalf("build stints: %v", err)
	}
	if len(stints) != 2 || stints[0].Number != 1 || stints[0].Laps != 12 || stints[0].Fuel.Amount != 40 || stints[0].Tyres.ChangedWheels != 4 {
		t.Fatalf("unexpected first stint: %#v", stints)
	}
	if stints[0].Pit.Window.Kind != PitWindowExact || stints[0].Pit.Window.Lap != 12 {
		t.Fatalf("pit window was not preserved: %#v", stints[0].Pit)
	}
}

func TestBuildStintsAllowsPartialRefuelAndTyreOnlyStop(t *testing.T) {
	stints, err := BuildStints([]StintInput{
		{Laps: 10, Fuel: ResourceService{Amount: 30}},
		{Laps: 10, Fuel: ResourceService{Amount: 0}, Pit: PitStopInput{
			Required: true,
			Tyres:    TyreService{ChangedWheels: 2},
			Window:   PitWindow{Kind: PitWindowWindow, StartLap: 10, EndLap: 12},
		}},
	})
	if err != nil {
		t.Fatalf("tyre-only stop should be valid: %v", err)
	}
	if stints[1].Pit.Window.Kind != PitWindowWindow || stints[1].Pit.Tyres.ChangedWheels != 2 {
		t.Fatalf("unexpected tyre-only stop: %#v", stints[1].Pit)
	}
}

func TestBuildStintsRejectsUnservicedPitAndInvalidWindow(t *testing.T) {
	_, err := BuildStints([]StintInput{{Laps: 10}, {Laps: 10, Pit: PitStopInput{Required: true}}})
	assertStintError(t, err, "pit_no_service")

	_, err = BuildStints([]StintInput{{Laps: 10, Pit: PitStopInput{Required: true, Fuel: ResourceService{Amount: 10}, Window: PitWindow{Kind: PitWindowWindow, StartLap: 12, EndLap: 10}}}})
	assertStintError(t, err, "pit_window_invalid")
}

func TestBuildStintsRejectsNegativeServiceAmountAndEmptyRace(t *testing.T) {
	_, err := BuildStints(nil)
	assertStintError(t, err, "stints_required")

	_, err = BuildStints([]StintInput{{Laps: 10, Fuel: ResourceService{Amount: -1}}})
	assertStintError(t, err, "fuel_service_non_negative")
}

func assertStintError(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected stint error %q", code)
	}
	if typed, ok := err.(StintValidationErrors); ok {
		for _, item := range typed.Errors {
			if item.Code == code {
				return
			}
		}
	}
	t.Fatalf("expected stint error %q, got %v", code, err)
}
