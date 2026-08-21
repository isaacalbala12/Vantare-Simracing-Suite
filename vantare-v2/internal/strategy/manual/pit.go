package manual

import (
	"math"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

type PitServiceMode string

const (
	// PitServiceParallel overlaps only refuelling and tyre work. Repair remains
	// an explicit sequential addition; a served penalty never overlaps work.
	PitServiceParallel   PitServiceMode = "parallel"
	PitServiceSequential PitServiceMode = "sequential"
)

type PitStopInput struct {
	Entry         Sourced[contract.DurationSeconds]  `json:"entry"`
	Transit       Sourced[contract.DurationSeconds]  `json:"transit"`
	Exit          Sourced[contract.DurationSeconds]  `json:"exit"`
	Refuel        Sourced[contract.DurationSeconds]  `json:"refuel"`
	VirtualEnergy *Sourced[contract.DurationSeconds] `json:"virtualEnergy,omitempty"`
	Tyres         Sourced[contract.DurationSeconds]  `json:"tyres"`
	Repair        *Sourced[contract.DurationSeconds] `json:"repair,omitempty"`
	Penalty       *Sourced[contract.DurationSeconds] `json:"penalty,omitempty"`
	ServiceMode   PitServiceMode                     `json:"serviceMode"`
	ModeSelection Evidence                           `json:"modeSelection"`
}

type PitBreakdown struct {
	TravelSeconds       contract.DurationSeconds `json:"travelSeconds"`
	CoreServiceSeconds  contract.DurationSeconds `json:"coreServiceSeconds"`
	RepairSeconds       contract.DurationSeconds `json:"repairSeconds"`
	PenaltySeconds      contract.DurationSeconds `json:"penaltySeconds"`
	FixedSeconds        contract.DurationSeconds `json:"fixedSeconds"`
	VariableSeconds     contract.DurationSeconds `json:"variableSeconds"`
	OverlapSavedSeconds contract.DurationSeconds `json:"overlapSavedSeconds"`
	TotalSeconds        contract.DurationSeconds `json:"totalSeconds"`
	Assumptions         []Assumption             `json:"assumptions"`
}

type PitSchedule struct {
	Stops           []PitBreakdown           `json:"stops"`
	FixedSeconds    contract.DurationSeconds `json:"fixedSeconds"`
	VariableSeconds contract.DurationSeconds `json:"variableSeconds"`
	TotalSeconds    contract.DurationSeconds `json:"totalSeconds"`
}

func CalculatePitStop(input PitStopInput) (PitBreakdown, error) {
	fields := []struct {
		name  string
		value Sourced[contract.DurationSeconds]
	}{
		{name: "pit.entry", value: input.Entry},
		{name: "pit.transit", value: input.Transit},
		{name: "pit.exit", value: input.Exit},
		{name: "pit.refuel", value: input.Refuel},
		{name: "pit.tyres", value: input.Tyres},
	}
	for _, field := range fields {
		if err := validateSourcedDuration(field.name, field.value); err != nil {
			return PitBreakdown{}, err
		}
	}
	if err := validateEvidence("pit.modeSelection", input.ModeSelection); err != nil {
		return PitBreakdown{}, err
	}
	if input.ServiceMode != PitServiceParallel && input.ServiceMode != PitServiceSequential {
		return PitBreakdown{}, calculationError(ErrorInvalidInput, "pit.serviceMode", "unsupported service mode")
	}
	if input.Repair != nil {
		if err := validateSourcedDuration("pit.repair", *input.Repair); err != nil {
			return PitBreakdown{}, err
		}
	}
	if input.VirtualEnergy != nil {
		if err := validateSourcedDuration("pit.virtualEnergy", *input.VirtualEnergy); err != nil {
			return PitBreakdown{}, err
		}
	}
	if input.Penalty != nil {
		if err := validateSourcedDuration("pit.penalty", *input.Penalty); err != nil {
			return PitBreakdown{}, err
		}
	}

	travel, err := checkedAdd("pit.travelSeconds", input.Entry.Value.Value(), input.Transit.Value.Value(), input.Exit.Value.Value())
	if err != nil {
		return PitBreakdown{}, err
	}
	virtualEnergy := 0.0
	if input.VirtualEnergy != nil {
		virtualEnergy = input.VirtualEnergy.Value.Value()
	}
	sequentialCore, err := checkedAdd("pit.coreServiceSeconds", input.Refuel.Value.Value(), virtualEnergy, input.Tyres.Value.Value())
	if err != nil {
		return PitBreakdown{}, err
	}
	core := sequentialCore
	overlap := 0.0
	if input.ServiceMode == PitServiceParallel {
		core = math.Max(input.Refuel.Value.Value(), math.Max(virtualEnergy, input.Tyres.Value.Value()))
		overlap = sequentialCore - core
	}
	repair := 0.0
	if input.Repair != nil {
		repair = input.Repair.Value.Value()
	}
	penalty := 0.0
	if input.Penalty != nil {
		penalty = input.Penalty.Value.Value()
	}
	fixed, err := checkedAdd("pit.fixedSeconds", travel, penalty)
	if err != nil {
		return PitBreakdown{}, err
	}
	variable, err := checkedAdd("pit.variableSeconds", core, repair)
	if err != nil {
		return PitBreakdown{}, err
	}
	total, err := checkedAdd("pit.totalSeconds", fixed, variable)
	if err != nil {
		return PitBreakdown{}, err
	}

	result := PitBreakdown{Assumptions: make([]Assumption, 0, 8)}
	result.TravelSeconds, err = duration("pit.travelSeconds", travel)
	if err != nil {
		return PitBreakdown{}, err
	}
	result.CoreServiceSeconds, err = duration("pit.coreServiceSeconds", core)
	if err != nil {
		return PitBreakdown{}, err
	}
	result.RepairSeconds, err = duration("pit.repairSeconds", repair)
	if err != nil {
		return PitBreakdown{}, err
	}
	result.PenaltySeconds, err = duration("pit.penaltySeconds", penalty)
	if err != nil {
		return PitBreakdown{}, err
	}
	result.FixedSeconds, err = duration("pit.fixedSeconds", fixed)
	if err != nil {
		return PitBreakdown{}, err
	}
	result.VariableSeconds, err = duration("pit.variableSeconds", variable)
	if err != nil {
		return PitBreakdown{}, err
	}
	result.OverlapSavedSeconds, err = duration("pit.overlapSavedSeconds", overlap)
	if err != nil {
		return PitBreakdown{}, err
	}
	result.TotalSeconds, err = duration("pit.totalSeconds", total)
	if err != nil {
		return PitBreakdown{}, err
	}
	for _, field := range fields {
		result.Assumptions = append(result.Assumptions, assumption(field.name, "duration_seconds", field.value.Value.Value(), field.value.Evidence))
	}
	if input.VirtualEnergy != nil {
		result.Assumptions = append(result.Assumptions, assumption("pit.virtualEnergy", "duration_seconds", virtualEnergy, input.VirtualEnergy.Evidence))
	}
	result.Assumptions = append(result.Assumptions, assumption("pit.serviceMode", "pit_service_mode", input.ServiceMode, input.ModeSelection))
	if input.Repair != nil {
		result.Assumptions = append(result.Assumptions, assumption("pit.repair", "duration_seconds", input.Repair.Value.Value(), input.Repair.Evidence))
	}
	if input.Penalty != nil {
		result.Assumptions = append(result.Assumptions, assumption("pit.penalty", "duration_seconds", input.Penalty.Value.Value(), input.Penalty.Evidence))
	}
	return result, nil
}

func CalculatePitSchedule(inputs []PitStopInput) (PitSchedule, error) {
	result := PitSchedule{Stops: make([]PitBreakdown, 0, len(inputs))}
	var fixed, variable float64
	for _, input := range inputs {
		stop, err := CalculatePitStop(input)
		if err != nil {
			return PitSchedule{}, err
		}
		fixed, err = checkedAdd("pitSchedule.fixedSeconds", fixed, stop.FixedSeconds.Value())
		if err != nil {
			return PitSchedule{}, err
		}
		variable, err = checkedAdd("pitSchedule.variableSeconds", variable, stop.VariableSeconds.Value())
		if err != nil {
			return PitSchedule{}, err
		}
		result.Stops = append(result.Stops, stop)
	}
	var err error
	result.FixedSeconds, err = duration("pitSchedule.fixedSeconds", fixed)
	if err != nil {
		return PitSchedule{}, err
	}
	result.VariableSeconds, err = duration("pitSchedule.variableSeconds", variable)
	if err != nil {
		return PitSchedule{}, err
	}
	total, err := checkedAdd("pitSchedule.totalSeconds", fixed, variable)
	if err != nil {
		return PitSchedule{}, err
	}
	result.TotalSeconds, err = duration("pitSchedule.totalSeconds", total)
	if err != nil {
		return PitSchedule{}, err
	}
	return result, nil
}
