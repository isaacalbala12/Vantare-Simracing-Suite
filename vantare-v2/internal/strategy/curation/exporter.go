package curation

import (
	"fmt"
	"sort"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// ExportRequest contiene únicamente contratos derivados ya producidos por
// Telemetry Analysis. El exportador no abre recordings ni telemetría cruda.
type ExportRequest struct {
	UploadID   string
	DeleteHash string
	BundleID   string
	Projection strategyprojection.StrategyInputProjectionV2
	Observed   []strategyprojection.ObservedStrategyV1
}

// GenerateFromDerivations reduce los contratos públicos de Analysis a la
// allowlist cerrada de CurationBundle v1. Identidades de sesión, timestamps y
// texto descriptivo nunca tienen un campo de destino y por tanto no se copian.
func GenerateFromDerivations(request ExportRequest) (CurationBundleV1, error) {
	if err := request.Projection.Validate(); err != nil {
		return CurationBundleV1{}, fmt.Errorf("invalid strategy projection: %w", err)
	}
	sources := make(map[string]bool, len(request.Projection.SourceSessions))
	for _, sessionID := range request.Projection.SourceSessions {
		sources[sessionID] = true
	}
	stints := make(map[int]int)
	strategies := make([]ObservedStrategyRef, 0, len(request.Observed))
	for index, observed := range request.Observed {
		if err := observed.Validate(); err != nil {
			return CurationBundleV1{}, fmt.Errorf("invalid observed strategy %d: %w", index, err)
		}
		if !sources[observed.SessionID] {
			return CurationBundleV1{}, fmt.Errorf("observed strategy %d is outside projection sources", index)
		}
		ref := ObservedStrategyRef{
			StintCount: len(observed.Stints),
			PitLaps:    make([]int, 0, len(observed.PitStops)),
			Compounds:  make([]string, 0, len(observed.Stints)),
		}
		for _, stint := range observed.Stints {
			if stint.StintNumber <= 0 || stint.EndLap < stint.StartLap {
				return CurationBundleV1{}, fmt.Errorf("observed strategy %d has invalid stint bounds", index)
			}
			stints[stint.StintNumber] += stint.EndLap - stint.StartLap + 1
			if stint.CompoundRaw != nil {
				ref.Compounds = append(ref.Compounds, fmt.Sprintf("raw-%d", *stint.CompoundRaw))
			}
		}
		for _, pit := range observed.PitStops {
			ref.PitLaps = append(ref.PitLaps, pit.LapNumber)
		}
		sort.Ints(ref.PitLaps)
		strategies = append(strategies, ref)
	}
	if len(stints) == 0 {
		return CurationBundleV1{}, fmt.Errorf("at least one observed stint is required")
	}
	stintNumbers := make([]int, 0, len(stints))
	for number := range stints {
		stintNumbers = append(stintNumbers, number)
	}
	sort.Ints(stintNumbers)
	aggregates := make([]StintAggregate, 0, len(stintNumbers))
	for _, number := range stintNumbers {
		aggregates = append(aggregates, StintAggregate{
			StintNumber:   number,
			Laps:          stints[number],
			AvgFuelPerLap: request.Projection.FuelConsumption.MeanPerLap,
			AvgVEPerLap:   request.Projection.VirtualEnergyConsumption.MeanPerLap,
		})
	}

	valid, invalid := 0, 0
	for _, lap := range request.Projection.LapValidity.Laps {
		if lap.Included {
			valid++
		} else {
			invalid++
		}
	}
	if valid+invalid == 0 {
		valid = request.Projection.LapValidity.Confidence.SampleSize
	}

	bundle := CurationBundleV1{
		Admin: AdminEnvelope{UploadID: request.UploadID, DeleteHash: request.DeleteHash},
		Payload: BundlePayload{
			ContractVersion:    ContractVersionV1,
			BundleID:           request.BundleID,
			CombinationID:      request.Projection.CombinationID,
			Epoch:              QuantizeEpoch(request.Projection.GeneratedAt),
			StintAggregates:    aggregates,
			PitAggregates:      projectPitAggregates(request.Projection.Pit),
			ObservedStrategies: strategies,
			ChannelQuality:     ChannelQuality{ValidSessions: valid, InvalidSessions: invalid},
		},
	}
	if _, err := bundle.MarshalStrict(); err != nil {
		return CurationBundleV1{}, fmt.Errorf("generated curation bundle: %w", err)
	}
	return bundle, nil
}

func projectPitAggregates(pit strategyprojection.PitFamily) *PitAggregates {
	if len(pit.ObservedIntervals) == 0 {
		return nil
	}
	var duration float64
	for _, interval := range pit.ObservedIntervals {
		duration += interval.DurationSeconds
	}
	result := &PitAggregates{
		Count:              len(pit.ObservedIntervals),
		AvgDurationSeconds: duration / float64(len(pit.ObservedIntervals)),
	}
	if pit.FuelRate.Presence == strategyprojection.PresenceValid && pit.FuelRate.Mean > 0 {
		result.FuelRateLPerS = &pit.FuelRate.Mean
	}
	if pit.VERate.Presence == strategyprojection.PresenceValid && pit.VERate.Mean > 0 {
		result.VERatePPerS = &pit.VERate.Mean
	}
	return result
}
