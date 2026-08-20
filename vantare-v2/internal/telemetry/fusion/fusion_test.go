package fusion

import (
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/catalog"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

const (
	slotPrimary   SlotID = "primary"
	slotSecondary SlotID = "secondary"
	slotTertiary  SlotID = "tertiary"

	primaryTTL   = 500 * time.Millisecond
	secondaryTTL = 2 * time.Second
	tertiaryTTL  = 4 * time.Second
)

func fresh(t *testing.T, value int) schema.Field[int] {
	t.Helper()
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatalf("NewField() error = %v", err)
	}
	return field
}

func at(elapsed time.Duration) Stamp { return Stamp{Elapsed: elapsed, Set: true} }

func oneSlot() Rule {
	return Rule{Signal: catalog.SignalSessionType, Sources: []Candidate{{slotPrimary, primaryTTL}}}
}

func twoSlots() Rule {
	return Rule{
		Signal:     catalog.SignalSessionType,
		Sources:    []Candidate{{slotPrimary, primaryTTL}, {slotSecondary, secondaryTTL}},
		Equivalent: true,
	}
}

func threeSlots() Rule {
	return Rule{
		Signal:     catalog.SignalSessionType,
		Sources:    []Candidate{{slotPrimary, primaryTTL}, {slotSecondary, secondaryTTL}, {slotTertiary, tertiaryTTL}},
		Equivalent: true,
	}
}

func TestMatrixIndexesEverySignalWithoutLinearScan(t *testing.T) {
	t.Parallel()

	matrix, err := NewMatrix([]Rule{oneSlot(), {Signal: catalog.SignalSessionTrackName, Sources: []Candidate{{slotSecondary, secondaryTTL}}}})
	if err != nil {
		t.Fatalf("NewMatrix() error = %v", err)
	}
	if matrix.Len() != 2 {
		t.Fatalf("Len() = %d, want 2", matrix.Len())
	}
	rule, err := matrix.Lookup(catalog.SignalSessionTrackName)
	if err != nil {
		t.Fatalf("Lookup() error = %v", err)
	}
	if rule.Preferred().Slot != slotSecondary {
		t.Fatalf("Preferred() = %q, want %q", rule.Preferred().Slot, slotSecondary)
	}
	if slots := matrix.Slots(); len(slots) != 2 || slots[0] != slotPrimary || slots[1] != slotSecondary {
		t.Fatalf("Slots() = %v", slots)
	}
}

// An uncovered signal is a matrix bug, but it must degrade to a typed error so
// a partially mapped driver cannot take the process down. The LMU fusion this
// package replaces panicked here.
func TestLookupReturnsTypedErrorInsteadOfPanicking(t *testing.T) {
	t.Parallel()

	matrix, err := NewMatrix([]Rule{oneSlot()})
	if err != nil {
		t.Fatalf("NewMatrix() error = %v", err)
	}
	if _, err := matrix.Lookup(catalog.SignalEnergyFuelAmount); !errors.Is(err, ErrRuleMissing) {
		t.Fatalf("Lookup() error = %v, want ErrRuleMissing", err)
	}
	var absent *Matrix
	if _, err := absent.Lookup(catalog.SignalSessionType); !errors.Is(err, ErrRuleMissing) {
		t.Fatalf("nil Lookup() error = %v, want ErrRuleMissing", err)
	}
}

func TestNewMatrixRejectsDuplicateAndEmptyRules(t *testing.T) {
	t.Parallel()

	if _, err := NewMatrix([]Rule{oneSlot(), oneSlot()}); !errors.Is(err, ErrDuplicateRule) {
		t.Fatalf("duplicate error = %v, want ErrDuplicateRule", err)
	}
	if _, err := NewMatrix([]Rule{{Signal: catalog.SignalSessionType}}); !errors.Is(err, ErrEmptyRule) {
		t.Fatalf("empty error = %v, want ErrEmptyRule", err)
	}
}

