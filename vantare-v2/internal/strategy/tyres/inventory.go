// Package tyres models the physical tyre inventory used by Strategy Planner.
// It contains no telemetry, persistence, UI, or strategy-optimization logic.
package tyres

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

type TyreID string

var tyreIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type Compound string

const (
	CompoundSoft   Compound = "soft"
	CompoundMedium Compound = "medium"
	CompoundHard   Compound = "hard"
	CompoundWet    Compound = "wet"
)

func (compound Compound) valid() bool {
	switch compound {
	case CompoundSoft, CompoundMedium, CompoundHard, CompoundWet:
		return true
	default:
		return false
	}
}

type Corner string

const (
	CornerNone       Corner = ""
	CornerFrontLeft  Corner = "front_left"
	CornerFrontRight Corner = "front_right"
	CornerRearLeft   Corner = "rear_left"
	CornerRearRight  Corner = "rear_right"
)

func (corner Corner) valid() bool {
	switch corner {
	case CornerFrontLeft, CornerFrontRight, CornerRearLeft, CornerRearRight:
		return true
	default:
		return false
	}
}

type Origin string

const (
	OriginEventAllocation Origin = "event_allocation"
	OriginQualifying      Origin = "qualifying"
	OriginUnknown         Origin = "unknown"
)

func (origin Origin) valid() bool {
	switch origin {
	case OriginEventAllocation, OriginQualifying, OriginUnknown:
		return true
	default:
		return false
	}
}

type State string

const (
	StateFree      State = "free"
	StateMounted   State = "mounted"
	StateUsed      State = "used"
	StateDiscarded State = "discarded"
)

// Condition is the remaining usable tyre percentage. A range remains a range:
// estimated data is never silently collapsed into an exact percentage.
type Condition struct {
	MinimumRemainingPercent float64             `json:"minimumRemainingPercent"`
	MaximumRemainingPercent float64             `json:"maximumRemainingPercent"`
	Provenance              contract.Provenance `json:"provenance"`
	Confidence              contract.Confidence `json:"confidence"`
}

func (condition Condition) IsExact() bool {
	return condition.MinimumRemainingPercent == condition.MaximumRemainingPercent
}

func (condition Condition) Validate() error {
	minimum := condition.MinimumRemainingPercent
	maximum := condition.MaximumRemainingPercent
	if math.IsNaN(minimum) || math.IsInf(minimum, 0) || math.IsNaN(maximum) || math.IsInf(maximum, 0) {
		return inventoryError(ErrorInvalidCondition, "remaining percentage must be finite")
	}
	if minimum < 0 || maximum > 100 || minimum > maximum {
		return inventoryError(ErrorInvalidCondition, "remaining percentage must satisfy 0 <= minimum <= maximum <= 100")
	}
	if err := condition.Provenance.Validate(); err != nil {
		return &InventoryError{Code: ErrorInvalidCondition, Message: "invalid condition provenance", Cause: err}
	}
	if err := condition.Confidence.Validate(); err != nil {
		return &InventoryError{Code: ErrorInvalidCondition, Message: "invalid condition confidence", Cause: err}
	}
	if condition.IsExact() {
		switch condition.Provenance.Kind {
		case contract.ProvenanceObserved, contract.ProvenanceCorrected, contract.ProvenanceManual, contract.ProvenanceDerived:
			return nil
		default:
			return inventoryError(ErrorInvalidCondition, "an exact percentage requires observed, corrected, manual, or derived evidence")
		}
	}
	if condition.Provenance.Kind != contract.ProvenanceRange && condition.Provenance.Kind != contract.ProvenanceEstimated {
		return inventoryError(ErrorInvalidCondition, "a non-exact percentage requires range or estimated provenance")
	}
	return nil
}

