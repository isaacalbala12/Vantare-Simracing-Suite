// Package solver chooses the stint split that finishes a race soonest.
//
// It is pure and deterministic: no telemetry, persistence, UI or randomness. It
// replaces the historical Product A generator, which emitted a handful of fixed
// shapes, left tyre degradation out of the total time entirely, and added fuel
// litres to virtual-energy percent as if they were one quantity.
//
// The model it optimises is stated explicitly so a result can be argued with:
//
//   - Lap time grows linearly with tyre age inside a stint, so a stint of L laps
//     on fresh tyres costs L*base + degradation*L*(L-1)/2. Degradation is
//     therefore part of the total, and trading a pit stop against a longer,
//     slower stint is a real decision rather than a fixed preset.
//   - Every stop fits fresh tyres and refills to usable capacity, so each stint
//     starts from the same state and its cost depends only on its length.
//   - Fuel and virtual energy are separate consumables in different units. They
//     are never added; each independently caps how many laps a stint may run and
//     the tighter one binds.
//
// Within that model the answer is exact, not a heuristic: the per-stint cost is
// convex in stint length, so for a given number of stops the most even split is
// optimal, and the number of stops is then searched exhaustively.
package solver

import (
	"errors"
	"fmt"
	"math"
)

type ErrorCode string

const (
	ErrorInvalidInput ErrorCode = "invalid_input"
	ErrorOverflow     ErrorCode = "overflow"
	ErrorInfeasible   ErrorCode = "infeasible"
)

type SolveError struct {
	Code    ErrorCode
	Field   string
	Message string
}

func (err *SolveError) Error() string {
	if err.Field == "" {
		return fmt.Sprintf("%s: %s", err.Code, err.Message)
	}
	return fmt.Sprintf("%s (%s): %s", err.Code, err.Field, err.Message)
}

func solveError(code ErrorCode, field, message string) error {
	return &SolveError{Code: code, Field: field, Message: message}
}

// HasErrorCode reports whether err carries the given code.
func HasErrorCode(err error, code ErrorCode) bool {
	var solveErr *SolveError
	return errors.As(err, &solveErr) && solveErr.Code == code
}

// ResourceKind names a consumable. The kind travels with every limit so a
// result can say which constraint bound a stint rather than reporting a bare
// number whose unit has been forgotten.
type ResourceKind string

const (
	ResourceFuel          ResourceKind = "fuel"
	ResourceVirtualEnergy ResourceKind = "virtual_energy"
	ResourceTyreLife      ResourceKind = "tyre_life"
	ResourceNone          ResourceKind = "none"
)

// Resource is one independently tracked consumable: fuel in litres, virtual
// energy in percent. There is deliberately no way to add two of these together;
// the only comparison the solver makes between them is how many laps each
// allows, which is a lap count in both cases.
type Resource struct {
	Kind ResourceKind `json:"kind"`
	// Used is false when the car does not consume this resource at all.
	Used bool `json:"used"`
	// UsableCapacity is what a full service provides, in this resource's unit.
	UsableCapacity float64 `json:"usableCapacity"`
	// PerLap is the consumption per racing lap, in this resource's unit.
	PerLap float64 `json:"perLap"`
}

// LapsPerStint is how many whole laps one full service supports, and whether
// this resource constrains anything at all.
func (resource Resource) LapsPerStint() (int64, bool) {
	if !resource.Used || resource.PerLap <= 0 {
		return 0, false
	}
	laps := math.Floor(resource.UsableCapacity / resource.PerLap)
	if laps < 0 || laps > maxSupportedLaps {
		return 0, false
	}
	return int64(laps), true
}

func (resource Resource) validate(field string) error {
	if !resource.Used {
		return nil
	}
	for name, value := range map[string]float64{
		field + ".usableCapacity": resource.UsableCapacity,
		field + ".perLap":         resource.PerLap,
	} {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			return solveError(ErrorInvalidInput, name, "must be finite and non-negative")
		}
	}
	if resource.PerLap == 0 {
		return solveError(ErrorInvalidInput, field+".perLap", "a used resource must be consumed")
	}
	return nil
}

const (
	maxSupportedLaps = 100_000
	// auditWindow is how many stop counts either side of the optimum are
	// reported. The search itself is exhaustive; this only bounds the report.
	auditWindow = 2
)