func TestMatrixRulesAreDefensivelyCopied(t *testing.T) {
	t.Parallel()

	matrix, err := NewMatrix([]Rule{twoSlots()})
	if err != nil {
		t.Fatalf("NewMatrix() error = %v", err)
	}
	rules := matrix.Rules()
	rules[0].Sources[0].Slot = "mutated"
	again, err := matrix.Lookup(catalog.SignalSessionType)
	if err != nil {
		t.Fatalf("Lookup() error = %v", err)
	}
	if again.Preferred().Slot != slotPrimary {
		t.Fatalf("matrix mutated through Rules(): %q", again.Preferred().Slot)
	}
}

func TestChooseResolvesOneTwoAndThreeSlots(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		rule      Rule
		inputs    []Input[int]
		wantValue int
		wantSlot  SlotID
		wantFall  bool
	}{
		{
			name:      "one slot answers",
			rule:      oneSlot(),
			inputs:    []Input[int]{{Slot: slotPrimary, Field: fresh(t, 1), At: at(0)}},
			wantValue: 1, wantSlot: slotPrimary,
		},
		{
			name: "two slots prefer the first",
			rule: twoSlots(),
			inputs: []Input[int]{
				{Slot: slotPrimary, Field: fresh(t, 1), At: at(0)},
				{Slot: slotSecondary, Field: fresh(t, 2), At: at(0)},
			},
			wantValue: 1, wantSlot: slotPrimary,
		},
		{
			name: "two slots fall back when the first is missing",
			rule: twoSlots(),
			inputs: []Input[int]{
				{Slot: slotSecondary, Field: fresh(t, 2), At: at(0)},
			},
			wantValue: 2, wantSlot: slotSecondary, wantFall: true,
		},
		{
			name: "three slots fall back to the third",
			rule: threeSlots(),
			inputs: []Input[int]{
				{Slot: slotTertiary, Field: fresh(t, 3), At: at(0)},
			},
			wantValue: 3, wantSlot: slotTertiary, wantFall: true,
		},
		{
			name: "three slots keep declaration order over arrival order",
			rule: threeSlots(),
			inputs: []Input[int]{
				{Slot: slotTertiary, Field: fresh(t, 3), At: at(0)},
				{Slot: slotSecondary, Field: fresh(t, 2), At: at(0)},
			},
			wantValue: 2, wantSlot: slotSecondary, wantFall: true,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			ledger := NewLedger(1, 5)
			got := Choose(0, test.rule, ledger, test.inputs...)
			value, present := got.Value()
			if !present || value != test.wantValue {
				t.Fatalf("Choose() = %v present=%t, want %d", value, present, test.wantValue)
			}
			decisions := ledger.Decisions()
			if len(decisions) != 1 {
				t.Fatalf("Decisions() = %#v", decisions)
			}
			if decisions[0].Slot != test.wantSlot || decisions[0].Fallback != test.wantFall {
				t.Fatalf("decision = %#v, want slot %q fallback %t", decisions[0], test.wantSlot, test.wantFall)
			}
		})
	}
}

func TestChooseHonoursPerSlotTTL(t *testing.T) {
	t.Parallel()

	ledger := NewLedger(1, 5)
	got := Choose(time.Second, twoSlots(), ledger,
		Input[int]{Slot: slotPrimary, Field: fresh(t, 1), At: at(0)},
		Input[int]{Slot: slotSecondary, Field: fresh(t, 2), At: at(0)},
	)
	// The primary budget is 500ms and expired; the secondary budget is 2s and
	// is still fresh, so the fresher slot wins over the stale preferred one.
	if value, _ := got.Value(); value != 2 {
		t.Fatalf("Choose() = %d, want the still-fresh secondary slot", value)
	}
	if decision := ledger.Decisions()[0]; decision.Slot != slotSecondary || !decision.Fallback {
		t.Fatalf("decision = %#v", decision)
	}
}

func TestChooseKeepsPreferredWhenNotEquivalent(t *testing.T) {
	t.Parallel()

	rule := twoSlots()
	rule.Equivalent = false
	ledger := NewLedger(1, 5)
	got := Choose(0, rule, ledger, Input[int]{Slot: slotSecondary, Field: fresh(t, 2), At: at(0)})
	if _, present := got.Value(); present {
		t.Fatal("a non-equivalent rule must not fall back to another slot")
	}
	if decision := ledger.Decisions()[0]; decision.Slot != SlotUnknown || decision.Freshness != schema.FreshnessMissing {
		t.Fatalf("decision = %#v", decision)
	}
}

