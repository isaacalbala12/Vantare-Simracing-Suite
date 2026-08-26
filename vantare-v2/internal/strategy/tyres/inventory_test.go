package tyres

import (
	"errors"
	"math"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

func TestInventoryAcceptsIndividualTyresAndEveryLMUCompound(t *testing.T) {
	tyres := []Tyre{
		mustAllocatedTyre(t, "soft-1", CompoundSoft),
		mustAllocatedTyre(t, "medium-1", CompoundMedium),
		mustAllocatedTyre(t, "hard-1", CompoundHard),
		mustAllocatedTyre(t, "wet-1", CompoundWet),
	}

	inventory, err := NewInventory(4, tyres)
	if err != nil {
		t.Fatalf("new inventory: %v", err)
	}
	if inventory.Maximum() != 4 || len(inventory.Tyres()) != 4 {
		t.Fatalf("unexpected inventory: maximum=%d tyres=%d", inventory.Maximum(), len(inventory.Tyres()))
	}
}

func TestInventoryRejectsDuplicateIdentityAndMaximumOverflow(t *testing.T) {
	duplicate := mustAllocatedTyre(t, "soft-1", CompoundSoft)
	for name, test := range map[string]struct {
		maximum int
		values  []Tyre
		code    ErrorCode
	}{
		"duplicate": {maximum: 2, values: []Tyre{duplicate, duplicate}, code: ErrorDuplicateTyre},
		"overflow": {
			maximum: 1,
			values:  []Tyre{duplicate, mustAllocatedTyre(t, "medium-1", CompoundMedium)},
			code:    ErrorCapacityExceeded,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := NewInventory(test.maximum, test.values)
			assertInventoryError(t, err, test.code)
		})
	}
}

func TestDefaultConditionsKeepUncertaintyExplicit(t *testing.T) {
	tests := []struct {
		name   string
		origin Origin
		min    float64
		max    float64
		exact  bool
	}{
		{name: "new event allocation", origin: OriginEventAllocation, min: 100, max: 100, exact: true},
		{name: "qualifying without exact data", origin: OriginQualifying, min: 80, max: 90},
		{name: "unknown used tyre", origin: OriginUnknown, min: 40, max: 70},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			condition, err := DefaultCondition(test.origin)
			if err != nil {
				t.Fatalf("default condition: %v", err)
			}
			if condition.MinimumRemainingPercent != test.min || condition.MaximumRemainingPercent != test.max || condition.IsExact() != test.exact {
				t.Fatalf("unexpected condition: %#v", condition)
			}
		})
	}
}

func TestConditionRejectsInventedExactEstimateAndInvalidNumbers(t *testing.T) {
	now := time.Date(2026, 8, 2, 10, 0, 0, 0, time.UTC)
	tests := []Condition{
		{
			MinimumRemainingPercent: 55,
			MaximumRemainingPercent: 55,
			Provenance:              contract.Provenance{Kind: contract.ProvenanceEstimated, SourceID: "wear-model", ObservedAt: &now},
			Confidence:              contract.Confidence{Level: contract.ConfidenceLow, Basis: "no measured wear"},
		},
		{
			MinimumRemainingPercent: math.NaN(),
			MaximumRemainingPercent: 70,
			Provenance:              contract.Provenance{Kind: contract.ProvenanceRange, SourceID: "fallback"},
			Confidence:              contract.Confidence{Level: contract.ConfidenceLow, Basis: "missing data"},
		},
		{
			MinimumRemainingPercent: 40,
			MaximumRemainingPercent: math.Inf(1),
			Provenance:              contract.Provenance{Kind: contract.ProvenanceRange, SourceID: "fallback"},
			Confidence:              contract.Confidence{Level: contract.ConfidenceLow, Basis: "missing data"},
		},
		{
			MinimumRemainingPercent: 90,
			MaximumRemainingPercent: 80,
			Provenance:              contract.Provenance{Kind: contract.ProvenanceRange, SourceID: "qualifying"},
			Confidence:              contract.Confidence{Level: contract.ConfidenceLow, Basis: "qualifying range"},
		},
	}
	for index, condition := range tests {
		if err := condition.Validate(); err == nil {
			t.Fatalf("condition %d should fail: %#v", index, condition)
		}
	}
}