// DefaultCondition applies only documented product ranges. Callers with an
// exact measured or manual value must construct and validate that value.
func DefaultCondition(origin Origin) (Condition, error) {
	var condition Condition
	switch origin {
	case OriginEventAllocation:
		condition = Condition{
			MinimumRemainingPercent: 100,
			MaximumRemainingPercent: 100,
			Provenance:              contract.Provenance{Kind: contract.ProvenanceObserved, SourceID: "event-allocation"},
			Confidence:              contract.Confidence{Level: contract.ConfidenceHigh, Basis: "new event allocation"},
		}
	case OriginQualifying:
		condition = Condition{
			MinimumRemainingPercent: 80,
			MaximumRemainingPercent: 90,
			Provenance:              contract.Provenance{Kind: contract.ProvenanceRange, SourceID: "qualifying-default-range"},
			Confidence:              contract.Confidence{Level: contract.ConfidenceLow, Basis: "qualifying usage without exact data"},
		}
	case OriginUnknown:
		condition = Condition{
			MinimumRemainingPercent: 40,
			MaximumRemainingPercent: 70,
			Provenance:              contract.Provenance{Kind: contract.ProvenanceRange, SourceID: "missing-data-default-range"},
			Confidence:              contract.Confidence{Level: contract.ConfidenceLow, Basis: "no measured or manual condition"},
		}
	default:
		return Condition{}, inventoryError(ErrorInvalidOrigin, "unknown tyre origin")
	}
	return condition, condition.Validate()
}

// Tyre represents one physical tyre. LockedCorner becomes permanent on first
// recorded use; MountedCorner is only the current, reversible placement.
type Tyre struct {
	ID            TyreID    `json:"id"`
	Compound      Compound  `json:"compound"`
	Origin        Origin    `json:"origin"`
	Condition     Condition `json:"condition"`
	State         State     `json:"state"`
	Stints        int       `json:"stints"`
	MountedCorner Corner    `json:"mountedCorner,omitempty"`
	LockedCorner  Corner    `json:"lockedCorner,omitempty"`
}

func NewTyre(id TyreID, compound Compound, origin Origin, condition Condition) (Tyre, error) {
	tyre := Tyre{
		ID:        id,
		Compound:  compound,
		Origin:    origin,
		Condition: condition,
		State:     StateFree,
	}
	if err := tyre.validate(); err != nil {
		return Tyre{}, err
	}
	return tyre, nil
}

func (tyre Tyre) validate() error {
	if !tyreIDPattern.MatchString(string(tyre.ID)) {
		return &InventoryError{Code: ErrorInvalidTyre, TyreID: tyre.ID, Message: "tyre id must contain 1-128 safe identifier characters"}
	}
	if !tyre.Compound.valid() {
		return &InventoryError{Code: ErrorInvalidCompound, TyreID: tyre.ID, Compound: tyre.Compound, Message: "compound must be soft, medium, hard, or wet"}
	}
	if !tyre.Origin.valid() {
		return &InventoryError{Code: ErrorInvalidOrigin, TyreID: tyre.ID, Message: "unknown tyre origin"}
	}
	if err := tyre.Condition.Validate(); err != nil {
		return &InventoryError{Code: ErrorInvalidCondition, TyreID: tyre.ID, Message: "invalid tyre condition", Cause: err}
	}
	if tyre.Stints < 0 {
		return &InventoryError{Code: ErrorInvalidTyre, TyreID: tyre.ID, Message: "stints cannot be negative"}
	}
	switch tyre.State {
	case StateFree:
		if tyre.Stints != 0 || tyre.MountedCorner != CornerNone || tyre.LockedCorner != CornerNone {
			return invalidTyreState(tyre.ID, "a free tyre cannot have use or corner history")
		}
	case StateMounted:
		if !tyre.MountedCorner.valid() {
			return invalidTyreState(tyre.ID, "a mounted tyre requires a current corner")
		}
		if tyre.Stints == 0 && tyre.LockedCorner != CornerNone {
			return invalidTyreState(tyre.ID, "an unused tyre cannot have a locked corner")
		}
		if tyre.Stints > 0 && (tyre.LockedCorner == CornerNone || tyre.LockedCorner != tyre.MountedCorner) {
			return invalidTyreState(tyre.ID, "a used mounted tyre must remain on its locked corner")
		}
	case StateUsed:
		if tyre.Stints == 0 || !tyre.LockedCorner.valid() || tyre.MountedCorner != CornerNone {
			return invalidTyreState(tyre.ID, "a used tyre requires stint history and one locked corner")
		}
	case StateDiscarded:
		if tyre.MountedCorner != CornerNone {
			return invalidTyreState(tyre.ID, "a discarded tyre cannot remain mounted")
		}
		if tyre.Stints == 0 && tyre.LockedCorner != CornerNone {
			return invalidTyreState(tyre.ID, "an unused discarded tyre cannot have a locked corner")
		}
		if tyre.Stints > 0 && !tyre.LockedCorner.valid() {
			return invalidTyreState(tyre.ID, "a used discarded tyre retains its locked corner")
		}
	default:
		return invalidTyreState(tyre.ID, "unknown tyre state")
	}
	return nil
}

