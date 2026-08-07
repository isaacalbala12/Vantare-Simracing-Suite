package solver

import (
	"fmt"
	"math"
)

// VariantKind names what a plan optimises for. The three are not a ranking:
// they answer different questions, and which one to run is the driver's call.
type VariantKind string

const (
	// VariantFast is the quickest plan if every estimate turns out right.
	VariantFast VariantKind = "fast"
	// VariantRobust is the quickest plan that still finishes if consumption is
	// worse than estimated.
	VariantRobust VariantKind = "robust"
	// VariantConservative buys a further stop of insurance at a stated cost.
	VariantConservative VariantKind = "conservative"
)

// RiskLevel describes how little room a plan leaves before it strands the car.
type RiskLevel string

const (
	RiskLow    RiskLevel = "low"
	RiskMedium RiskLevel = "medium"
	RiskHigh   RiskLevel = "high"
)

// Range is a total time under the sensitivity envelope. It is reported instead
// of a single figure because the inputs are estimates, and a lone number would
// claim a precision nobody has.
type Range struct {
	OptimisticSeconds  float64 `json:"optimisticSeconds"`
	ExpectedSeconds    float64 `json:"expectedSeconds"`
	PessimisticSeconds float64 `json:"pessimisticSeconds"`
}

// SpreadSeconds is how wide the estimate is. A wide spread is a warning that
// the inputs matter more than the choice between plans.
func (value Range) SpreadSeconds() float64 {
	return value.PessimisticSeconds - value.OptimisticSeconds
}

// Sensitivity is how wrong the estimates are allowed to be. Both are fractions:
// 0.1 means "degradation could be a tenth worse or better than stated".
type Sensitivity struct {
	DegradationFactor float64 `json:"degradationFactor"`
	ConsumptionFactor float64 `json:"consumptionFactor"`
}

// DefaultSensitivity is deliberately modest. It is an assumption, and it is
// reported as one rather than hidden inside the arithmetic.
func DefaultSensitivity() Sensitivity {
	return Sensitivity{DegradationFactor: 0.20, ConsumptionFactor: 0.05}
}

func (value Sensitivity) validate() error {
	for field, factor := range map[string]float64{
		"sensitivity.degradationFactor": value.DegradationFactor,
		"sensitivity.consumptionFactor": value.ConsumptionFactor,
	} {
		if math.IsNaN(factor) || math.IsInf(factor, 0) || factor < 0 || factor >= 1 {
			return solveError(ErrorInvalidInput, field, "must be a fraction between 0 and 1")
		}
	}
	return nil
}

// Variant is one plan with everything needed to choose between it and another:
// what it costs, how wrong that cost could be, and what it risks.
type Variant struct {
	Kind      VariantKind `json:"kind"`
	Candidate Candidate   `json:"candidate"`
	Total     Range       `json:"total"`
	// DeltaToFastestSeconds is what this plan gives up against the quickest.
	DeltaToFastestSeconds float64 `json:"deltaToFastestSeconds"`
	// MarginLaps is how many laps of the binding resource the longest stint
	// leaves unused. Zero means the plan sits exactly on the limit.
	MarginLaps int64 `json:"marginLaps"`
	// SurvivesPessimistic reports whether the plan still fits if consumption
	// turns out worse than estimated.
	SurvivesPessimistic bool      `json:"survivesPessimistic"`
	Risk                RiskLevel `json:"risk"`
	// Dominated marks a plan that another beats on both time and margin, so
	// there is no reason to pick it.
	Dominated   bool        `json:"dominated"`
	DominatedBy VariantKind `json:"dominatedBy,omitempty"`
	Reasons     []Reason    `json:"reasons"`
}

type Comparison struct {
	// Variants are ordered fastest first, with ties broken deterministically.
	Variants     []Variant    `json:"variants"`
	Sensitivity  Sensitivity  `json:"sensitivity"`
	MaxStintLaps int64        `json:"maxStintLaps"`
	Binding      ResourceKind `json:"binding"`
	Limits       []Limit      `json:"limits"`
	Assumptions  []Reason     `json:"assumptions"`
}