func TestConditionAcceptsExplicitManualQualifyingValue(t *testing.T) {
	condition := Condition{
		MinimumRemainingPercent: 86,
		MaximumRemainingPercent: 86,
		Provenance:              contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "qualifying-input"},
		Confidence:              contract.Confidence{Level: contract.ConfidenceMedium, Basis: "driver entered remaining condition"},
	}
	tyre, err := NewTyre("qualifying-soft", CompoundSoft, OriginQualifying, condition)
	if err != nil {
		t.Fatalf("explicit qualifying condition: %v", err)
	}
	if !tyre.Condition.IsExact() || tyre.Condition.MinimumRemainingPercent != 86 {
		t.Fatalf("manual exact value was not preserved: %#v", tyre.Condition)
	}
}

func TestUsedTyreCannotChangeCorner(t *testing.T) {
	inventory := mustInventory(t, mustAllocatedTyre(t, "soft-1", CompoundSoft))
	mounted, err := inventory.Mount("soft-1", CornerFrontLeft)
	if err != nil {
		t.Fatalf("mount first corner: %v", err)
	}
	used, err := mounted.RecordUse("soft-1", CornerFrontLeft)
	if err != nil {
		t.Fatalf("record first use: %v", err)
	}

	_, err = used.Mount("soft-1", CornerFrontRight)
	assertInventoryError(t, err, ErrorCornerLocked)

	remounted, err := used.Mount("soft-1", CornerFrontLeft)
	if err != nil {
		t.Fatalf("remount locked corner: %v", err)
	}
	usedAgain, err := remounted.RecordUse("soft-1", CornerFrontLeft)
	if err != nil {
		t.Fatalf("record second use: %v", err)
	}
	tyre, ok := usedAgain.Tyre("soft-1")
	if !ok || tyre.Stints != 2 || tyre.LockedCorner != CornerFrontLeft || tyre.State != StateUsed {
		t.Fatalf("unexpected used tyre: %#v", tyre)
	}
}

func TestUnusedMountedTyreMayMoveBeforeFirstUse(t *testing.T) {
	inventory := mustInventory(t, mustAllocatedTyre(t, "soft-1", CompoundSoft))
	left, err := inventory.Mount("soft-1", CornerFrontLeft)
	if err != nil {
		t.Fatalf("mount left: %v", err)
	}
	right, err := left.Mount("soft-1", CornerFrontRight)
	if err != nil {
		t.Fatalf("move before use: %v", err)
	}
	tyre, _ := right.Tyre("soft-1")
	if tyre.MountedCorner != CornerFrontRight || tyre.LockedCorner != CornerNone {
		t.Fatalf("unexpected pre-use mount: %#v", tyre)
	}
}

func TestInventoryOperationsAreImmutable(t *testing.T) {
	inventory := mustInventory(t, mustAllocatedTyre(t, "soft-1", CompoundSoft))
	returned := inventory.Tyres()
	returned[0].State = StateDiscarded

	mounted, err := inventory.Mount("soft-1", CornerFrontLeft)
	if err != nil {
		t.Fatalf("mount: %v", err)
	}
	original, _ := inventory.Tyre("soft-1")
	changed, _ := mounted.Tyre("soft-1")
	if original.State != StateFree || original.MountedCorner != CornerNone {
		t.Fatalf("original mutated: %#v", original)
	}
	if changed.State != StateMounted || changed.MountedCorner != CornerFrontLeft {
		t.Fatalf("returned inventory did not change: %#v", changed)
	}
}

