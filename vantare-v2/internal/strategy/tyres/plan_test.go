package tyres

import (
	"context"
	"encoding/json"
	"testing"
)

func mustCondition(t *testing.T, origin Origin) Condition {
	t.Helper()
	condition, err := DefaultCondition(origin)
	if err != nil {
		t.Fatalf("DefaultCondition(%s): %v", origin, err)
	}
	return condition
}

func freshTyre(t *testing.T, id TyreID, compound Compound) Tyre {
	t.Helper()
	tyre, err := NewTyre(id, compound, OriginEventAllocation, mustCondition(t, OriginEventAllocation))
	if err != nil {
		t.Fatalf("NewTyre(%s): %v", id, err)
	}
	return tyre
}

func ranTyre(t *testing.T, id TyreID, compound Compound, corner Corner) Tyre {
	t.Helper()
	return Tyre{
		ID:           id,
		Compound:     compound,
		Origin:       OriginQualifying,
		Condition:    mustCondition(t, OriginQualifying),
		State:        StateUsed,
		Stints:       1,
		LockedCorner: corner,
	}
}

func planInventory(t *testing.T) Inventory {
	t.Helper()
	inventory, err := NewInventory(8, []Tyre{
		ranTyre(t, "M-01", CompoundMedium, CornerFrontLeft),
		freshTyre(t, "S-05", CompoundSoft),
		func() Tyre {
			tyre := freshTyre(t, "D-09", CompoundHard)
			tyre.State = StateDiscarded
			return tyre
		}(),
	})
	if err != nil {
		t.Fatalf("NewInventory: %v", err)
	}
	return inventory
}

func TestPlannableOnAcceptsAnyCornerForATyreThatNeverRan(t *testing.T) {
	inventory := planInventory(t)
	for _, corner := range orderedCorners() {
		if err := inventory.PlannableOn("S-05", corner); err != nil {
			t.Fatalf("a fresh tyre must be plannable on %s: %v", corner, err)
		}
	}
}

func TestPlannableOnKeepsAUsedTyreOnItsLockedCorner(t *testing.T) {
	inventory := planInventory(t)
	if err := inventory.PlannableOn("M-01", CornerFrontLeft); err != nil {
		t.Fatalf("locked corner must stay available: %v", err)
	}
	err := inventory.PlannableOn("M-01", CornerRearRight)
	var inventoryErr *InventoryError
	if !asInventoryError(err, &inventoryErr) || inventoryErr.Code != ErrorCornerLocked {
		t.Fatalf("expected corner_locked, got %v", err)
	}
}

func TestPlannableOnRejectsDiscardedAndUnknownTyres(t *testing.T) {
	inventory := planInventory(t)
	var inventoryErr *InventoryError

	err := inventory.PlannableOn("D-09", CornerFrontLeft)
	if !asInventoryError(err, &inventoryErr) || inventoryErr.Code != ErrorTyreDiscarded {
		t.Fatalf("expected tyre_discarded, got %v", err)
	}
	err = inventory.PlannableOn("ZZ-99", CornerFrontLeft)
	if !asInventoryError(err, &inventoryErr) || inventoryErr.Code != ErrorTyreNotFound {
		t.Fatalf("expected tyre_not_found, got %v", err)
	}
	err = inventory.PlannableOn("S-05", Corner("boot"))
	if !asInventoryError(err, &inventoryErr) || inventoryErr.Code != ErrorInvalidCorner {
		t.Fatalf("expected invalid_corner, got %v", err)
	}
}

func TestValidatePlanAcceptsARunnablePlan(t *testing.T) {
	inventory := planInventory(t)
	violations := inventory.ValidatePlan([]StintPlan{{
		StintID:     "stint-1",
		Assignments: map[Corner]TyreID{CornerFrontLeft: "M-01", CornerRearRight: "S-05"},
	}})
	if len(violations) != 0 {
		t.Fatalf("expected a runnable plan, got %+v", violations)
	}
}

func TestValidatePlanCollectsEveryViolationInOrder(t *testing.T) {
	inventory := planInventory(t)
	violations := inventory.ValidatePlan([]StintPlan{{
		StintID: "stint-2",
		Assignments: map[Corner]TyreID{
			CornerFrontLeft:  "ZZ-99", // not in the inventory
			CornerFrontRight: "M-01",  // locked to front left
			CornerRearLeft:   "D-09",  // discarded
			CornerRearRight:  "S-05",
		},
	}})
	if len(violations) != 3 {
		t.Fatalf("expected three violations, got %+v", violations)
	}
	// Corner order is fixed so the report never depends on map iteration.
	want := []ErrorCode{ErrorTyreNotFound, ErrorCornerLocked, ErrorTyreDiscarded}
	for index, code := range want {
		if violations[index].Code != code {
			t.Fatalf("violation %d: expected %s, got %s", index, code, violations[index].Code)
		}
		if violations[index].StintID != "stint-2" {
			t.Fatalf("violation %d lost its stint", index)
		}
	}
}

