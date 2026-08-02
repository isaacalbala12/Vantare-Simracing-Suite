package manual

import (
	"math"
	"math/rand"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

func TestResourceBudgetProperties(t *testing.T) {
	t.Parallel()
	random := rand.New(rand.NewSource(140))
	manual := evidence(contract.ProvenanceManual, "property", contract.ConfidenceHigh, "generated bounded inputs")
	for sample := 0; sample < 10_000; sample++ {
		capacity := float64(random.Intn(200)+1) / 2
		usable := float64(random.Intn(int(capacity*2))+1) / 2
		start := float64(random.Intn(int(capacity*2)+1)) / 2
		consumption := float64(random.Intn(100)+1) / 20
		formation := float64(random.Intn(100)) / 20
		lapsValue := int64(random.Intn(500) + 1)
		got, err := CalculateFuel(FuelInput{
			Capacity: sourcedFuel(t, capacity, manual), UsableCapacity: sourcedFuel(t, usable, manual),
			StartAmount: sourcedFuel(t, start, manual), ConsumptionPerLap: sourcedFuel(t, consumption, manual),
			FormationConsumption: sourcedFuel(t, formation, manual), Reserve: FuelReserveInput{Kind: ReserveNone, Selection: manual},
		}, mustLaps(t, lapsValue))
		if err != nil {
			t.Fatalf("sample %d: %v", sample, err)
		}
		if math.Abs(got.TotalNeed.Value()-(got.RaceNeed.Value()+got.FormationNeed.Value()+got.ReserveAmount.Value())) > 1e-9 {
			t.Fatalf("sample %d: need conservation failed: %#v", sample, got)
		}
		available := got.StartAmount.Value()
		for _, refill := range got.RefillAmounts {
			if refill.Value() > got.UsableCapacity.Value()+1e-12 {
				t.Fatalf("sample %d: refill exceeds usable capacity", sample)
			}
			available += refill.Value()
		}
		if available+1e-9 < got.TotalNeed.Value() {
			t.Fatalf("sample %d: allocated resource does not cover need: %#v", sample, got)
		}
	}
}

func TestTimedRaceFloatingBoundaryDoesNotCreatePhantomLap(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "rounding", contract.ConfidenceHigh, "decimal boundary")
	got, err := CalculateRace(RaceInput{
		Kind: RaceByTime, Duration: sourcedDuration(t, 0.3, manual), AverageLap: sourcedDuration(t, 0.1, manual),
		FormationLaps: sourcedLaps(t, 0, manual), PitLoss: sourcedDuration(t, 0, manual),
		TimedFinish: TimedFinishCurrentLap, Selection: manual,
	})
	if err != nil {
		t.Fatalf("CalculateRace: %v", err)
	}
	if got.CompetitiveLaps.Value() != 3 || got.FinalLapsAfterExpiry.Value() != 0 {
		t.Fatalf("decimal boundary added a phantom lap: %#v", got)
	}
}

func TestTimedRaceRoundingToleranceDoesNotConsumeRealFractionAtLargeMagnitude(t *testing.T) {
	t.Parallel()
	manual := evidence(contract.ProvenanceManual, "rounding", contract.ConfidenceHigh, "large fractional boundary")
	got, err := CalculateRace(RaceInput{
		Kind: RaceByTime, Duration: sourcedDuration(t, 1_000_000_000_000.25, manual), AverageLap: sourcedDuration(t, 1, manual),
		FormationLaps: sourcedLaps(t, 0, manual), PitLoss: sourcedDuration(t, 0, manual),
		TimedFinish: TimedFinishCurrentLap, Selection: manual,
	})
	if err != nil {
		t.Fatalf("CalculateRace: %v", err)
	}
	if got.CompetitiveLaps.Value() != 1_000_000_000_001 || got.FinalLapsAfterExpiry.Value() != 1 {
		t.Fatalf("real fractional lap was rounded away: %#v", got)
	}
}

func FuzzFuelBudgetConservation(f *testing.F) {
	f.Add(uint16(100), uint16(100), uint16(100), uint16(4), uint16(25))
	f.Add(uint16(37), uint16(19), uint16(3), uint16(7), uint16(143))
	manual := evidence(contract.ProvenanceManual, "fuzz", contract.ConfidenceHigh, "bounded fuzz inputs")
	f.Fuzz(func(t *testing.T, capacitySeed, usableSeed, startSeed, consumptionSeed, lapSeed uint16) {
		capacity := float64(capacitySeed%500+1) / 2
		usable := math.Min(float64(usableSeed%500+1)/2, capacity)
		start := math.Min(float64(startSeed%500)/2, capacity)
		consumption := float64(consumptionSeed%100+1) / 20
		lapCount := int64(lapSeed%1000 + 1)
		got, err := CalculateFuel(FuelInput{
			Capacity: sourcedFuel(t, capacity, manual), UsableCapacity: sourcedFuel(t, usable, manual),
			StartAmount: sourcedFuel(t, start, manual), ConsumptionPerLap: sourcedFuel(t, consumption, manual),
			FormationConsumption: sourcedFuel(t, 0, manual), Reserve: FuelReserveInput{Kind: ReserveNone, Selection: manual},
		}, mustLaps(t, lapCount))
		if err != nil {
			t.Fatalf("CalculateFuel: %v", err)
		}
		allocated := got.StartAmount.Value()
		for _, refill := range got.RefillAmounts {
			allocated += refill.Value()
		}
		if allocated+1e-9 < got.TotalNeed.Value() {
			t.Fatalf("allocated=%v need=%v", allocated, got.TotalNeed.Value())
		}
	})
}

func FuzzPitBreakdownConservation(f *testing.F) {
	f.Add(uint16(5), uint16(10), uint16(5), uint16(30), uint16(20), true)
	manual := evidence(contract.ProvenanceManual, "fuzz", contract.ConfidenceHigh, "bounded fuzz inputs")
	f.Fuzz(func(t *testing.T, entry, transit, exit, refuel, tyres uint16, parallel bool) {
		mode := PitServiceSequential
		if parallel {
			mode = PitServiceParallel
		}
		got, err := CalculatePitStop(PitStopInput{
			Entry: sourcedDuration(t, float64(entry), manual), Transit: sourcedDuration(t, float64(transit), manual),
			Exit: sourcedDuration(t, float64(exit), manual), Refuel: sourcedDuration(t, float64(refuel), manual),
			Tyres: sourcedDuration(t, float64(tyres), manual), ServiceMode: mode, ModeSelection: manual,
		})
		if err != nil {
			t.Fatalf("CalculatePitStop: %v", err)
		}
		if got.FixedSeconds.Value()+got.VariableSeconds.Value() != got.TotalSeconds.Value() {
			t.Fatalf("pit time not conserved: %#v", got)
		}
	})
}