// Compare builds the fast, robust and conservative plans for one race and
// reports how they differ, how wrong each total might be, and which of them
// another plan already beats outright.
func Compare(input Input, sensitivity Sensitivity) (Comparison, error) {
	if err := sensitivity.validate(); err != nil {
		return Comparison{}, err
	}
	nominal, err := Solve(input)
	if err != nil {
		return Comparison{}, err
	}

	pessimistic := input.withConsumption(1 + sensitivity.ConsumptionFactor)
	pessimisticMax, _ := bindingLimit(pessimistic.limits())
	if len(pessimistic.limits()) == 0 {
		pessimisticMax = input.RaceLaps
	}

	fastStints := int64(len(nominal.Best.Stints))
	robustStints := fastStints
	robustReason := Reason{
		Code:    "already_robust",
		Message: "the quickest plan already survives the pessimistic case, so there is nothing to buy",
	}
	if pessimisticSurvives, err := Solve(pessimistic); err == nil {
		if stints := int64(len(pessimisticSurvives.Best.Stints)); stints > robustStints {
			robustStints = stints
			robustReason = Reason{
				Code: "extra_stop_for_consumption",
				Message: fmt.Sprintf("one more stint keeps the plan alive if consumption runs %.0f%% over",
					sensitivity.ConsumptionFactor*100),
			}
		}
	} else if HasErrorCode(err, ErrorInfeasible) {
		robustReason = Reason{
			Code:    "no_robust_plan",
			Message: "no plan survives the pessimistic case; the quickest one is shown as-is",
		}
	}

	plans := []struct {
		kind   VariantKind
		stints int64
		reason Reason
	}{
		{VariantFast, fastStints, Reason{
			Code:    "time_optimal",
			Message: "the quickest plan if every estimate holds",
		}},
		{VariantRobust, robustStints, robustReason},
		{VariantConservative, robustStints + 1, Reason{
			Code:    "extra_stop_insurance",
			Message: "a further stop, so a slow stint or a late problem does not end the race",
		}},
	}

	variants := make([]Variant, 0, len(plans))
	seen := make(map[int64]VariantKind, len(plans))
	for _, plan := range plans {
		if plan.stints > input.RaceLaps {
			continue
		}
		candidate, err := buildCandidate(input, plan.stints, nominal.MaxStintLaps, nominal.Binding)
		if err != nil {
			return Comparison{}, err
		}
		if !candidate.Feasible {
			continue
		}
		variant := Variant{
			Kind:       plan.kind,
			Candidate:  candidate,
			Total:      totalRange(input, plan.stints, sensitivity),
			MarginLaps: nominal.MaxStintLaps - longestStint(candidate),
			Reasons:    append([]Reason{plan.reason}, candidate.Reasons...),
		}
		variant.SurvivesPessimistic = longestStint(candidate) <= pessimisticMax
		variant.Risk = riskFor(variant.MarginLaps, variant.SurvivesPessimistic)
		if previous, duplicate := seen[plan.stints]; duplicate {
			variant.Reasons = append(variant.Reasons, Reason{
				Code:    "same_as_" + string(previous),
				Message: fmt.Sprintf("this is the same plan as the %s one", previous),
			})
		}
		seen[plan.stints] = plan.kind
		variants = append(variants, variant)
	}
	if len(variants) == 0 {
		return Comparison{}, solveError(ErrorInfeasible, "raceLaps", "no variant is feasible for these limits")
	}

	fastest := variants[0].Candidate.TotalSeconds
	for _, variant := range variants {
		if variant.Candidate.TotalSeconds < fastest {
			fastest = variant.Candidate.TotalSeconds
		}
	}
	for index := range variants {
		variants[index].DeltaToFastestSeconds = variants[index].Candidate.TotalSeconds - fastest
	}
	markDominated(variants)
	sortVariants(variants)

	assumptions := append(nominal.Assumptions,
		Reason{Code: "sensitivity_envelope", Message: fmt.Sprintf(
			"totals are shown as a range for degradation %.0f%% either way and consumption %.0f%% over",
			sensitivity.DegradationFactor*100, sensitivity.ConsumptionFactor*100)},
		Reason{Code: "variants_are_not_a_ranking", Message: "fast, robust and conservative answer different questions"},
	)

	return Comparison{
		Variants:     variants,
		Sensitivity:  sensitivity,
		MaxStintLaps: nominal.MaxStintLaps,
		Binding:      nominal.Binding,
		Limits:       nominal.Limits,
		Assumptions:  assumptions,
	}, nil
}

