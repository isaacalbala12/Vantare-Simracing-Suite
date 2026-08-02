package producta

import (
	"fmt"
	"math"
)

// PitServiceMode controls whether refuelling and tyre service overlap.
type PitServiceMode string

const (
	PitServiceSimultaneous PitServiceMode = "simultaneous"
	PitServiceSequential   PitServiceMode = "sequential"
)

// PitStop contains manual service timing assumptions for one stop.
type PitStop struct {
	EntrySeconds      float64        `json:"entrySeconds"`
	TransitSeconds    float64        `json:"transitSeconds"`
	ExitSeconds       float64        `json:"exitSeconds"`
	RefuelSeconds     float64        `json:"refuelSeconds"`
	TyreChangeSeconds float64        `json:"tyreChangeSeconds"`
	RepairSeconds     float64        `json:"repairSeconds"`
	PenaltySeconds    float64        `json:"penaltySeconds"`
	ServiceMode       PitServiceMode `json:"serviceMode"`
}

// PitComponent is one explainable contribution to pit loss.
type PitComponent struct {
	Name    string  `json:"name"`
	Seconds float64 `json:"seconds"`
}

// PitBreakdown contains the total and its service explanation.
type PitBreakdown struct {
	EntrySeconds   float64        `json:"entrySeconds"`
	TransitSeconds float64        `json:"transitSeconds"`
	ExitSeconds    float64        `json:"exitSeconds"`
	ServiceSeconds float64        `json:"serviceSeconds"`
	RepairSeconds  float64        `json:"repairSeconds"`
	PenaltySeconds float64        `json:"penaltySeconds"`
	TotalSeconds   float64        `json:"totalSeconds"`
	Components     []PitComponent `json:"components"`
}

// PitPreset is a reusable manual timing preset. Product A intentionally ships
// with no unconfirmed LMU timing values.
type PitPreset = PitStop

// LMUPitPreset is neutral until timing data is confirmed by the product owner.
var LMUPitPreset = PitPreset{}

// PitDuration calculates pit loss and retains each contributing component.
func PitDuration(stop PitStop) (PitBreakdown, error) {
	for name, value := range map[string]float64{
		"entry":   stop.EntrySeconds,
		"transit": stop.TransitSeconds,
		"exit":    stop.ExitSeconds,
		"refuel":  stop.RefuelSeconds,
		"tyres":   stop.TyreChangeSeconds,
		"repair":  stop.RepairSeconds,
		"penalty": stop.PenaltySeconds,
	} {
		if !isFinite(value) || value < 0 {
			return PitBreakdown{}, fmt.Errorf("%s seconds must be finite and non-negative", name)
		}
	}

	mode := stop.ServiceMode
	if mode == "" {
		mode = PitServiceSimultaneous
	}
	var serviceSeconds float64
	switch mode {
	case PitServiceSimultaneous:
		serviceSeconds = math.Max(stop.RefuelSeconds, stop.TyreChangeSeconds)
	case PitServiceSequential:
		serviceSeconds = stop.RefuelSeconds + stop.TyreChangeSeconds
	default:
		return PitBreakdown{}, fmt.Errorf("unsupported pit service mode %q", stop.ServiceMode)
	}

	breakdown := PitBreakdown{
		EntrySeconds:   stop.EntrySeconds,
		TransitSeconds: stop.TransitSeconds,
		ExitSeconds:    stop.ExitSeconds,
		ServiceSeconds: serviceSeconds,
		RepairSeconds:  stop.RepairSeconds,
		PenaltySeconds: stop.PenaltySeconds,
	}
	breakdown.Components = []PitComponent{
		{Name: "entry", Seconds: breakdown.EntrySeconds},
		{Name: "transit", Seconds: breakdown.TransitSeconds},
		{Name: "service", Seconds: breakdown.ServiceSeconds},
		{Name: "repair", Seconds: breakdown.RepairSeconds},
		{Name: "penalty", Seconds: breakdown.PenaltySeconds},
		{Name: "exit", Seconds: breakdown.ExitSeconds},
	}
	breakdown.TotalSeconds = breakdown.EntrySeconds + breakdown.TransitSeconds + breakdown.ServiceSeconds + breakdown.RepairSeconds + breakdown.PenaltySeconds + breakdown.ExitSeconds
	return breakdown, nil
}