type Input struct {
	RaceLaps int64 `json:"raceLaps"`
	// BaseLapSeconds is the lap time on fresh tyres in clean air.
	BaseLapSeconds float64 `json:"baseLapSeconds"`
	// DegradationPerLapSeconds is how much slower each successive lap of a
	// stint is. Zero models a car whose pace does not fall away.
	DegradationPerLapSeconds float64 `json:"degradationPerLapSeconds"`
	// PitLossSeconds is the time cost of one stop versus staying out.
	PitLossSeconds float64  `json:"pitLossSeconds"`
	Fuel           Resource `json:"fuel"`
	VirtualEnergy  Resource `json:"virtualEnergy"`
	// TyreLifeLaps caps a stint on tyre wear alone. Zero means uncapped.
	TyreLifeLaps int64 `json:"tyreLifeLaps"`
}

// StintPlan is one stint with its cost broken out, so the total can be argued
// with rather than taken on trust.
type StintPlan struct {
	Laps               int64   `json:"laps"`
	GreenSeconds       float64 `json:"greenSeconds"`
	DegradationSeconds float64 `json:"degradationSeconds"`
	TotalSeconds       float64 `json:"totalSeconds"`
}

// Limit records one cap on stint length and where it came from.
type Limit struct {
	Kind ResourceKind `json:"kind"`
	Laps int64        `json:"laps"`
}

type Reason struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Candidate is one complete plan at a given number of stops. Infeasible
// candidates are kept and explained rather than silently dropped.
type Candidate struct {
	Stops              int64       `json:"stops"`
	Stints             []StintPlan `json:"stints"`
	GreenSeconds       float64     `json:"greenSeconds"`
	DegradationSeconds float64     `json:"degradationSeconds"`
	PitSeconds         float64     `json:"pitSeconds"`
	TotalSeconds       float64     `json:"totalSeconds"`
	Feasible           bool        `json:"feasible"`
	Reasons            []Reason    `json:"reasons"`
}

type Result struct {
	// Best is the plan with the lowest total time. The search over stop counts
	// is exhaustive, so this is the optimum of the stated model, not a pick from
	// a shortlist.
	Best Candidate `json:"best"`
	// Candidates is a window around the optimum, for comparison.
	Candidates []Candidate `json:"candidates"`
	// MaxStintLaps is the binding cap, and Binding says which limit produced it.
	MaxStintLaps int64        `json:"maxStintLaps"`
	Binding      ResourceKind `json:"binding"`
	// Limits lists every active cap, so a tie or a near-miss is visible.
	Limits      []Limit  `json:"limits"`
	Assumptions []Reason `json:"assumptions"`
}

// Solve returns the fastest plan for the stated model.
func Solve(input Input) (Result, error) {
	if err := input.validate(); err != nil {
		return Result{}, err
	}

	limits := input.limits()
	maxStintLaps, binding := bindingLimit(limits)
	if len(limits) == 0 {
		// Nothing caps a stint, so the whole race can run without stopping.
		maxStintLaps = input.RaceLaps
		binding = ResourceNone
	} else if maxStintLaps < 1 {
		// A limit that does not cover a single lap is not an absent limit: the
		// car cannot complete one lap of this race on that resource.
		return Result{}, solveError(ErrorInfeasible, string(binding),
			fmt.Sprintf("%s does not cover a single lap", binding))
	}

	minStints := ceilDiv(input.RaceLaps, maxStintLaps)
	if minStints < 1 {
		minStints = 1
	}
	if minStints > input.RaceLaps {
		return Result{}, solveError(ErrorInfeasible, "raceLaps",
			"no stint length satisfies the resource limits for this race")
	}

	// The search costs nothing per stint count, so it can be exhaustive: only
	// the plans actually reported are built out into stints.
	bestStints := int64(0)
	bestTotal := math.Inf(1)
	for stints := minStints; stints <= input.RaceLaps; stints++ {
		total, feasible := totalForStints(input, stints, maxStintLaps)
		// Strict improvement only, so ties go to the plan with fewer stops:
		// less exposure to pit lane for the same predicted time.
		if feasible && total < bestTotal {
			bestTotal = total
			bestStints = stints
		}
	}
	if bestStints == 0 {
		return Result{}, solveError(ErrorInfeasible, "raceLaps", "no feasible plan exists for these limits")
	}

	best, err := buildCandidate(input, bestStints, maxStintLaps, binding)
	if err != nil {
		return Result{}, err
	}
	candidates, err := auditAround(input, bestStints, minStints, maxStintLaps, binding)
	if err != nil {
		return Result{}, err
	}

	return Result{
		Best:         best,
		Candidates:   candidates,
		MaxStintLaps: maxStintLaps,
		Binding:      binding,
		Limits:       limits,
		Assumptions:  input.assumptions(maxStintLaps, binding),
	}, nil
}

