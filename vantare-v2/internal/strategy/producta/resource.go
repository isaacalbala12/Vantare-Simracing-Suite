package producta

import (
	"fmt"
	"math"
)

// ResourceProjection contains the resource budget for a projected race.
type ResourceProjection struct {
	Used             bool    `json:"used"`
	RaceNeed         float64 `json:"raceNeed"`
	FormationNeed    float64 `json:"formationNeed"`
	ReserveAmount    float64 `json:"reserveAmount"`
	TotalNeed        float64 `json:"totalNeed"`
	AvailableAmount  float64 `json:"availableAmount"`
	AvailableLaps    float64 `json:"availableLaps"`
	AdditionalAmount float64 `json:"additionalAmount"`
	UsableCapacity   float64 `json:"usableCapacity"`
	StopsRequired    int     `json:"stopsRequired"`
}

// SavingOpportunity describes the resource reduction needed to remove one
// service stop under the supplied capacity assumptions.
type SavingOpportunity struct {
	Amount  float64 `json:"amount"`
	PerLap  float64 `json:"perLap"`
	Percent float64 `json:"percent"`
}

// ProjectResource projects a resource budget for the requested competitive
// laps. A zero consumption means that resource is not used.
func ProjectResource(input ResourceInput, raceLaps float64) (ResourceProjection, error) {
	if !isFinite(raceLaps) || raceLaps < 0 {
		return ResourceProjection{}, fmt.Errorf("race laps must be finite and non-negative")
	}
	values := []struct {
		name  string
		value float64
	}{
		{name: "capacity", value: input.Capacity},
		{name: "usable capacity", value: input.UsableCapacity},
		{name: "start amount", value: input.StartAmount},
		{name: "consumption", value: input.ConsumptionPerLap},
		{name: "formation amount", value: input.FormationAmount},
		{name: "formation laps", value: input.FormationLaps},
		{name: "margin", value: input.Margin.Value},
	}
	for _, item := range values {
		if !isFinite(item.value) {
			return ResourceProjection{}, fmt.Errorf("%s must be finite", item.name)
		}
	}
	if input.Capacity < 0 || input.UsableCapacity < 0 || input.StartAmount < 0 || input.ConsumptionPerLap < 0 || input.FormationAmount < 0 || input.FormationLaps < 0 || input.Margin.Value < 0 {
		return ResourceProjection{}, fmt.Errorf("resource values must be non-negative")
	}
	if input.Margin.Kind != "" && input.Margin.Kind != "amount" && input.Margin.Kind != "laps" && input.Margin.Kind != "percent" {
		return ResourceProjection{}, fmt.Errorf("unsupported margin kind %q", input.Margin.Kind)
	}

	usableCapacity := input.UsableCapacity
	if usableCapacity == 0 {
		usableCapacity = input.Capacity
	}
	projection := ResourceProjection{UsableCapacity: usableCapacity}
	if !input.Enabled || input.ConsumptionPerLap == 0 {
		return projection, nil
	}
	if usableCapacity <= 0 {
		return projection, nil
	}

	projection.Used = true
	projection.RaceNeed = raceLaps * input.ConsumptionPerLap
	projection.FormationNeed = input.FormationAmount + input.FormationLaps*input.ConsumptionPerLap
	projection.ReserveAmount = reserveAmount(input.Margin, projection.RaceNeed+projection.FormationNeed, input.ConsumptionPerLap)
	projection.TotalNeed = projection.RaceNeed + projection.FormationNeed + projection.ReserveAmount
	projection.AvailableAmount = math.Min(input.StartAmount, usableCapacity)
	projection.AvailableLaps = projection.AvailableAmount / input.ConsumptionPerLap
	projection.AdditionalAmount = math.Max(projection.TotalNeed-projection.AvailableAmount, 0)
	projection.StopsRequired = int(math.Ceil(projection.AdditionalAmount / usableCapacity))
	return projection, nil
}

func reserveAmount(margin MarginInput, baseNeed, consumption float64) float64 {
	switch margin.Kind {
	case "amount":
		return margin.Value
	case "laps":
		return margin.Value * consumption
	case "percent":
		return baseNeed * margin.Value / 100
	default:
		return 0
	}
}

// SavingForOneLessStop estimates the reduction required to fit within one
// fewer service capacity. currentStops is the number of existing stops.
func SavingForOneLessStop(raceLaps, totalNeed, capacity float64, currentStops int) (SavingOpportunity, error) {
	if !isFinite(raceLaps) || raceLaps <= 0 {
		return SavingOpportunity{}, fmt.Errorf("race laps must be finite and positive")
	}
	if !isFinite(totalNeed) || totalNeed < 0 || !isFinite(capacity) || capacity <= 0 {
		return SavingOpportunity{}, fmt.Errorf("resource budget must be finite and valid")
	}
	if currentStops <= 0 {
		return SavingOpportunity{}, nil
	}

	targetCapacity := capacity * float64(currentStops)
	amount := math.Max(totalNeed-targetCapacity, 0)
	return SavingOpportunity{
		Amount:  amount,
		PerLap:  amount / raceLaps,
		Percent: amount / totalNeed * 100,
	}, nil
}
