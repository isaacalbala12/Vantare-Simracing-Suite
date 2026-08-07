package tyres

import "fmt"

// StintPlan is the tyre set a stint intends to run. Planning is not mounting:
// it records intent only, so validating a plan never mutates tyre state and a
// tyre that has never run keeps every corner available to it.
type StintPlan struct {
	StintID     string            `json:"stintId"`
	Assignments map[Corner]TyreID `json:"assignments"`
}

// PlanViolation is one reason a planned assignment could not be run. Violations
// are collected rather than returned one at a time so the editor can show every
// problem in a plan at once.
type PlanViolation struct {
	Code    ErrorCode `json:"code"`
	StintID string    `json:"stintId,omitempty"`
	TyreID  TyreID    `json:"tyreId,omitempty"`
	Corner  Corner    `json:"corner,omitempty"`
	Message string    `json:"message"`
}

// orderedCorners fixes iteration order so a plan always reports its violations
// in the same sequence regardless of how the assignments were decoded.
func orderedCorners() []Corner {
	return []Corner{CornerFrontLeft, CornerFrontRight, CornerRearLeft, CornerRearRight}
}

// PlannableOn reports why a tyre may not be planned on a corner, or nil when it
// may. This is the single rule the editor and the solver both answer to.
func (inventory Inventory) PlannableOn(id TyreID, corner Corner) error {
	if !corner.valid() {
		return &InventoryError{Code: ErrorInvalidCorner, TyreID: id, Corner: corner, Message: "unknown physical corner"}
	}
	tyre, found := inventory.Tyre(id)
	if !found {
		return &InventoryError{Code: ErrorTyreNotFound, TyreID: id, Corner: corner, Message: "physical tyre does not exist in inventory"}
	}
	if tyre.State == StateDiscarded {
		return &InventoryError{Code: ErrorTyreDiscarded, TyreID: id, Corner: corner, Message: "discarded tyre cannot be planned"}
	}
	if tyre.LockedCorner != CornerNone && tyre.LockedCorner != corner {
		return &InventoryError{Code: ErrorCornerLocked, TyreID: id, Corner: corner, Message: fmt.Sprintf("tyre is permanently assigned to %s", tyre.LockedCorner)}
	}
	return nil
}

// ValidatePlan checks every planned assignment against the physical inventory
// and returns each violation found. An empty result means the plan is runnable.
func (inventory Inventory) ValidatePlan(plan []StintPlan) []PlanViolation {
	violations := make([]PlanViolation, 0)
	for _, stint := range plan {
		seen := make(map[TyreID]Corner, len(stint.Assignments))
		for _, corner := range orderedCorners() {
			id, assigned := stint.Assignments[corner]
			if !assigned || id == "" {
				continue
			}
			if previous, duplicated := seen[id]; duplicated {
				violations = append(violations, PlanViolation{
					Code:    ErrorTyreReused,
					StintID: stint.StintID,
					TyreID:  id,
					Corner:  corner,
					Message: fmt.Sprintf("tyre already occupies %s in this stint", previous),
				})
				continue
			}
			seen[id] = corner
			if err := inventory.PlannableOn(id, corner); err != nil {
				violation := PlanViolation{StintID: stint.StintID, TyreID: id, Corner: corner, Message: err.Error()}
				var inventoryErr *InventoryError
				if asInventoryError(err, &inventoryErr) {
					violation.Code = inventoryErr.Code
					violation.Message = inventoryErr.Message
				} else {
					violation.Code = ErrorInvalidTyre
				}
				violations = append(violations, violation)
			}
		}
	}
	return violations
}

func asInventoryError(err error, target **InventoryError) bool {
	value, ok := err.(*InventoryError)
	if ok {
		*target = value
	}
	return ok
}
