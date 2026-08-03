package producta

import (
	"errors"
	"fmt"
	"math"
)

// ErrTyreTimingPending means a partial tyre-change duration has not been
// confirmed yet; it must not be interpreted as zero seconds.
var ErrTyreTimingPending = errors.New("tyre change timing is pending")

// TyreCompound identifies a tyre compound supported by Product A.
type TyreCompound string

const (
	TyreSoft   TyreCompound = "soft"
	TyreMedium TyreCompound = "medium"
	TyreHard   TyreCompound = "hard"
	TyreWet    TyreCompound = "wet"
)

// Wheel identifies a physical corner. It is part of the unit identity after
// the unit has been used once.
type Wheel string

const (
	WheelFL Wheel = "fl"
	WheelFR Wheel = "fr"
	WheelRL Wheel = "rl"
	WheelRR Wheel = "rr"
)

// TyreUnit is one physical tyre that may be reused across stints.
type TyreUnit struct {
	ID           string       `json:"id"`
	SetID        string       `json:"setId"`
	Compound     TyreCompound `json:"compound"`
	Corner       Wheel        `json:"corner"`
	InitialTread float64      `json:"initialTread"`
	WearPerLap   float64      `json:"wearPerLap"`
	UsedCount    int          `json:"usedCount"`
}

// TyreSet groups physical units for the basic inventory view.
type TyreSet struct {
	ID       string       `json:"id"`
	Compound TyreCompound `json:"compound"`
	UnitIDs  []string     `json:"unitIds"`
}

// TyreInventory contains the available physical stock.
type TyreInventory struct {
	LimitedStock bool       `json:"limitedStock"`
	Units        []TyreUnit `json:"units"`
	Sets         []TyreSet  `json:"sets"`
}

// TyreAllocation assigns at most one unit to each wheel for a stint.
type TyreAllocation struct {
	Stint  int              `json:"stint"`
	Wheels map[Wheel]string `json:"wheels"`
}

// TyrePlan combines inventory and its per-stint allocations.
type TyrePlan struct {
	Inventory   TyreInventory    `json:"inventory"`
	Allocations []TyreAllocation `json:"allocations"`
}

// TyreChangePreset contains manual service timing for changing 0..4 wheels.
type TyreChangePreset struct {
	OneWheelSeconds   float64 `json:"oneWheelSeconds"`
	TwoWheelSeconds   float64 `json:"twoWheelSeconds"`
	ThreeWheelSeconds float64 `json:"threeWheelSeconds"`
	FourWheelSeconds  float64 `json:"fourWheelSeconds"`
}

// TyreRisk is the user-facing severity of a projected tyre state.
type TyreRisk string

const (
	TyreRiskNone     TyreRisk = "none"
	TyreRiskWarning  TyreRisk = "warning"
	TyreRiskCritical TyreRisk = "critical"
)

// WearCurvePoint maps normalized tread consumption to lost lap time.
type WearCurvePoint struct {
	Wear            float64 `json:"wear"`
	PaceLossSeconds float64 `json:"paceLossSeconds"`
}

// TyreWearProfile contains editable degradation assumptions for a compound.
type TyreWearProfile struct {
	WearPerLap         float64          `json:"wearPerLap"`
	WearPerStint       float64          `json:"wearPerStint"`
	SafeThreshold      float64          `json:"safeThreshold"`
	BlowoutThreshold   float64          `json:"blowoutThreshold"`
	PaceLossAtFullWear float64          `json:"paceLossAtFullWear"`
	Curve              []WearCurvePoint `json:"curve"`
}

// TyreWearProjection describes tread, accumulated degradation, and risk.
type TyreWearProjection struct {
	StartTread      float64  `json:"startTread"`
	EndTread        float64  `json:"endTread"`
	WearAmount      float64  `json:"wearAmount"`
	WearFraction    float64  `json:"wearFraction"`
	PaceLossSeconds float64  `json:"paceLossSeconds"`
	Blowout         bool     `json:"blowout"`
	Risk            TyreRisk `json:"risk"`
}

// TyreValidationError is a stable, non-localized inventory finding.
type TyreValidationError struct {
	Code  string `json:"code"`
	Field string `json:"field"`
}

func (e TyreValidationError) Error() string {
	return fmt.Sprintf("%s (%s)", e.Code, e.Field)
}

// TyreValidationErrors keeps all inventory findings so the UI can repair a
// plan in one pass.
type TyreValidationErrors struct {
	Errors []TyreValidationError `json:"errors"`
}