func TestValidatePlanRejectsOneTyreInTwoCornersOfAStint(t *testing.T) {
	inventory := planInventory(t)
	violations := inventory.ValidatePlan([]StintPlan{{
		StintID:     "stint-3",
		Assignments: map[Corner]TyreID{CornerRearLeft: "S-05", CornerRearRight: "S-05"},
	}})
	if len(violations) != 1 || violations[0].Code != ErrorTyreReused {
		t.Fatalf("expected tyre_reused, got %+v", violations)
	}
	if violations[0].Corner != CornerRearRight {
		t.Fatalf("the second corner is the offending one, got %s", violations[0].Corner)
	}
}

func TestValidatePlanAllowsTheSameTyreAcrossDifferentStints(t *testing.T) {
	inventory := planInventory(t)
	violations := inventory.ValidatePlan([]StintPlan{
		{StintID: "stint-1", Assignments: map[Corner]TyreID{CornerFrontLeft: "M-01"}},
		{StintID: "stint-2", Assignments: map[Corner]TyreID{CornerFrontLeft: "M-01"}},
	})
	if len(violations) != 0 {
		t.Fatalf("a tyre may run in more than one stint, got %+v", violations)
	}
}

func TestValidatePlanIgnoresEmptyCorners(t *testing.T) {
	inventory := planInventory(t)
	violations := inventory.ValidatePlan([]StintPlan{{
		StintID:     "stint-4",
		Assignments: map[Corner]TyreID{CornerFrontLeft: "", CornerRearRight: "S-05"},
	}})
	if len(violations) != 0 {
		t.Fatalf("an unassigned corner is not a violation, got %+v", violations)
	}
}

func TestJSONBridgeValidatesAPlan(t *testing.T) {
	command := ValidateCommandV1{
		ProtocolVersion: TyresProtocolV1,
		CommandID:       "tyres-1",
		Input: ValidateInput{
			Maximum: 8,
			Tyres:   []Tyre{ranTyre(t, "M-01", CompoundMedium, CornerFrontLeft)},
			Plan: []StintPlan{{
				StintID:     "stint-1",
				Assignments: map[Corner]TyreID{CornerRearRight: "M-01"},
			}},
		},
	}
	document, err := json.Marshal(command)
	if err != nil {
		t.Fatalf("marshal command: %v", err)
	}
	encoded, err := JSONBridge{}.Execute(context.Background(), document)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	var result ValidateResultV1
	if err := json.Unmarshal(encoded, &result); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if result.ProtocolVersion != TyresProtocolV1 || result.CommandID != "tyres-1" {
		t.Fatalf("result lost its envelope: %+v", result)
	}
	if result.Result.Valid || len(result.Result.Violations) != 1 {
		t.Fatalf("expected one violation, got %+v", result.Result)
	}
	if result.Result.Violations[0].Code != ErrorCornerLocked {
		t.Fatalf("expected corner_locked, got %s", result.Result.Violations[0].Code)
	}
}

func TestJSONBridgeRejectsMalformedCommands(t *testing.T) {
	bridge := JSONBridge{}
	cases := map[string]string{
		"empty":          ``,
		"unknown field":  `{"protocolVersion":"strategy.tyres.v1","commandId":"a","input":{},"extra":1}`,
		"bad protocol":   `{"protocolVersion":"strategy.tyres.v0","commandId":"a","input":{}}`,
		"bad command id": `{"protocolVersion":"strategy.tyres.v1","commandId":"","input":{}}`,
		"trailing data":  `{"protocolVersion":"strategy.tyres.v1","commandId":"a","input":{}} {}`,
		"capacity exceeded": `{"protocolVersion":"strategy.tyres.v1","commandId":"a","input":{"maximum":0,` +
			`"tyres":[{"id":"S-05","compound":"soft","origin":"event_allocation","state":"free","stints":0,` +
			`"condition":{"minimumRemainingPercent":100,"maximumRemainingPercent":100,` +
			`"provenance":{"kind":"observed","sourceId":"event-allocation"},` +
			`"confidence":{"level":"high","basis":"new event allocation"}}}]}}`,
	}
	for name, document := range cases {
		if _, err := bridge.Execute(context.Background(), []byte(document)); err == nil {
			t.Fatalf("%s: expected an error", name)
		}
	}
}

func TestJSONBridgeRejectsACancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (JSONBridge{}).Execute(ctx, []byte(`{}`)); err == nil {
		t.Fatal("expected a cancellation error")
	}
}
