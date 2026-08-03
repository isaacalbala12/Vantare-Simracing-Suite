package producta

import "fmt"

// ResourceService is the amount added to a resource at a stop.
type ResourceService struct {
	Amount float64 `json:"amount"`
}

// TyreService describes a partial or complete tyre change.
type TyreService struct {
	ChangedWheels int `json:"changedWheels"`
}

// PitWindowKind selects an exact pit lap or an allowed lap interval.
type PitWindowKind string

const (
	PitWindowExact  PitWindowKind = "exact"
	PitWindowWindow PitWindowKind = "window"
)

// PitWindow stores the user-editable pit timing constraint.
type PitWindow struct {
	Kind     PitWindowKind `json:"kind"`
	Lap      float64       `json:"lap"`
	StartLap float64       `json:"startLap"`
	EndLap   float64       `json:"endLap"`
}

// PitStopInput combines resource and manual service actions for one stop.
type PitStopInput struct {
	Required       bool            `json:"required"`
	Fuel           ResourceService `json:"fuel"`
	VE             ResourceService `json:"ve"`
	Tyres          TyreService     `json:"tyres"`
	RepairSeconds  float64         `json:"repairSeconds"`
	PenaltySeconds float64         `json:"penaltySeconds"`
	Window         PitWindow       `json:"window"`
}

// StintInput is the explicit plan for one stint before numbering.
type StintInput struct {
	Laps  float64         `json:"laps"`
	Fuel  ResourceService `json:"fuel"`
	VE    ResourceService `json:"ve"`
	Tyres TyreService     `json:"tyres"`
	Pit   PitStopInput    `json:"pit"`
}

// StintPlan is the validated, numbered representation used by later solver
// and timeline layers.
type StintPlan struct {
	Number int             `json:"number"`
	Laps   float64         `json:"laps"`
	Fuel   ResourceService `json:"fuel"`
	VE     ResourceService `json:"ve"`
	Tyres  TyreService     `json:"tyres"`
	Pit    PitStopInput    `json:"pit"`
}

type StintValidationError struct {
	Code  string `json:"code"`
	Field string `json:"field"`
}

type StintValidationErrors struct {
	Errors []StintValidationError `json:"errors"`
}

func (e StintValidationErrors) Error() string {
	if len(e.Errors) == 0 {
		return ""
	}
	return fmt.Sprintf("%s (%s)", e.Errors[0].Code, e.Errors[0].Field)
}

// BuildStints validates and numbers a user-authored sequence without solving
// or silently changing any lap/resource decision.
func BuildStints(inputs []StintInput) ([]StintPlan, error) {
	if len(inputs) == 0 {
		return nil, StintValidationErrors{Errors: []StintValidationError{{Code: "stints_required", Field: "stints"}}}
	}

	var findings []StintValidationError
	plans := make([]StintPlan, 0, len(inputs))
	for index, input := range inputs {
		field := fmt.Sprintf("stints[%d]", index)
		if !isFinite(input.Laps) || input.Laps <= 0 {
			findings = append(findings, StintValidationError{Code: "stint_laps_positive", Field: field + ".laps"})
		}
		validateServiceAmount(&findings, field+".fuel.amount", input.Fuel.Amount, "fuel_service_non_negative")
		validateServiceAmount(&findings, field+".ve.amount", input.VE.Amount, "ve_service_non_negative")
		if input.Tyres.ChangedWheels < 0 || input.Tyres.ChangedWheels > 4 {
			findings = append(findings, StintValidationError{Code: "tyre_service_wheel_count", Field: field + ".tyres.changedWheels"})
		}
		validatePitInput(&findings, field+".pit", input.Pit)
		plans = append(plans, StintPlan{Number: index + 1, Laps: input.Laps, Fuel: input.Fuel, VE: input.VE, Tyres: input.Tyres, Pit: input.Pit})
	}
	if len(findings) != 0 {
		return nil, StintValidationErrors{Errors: findings}
	}
	return plans, nil
}

func validateServiceAmount(findings *[]StintValidationError, field string, value float64, code string) {
	if !isFinite(value) || value < 0 {
		*findings = append(*findings, StintValidationError{Code: code, Field: field})
	}
}

func validatePitInput(findings *[]StintValidationError, field string, pit PitStopInput) {
	if !pit.Required {
		return
	}
	if pit.Fuel.Amount == 0 && pit.VE.Amount == 0 && pit.Tyres.ChangedWheels == 0 && pit.RepairSeconds == 0 && pit.PenaltySeconds == 0 {
		*findings = append(*findings, StintValidationError{Code: "pit_no_service", Field: field})
	}
	if !isFinite(pit.RepairSeconds) || pit.RepairSeconds < 0 {
		*findings = append(*findings, StintValidationError{Code: "repair_seconds_non_negative", Field: field + ".repairSeconds"})
	}
	if !isFinite(pit.PenaltySeconds) || pit.PenaltySeconds < 0 {
		*findings = append(*findings, StintValidationError{Code: "penalty_seconds_non_negative", Field: field + ".penaltySeconds"})
	}
	switch pit.Window.Kind {
	case "":
	case PitWindowExact:
		if !isFinite(pit.Window.Lap) || pit.Window.Lap <= 0 {
			*findings = append(*findings, StintValidationError{Code: "pit_window_invalid", Field: field + ".window.lap"})
		}
	case PitWindowWindow:
		if !isFinite(pit.Window.StartLap) || !isFinite(pit.Window.EndLap) || pit.Window.StartLap <= 0 || pit.Window.EndLap < pit.Window.StartLap {
			*findings = append(*findings, StintValidationError{Code: "pit_window_invalid", Field: field + ".window"})
		}
	default:
		*findings = append(*findings, StintValidationError{Code: "pit_window_invalid", Field: field + ".window.kind"})
	}
}