// totalForStints costs a layout in constant time and without allocating, which
// is what lets the stop-count search cover every possibility.
func totalForStints(input Input, stints, maxStintLaps int64) (float64, bool) {
	if stints > input.RaceLaps {
		return 0, false
	}
	base := input.RaceLaps / stints
	remainder := input.RaceLaps % stints
	longest := base
	if remainder > 0 {
		longest = base + 1
	}
	if longest > maxStintLaps {
		return 0, false
	}
	// Every layout runs the same laps, so green time is fixed; only the shape of
	// the tyre-age sum and the number of stops vary.
	green := float64(input.RaceLaps) * input.BaseLapSeconds
	ageSum := float64(remainder)*ageSumFor(base+1) + float64(stints-remainder)*ageSumFor(base)
	total := green + ageSum*input.DegradationPerLapSeconds + float64(stints-1)*input.PitLossSeconds
	if math.IsInf(total, 0) || math.IsNaN(total) {
		return 0, false
	}
	return total, true
}

// ageSumFor is the total tyre age accumulated over a stint of L laps: the first
// lap runs on age 0 and the last on age L-1.
func ageSumFor(laps int64) float64 {
	return float64(laps) * float64(laps-1) / 2
}

func (input Input) validate() error {
	if input.RaceLaps <= 0 || input.RaceLaps > maxSupportedLaps {
		return solveError(ErrorInvalidInput, "raceLaps", "race length must be between 1 and 100000 laps")
	}
	for field, value := range map[string]float64{
		"baseLapSeconds":           input.BaseLapSeconds,
		"degradationPerLapSeconds": input.DegradationPerLapSeconds,
		"pitLossSeconds":           input.PitLossSeconds,
	} {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			return solveError(ErrorInvalidInput, field, "must be finite and non-negative")
		}
	}
	if input.BaseLapSeconds == 0 {
		return solveError(ErrorInvalidInput, "baseLapSeconds", "lap time must be positive")
	}
	if input.TyreLifeLaps < 0 || input.TyreLifeLaps > maxSupportedLaps {
		return solveError(ErrorInvalidInput, "tyreLifeLaps", "tyre life must be between 0 and 100000 laps")
	}
	if err := input.Fuel.validate("fuel"); err != nil {
		return err
	}
	return input.VirtualEnergy.validate("virtualEnergy")
}

// limits collects each cap separately. Fuel and virtual energy are compared as
// lap counts and never combined in their own units.
func (input Input) limits() []Limit {
	limits := make([]Limit, 0, 3)
	if laps, active := input.Fuel.LapsPerStint(); active {
		limits = append(limits, Limit{Kind: ResourceFuel, Laps: laps})
	}
	if laps, active := input.VirtualEnergy.LapsPerStint(); active {
		limits = append(limits, Limit{Kind: ResourceVirtualEnergy, Laps: laps})
	}
	if input.TyreLifeLaps > 0 {
		limits = append(limits, Limit{Kind: ResourceTyreLife, Laps: input.TyreLifeLaps})
	}
	return limits
}

// bindingLimit is the tightest cap. Ties resolve in declaration order so the
// reported binding constraint is stable.
func bindingLimit(limits []Limit) (int64, ResourceKind) {
	if len(limits) == 0 {
		return 0, ResourceNone
	}
	best := limits[0]
	for _, limit := range limits[1:] {
		if limit.Laps < best.Laps {
			best = limit
		}
	}
	return best.Laps, best.Kind
}