func (e TyreValidationErrors) Error() string {
	if len(e.Errors) == 0 {
		return ""
	}
	return e.Errors[0].Error()
}

// ValidateTyrePlan checks stock references, wheel uniqueness and corner
// stability across reused units.
func ValidateTyrePlan(plan TyrePlan) error {
	var findings []TyreValidationError
	units := make(map[string]TyreUnit, len(plan.Inventory.Units))
	for index, unit := range plan.Inventory.Units {
		field := fmt.Sprintf("inventory.units[%d]", index)
		if unit.ID == "" {
			findings = append(findings, TyreValidationError{Code: "tyre_id_required", Field: field + ".id"})
			continue
		}
		if _, exists := units[unit.ID]; exists {
			findings = append(findings, TyreValidationError{Code: "tyre_id_duplicate", Field: field + ".id"})
			continue
		}
		units[unit.ID] = unit
		if !isCompound(unit.Compound) {
			findings = append(findings, TyreValidationError{Code: "tyre_compound_invalid", Field: field + ".compound"})
		}
		if !isWheel(unit.Corner) {
			findings = append(findings, TyreValidationError{Code: "tyre_corner_invalid", Field: field + ".corner"})
		}
		if unit.UsedCount < 0 {
			findings = append(findings, TyreValidationError{Code: "tyre_used_count_negative", Field: field + ".usedCount"})
		}
	}

	for allocationIndex, allocation := range plan.Allocations {
		field := fmt.Sprintf("allocations[%d]", allocationIndex)
		if allocation.Stint <= 0 {
			findings = append(findings, TyreValidationError{Code: "tyre_stint_positive", Field: field + ".stint"})
		}
		usedInStint := make(map[string]Wheel, len(allocation.Wheels))
		for wheel, unitID := range allocation.Wheels {
			wheelField := fmt.Sprintf("%s.wheels.%s", field, wheel)
			if !isWheel(wheel) {
				findings = append(findings, TyreValidationError{Code: "tyre_wheel_invalid", Field: wheelField})
			}
			unit, exists := units[unitID]
			if !exists {
				findings = append(findings, TyreValidationError{Code: "tyre_unit_missing", Field: wheelField})
				continue
			}
			if _, exists := usedInStint[unitID]; exists {
				findings = append(findings, TyreValidationError{Code: "tyre_unit_reused_in_stint", Field: wheelField})
				continue
			}
			usedInStint[unitID] = wheel
			if unit.UsedCount > 0 && wheel != unit.Corner {
				findings = append(findings, TyreValidationError{Code: "tyre_corner_changed", Field: wheelField})
			}
		}
	}

	if len(findings) == 0 {
		return nil
	}
	return TyreValidationErrors{Errors: findings}
}

// CountTyreChanges compares two stints by physical wheel position.
func CountTyreChanges(previous, current TyreAllocation) int {
	changed := 0
	for _, wheel := range []Wheel{WheelFL, WheelFR, WheelRL, WheelRR} {
		if previous.Wheels[wheel] != current.Wheels[wheel] {
			changed++
		}
	}
	return changed
}

// TyreChangeDuration resolves the manual preset for a partial service.
func TyreChangeDuration(changedWheels int, preset TyreChangePreset) (float64, error) {
	if changedWheels < 0 || changedWheels > 4 {
		return 0, fmt.Errorf("changed wheel count must be between zero and four")
	}
	if changedWheels == 0 {
		return 0, nil
	}

	var duration float64
	switch changedWheels {
	case 1:
		duration = preset.OneWheelSeconds
	case 2:
		duration = preset.TwoWheelSeconds
	case 3:
		duration = preset.ThreeWheelSeconds
	case 4:
		duration = preset.FourWheelSeconds
	}
	if !isFinite(duration) || duration < 0 {
		return 0, fmt.Errorf("tyre change duration must be finite and non-negative")
	}
	if duration == 0 {
		return 0, ErrTyreTimingPending
	}
	return duration, nil
}

