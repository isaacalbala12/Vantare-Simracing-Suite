package solver

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/internal/strategy/pilotprofile"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const defaultDriverPaceDeltaSensitivity = 0.20

// DriverProfileInput enlaza una identidad del documento v2 con una sola
// autoridad de ritmo y consumo: PilotProfile v1 o entrada manual/reference.
type DriverProfileInput struct {
	DriverID string                       `json:"driverId"`
	Profile  *pilotprofile.PilotProfileV1 `json:"profile,omitempty"`
	Manual   *ManualDriverProfile         `json:"manual,omitempty"`
}

type ManualDriverProfile struct {
	BaseLapSeconds   float64       `json:"baseLapSeconds"`
	FuelPerLapLiters float64       `json:"fuelPerLapLiters"`
	VEPerLapPercent  float64       `json:"vePerLapPercent"`
	Provenance       sp.Provenance `json:"provenance"`
	Confidence       sp.Confidence `json:"confidence"`
}

type DriverProfileSource struct {
	DriverID         string        `json:"driverId"`
	Source           string        `json:"source"`
	SourceID         string        `json:"sourceId"`
	BaseLapSeconds   float64       `json:"baseLapSeconds"`
	FuelPerLapLiters float64       `json:"fuelPerLapLiters"`
	VEPerLapPercent  float64       `json:"vePerLapPercent"`
	Provenance       sp.Provenance `json:"provenance"`
	Confidence       sp.Confidence `json:"confidence"`
}

type driverCost struct {
	id         string
	baseLap    float64
	fuelPerLap int64
	vePerLap   int64
	source     DriverProfileSource
}

type driverDecisionModel struct {
	enabled bool
	order   []driverCost
}

type driverUsage struct {
	laps    int64
	seconds float64
}

func (input SolverInputV2) applyDriverConstraints(before searchNode, after *searchNode, driver driverCost) (bool, string, string) {
	startLap, endLap := before.lap+1, after.lap
	limit := input.EventRules.DriverLimits[driver.id]
	for _, window := range limit.Unavailable {
		if startLap <= window.ToLap && endLap >= window.FromLap {
			return false, "driver_unavailable", fmt.Sprintf("el piloto %s no esta disponible entre las vueltas %d y %d", driver.id, window.FromLap, window.ToLap)
		}
	}
	driveSeconds := drivingSeconds(*after) - drivingSeconds(before)
	usage := after.driverUsage[driver.id]
	usage.laps += endLap - startLap + 1
	usage.seconds += driveSeconds
	if limit.MaxLaps != nil && usage.laps > *limit.MaxLaps {
		return false, "driver_maximum_laps", fmt.Sprintf("el piloto %s supera el maximo de %d vueltas", driver.id, *limit.MaxLaps)
	}
	if limit.MaxTotalTimeSeconds != nil && usage.seconds > *limit.MaxTotalTimeSeconds {
		return false, "driver_total_time", fmt.Sprintf("el piloto %s supera %.3f s de conduccion total", driver.id, *limit.MaxTotalTimeSeconds)
	}
	continuous := driveSeconds
	if before.currentDriver == driver.id {
		continuous += before.continuousDriverSeconds
	}
	if limit.MaxContinuousTimeSeconds != nil && continuous > *limit.MaxContinuousTimeSeconds {
		return false, "driver_continuous_time", fmt.Sprintf("el piloto %s supera %.3f s de conduccion continua", driver.id, *limit.MaxContinuousTimeSeconds)
	}
	if after.driverUsage == nil {
		after.driverUsage = make(map[string]driverUsage, len(input.DriverProfiles))
	}
	after.driverUsage[driver.id] = usage
	after.currentDriver = driver.id
	after.continuousDriverSeconds = continuous
	return true, "", ""
}

func drivingSeconds(node searchNode) float64 {
	return node.green + node.degradation + node.compound + node.fuelWeight + node.saving
}

func sameDriverUsage(left, right map[string]driverUsage) bool {
	if len(left) != len(right) {
		return false
	}
	for id, usage := range left {
		if right[id] != usage {
			return false
		}
	}
	return true
}

