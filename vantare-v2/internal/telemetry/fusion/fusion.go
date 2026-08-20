// Package fusion resolves one canonical value per catalog signal from an open
// set of acquisition slots. It is simulator neutral: it never imports a
// concrete driver, and a driver declares its own slot identifiers.
//
// The package replaces the private two-source fusion that lived inside the LMU
// driver. Three properties are guaranteed here and were not guaranteed there:
// the authority matrix is indexed by signal instead of scanned linearly, an
// uncovered signal returns ErrRuleMissing instead of panicking, and a matrix
// may declare any number of ordered source slots per signal.
package fusion

import (
	"errors"
	"fmt"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/catalog"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

// ErrRuleMissing reports a signal that the authority matrix does not cover.
// Reaching it is a programming error in the driver's matrix, never a runtime
// data condition, but it is returned instead of panicking so that a partially
// mapped driver degrades to a missing field rather than killing the process.
var ErrRuleMissing = errors.New("fusion authority rule is missing")

// ErrDuplicateRule reports two rules declared for the same signal.
var ErrDuplicateRule = errors.New("fusion authority matrix declares a duplicate signal")

// ErrEmptyRule reports a rule without any source slot.
var ErrEmptyRule = errors.New("fusion authority rule declares no source slot")

// SlotID identifies one acquisition slot of a driver. It is an open string:
// LMU uses "shared-memory" and "rest", a single-source driver uses one slot,
// and a three-source driver simply declares three.
type SlotID string

// SlotUnknown is the zero slot. It is the reported source of a missing value.
const SlotUnknown SlotID = ""

// Candidate is one ordered source of a signal with the freshness budget that
// applies to values arriving through it.
type Candidate struct {
	Slot SlotID
	TTL  time.Duration
}

// Rule is the authority of one signal: an ordered candidate list where index
// zero is preferred. Equivalent declares whether the non-preferred candidates
// carry the same semantics and may therefore be used as a fallback.
type Rule struct {
	Signal     catalog.SignalID
	Sources    []Candidate
	Equivalent bool
}

// Preferred returns the first candidate. The zero candidate is returned for a
// rule without sources, which NewMatrix rejects.
func (rule Rule) Preferred() Candidate {
	if len(rule.Sources) == 0 {
		return Candidate{}
	}
	return rule.Sources[0]
}

// Alternatives returns the ordered non-preferred candidates.
func (rule Rule) Alternatives() []Candidate {
	if len(rule.Sources) <= 1 {
		return nil
	}
	return rule.Sources[1:]
}

// TTL returns the freshness budget declared for one slot.
func (rule Rule) TTL(slot SlotID) time.Duration {
	for _, candidate := range rule.Sources {
		if candidate.Slot == slot {
			return candidate.TTL
		}
	}
	return 0
}

// Matrix is an immutable authority table indexed by signal.
type Matrix struct {
	rules []Rule
	index map[catalog.SignalID]int
}

// NewMatrix validates and indexes an ordered rule list. The declaration order
// is preserved because it is the canonical order of emitted decisions.
func NewMatrix(rules []Rule) (*Matrix, error) {
	index := make(map[catalog.SignalID]int, len(rules))
	stored := make([]Rule, 0, len(rules))
	for position, rule := range rules {
		if len(rule.Sources) == 0 {
			return nil, fmt.Errorf("%w: signal %d", ErrEmptyRule, rule.Signal)
		}
		if _, exists := index[rule.Signal]; exists {
			return nil, fmt.Errorf("%w: signal %d", ErrDuplicateRule, rule.Signal)
		}
		index[rule.Signal] = position
		sources := make([]Candidate, len(rule.Sources))
		copy(sources, rule.Sources)
		rule.Sources = sources
		stored = append(stored, rule)
	}
	return &Matrix{rules: stored, index: index}, nil
}

// MustMatrix is the package-level initialiser for a matrix literal owned by a
// driver. It panics only at process start on a malformed literal, never on
// runtime data, and no lookup below can panic afterwards.
func MustMatrix(rules []Rule) *Matrix {
	matrix, err := NewMatrix(rules)
	if err != nil {
		panic(err)
	}
	return matrix
}

// Len reports the number of covered signals.
func (matrix *Matrix) Len() int {
	if matrix == nil {
		return 0
	}
	return len(matrix.rules)
}

// Rules returns a defensive copy in declaration order.
func (matrix *Matrix) Rules() []Rule {
	if matrix == nil {
		return nil
	}
	result := make([]Rule, len(matrix.rules))
	for position, rule := range matrix.rules {
		sources := make([]Candidate, len(rule.Sources))
		copy(sources, rule.Sources)
		rule.Sources = sources
		result[position] = rule
	}
	return result
}

// Lookup resolves one signal in constant time. It returns ErrRuleMissing for
// an uncovered signal.
func (matrix *Matrix) Lookup(signal catalog.SignalID) (Rule, error) {
	if matrix == nil {
		return Rule{Signal: signal}, fmt.Errorf("%w: signal %d", ErrRuleMissing, signal)
	}
	position, ok := matrix.index[signal]
	if !ok {
		return Rule{Signal: signal}, fmt.Errorf("%w: signal %d", ErrRuleMissing, signal)
	}
	rule := matrix.rules[position]
	sources := make([]Candidate, len(rule.Sources))
	copy(sources, rule.Sources)
	rule.Sources = sources
	return rule, nil
}

// Slots identifies every distinct slot declared by the matrix, in first
// declaration order.
func (matrix *Matrix) Slots() []SlotID {
	if matrix == nil {
		return nil
	}
	seen := make(map[SlotID]struct{}, 4)
	result := make([]SlotID, 0, 4)
	for _, rule := range matrix.rules {
		for _, candidate := range rule.Sources {
			if candidate.Slot == SlotUnknown {
				continue
			}
			if _, exists := seen[candidate.Slot]; exists {
				continue
			}
			seen[candidate.Slot] = struct{}{}
			result = append(result, candidate.Slot)
		}
	}
	return result
}

// Stamp is a monotonic arrival mark. UTC never governs a TTL decision.
type Stamp struct {
	Elapsed time.Duration
	Set     bool
}

// Decision records which slot answered one signal.
type Decision struct {
	Signal    catalog.SignalID
	Slot      SlotID
	Freshness schema.Freshness
	Fallback  bool
}

// Conflict records that two usable slots disagreed on one signal.
type Conflict struct {
	Signal      catalog.SignalID
	Preferred   SlotID
	Alternative SlotID
}

// Ledger accumulates the decisions and the bounded conflict diagnostics of one
// merge. It is single-writer state owned by one merge call.
type Ledger struct {
	decisions    []Decision
	conflicts    []Conflict
	maxConflicts int
}

// NewLedger preallocates a ledger for a matrix of the given size.
func NewLedger(signals, maxConflicts int) *Ledger {
	if maxConflicts < 0 {
		maxConflicts = 0
	}
	return &Ledger{
		decisions:    make([]Decision, 0, signals),
		conflicts:    make([]Conflict, 0, maxConflicts),
		maxConflicts: maxConflicts,
	}
}

// Decide appends one decision.
func (ledger *Ledger) Decide(signal catalog.SignalID, slot SlotID, freshness schema.Freshness, fallback bool) {
	if ledger == nil {
		return
	}
	ledger.decisions = append(ledger.decisions, Decision{Signal: signal, Slot: slot, Freshness: freshness, Fallback: fallback})
}

// Conflict appends one bounded conflict diagnostic.
func (ledger *Ledger) Conflict(signal catalog.SignalID, preferred, alternative SlotID) {
	if ledger == nil || len(ledger.conflicts) >= ledger.maxConflicts {
		return
	}
	ledger.conflicts = append(ledger.conflicts, Conflict{Signal: signal, Preferred: preferred, Alternative: alternative})
}

// Decisions returns the recorded decisions in append order.
func (ledger *Ledger) Decisions() []Decision {
	if ledger == nil {
		return nil
	}
	return ledger.decisions
}

// Conflicts returns the recorded conflicts in append order.
func (ledger *Ledger) Conflicts() []Conflict {
	if ledger == nil {
		return nil
	}
	return ledger.conflicts
}

// Input is one slot's candidate value for a signal, with its arrival mark.
type Input[T comparable] struct {
	Slot  SlotID
	Field schema.Field[T]
	At    Stamp
}

// Choose resolves one signal from N slot inputs using value equality to detect
// conflicts. Inputs are matched to the rule by slot, so their order is
// irrelevant; the rule's candidate order decides authority.
func Choose[T comparable](elapsed time.Duration, rule Rule, ledger *Ledger, inputs ...Input[T]) schema.Field[T] {
	return ChooseFunc(elapsed, rule, ledger, Differ[T], inputs...)
}

// ChooseFunc is Choose with a caller-supplied disagreement predicate, used by
// signals such as a session clock whose two sources are only equivalent after
// projecting them onto the same instant.
func ChooseFunc[T comparable](
	elapsed time.Duration,
	rule Rule,
	ledger *Ledger,
	differ func(left, right Input[T]) bool,
	inputs ...Input[T],
) schema.Field[T] {
	aged := make([]Input[T], 0, len(rule.Sources))
	for _, candidate := range rule.Sources {
		input := Input[T]{Slot: candidate.Slot, Field: schema.MissingField[T]()}
		for _, supplied := range inputs {
			if supplied.Slot == candidate.Slot {
				input = supplied
				break
			}
		}
		input.Slot = candidate.Slot
		input.Field = FieldAt(elapsed, input.At, candidate.TTL, input.Field)
		aged = append(aged, input)
	}
	if len(aged) == 0 {
		ledger.Decide(rule.Signal, SlotUnknown, schema.FreshnessMissing, false)
		return schema.MissingField[T]()
	}
	if differ != nil {
		preferred := aged[0]
		for _, alternative := range aged[1:] {
			if validUsable(preferred.Field) && validUsable(alternative.Field) && differ(preferred, alternative) {
				ledger.Conflict(rule.Signal, preferred.Slot, alternative.Slot)
			}
		}
	}
	limit := len(aged)
	if !rule.Equivalent {
		limit = 1
	}
	for _, accept := range []func(schema.Field[T]) bool{usable[T], validStale[T], hasValue[T]} {
		for position := 0; position < limit; position++ {
			if !accept(aged[position].Field) {
				continue
			}
			ledger.Decide(rule.Signal, aged[position].Slot, aged[position].Field.Freshness(), position != 0)
			return aged[position].Field
		}
	}
	ledger.Decide(rule.Signal, SlotUnknown, schema.FreshnessMissing, false)
	return schema.MissingField[T]()
}

// Differ is the default disagreement predicate: value equality.
func Differ[T comparable](left, right Input[T]) bool {
	leftValue, leftPresent := left.Field.Value()
	rightValue, rightPresent := right.Field.Value()
	return leftPresent != rightPresent || (leftPresent && leftValue != rightValue)
}

// FieldAt downgrades a fresh field to stale once its arrival mark is older
// than the TTL, or when the clock moved backwards.
func FieldAt[T comparable](elapsed time.Duration, updated Stamp, ttl time.Duration, field schema.Field[T]) schema.Field[T] {
	if !updated.Set || !hasValue(field) || field.Freshness() != schema.FreshnessFresh {
		return field
	}
	if elapsed < updated.Elapsed || elapsed-updated.Elapsed > ttl {
		return WithFreshness(field, schema.FreshnessStale)
	}
	return field
}

// WithFreshness returns the field with a replaced freshness. A missing or
// structurally invalid field is returned unchanged.
func WithFreshness[T comparable](field schema.Field[T], freshness schema.Freshness) schema.Field[T] {
	value, present := field.Value()
	if !present || field.Freshness() == schema.FreshnessInvalid {
		return field
	}
	replaced, err := schema.NewField(value, field.Provenance(), freshness)
	if err != nil {
		return field
	}
	return replaced
}

func usable[T comparable](field schema.Field[T]) bool {
	_, present := field.Value()
	return present && field.Freshness() == schema.FreshnessFresh
}

func validStale[T comparable](field schema.Field[T]) bool {
	_, present := field.Value()
	return present && field.Freshness() == schema.FreshnessStale
}

func validUsable[T comparable](field schema.Field[T]) bool { return usable(field) || validStale(field) }

func hasValue[T comparable](field schema.Field[T]) bool {
	_, present := field.Value()
	return present
}

// Present reports a field carrying a value regardless of freshness.
func Present[T comparable](field schema.Field[T]) bool { return hasValue(field) }