// PaceLossAtWear linearly interpolates an editable degradation curve and
// clamps values outside the curve's normalized 0..1 range.
func PaceLossAtWear(curve []WearCurvePoint, wear float64) (float64, error) {
	if !isFinite(wear) {
		return 0, ErrNonFinite
	}
	if len(curve) < 2 {
		return 0, fmt.Errorf("wear curve requires at least two points")
	}
	for index, point := range curve {
		if !isFinite(point.Wear) || !isFinite(point.PaceLossSeconds) || point.Wear < 0 || point.Wear > 1 || point.PaceLossSeconds < 0 {
			return 0, fmt.Errorf("invalid wear curve point %d", index)
		}
		if index > 0 && point.Wear <= curve[index-1].Wear {
			return 0, fmt.Errorf("wear curve must be strictly increasing")
		}
	}
	if wear <= curve[0].Wear {
		return curve[0].PaceLossSeconds, nil
	}
	for index := 1; index < len(curve); index++ {
		if wear <= curve[index].Wear {
			previous := curve[index-1]
			current := curve[index]
			fraction := (wear - previous.Wear) / (current.Wear - previous.Wear)
			return previous.PaceLossSeconds + fraction*(current.PaceLossSeconds-previous.PaceLossSeconds), nil
		}
	}
	return curve[len(curve)-1].PaceLossSeconds, nil
}

// ProjectTyreWear applies per-lap and per-stint wear and accumulates pace loss
// per lap, rather than multiplying only the final loss by stint length.
func ProjectTyreWear(unit TyreUnit, profile TyreWearProfile, laps, priorStintWear float64) (TyreWearProjection, error) {
	values := []struct {
		name  string
		value float64
	}{
		{name: "initial tread", value: unit.InitialTread},
		{name: "wear per lap", value: profile.WearPerLap},
		{name: "wear per stint", value: profile.WearPerStint},
		{name: "safe threshold", value: profile.SafeThreshold},
		{name: "blowout threshold", value: profile.BlowoutThreshold},
		{name: "full wear pace loss", value: profile.PaceLossAtFullWear},
		{name: "laps", value: laps},
		{name: "prior stint wear", value: priorStintWear},
	}
	for _, item := range values {
		if !isFinite(item.value) {
			return TyreWearProjection{}, fmt.Errorf("%s must be finite", item.name)
		}
	}
	if unit.InitialTread <= 0 || profile.WearPerLap < 0 || profile.WearPerStint < 0 || profile.SafeThreshold < 0 || profile.BlowoutThreshold < 0 || profile.PaceLossAtFullWear < 0 || laps < 0 || priorStintWear < 0 {
		return TyreWearProjection{}, fmt.Errorf("tyre wear values must be non-negative and tread must be positive")
	}
	if profile.SafeThreshold > unit.InitialTread || profile.BlowoutThreshold > unit.InitialTread {
		return TyreWearProjection{}, fmt.Errorf("tyre thresholds exceed initial tread")
	}

	curve := profile.Curve
	if len(curve) == 0 {
		curve = []WearCurvePoint{{Wear: 0, PaceLossSeconds: 0}, {Wear: 1, PaceLossSeconds: profile.PaceLossAtFullWear}}
	}
	startTread := unit.InitialTread - priorStintWear
	currentWear := profile.WearPerStint + laps*profile.WearPerLap
	endTread := startTread - currentWear
	projection := TyreWearProjection{
		StartTread:   startTread,
		EndTread:     endTread,
		WearAmount:   currentWear,
		WearFraction: math.Max(0, (unit.InitialTread-endTread)/unit.InitialTread),
		Risk:         TyreRiskNone,
	}

	fullLaps := int(math.Floor(laps))
	for lap := 1; lap <= fullLaps; lap++ {
		wearFraction := (priorStintWear + profile.WearPerStint + float64(lap)*profile.WearPerLap) / unit.InitialTread
		loss, err := PaceLossAtWear(curve, wearFraction)
		if err != nil {
			return TyreWearProjection{}, err
		}
		projection.PaceLossSeconds += loss
	}
	if fractionalLap := laps - float64(fullLaps); fractionalLap > 0 {
		wearFraction := (priorStintWear + profile.WearPerStint + laps*profile.WearPerLap) / unit.InitialTread
		loss, err := PaceLossAtWear(curve, wearFraction)
		if err != nil {
			return TyreWearProjection{}, err
		}
		projection.PaceLossSeconds += loss * fractionalLap
	}

	if endTread < profile.BlowoutThreshold {
		projection.Blowout = true
		projection.Risk = TyreRiskCritical
	} else if endTread <= profile.SafeThreshold {
		projection.Risk = TyreRiskWarning
	}
	return projection, nil
}

func isCompound(compound TyreCompound) bool {
	switch compound {
	case TyreSoft, TyreMedium, TyreHard, TyreWet:
		return true
	default:
		return false
	}
}

func isWheel(wheel Wheel) bool {
	switch wheel {
	case WheelFL, WheelFR, WheelRL, WheelRR:
		return true
	default:
		return false
	}
}