func newDriverDecisionModel(input SolverInputV2, saving savingCost) (driverDecisionModel, error) {
	if len(input.DriverProfiles) == 0 {
		if len(input.EventRules.DriverLimits) != 0 {
			return driverDecisionModel{}, fmt.Errorf("eventRules.driverLimits requires driverProfiles")
		}
		return driverDecisionModel{order: []driverCost{{
			baseLap:    input.baseLapSource().Value,
			fuelPerLap: mustServiceUnits(input.resourcePerLap(ResourceFuel)),
			vePerLap:   mustServiceUnits(input.resourcePerLap(ResourceVirtualEnergy)),
		}}}, nil
	}

	model := driverDecisionModel{enabled: true, order: make([]driverCost, 0, len(input.DriverProfiles))}
	seen := make(map[string]struct{}, len(input.DriverProfiles))
	for index, profile := range input.DriverProfiles {
		cost, err := profile.cost()
		if err != nil {
			return driverDecisionModel{}, fmt.Errorf("driverProfiles[%d]: %w", index, err)
		}
		if _, duplicate := seen[cost.id]; duplicate {
			return driverDecisionModel{}, fmt.Errorf("driverProfiles[%d].driverId is duplicated", index)
		}
		seen[cost.id] = struct{}{}
		for _, level := range saving.levels {
			if level.fuelSavedPerLap > cost.fuelPerLap || level.veSavedPerLap > cost.vePerLap {
				return driverDecisionModel{}, fmt.Errorf("driverProfiles[%d] consumption is lower than saving level %q", index, level.level)
			}
		}
		model.order = append(model.order, cost)
	}
	for _, driverID := range input.sortedDriverLimitIDs() {
		limit := input.EventRules.DriverLimits[driverID]
		if _, ok := seen[driverID]; !ok {
			return driverDecisionModel{}, fmt.Errorf("eventRules.driverLimits[%q] has no driverProfile", driverID)
		}
		if err := limit.validate(input.RaceLaps); err != nil {
			return driverDecisionModel{}, fmt.Errorf("eventRules.driverLimits[%q]: %w", driverID, err)
		}
	}
	return model, nil
}

