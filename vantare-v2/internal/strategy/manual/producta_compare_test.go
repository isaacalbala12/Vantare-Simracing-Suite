package manual

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/producta"
)

// These comparisons cover only the STR-01 allowlisted historical functions
// and only cases whose semantics remain intentionally equivalent. Product A is
// evidence in tests, never a dependency of the manual engine.
func TestCompatibleProductAOracles(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "fixture", contract.ConfidenceHigh, "historical compatible oracle")

	t.Run("race by laps", func(t *testing.T) {
		t.Parallel()
		got, err := CalculateRace(RaceInput{
			Kind:          RaceByLaps,
			TargetLaps:    sourcedLaps(t, 30, manual),
			AverageLap:    sourcedDuration(t, 120, manual),
			FormationLaps: sourcedLaps(t, 0, manual),
			PitLoss:       sourcedDuration(t, 0, manual),
			Selection:     manual,
		})
		if err != nil {
			t.Fatalf("manual race: %v", err)
		}
		old, err := producta.ProjectRace(producta.RaceInput{Kind: producta.RaceByLaps, Laps: 30, LapTimeSeconds: 120}, 0)
		if err != nil {
			t.Fatalf("Product A race: %v", err)
		}
		if float64(got.CompetitiveLaps.Value()) != old.RaceLaps || got.DrivingSeconds.Value() != old.EffectiveRaceSeconds {
			t.Fatalf("compatible race drift: new=%#v old=%#v", got, old)
		}
	})

	t.Run("resource budget", func(t *testing.T) {
		t.Parallel()
		got, err := CalculateFuel(FuelInput{
			Capacity:             sourcedFuel(t, 100, manual),
			UsableCapacity:       sourcedFuel(t, 90, manual),
			StartAmount:          sourcedFuel(t, 20, manual),
			ConsumptionPerLap:    sourcedFuel(t, 4, manual),
			FormationConsumption: sourcedFuel(t, 8, manual),
			Reserve:              FuelReserveInput{Kind: ReserveLaps, Laps: sourcedLaps(t, 2, manual), Selection: manual},
		}, mustLaps(t, 30))
		if err != nil {
			t.Fatalf("manual fuel: %v", err)
		}
		old, err := producta.ProjectResource(producta.ResourceInput{
			Enabled: true, Capacity: 100, UsableCapacity: 90, StartAmount: 20,
			ConsumptionPerLap: 4, FormationAmount: 2, FormationLaps: 1.5,
			Margin: producta.MarginInput{Kind: "laps", Value: 2},
		}, 30)
		if err != nil {
			t.Fatalf("Product A resource: %v", err)
		}
		if got.TotalNeed.Value() != old.TotalNeed || got.AdditionalRequired.Value() != old.AdditionalAmount || got.StopsRequired != int64(old.StopsRequired) {
			t.Fatalf("compatible resource drift: new=%#v old=%#v", got, old)
		}
	})

	for _, mode := range []struct {
		name string
		new  PitServiceMode
		old  producta.PitServiceMode
	}{
		{name: "parallel pit", new: PitServiceParallel, old: producta.PitServiceSimultaneous},
		{name: "sequential pit", new: PitServiceSequential, old: producta.PitServiceSequential},
	} {
		mode := mode
		t.Run(mode.name, func(t *testing.T) {
			t.Parallel()
			repair := sourcedDuration(t, 4, manual)
			penalty := sourcedDuration(t, 2, manual)
			got, err := CalculatePitStop(PitStopInput{
				Entry: sourcedDuration(t, 5, manual), Transit: sourcedDuration(t, 10, manual), Exit: sourcedDuration(t, 5, manual),
				Refuel: sourcedDuration(t, 30, manual), Tyres: sourcedDuration(t, 20, manual), Repair: &repair, Penalty: &penalty,
				ServiceMode: mode.new, ModeSelection: manual,
			})
			if err != nil {
				t.Fatalf("manual pit: %v", err)
			}
			old, err := producta.PitDuration(producta.PitStop{
				EntrySeconds: 5, TransitSeconds: 10, ExitSeconds: 5, RefuelSeconds: 30,
				TyreChangeSeconds: 20, RepairSeconds: 4, PenaltySeconds: 2, ServiceMode: mode.old,
			})
			if err != nil {
				t.Fatalf("Product A pit: %v", err)
			}
			if got.TotalSeconds.Value() != old.TotalSeconds {
				t.Fatalf("compatible pit drift: new=%#v old=%#v", got, old)
			}
		})
	}
}