// withConsumption returns the same race with every consumable scaled, which is
// how the pessimistic case is modelled without touching the nominal input.
func (input Input) withConsumption(factor float64) Input {
	scaled := input
	if scaled.Fuel.Used {
		scaled.Fuel.PerLap = input.Fuel.PerLap * factor
	}
	if scaled.VirtualEnergy.Used {
		scaled.VirtualEnergy.PerLap = input.VirtualEnergy.PerLap * factor
	}
	if scaled.TyreLifeLaps > 0 && factor > 0 {
		reduced := int64(math.Floor(float64(input.TyreLifeLaps) / factor))
		if reduced < 1 {
			reduced = 1
		}
		scaled.TyreLifeLaps = reduced
	}
	return scaled
}

// totalRange costs one layout under a better and a worse world. Only the
// degradation moves: consumption changes what is feasible, not what it costs.
func totalRange(input Input, stints int64, sensitivity Sensitivity) Range {
	cost := func(degradation float64) float64 {
		scaled := input
		scaled.DegradationPerLapSeconds = degradation
		total, feasible := totalForStints(scaled, stints, input.RaceLaps)
		if !feasible {
			return math.NaN()
		}
		return total
	}
	return Range{
		OptimisticSeconds:  cost(input.DegradationPerLapSeconds * (1 - sensitivity.DegradationFactor)),
		ExpectedSeconds:    cost(input.DegradationPerLapSeconds),
		PessimisticSeconds: cost(input.DegradationPerLapSeconds * (1 + sensitivity.DegradationFactor)),
	}
}

func longestStint(candidate Candidate) int64 {
	var longest int64
	for _, stint := range candidate.Stints {
		if stint.Laps > longest {
			longest = stint.Laps
		}
	}
	return longest
}

func riskFor(marginLaps int64, survivesPessimistic bool) RiskLevel {
	switch {
	case !survivesPessimistic || marginLaps <= 0:
		return RiskHigh
	case marginLaps == 1:
		return RiskMedium
	default:
		return RiskLow
	}
}

// markDominated flags a plan that another beats on both time and margin. A plan
// that is slower but safer is not dominated: it is a different trade.
func markDominated(variants []Variant) {
	for index := range variants {
		for other := range variants {
			if index == other {
				continue
			}
			left, right := variants[index], variants[other]
			betterOrEqual := right.Candidate.TotalSeconds <= left.Candidate.TotalSeconds &&
				right.MarginLaps >= left.MarginLaps
			strictlyBetter := right.Candidate.TotalSeconds < left.Candidate.TotalSeconds ||
				right.MarginLaps > left.MarginLaps
			if betterOrEqual && strictlyBetter {
				variants[index].Dominated = true
				variants[index].DominatedBy = right.Kind
				variants[index].Reasons = append(variants[index].Reasons, Reason{
					Code: "dominated",
					Message: fmt.Sprintf("the %s plan is at least as quick and leaves at least as much margin",
						right.Kind),
				})
				break
			}
		}
	}
}

// sortVariants orders by time, then by margin, then by a fixed kind order, so
// the same comparison always presents in the same sequence.
func sortVariants(variants []Variant) {
	order := map[VariantKind]int{VariantFast: 0, VariantRobust: 1, VariantConservative: 2}
	for index := 1; index < len(variants); index++ {
		for back := index; back > 0; back-- {
			left, right := variants[back-1], variants[back]
			if !variantBefore(right, left, order) {
				break
			}
			variants[back-1], variants[back] = right, left
		}
	}
}

func variantBefore(left, right Variant, order map[VariantKind]int) bool {
	if left.Candidate.TotalSeconds != right.Candidate.TotalSeconds {
		return left.Candidate.TotalSeconds < right.Candidate.TotalSeconds
	}
	if left.MarginLaps != right.MarginLaps {
		return left.MarginLaps > right.MarginLaps
	}
	return order[left.Kind] < order[right.Kind]
}