func TestConflictsAreRecordedAndClamped(t *testing.T) {
	t.Parallel()

	ledger := NewLedger(1, 2)
	Choose(0, threeSlots(), ledger,
		Input[int]{Slot: slotPrimary, Field: fresh(t, 1), At: at(0)},
		Input[int]{Slot: slotSecondary, Field: fresh(t, 2), At: at(0)},
		Input[int]{Slot: slotTertiary, Field: fresh(t, 3), At: at(0)},
	)
	conflicts := ledger.Conflicts()
	if len(conflicts) != 2 {
		t.Fatalf("Conflicts() = %#v, want two clamped entries", conflicts)
	}
	if conflicts[0].Preferred != slotPrimary || conflicts[0].Alternative != slotSecondary {
		t.Fatalf("first conflict = %#v", conflicts[0])
	}
	ledger.Conflict(catalog.SignalSessionType, slotPrimary, slotTertiary)
	if len(ledger.Conflicts()) != 2 {
		t.Fatal("conflict budget is not clamped")
	}
}

func TestChooseFuncUsesTheSuppliedDisagreementPredicate(t *testing.T) {
	t.Parallel()

	ledger := NewLedger(1, 5)
	never := func(left, right Input[int]) bool { return false }
	Choose(0, twoSlots(), NewLedger(1, 5),
		Input[int]{Slot: slotPrimary, Field: fresh(t, 1), At: at(0)},
		Input[int]{Slot: slotSecondary, Field: fresh(t, 2), At: at(0)},
	)
	ChooseFunc(0, twoSlots(), ledger, never,
		Input[int]{Slot: slotPrimary, Field: fresh(t, 1), At: at(0)},
		Input[int]{Slot: slotSecondary, Field: fresh(t, 2), At: at(0)},
	)
	if len(ledger.Conflicts()) != 0 {
		t.Fatalf("Conflicts() = %#v, want none", ledger.Conflicts())
	}
}

func TestFieldAtDowngradesOnExpiryAndBackwardsClock(t *testing.T) {
	t.Parallel()

	field := fresh(t, 1)
	if got := FieldAt(400*time.Millisecond, at(0), primaryTTL, field); got.Freshness() != schema.FreshnessFresh {
		t.Fatalf("within budget freshness = %v", got.Freshness())
	}
	if got := FieldAt(600*time.Millisecond, at(0), primaryTTL, field); got.Freshness() != schema.FreshnessStale {
		t.Fatalf("expired freshness = %v", got.Freshness())
	}
	if got := FieldAt(0, at(time.Second), primaryTTL, field); got.Freshness() != schema.FreshnessStale {
		t.Fatalf("backwards clock freshness = %v", got.Freshness())
	}
	if got := FieldAt(time.Hour, Stamp{}, primaryTTL, field); got.Freshness() != schema.FreshnessFresh {
		t.Fatalf("unstamped freshness = %v", got.Freshness())
	}
}

func TestSlotsRetainEveryDeclaredSource(t *testing.T) {
	t.Parallel()

	store := NewSlots[int](slotPrimary, slotSecondary, slotTertiary)
	store.Put(slotPrimary, 1, at(0))
	store.Put(slotTertiary, 3, at(time.Second))
	store.Put(slotPrimary, 11, at(2*time.Second))
	if store.Count() != 2 || store.Sequence() != 3 {
		t.Fatalf("Count() = %d Sequence() = %d", store.Count(), store.Sequence())
	}
	if entry := store.Get(slotPrimary); entry.Value != 11 || entry.Sequence != 3 {
		t.Fatalf("primary entry = %#v", entry)
	}
	if entry := store.Get(slotSecondary); entry.Present() {
		t.Fatalf("secondary entry = %#v, want absent", entry)
	}
	store.Put(SlotUnknown, 9, at(0))
	if store.Sequence() != 3 {
		t.Fatal("the unknown slot must not be retained")
	}
}