func TestSelectFitmentAllowsMixedCompounds(t *testing.T) {
	inventory := mustInventory(t,
		mustAllocatedTyre(t, "soft-1", CompoundSoft),
		mustAllocatedTyre(t, "medium-1", CompoundMedium),
		mustAllocatedTyre(t, "hard-1", CompoundHard),
		mustAllocatedTyre(t, "wet-1", CompoundWet),
	)
	fitment, err := inventory.SelectFitment(FitmentRequest{
		FrontLeft:  CompoundSoft,
		FrontRight: CompoundMedium,
		RearLeft:   CompoundHard,
		RearRight:  CompoundWet,
	})
	if err != nil {
		t.Fatalf("select mixed fitment: %v", err)
	}
	if fitment.FrontLeft != "soft-1" || fitment.FrontRight != "medium-1" || fitment.RearLeft != "hard-1" || fitment.RearRight != "wet-1" {
		t.Fatalf("unexpected mixed fitment: %#v", fitment)
	}
}

func TestSelectFitmentExplainsInsufficientInventory(t *testing.T) {
	inventory := mustInventory(t,
		mustAllocatedTyre(t, "soft-1", CompoundSoft),
		mustAllocatedTyre(t, "soft-2", CompoundSoft),
		mustAllocatedTyre(t, "soft-3", CompoundSoft),
	)
	_, err := inventory.SelectFitment(FitmentRequest{
		FrontLeft:  CompoundSoft,
		FrontRight: CompoundSoft,
		RearLeft:   CompoundSoft,
		RearRight:  CompoundSoft,
	})
	var inventoryErr *InventoryError
	if !errors.As(err, &inventoryErr) || inventoryErr.Code != ErrorInsufficientInventory {
		t.Fatalf("expected insufficient inventory error, got %v", err)
	}
	if inventoryErr.Required != 4 || inventoryErr.Available != 3 || inventoryErr.Compound != CompoundSoft {
		t.Fatalf("error is not explainable: %#v", inventoryErr)
	}
}

func TestSelectFitmentRespectsPersistentCornerAndDiscardedState(t *testing.T) {
	locked := mustAllocatedTyre(t, "soft-locked", CompoundSoft)
	locked.State = StateUsed
	locked.Stints = 1
	locked.LockedCorner = CornerFrontLeft
	discarded := mustAllocatedTyre(t, "soft-discarded", CompoundSoft)
	discarded.State = StateDiscarded
	inventory := mustInventory(t,
		locked,
		discarded,
		mustAllocatedTyre(t, "soft-free-1", CompoundSoft),
		mustAllocatedTyre(t, "soft-free-2", CompoundSoft),
		mustAllocatedTyre(t, "soft-free-3", CompoundSoft),
	)

	fitment, err := inventory.SelectFitment(FitmentRequest{
		FrontLeft:  CompoundSoft,
		FrontRight: CompoundSoft,
		RearLeft:   CompoundSoft,
		RearRight:  CompoundSoft,
	})
	if err != nil {
		t.Fatalf("select fitment: %v", err)
	}
	if fitment.FrontLeft != "soft-locked" {
		t.Fatalf("locked tyre should remain on front left: %#v", fitment)
	}
	if fitment.FrontRight == "soft-discarded" || fitment.RearLeft == "soft-discarded" || fitment.RearRight == "soft-discarded" {
		t.Fatalf("discarded tyre selected: %#v", fitment)
	}
}