type Inventory struct {
	maximum int
	tyres   []Tyre
}

func NewInventory(maximum int, values []Tyre) (Inventory, error) {
	if maximum < 0 {
		return Inventory{}, inventoryError(ErrorInvalidMaximum, "maximum tyre count cannot be negative")
	}
	if len(values) > maximum {
		return Inventory{}, &InventoryError{Code: ErrorCapacityExceeded, Required: len(values), Available: maximum, Message: "physical tyre count exceeds the event maximum"}
	}
	seen := make(map[TyreID]struct{}, len(values))
	for _, tyre := range values {
		if _, exists := seen[tyre.ID]; exists {
			return Inventory{}, &InventoryError{Code: ErrorDuplicateTyre, TyreID: tyre.ID, Message: "physical tyre identity must be unique"}
		}
		if err := tyre.validate(); err != nil {
			return Inventory{}, err
		}
		seen[tyre.ID] = struct{}{}
	}
	return Inventory{maximum: maximum, tyres: cloneTyres(values)}, nil
}

func (inventory Inventory) Maximum() int { return inventory.maximum }

func (inventory Inventory) Tyres() []Tyre { return cloneTyres(inventory.tyres) }

func (inventory Inventory) Tyre(id TyreID) (Tyre, bool) {
	for _, tyre := range inventory.tyres {
		if tyre.ID == id {
			return tyre, true
		}
	}
	return Tyre{}, false
}

func (inventory Inventory) Mount(id TyreID, corner Corner) (Inventory, error) {
	if !corner.valid() {
		return Inventory{}, &InventoryError{Code: ErrorInvalidCorner, TyreID: id, Corner: corner, Message: "unknown physical corner"}
	}
	index, tyre, err := inventory.find(id)
	if err != nil {
		return Inventory{}, err
	}
	if tyre.State == StateDiscarded {
		return Inventory{}, &InventoryError{Code: ErrorInvalidTransition, TyreID: id, Message: "discarded tyre cannot be mounted"}
	}
	if tyre.LockedCorner != CornerNone && tyre.LockedCorner != corner {
		return Inventory{}, &InventoryError{Code: ErrorCornerLocked, TyreID: id, Corner: corner, Message: fmt.Sprintf("tyre is permanently assigned to %s", tyre.LockedCorner)}
	}
	for otherIndex, other := range inventory.tyres {
		if otherIndex != index && other.State == StateMounted && other.MountedCorner == corner {
			return Inventory{}, &InventoryError{Code: ErrorCornerOccupied, TyreID: id, Corner: corner, Message: fmt.Sprintf("corner is occupied by %s", other.ID)}
		}
	}
	tyre.State = StateMounted
	tyre.MountedCorner = corner
	return inventory.replace(index, tyre)
}

func (inventory Inventory) Unmount(id TyreID) (Inventory, error) {
	index, tyre, err := inventory.find(id)
	if err != nil {
		return Inventory{}, err
	}
	if tyre.State != StateMounted {
		return Inventory{}, &InventoryError{Code: ErrorInvalidTransition, TyreID: id, Message: "only a mounted tyre can be unmounted"}
	}
	tyre.MountedCorner = CornerNone
	if tyre.Stints == 0 {
		tyre.State = StateFree
	} else {
		tyre.State = StateUsed
	}
	return inventory.replace(index, tyre)
}

func (inventory Inventory) RecordUse(id TyreID, corner Corner) (Inventory, error) {
	index, tyre, err := inventory.find(id)
	if err != nil {
		return Inventory{}, err
	}
	if tyre.State != StateMounted || tyre.MountedCorner != corner {
		return Inventory{}, &InventoryError{Code: ErrorInvalidTransition, TyreID: id, Corner: corner, Message: "tyre must be mounted on the recorded corner before use"}
	}
	if tyre.LockedCorner != CornerNone && tyre.LockedCorner != corner {
		return Inventory{}, &InventoryError{Code: ErrorCornerLocked, TyreID: id, Corner: corner, Message: fmt.Sprintf("tyre is permanently assigned to %s", tyre.LockedCorner)}
	}
	tyre.LockedCorner = corner
	tyre.MountedCorner = CornerNone
	tyre.Stints++
	tyre.State = StateUsed
	return inventory.replace(index, tyre)
}