// buildCandidate lays the race out over the given number of stints. The split is
// as even as whole laps allow, which is optimal because the per-stint cost is
// convex in stint length.
func buildCandidate(input Input, stints, maxStintLaps int64, binding ResourceKind) (Candidate, error) {
	stops := stints - 1
	candidate := Candidate{Stops: stops, Reasons: make([]Reason, 0, 2)}

	if stints > input.RaceLaps {
		candidate.Reasons = append(candidate.Reasons, Reason{
			Code:    "more_stints_than_laps",
			Message: "a stint cannot be shorter than one lap",
		})
		return candidate, nil
	}

	base := input.RaceLaps / stints
	remainder := input.RaceLaps % stints
	longest := base
	if remainder > 0 {
		longest = base + 1
	}
	if longest > maxStintLaps {
		candidate.Reasons = append(candidate.Reasons, Reason{
			Code: "stint_exceeds_limit",
			Message: fmt.Sprintf("the shortest possible stint of %d laps exceeds the %d-lap %s limit",
				longest, maxStintLaps, binding),
		})
		return candidate, nil
	}

	candidate.Stints = make([]StintPlan, 0, stints)
	// Longer stints first, so an identical input always yields an identical plan.
	for index := int64(0); index < stints; index++ {
		laps := base
		if index < remainder {
			laps = base + 1
		}
		stint, err := planStint(laps, input.BaseLapSeconds, input.DegradationPerLapSeconds)
		if err != nil {
			return Candidate{}, err
		}
		candidate.Stints = append(candidate.Stints, stint)
		candidate.GreenSeconds += stint.GreenSeconds
		candidate.DegradationSeconds += stint.DegradationSeconds
	}

	candidate.PitSeconds = float64(stops) * input.PitLossSeconds
	candidate.TotalSeconds = candidate.GreenSeconds + candidate.DegradationSeconds + candidate.PitSeconds
	if math.IsInf(candidate.TotalSeconds, 0) || math.IsNaN(candidate.TotalSeconds) {
		return Candidate{}, solveError(ErrorOverflow, "totalSeconds", "total race time overflowed")
	}
	candidate.Feasible = true
	candidate.Reasons = append(candidate.Reasons, Reason{
		Code: "even_split",
		Message: fmt.Sprintf("%d laps over %d stints, split as evenly as whole laps allow",
			input.RaceLaps, stints),
	})
	if binding != ResourceNone && longest == maxStintLaps {
		candidate.Reasons = append(candidate.Reasons, Reason{
			Code:    "at_" + string(binding) + "_limit",
			Message: fmt.Sprintf("the longest stint sits exactly on the %s limit", binding),
		})
	}
	return candidate, nil
}

// planStint costs one stint. Degradation is charged on tyre age within the
// stint, so the first lap is free of it and the last pays the most.
func planStint(laps int64, baseLapSeconds, degradationPerLap float64) (StintPlan, error) {
	green := float64(laps) * baseLapSeconds
	// Sum of 0..laps-1 ages, as a float to keep the product away from int64 limits.
	ageSum := float64(laps) * float64(laps-1) / 2
	degradation := ageSum * degradationPerLap
	total := green + degradation
	if math.IsInf(total, 0) || math.IsNaN(total) {
		return StintPlan{}, solveError(ErrorOverflow, "stint", "stint time overflowed")
	}
	return StintPlan{
		Laps:               laps,
		GreenSeconds:       green,
		DegradationSeconds: degradation,
		TotalSeconds:       total,
	}, nil
}

// auditAround builds the plans either side of the optimum so the choice can be
// compared, including any that turned out not to be runnable.
func auditAround(input Input, bestStints, minStints, maxStintLaps int64, binding ResourceKind) ([]Candidate, error) {
	from := bestStints - auditWindow
	if from < minStints {
		from = minStints
	}
	if from < 1 {
		from = 1
	}
	to := bestStints + auditWindow
	if to > input.RaceLaps {
		to = input.RaceLaps
	}
	window := make([]Candidate, 0, to-from+1)
	for stints := from; stints <= to; stints++ {
		candidate, err := buildCandidate(input, stints, maxStintLaps, binding)
		if err != nil {
			return nil, err
		}
		window = append(window, candidate)
	}
	return window, nil
}

func (input Input) assumptions(maxStintLaps int64, binding ResourceKind) []Reason {
	assumptions := []Reason{
		{Code: "fresh_tyres_each_stop", Message: "every stop fits fresh tyres and refills to usable capacity"},
		{Code: "linear_degradation", Message: fmt.Sprintf(
			"each successive lap of a stint costs %.3fs more than the last", input.DegradationPerLapSeconds)},
		{Code: "separate_resources", Message: "fuel and virtual energy are capped independently and never added together"},
	}
	if binding == ResourceNone {
		assumptions = append(assumptions, Reason{
			Code:    "unlimited_stint",
			Message: "no resource limits a stint, so a no-stop race is possible",
		})
		return assumptions
	}
	assumptions = append(assumptions, Reason{
		Code:    "binding_limit",
		Message: fmt.Sprintf("%s allows the shortest stint at %d laps", binding, maxStintLaps),
	})
	return assumptions
}

func ceilDiv(numerator, denominator int64) int64 {
	if denominator <= 0 {
		return 0
	}
	if numerator%denominator == 0 {
		return numerator / denominator
	}
	return numerator/denominator + 1
}
