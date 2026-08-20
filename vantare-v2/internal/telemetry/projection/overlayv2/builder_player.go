package overlayv2

import (
	"slices"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

const (
	capabilitySession             = "session"
	capabilityControls            = "controls"
	capabilityStandings           = "standings"
	capabilityGaps                = "gaps"
	capabilityFuel                = "fuel"
	capabilityDelta               = "delta"
	capabilitySpatialLongitudinal = "spatial.longitudinal"
	capabilitySpatialLateral      = "spatial.lateral"
	capabilitySpotter             = "spotter"

	driverCapabilitySharedMemory = "shared-memory"
	driverCapabilityREST         = "rest"
)

type PreferencesV2 struct {
	Speed       SpeedUnit
	Temperature TemperatureUnit
	Pressure    PressureUnit
	Fuel        FuelUnit
	// DeltaReference is the reference lap the consumer asks the delta view to
	// use. It lives here, not in the widget, because the frame is one per tick:
	// the builder publishes the requested reference alongside the effective one
	// so the widget can render the difference instead of resolving it.
	DeltaReference string
}

type SourceContextV2 struct {
	State                  string
	ReconnectAttempt       int
	DescriptorCapabilities []string
	LastFrameAgeMS         int64
	DegradedReason         string
}

func DefaultPreferencesV2() PreferencesV2 {
	return PreferencesV2{
		Speed: SpeedUnitMPS, Temperature: TemperatureUnitCelsius,
		Pressure: PressureUnitKPA, Fuel: FuelUnitLiters,
		DeltaReference: DeltaReferencePersonalBest,
	}
}

// Deprecated: the production path composes the frame per section through
// CachedProjector (F11); ProjectV2 remains the reference implementation that
// the byte-for-byte parity tests compare against. Do not wire it back into
// the runtime.
func ProjectV2(
	snapshot envelope.Snapshot[derive.FinalState],
	source SourceContextV2,
	preferences PreferencesV2,
	deliveryRevision uint64,
) (UpdateV2, error) {
	final, ok := snapshot.Value()
	if !ok {
		return UpdateV2{}, envelope.ErrCloneRequired
	}
	preferences = normalizedPreferences(preferences)
	header := snapshot.Header()
	frame := FrameV2{
		ContractVersion:  ContractVersionV2,
		AlgorithmVersion: AlgorithmVersionV1,
		StreamEpoch:      uint64(header.Cursor.Epoch),
		SourceSequence:   uint64(header.Cursor.Sequence),
		SessionID:        string(header.Identity.Session),
		GeneratedAt:      header.Clock.ReceivedUTC.Round(0).UTC().Format(time.RFC3339Nano),
		Units: UnitsV2{
			Speed: preferences.Speed, Temperature: preferences.Temperature,
			Pressure: preferences.Pressure, Fuel: preferences.Fuel,
		},
		Session:      BuildSession(final),
		Player:       BuildPlayerInstruments(final, preferences),
		Controls:     BuildControls(final),
		Standings:    BuildStandings(final),
		Relative:     BuildRelative(final),
		Delta:        BuildDelta(final, preferences),
		Fuel:         BuildFuel(final, preferences),
		Spotter:      BuildSpotter(final),
		Capabilities: BuildCapabilities(final, source.DescriptorCapabilities),
	}
	return UpdateV2{
		DeliveryRevision: deliveryRevision,
		Source: SourceStatusV2{
			State: source.State, ReconnectAttempt: uint32(max(source.ReconnectAttempt, 0)),
			LastFrameAgeMS: max(source.LastFrameAgeMS, 0), DegradedReason: source.DegradedReason,
		},
		Frame: &frame,
	}, nil
}

func BuildPlayerInstruments(final derive.FinalState, preferences PreferencesV2) PlayerInstrumentsV2 {
	preferences = normalizedPreferences(preferences)
	result := PlayerInstrumentsV2{
		Speed: missingValue[float64](), RPM: missingValue[float64](), Gear: missingValue[int32](),
		Throttle: missingValue[float64](), Brake: missingValue[float64](), Clutch: missingValue[float64](),
		// Steering is not present in the current canonical state. Keeping it
		// explicitly missing preserves the v2 contract without inventing data.
		Steering: missingValue[float64](),
	}
	for _, current := range final.Observed.Vehicles {
		player, present := current.Player.Value()
		if !present || !player || current.Player.Freshness() == schema.FreshnessInvalid {
			continue
		}
		result.VehicleID = string(current.Identity.Vehicle)
		result.Speed = qualityValue(current.SpeedMPS, func(value float64) float64 {
			return convertSpeed(value, preferences.Speed)
		})
		result.RPM = qualityValue(current.EngineRPM, func(value vehicle.EngineRPM) float64 { return float64(value) })
		result.Gear = qualityValue(current.Gear, func(value vehicle.Gear) int32 { return int32(value) })
		result.Throttle = qualityValue(current.Throttle, func(value schema.Ratio) float64 { return float64(value) })
		result.Brake = qualityValue(current.Brake, func(value schema.Ratio) float64 { return float64(value) })
		result.Clutch = qualityValue(current.Clutch, func(value schema.Ratio) float64 { return float64(value) })
		return result
	}
	return result
}

func BuildCapabilities(final derive.FinalState, descriptorCapabilities []string) CapabilitiesV2 {
	supported := supportedCapabilities(descriptorCapabilities)
	player := BuildPlayerInstruments(final, DefaultPreferencesV2())
	sessionView := BuildSession(final)
	available := make(map[string]Quality, len(supported))
	for _, capability := range supported {
		switch capability {
		case capabilitySession:
			available[capability] = bestQuality(sessionView.Track.Q, sessionView.Phase.Q, sessionView.RemainingSeconds.Q)
		case capabilityControls:
			available[capability] = bestQuality(player.Speed.Q, player.RPM.Q, player.Gear.Q, player.Throttle.Q, player.Brake.Q, player.Clutch.Q)
		case capabilityStandings:
			available[capability] = standingsQuality(final)
		case capabilityGaps:
			available[capability] = qualityFromFreshness(final.Derived.Gaps.Freshness)
		case capabilityFuel:
			available[capability] = playerFuelQuality(final)
		case capabilityDelta:
			available[capability] = qualityFromFreshness(final.Derived.Delta.Freshness)
		case capabilitySpatialLongitudinal, capabilitySpatialLateral, capabilitySpotter:
			available[capability] = spatialQuality(final)
		default:
			available[capability] = QualityMissing
		}
	}
	return CapabilitiesV2{
		Supported: supported,
		Available: available,
		Modes: CapabilityModesV2{
			Spatial: make([]string, 0), Delta: make([]string, 0),
			Standings: ModeNone, Gaps: ModeNone,
		},
	}
}

func supportedCapabilities(descriptorCapabilities []string) []string {
	result := make([]string, 0, 9)
	for _, capability := range descriptorCapabilities {
		switch capability {
		case driverCapabilitySharedMemory:
			result = append(result,
				capabilitySession, capabilityControls, capabilityStandings, capabilityGaps,
				capabilityFuel, capabilityDelta, capabilitySpatialLongitudinal, capabilitySpatialLateral, capabilitySpotter,
			)
		case driverCapabilityREST:
			result = append(result, capabilitySession)
		}
	}
	slices.Sort(result)
	return slices.Compact(result)
}

func normalizedPreferences(preferences PreferencesV2) PreferencesV2 {
	defaults := DefaultPreferencesV2()
	switch preferences.Speed {
	case SpeedUnitMPS, SpeedUnitKPH, SpeedUnitMPH:
	default:
		preferences.Speed = defaults.Speed
	}
	switch preferences.Temperature {
	case TemperatureUnitCelsius, TemperatureUnitFahrenheit:
	default:
		preferences.Temperature = defaults.Temperature
	}
	switch preferences.Pressure {
	case PressureUnitKPA, PressureUnitPSI:
	default:
		preferences.Pressure = defaults.Pressure
	}
	switch preferences.Fuel {
	case FuelUnitLiters, FuelUnitGallonsUS:
	default:
		preferences.Fuel = defaults.Fuel
	}
	switch preferences.DeltaReference {
	case DeltaReferencePersonalBest, DeltaReferenceSessionBest, DeltaReferencePreviousLap:
	default:
		preferences.DeltaReference = defaults.DeltaReference
	}
	return preferences
}

func convertSpeed(metresPerSecond float64, unit SpeedUnit) float64 {
	switch unit {
	case SpeedUnitKPH:
		return metresPerSecond * 3.6
	case SpeedUnitMPH:
		return metresPerSecond * 2.2369362920544
	default:
		return metresPerSecond
	}
}

func qualityValue[Source comparable, Target any](field schema.Field[Source], convert func(Source) Target) QValue[Target] {
	value, present := field.Value()
	quality := qualityFromFreshness(field.Freshness())
	if !present || quality == QualityMissing {
		return missingValue[Target]()
	}
	return QValue[Target]{V: convert(value), Q: quality}
}

func missingValue[T any]() QValue[T] { return QValue[T]{Q: QualityMissing} }

func qualityFromFreshness(freshness schema.Freshness) Quality {
	switch freshness {
	case schema.FreshnessFresh:
		return QualityFresh
	case schema.FreshnessStale:
		return QualityStale
	case schema.FreshnessInvalid:
		return QualityInvalid
	default:
		return QualityMissing
	}
}

func bestQuality(values ...Quality) Quality {
	best := QualityMissing
	for _, value := range values {
		switch value {
		case QualityFresh:
			return QualityFresh
		case QualityStale:
			best = QualityStale
		case QualityInvalid:
			if best == QualityMissing {
				best = QualityInvalid
			}
		}
	}
	return best
}

func standingsQuality(final derive.FinalState) Quality {
	qualities := make([]Quality, 0, len(final.Observed.Vehicles))
	for _, current := range final.Observed.Vehicles {
		qualities = append(qualities, qualityFromFreshness(current.Position.Freshness()))
	}
	return bestQuality(qualities...)
}

func playerFuelQuality(final derive.FinalState) Quality {
	for _, current := range final.Observed.Vehicles {
		if player, present := current.Player.Value(); present && player {
			return qualityFromFreshness(current.Fuel.Freshness())
		}
	}
	return QualityMissing
}

func spatialQuality(final derive.FinalState) Quality {
	qualities := make([]Quality, 0, len(final.Observed.Vehicles))
	for _, current := range final.Observed.Vehicles {
		qualities = append(qualities, qualityFromFreshness(current.WorldPosition.Freshness()))
	}
	return bestQuality(qualities...)
}