func (inventory Inventory) UpdateCondition(id TyreID, condition Condition) (Inventory, error) {
	if err := condition.Validate(); err != nil {
		return Inventory{}, err
	}
	index, tyre, err := inventory.find(id)
	if err != nil {
		return Inventory{}, err
	}
	tyre.Condition = condition
	return inventory.replace(index, tyre)
}

func (inventory Inventory) Discard(id TyreID) (Inventory, error) {
	index, tyre, err := inventory.find(id)
	if err != nil {
		return Inventory{}, err
	}
	if tyre.State == StateMounted {
		return Inventory{}, &InventoryError{Code: ErrorInvalidTransition, TyreID: id, Message: "mounted tyre must be unmounted before discard"}
	}
	tyre.State = StateDiscarded
	return inventory.replace(index, tyre)
}

func (inventory Inventory) find(id TyreID) (int, Tyre, error) {
	for index, tyre := range inventory.tyres {
		if tyre.ID == id {
			return index, tyre, nil
		}
	}
	return 0, Tyre{}, &InventoryError{Code: ErrorTyreNotFound, TyreID: id, Message: "physical tyre does not exist in inventory"}
}

func (inventory Inventory) replace(index int, tyre Tyre) (Inventory, error) {
	if err := tyre.validate(); err != nil {
		return Inventory{}, err
	}
	values := cloneTyres(inventory.tyres)
	values[index] = tyre
	return Inventory{maximum: inventory.maximum, tyres: values}, nil
}

func cloneTyres(values []Tyre) []Tyre {
	return append([]Tyre(nil), values...)
}

type FitmentRequest struct {
	FrontLeft  Compound
	FrontRight Compound
	RearLeft   Compound
	RearRight  Compound
}

type Fitment struct {
	FrontLeft  TyreID `json:"frontLeft"`
	FrontRight TyreID `json:"frontRight"`
	RearLeft   TyreID `json:"rearLeft"`
	RearRight  TyreID `json:"rearRight"`
}

type fitmentNeed struct {
	corner   Corner
	compound Compound
}

func (request FitmentRequest) needs() []fitmentNeed {
	return []fitmentNeed{
		{corner: CornerFrontLeft, compound: request.FrontLeft},
		{corner: CornerFrontRight, compound: request.FrontRight},
		{corner: CornerRearLeft, compound: request.RearLeft},
		{corner: CornerRearRight, compound: request.RearRight},
	}
}

// SelectFitment selects physical tyres without changing the inventory. Mixed
// compounds are intentionally valid. Persistent corners and discarded units
// remain hard constraints.
func (inventory Inventory) SelectFitment(request FitmentRequest) (Fitment, error) {
	needs := request.needs()
	requiredByCompound := make(map[Compound]int)
	availableByCompound := make(map[Compound]int)
	for _, need := range needs {
		if !need.compound.valid() {
			return Fitment{}, &InventoryError{Code: ErrorInvalidCompound, Corner: need.corner, Compound: need.compound, Message: "fitment requires a supported compound"}
		}
		requiredByCompound[need.compound]++
	}
	for _, tyre := range inventory.tyres {
		if tyre.State != StateDiscarded {
			availableByCompound[tyre.Compound]++
		}
	}
	for compound, required := range requiredByCompound {
		if available := availableByCompound[compound]; available < required {
			return Fitment{}, &InventoryError{
				Code:      ErrorInsufficientInventory,
				Compound:  compound,
				Required:  required,
				Available: available,
				Message:   fmt.Sprintf("need %d %s tyres but only %d are available", required, compound, available),
			}
		}
	}

	assignment := make(map[Corner]TyreID, len(needs))
	used := make(map[TyreID]bool, len(needs))
	if !inventory.assign(needs, 0, assignment, used) {
		for _, need := range needs {
			available := 0
			for _, tyre := range inventory.tyres {
				if tyreAvailableFor(tyre, need) {
					available++
				}
			}
			if available == 0 {
				return Fitment{}, &InventoryError{Code: ErrorInsufficientInventory, Corner: need.corner, Compound: need.compound, Required: 1, Available: 0, Message: "no compatible physical tyre is available for this corner"}
			}
		}
		compatible := make(map[TyreID]struct{})
		for _, need := range needs {
			for _, tyre := range inventory.tyres {
				if tyreAvailableFor(tyre, need) {
					compatible[tyre.ID] = struct{}{}
				}
			}
		}
		return Fitment{}, &InventoryError{Code: ErrorInsufficientInventory, Required: len(needs), Available: len(compatible), Message: "available tyres cannot satisfy all compound and persistent-corner constraints"}
	}
	return Fitment{
		FrontLeft:  assignment[CornerFrontLeft],
		FrontRight: assignment[CornerFrontRight],
		RearLeft:   assignment[CornerRearLeft],
		RearRight:  assignment[CornerRearRight],
	}, nil
}

