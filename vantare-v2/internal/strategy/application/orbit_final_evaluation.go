package application

import (
	"fmt"
	"math"
	"reflect"

	document "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// evaluateFinalOrbitPlan translates the visible load targets into a fixed
// decision. Only the solver evaluates its constraints and driving costs.
func evaluateFinalOrbitPlan(plan *OrbitCalculationPlan, input solver.SolverInputV2, solved solver.SolverResultV2, drivers map[string]OrbitCalculationDriver, variant OrbitCalculationVariant, planning *document.PlanningInputs) error {
	decision := solver.DecisionVector{Stints: make([]solver.StintDecision, len(plan.Stints)), PitStops: make([]solver.PitStopDecision, 0, len(plan.Stints)-1)}
	seen := make(map[string]bool)
	keepDriverProfiles := len(input.DriverProfiles) > 0
	for _, profile := range input.DriverProfiles {
		seen[profile.DriverID] = true
	}
	veLoads := make([]float64, len(plan.Stints))
	for index := range plan.Stints {
		stint := &plan.Stints[index]
		if input.VECapacityPercent.Value > 0 {
			value := veLoads[index]
			stint.VirtualEnergy = &value
		}
		pace, err := effectiveOrbitPace(drivers[stint.DriverID], variant.Mode, planning)
		if err != nil {
			return err
		}
		if pace.PaceSeconds != solved.ResolvedInputs.BaseLapSeconds.Value || pace.FuelLitersPerLap != solved.ResolvedInputs.FuelPerLapLiters.Value {
			keepDriverProfiles = true
		}
		// The plan already carries the effective pace and fuel, including the
		// original projection retained in input. Per-driver configuration only
		// overrides differing driver values for this fixed evaluation.
		if !seen[stint.DriverID] {
			input.DriverProfiles = append(input.DriverProfiles, orbitDriverProfile(
				stint.DriverID, pace, solved.ResolvedInputs.VEPerLapPercent.Value,
				sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "strategy.orbit.driver-configuration:" + stint.DriverID},
			))
			seen[stint.DriverID] = true
		}
		choice := solver.StintDecision{Index: index, Laps: stint.Laps, Driver: stint.DriverID, SavingLevel: solver.SavingNone}
		if index < len(solved.Best.Stints) && solved.Best.Stints[index].Laps == stint.Laps {
			choice = solved.Best.Stints[index]
			choice.Driver = stint.DriverID
		}
		decision.Stints[index] = choice
		if index < len(plan.Stints)-1 {
			stop := solver.PitStopDecision{Lap: stint.LastLap, ChangeTyres: true}
			if input.TyreInventory != nil {
				stop = solved.Best.PitStops[index]
			}
			decision.PitStops = append(decision.PitStops, stop)
		}
	}
	// Keep a profile supplied to optimisation. Otherwise preserve the original
	// scalar/projection provenance when every driver shares those inputs.
	if !keepDriverProfiles {
		input.DriverProfiles = nil
		for index := range decision.Stints {
			decision.Stints[index].Driver = ""
		}
	}
	required, err := solver.ResourceRequirementsV2(input, decision)
	if err != nil {
		return err
	}
	for index := range plan.Stints {
		stint := &plan.Stints[index]
		stint.Fuel = required.Stints[index].FuelLiters
		veLoads[index] = required.Stints[index].VEPercent
		if index == len(plan.Stints)-1 {
			stint.Fuel += required.Finish.FuelLiters
			veLoads[index] += required.Finish.VEPercent
		}
		if index == 0 {
			if input.InitialFuelLiters != nil {
				stint.Fuel = input.InitialFuelLiters.Value
			}
			if input.InitialVEPercent != nil {
				veLoads[index] = input.InitialVEPercent.Value
			}
		}
		if override := variant.Overrides[index]; override.Fuel != nil {
			if index == 0 && input.InitialFuelLiters != nil && *override.Fuel != input.InitialFuelLiters.Value {
				return fmt.Errorf("initial Fuel conflicts with stint override: %w", ErrCalculationInvalid)
			}
			stint.Fuel = *override.Fuel
		}
		if stint.Fuel+1e-6 < required.Stints[index].FuelLiters || stint.Fuel > input.FuelCapacityLiters.Value+1e-6 || veLoads[index] > input.VECapacityPercent.Value+1e-6 {
			return fmt.Errorf("stint %d exceeds available resources: %w", index, ErrCalculationInfeasible)
		}
		if index > 0 {
			previous := plan.Stints[index-1]
			fuelRemaining := previous.Fuel - required.Stints[index-1].FuelLiters
			veRemaining := veLoads[index-1] - required.Stints[index-1].VEPercent
			if stint.Fuel < fuelRemaining {
				if variant.Overrides[index].Fuel != nil {
					return fmt.Errorf("stint %d requires removing fuel: %w", index, ErrCalculationInfeasible)
				}
				stint.Fuel = fuelRemaining
			}
			if veLoads[index] < veRemaining {
				veLoads[index] = veRemaining
			}
			decision.PitStops[index-1].FuelLiters = math.Max(0, stint.Fuel-fuelRemaining)
			decision.PitStops[index-1].VEPercent = math.Max(0, veLoads[index]-veRemaining)
		}
	}
	replayed, err := solver.ReplayDecisionV2WithResources(input, decision, plan.Stints[0].Fuel, veLoads[0])
	if err != nil {
		return err
	}
	if !replayed.Feasible {
		return fmt.Errorf("final plan: %v: %w", replayed.Reasons, ErrCalculationInfeasible)
	}
	plan.TotalSeconds = replayed.Evaluation.TotalSeconds
	plan.FinalLapStartSeconds = replayed.FinalLapStartSeconds
	plan.ModelVersion = string(solved.ContractVersion)
	plan.Objective = "minimum_total_seconds"
	plan.Optimality = "not_proven"
	if len(variant.Overrides) == 0 && !solved.ComputeStats.Degradation.Applied && reflect.DeepEqual(replayed.Decision, solved.Best) {
		plan.Optimality = "proven"
	}
	plan.PitSeconds = replayed.Evaluation.PitSeconds
	plan.DrivingSeconds = plan.TotalSeconds - plan.PitSeconds - replayed.Evaluation.FormationSeconds
	if input.Formation.Seconds.Role == solver.ScalarRoleUserOverride {
		formationSeconds := replayed.Evaluation.FormationSeconds
		plan.FormationSeconds = &formationSeconds
	}
	plan.StartFuelLiters = plan.Stints[0].Fuel
	plan.FinishFuelLiters = replayed.Reserve.Fuel.RemainingAmount
	plan.ReserveLaps = replayed.Reserve.EffectiveLaps
	plan.ReserveRequiredLaps = requestedReserveLaps(replayed.Reserve)
	plan.ReserveSatisfied = replayed.Reserve.Satisfied
	plan.ReserveLimitingResource = string(replayed.Reserve.LimitingResource)
	clock := replayed.Evaluation.FormationSeconds
	for index := range plan.Distribution {
		plan.Distribution[index].Seconds = 0
	}
	for index := range plan.Stints {
		stint := &plan.Stints[index]
		windowOffset := stint.PitWindowSeconds - stint.StartSeconds
		cost := replayed.Stints[index].Evaluation
		stint.StartSeconds = clock
		stint.EndSeconds = clock + cost.TotalSeconds - cost.PitSeconds - cost.FormationSeconds
		stint.PitWindowSeconds = clock + windowOffset
		stint.OverCapacity = false
		for driver := range plan.Distribution {
			if plan.Distribution[driver].DriverID == stint.DriverID {
				plan.Distribution[driver].Seconds += stint.EndSeconds - stint.StartSeconds
			}
		}
		clock += cost.TotalSeconds - cost.FormationSeconds
		if index < len(plan.StopDetails) {
			stop := &plan.StopDetails[index]
			if input.TyreInventory != nil {
				decisionStop := replayed.Decision.PitStops[index]
				stop.ChangeTyres = &decisionStop.ChangeTyres
				stop.Compound = decisionStop.Compound
				stop.TyreFitment = decisionStop.TyreFitment
			}
			stop.FuelInLiters = stint.Fuel - required.Stints[index].FuelLiters
			stop.FuelOutLiters = plan.Stints[index+1].Fuel
			if input.VECapacityPercent.Value > 0 {
				energyIn := veLoads[index] - required.Stints[index].VEPercent
				energyOut := veLoads[index+1]
				stop.VirtualEnergyInPercent = &energyIn
				stop.VirtualEnergyOutPercent = &energyOut
			}
			breakdown := replayed.Decision.PitStops[index].PitBreakdown
			stop.PitLossSeconds = breakdown.TotalSeconds.Value()
			stop.PitTransitSeconds = breakdown.TravelSeconds.Value()
			stop.PitServiceSeconds = breakdown.CoreServiceSeconds.Value()
			stop.PitOverlapSeconds = breakdown.OverlapSavedSeconds.Value()
			stop.PitBreakdownAvailable = true
		}
	}
	return nil
}

func orbitDriverProfile(driverID string, pace OrbitCalculationPace, vePerLap float64, provenance sp.Provenance) solver.DriverProfileInput {
	return solver.DriverProfileInput{DriverID: driverID, Manual: &solver.ManualDriverProfile{
		BaseLapSeconds: pace.PaceSeconds, FuelPerLapLiters: pace.FuelLitersPerLap, VEPerLapPercent: vePerLap,
		Provenance: provenance,
		Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "orbit-adapter.v2"},
	}}
}