func TestSelectFitmentExplainsCornerLockedShortage(t *testing.T) {
	frontLeft := mustAllocatedTyre(t, "soft-front-left", CompoundSoft)
	frontLeft.State = StateUsed
	frontLeft.Stints = 1
	frontLeft.LockedCorner = CornerFrontLeft
	secondFrontLeft := frontLeft
	secondFrontLeft.ID = "soft-front-left-2"
	inventory := mustInventory(t,
		frontLeft,
		secondFrontLeft,
		mustAllocatedTyre(t, "medium-fr", CompoundMedium),
		mustAllocatedTyre(t, "hard-rl", CompoundHard),
		mustAllocatedTyre(t, "wet-rr", CompoundWet),
	)

	_, err := inventory.SelectFitment(FitmentRequest{
		FrontLeft:  CompoundSoft,
		FrontRight: CompoundSoft,
		RearLeft:   CompoundHard,
		RearRight:  CompoundWet,
	})
	var inventoryErr *InventoryError
	if !errors.As(err, &inventoryErr) || inventoryErr.Code != ErrorInsufficientInventory {
		t.Fatalf("expected corner shortage, got %v", err)
	}
	if inventoryErr.Corner != CornerFrontRight || inventoryErr.Compound != CompoundSoft || inventoryErr.Available != 0 {
		t.Fatalf("corner shortage is not explainable: %#v", inventoryErr)
	}
}

func TestSelectFitmentExcludingRequiresAnotherPhysicalSet(t *testing.T) {
	inventory := mustInventory(t,
		mustAllocatedTyre(t, "hard-a-fl", CompoundHard),
		mustAllocatedTyre(t, "hard-a-fr", CompoundHard),
		mustAllocatedTyre(t, "hard-a-rl", CompoundHard),
		mustAllocatedTyre(t, "hard-a-rr", CompoundHard),
		mustAllocatedTyre(t, "hard-b-fl", CompoundHard),
		mustAllocatedTyre(t, "hard-b-fr", CompoundHard),
		mustAllocatedTyre(t, "hard-b-rl", CompoundHard),
		mustAllocatedTyre(t, "hard-b-rr", CompoundHard),
	)
	request := FitmentRequest{
		FrontLeft: CompoundHard, FrontRight: CompoundHard,
		RearLeft: CompoundHard, RearRight: CompoundHard,
	}
	first, err := inventory.SelectFitment(request)
	if err != nil {
		t.Fatalf("select first fitment: %v", err)
	}
	second, err := inventory.SelectFitmentExcluding(request, []TyreID{
		first.FrontLeft, first.FrontRight, first.RearLeft, first.RearRight,
	})
	if err != nil {
		t.Fatalf("select second fitment: %v", err)
	}
	for _, id := range []TyreID{second.FrontLeft, second.FrontRight, second.RearLeft, second.RearRight} {
		if id == first.FrontLeft || id == first.FrontRight || id == first.RearLeft || id == first.RearRight {
			t.Fatalf("excluded tyre %s was reused: first=%+v second=%+v", id, first, second)
		}
	}

	_, err = inventory.SelectFitmentExcluding(request, []TyreID{
		first.FrontLeft, first.FrontRight, first.RearLeft, first.RearRight,
		second.FrontLeft, second.FrontRight, second.RearLeft, second.RearRight,
	})
	assertInventoryError(t, err, ErrorInsufficientInventory)
}

func mustAllocatedTyre(t *testing.T, id TyreID, compound Compound) Tyre {
	t.Helper()
	condition, err := DefaultCondition(OriginEventAllocation)
	if err != nil {
		t.Fatalf("default condition: %v", err)
	}
	tyre, err := NewTyre(id, compound, OriginEventAllocation, condition)
	if err != nil {
		t.Fatalf("new tyre: %v", err)
	}
	return tyre
}

func mustInventory(t *testing.T, values ...Tyre) Inventory {
	t.Helper()
	inventory, err := NewInventory(len(values), values)
	if err != nil {
		t.Fatalf("new inventory: %v", err)
	}
	return inventory
}

func assertInventoryError(t *testing.T, err error, code ErrorCode) {
	t.Helper()
	var inventoryErr *InventoryError
	if !errors.As(err, &inventoryErr) || inventoryErr.Code != code {
		t.Fatalf("expected inventory error %q, got %v", code, err)
	}
}