func (inventory Inventory) assign(needs []fitmentNeed, index int, assignment map[Corner]TyreID, used map[TyreID]bool) bool {
	if index == len(needs) {
		return true
	}
	need := needs[index]
	candidates := make([]Tyre, 0, len(inventory.tyres))
	for _, tyre := range inventory.tyres {
		if !used[tyre.ID] && tyreAvailableFor(tyre, need) {
			candidates = append(candidates, tyre)
		}
	}
	sort.Slice(candidates, func(left, right int) bool {
		leftLocked := candidates[left].LockedCorner == need.corner
		rightLocked := candidates[right].LockedCorner == need.corner
		if leftLocked != rightLocked {
			return leftLocked
		}
		return strings.Compare(string(candidates[left].ID), string(candidates[right].ID)) < 0
	})
	for _, candidate := range candidates {
		used[candidate.ID] = true
		assignment[need.corner] = candidate.ID
		if inventory.assign(needs, index+1, assignment, used) {
			return true
		}
		delete(assignment, need.corner)
		delete(used, candidate.ID)
	}
	return false
}

func tyreAvailableFor(tyre Tyre, need fitmentNeed) bool {
	return tyre.State != StateDiscarded &&
		tyre.Compound == need.compound &&
		(tyre.LockedCorner == CornerNone || tyre.LockedCorner == need.corner)
}

type ErrorCode string

const (
	ErrorInvalidMaximum        ErrorCode = "invalid_maximum"
	ErrorCapacityExceeded      ErrorCode = "capacity_exceeded"
	ErrorDuplicateTyre         ErrorCode = "duplicate_tyre"
	ErrorInvalidTyre           ErrorCode = "invalid_tyre"
	ErrorInvalidCompound       ErrorCode = "invalid_compound"
	ErrorInvalidOrigin         ErrorCode = "invalid_origin"
	ErrorInvalidCondition      ErrorCode = "invalid_condition"
	ErrorInvalidState          ErrorCode = "invalid_state"
	ErrorInvalidCorner         ErrorCode = "invalid_corner"
	ErrorTyreNotFound          ErrorCode = "tyre_not_found"
	ErrorInvalidTransition     ErrorCode = "invalid_transition"
	ErrorCornerLocked          ErrorCode = "corner_locked"
	ErrorTyreDiscarded         ErrorCode = "tyre_discarded"
	ErrorTyreReused            ErrorCode = "tyre_reused"
	ErrorCornerOccupied        ErrorCode = "corner_occupied"
	ErrorInsufficientInventory ErrorCode = "insufficient_inventory"
)

// InventoryError is stable and machine-readable while retaining enough
// context for the UI to explain why an operation failed.
type InventoryError struct {
	Code      ErrorCode
	TyreID    TyreID
	Corner    Corner
	Compound  Compound
	Required  int
	Available int
	Message   string
	Cause     error
}

func (err *InventoryError) Error() string {
	details := make([]string, 0, 3)
	if err.TyreID != "" {
		details = append(details, "tyre="+string(err.TyreID))
	}
	if err.Corner != "" {
		details = append(details, "corner="+string(err.Corner))
	}
	if err.Compound != "" {
		details = append(details, "compound="+string(err.Compound))
	}
	if len(details) == 0 {
		return fmt.Sprintf("%s: %s", err.Code, err.Message)
	}
	return fmt.Sprintf("%s (%s): %s", err.Code, strings.Join(details, ", "), err.Message)
}

func (err *InventoryError) Unwrap() error { return err.Cause }

func inventoryError(code ErrorCode, message string) error {
	return &InventoryError{Code: code, Message: message}
}

func invalidTyreState(id TyreID, message string) error {
	return &InventoryError{Code: ErrorInvalidState, TyreID: id, Message: message}
}