func (input SolverInputV2) sortedDriverLimitIDs() []string {
	ids := make([]string, 0, len(input.EventRules.DriverLimits))
	for id := range input.EventRules.DriverLimits {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func (input DriverProfileInput) cost() (driverCost, error) {
	if strings.TrimSpace(input.DriverID) == "" {
		return driverCost{}, fmt.Errorf("driverId is required")
	}
	if (input.Profile == nil) == (input.Manual == nil) {
		return driverCost{}, fmt.Errorf("exactly one of profile or manual is required")
	}
	if input.Profile != nil {
		if err := input.Profile.Validate(); err != nil {
			return driverCost{}, fmt.Errorf("profile: %w", err)
		}
		if !finite(input.Profile.Pace.BaseSeconds) {
			return driverCost{}, fmt.Errorf("profile.pace.baseSeconds must be finite")
		}
		provenanceKind := sp.ProvenanceKind(input.Profile.Provenance.Kind)
		if !provenanceKind.Valid() {
			return driverCost{}, fmt.Errorf("profile.provenance.kind is unsupported")
		}
		fuel, err := serviceUnits("fuelPerLapLiters", input.Profile.Fuel.MeanPerLap)
		if err != nil {
			return driverCost{}, err
		}
		ve, err := serviceUnits("vePerLapPercent", input.Profile.VE.MeanPerLap)
		if err != nil {
			return driverCost{}, err
		}
		return driverCost{
			id: input.DriverID, baseLap: input.Profile.Pace.BaseSeconds, fuelPerLap: fuel, vePerLap: ve,
			source: DriverProfileSource{
				DriverID: input.DriverID, Source: "pilot_profile", SourceID: input.Profile.ProfileID,
				BaseLapSeconds: input.Profile.Pace.BaseSeconds, FuelPerLapLiters: input.Profile.Fuel.MeanPerLap,
				VEPerLapPercent: input.Profile.VE.MeanPerLap,
				Provenance:      sp.Provenance{Kind: provenanceKind, SourceID: input.Profile.Provenance.SourceID},
				Confidence:      sp.Confidence{SampleSize: input.Profile.Pace.SampleSize, ComputationVersion: "pilotprofile.v1"},
			},
		}, nil
	}
	if err := input.Manual.validate(); err != nil {
		return driverCost{}, err
	}
	fuel, err := serviceUnits("fuelPerLapLiters", input.Manual.FuelPerLapLiters)
	if err != nil {
		return driverCost{}, err
	}
	ve, err := serviceUnits("vePerLapPercent", input.Manual.VEPerLapPercent)
	if err != nil {
		return driverCost{}, err
	}
	return driverCost{
		id: input.DriverID, baseLap: input.Manual.BaseLapSeconds, fuelPerLap: fuel, vePerLap: ve,
		source: DriverProfileSource{
			DriverID: input.DriverID, Source: "manual", SourceID: input.Manual.Provenance.SourceID,
			BaseLapSeconds: input.Manual.BaseLapSeconds, FuelPerLapLiters: input.Manual.FuelPerLapLiters,
			VEPerLapPercent: input.Manual.VEPerLapPercent, Provenance: input.Manual.Provenance, Confidence: input.Manual.Confidence,
		},
	}, nil
}

func (profile ManualDriverProfile) validate() error {
	if profile.BaseLapSeconds <= 0 || !finite(profile.BaseLapSeconds) {
		return fmt.Errorf("manual.baseLapSeconds must be positive and finite")
	}
	for field, value := range map[string]float64{"fuelPerLapLiters": profile.FuelPerLapLiters, "vePerLapPercent": profile.VEPerLapPercent} {
		if value < 0 || !finite(value) {
			return fmt.Errorf("manual.%s must be finite and non-negative", field)
		}
	}
	if profile.Provenance.Kind != sp.ProvenanceManual && profile.Provenance.Kind != sp.ProvenanceReference {
		return fmt.Errorf("manual.provenance.kind must be manual or reference")
	}
	if err := profile.Provenance.Validate(); err != nil {
		return err
	}
	return profile.Confidence.Validate()
}

func (limit DriverLimit) validate(raceLaps int64) error {
	if limit.MinLaps != nil && (*limit.MinLaps < 0 || *limit.MinLaps > raceLaps) {
		return fmt.Errorf("minLaps out of range")
	}
	if limit.MaxLaps != nil && (*limit.MaxLaps < 0 || *limit.MaxLaps > raceLaps) {
		return fmt.Errorf("maxLaps out of range")
	}
	if limit.MinLaps != nil && limit.MaxLaps != nil && *limit.MinLaps > *limit.MaxLaps {
		return fmt.Errorf("lap range invalid")
	}
	for field, value := range map[string]*float64{
		"maxContinuousTimeSeconds": limit.MaxContinuousTimeSeconds,
		"maxTotalTimeSeconds":      limit.MaxTotalTimeSeconds,
	} {
		if value != nil && (*value <= 0 || math.IsNaN(*value) || math.IsInf(*value, 0)) {
			return fmt.Errorf("%s must be positive and finite", field)
		}
	}
	for index, window := range limit.Unavailable {
		if window.FromLap < 1 || window.ToLap < window.FromLap || window.ToLap > raceLaps {
			return fmt.Errorf("unavailable[%d] must satisfy 1 <= fromLap <= toLap <= raceLaps", index)
		}
	}
	return nil
}

func (model driverDecisionModel) sources() []DriverProfileSource {
	if !model.enabled {
		return nil
	}
	result := make([]DriverProfileSource, 0, len(model.order))
	for _, driver := range model.order {
		result = append(result, driver.source)
	}
	return result
}

func (model driverDecisionModel) sensitivities(decision DecisionVector) []SolverSensitivity {
	if !model.enabled {
		return nil
	}
	laps := make(map[string]int64, len(model.order))
	for _, stint := range decision.Stints {
		laps[stint.Driver] += stint.Laps
	}
	ids := make([]string, 0, len(laps))
	for id := range laps {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	result := make([]SolverSensitivity, 0, len(ids))
	for _, id := range ids {
		result = append(result, SolverSensitivity{
			Parameter: "driverPaceDeltaSeconds." + id, Delta: defaultDriverPaceDeltaSensitivity,
			ImpactSeconds: float64(laps[id]) * defaultDriverPaceDeltaSensitivity,
		})
	}
	return result
}

func mustServiceUnits(value float64) int64 {
	units, _ := serviceUnits("driver", value)
	return units
}
