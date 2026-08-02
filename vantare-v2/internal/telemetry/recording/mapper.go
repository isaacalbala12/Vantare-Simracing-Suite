package recording

import (
	"errors"
	"fmt"
	"math"
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

var (
	ErrSnapshotUnavailable = errors.New("recording snapshot has no owned value")
	ErrVehicleSlotsFull    = errors.New("recording session vehicle slots exhausted")
	ErrUnknownFactKind     = errors.New("recording fact kind is not mapped")
)

// Mapper is the only production boundary from canonical runtime values into
// the closed historical v1 DTOs. Stable simulator or account identifiers are
// retained only in this in-memory map and are replaced by per-session slots.
type Mapper struct {
	mu       sync.Mutex
	slots    map[identity.VehicleID]uint16
	nextSlot uint16
}

func NewMapper() *Mapper {
	return &Mapper{slots: make(map[identity.VehicleID]uint16)}
}

func (m *Mapper) Payload(
	snapshot envelope.Snapshot[core.ObservedState],
) (RecordingPayloadV1, error) {
	header := snapshot.Header()
	state, present := snapshot.Value()
	if !present {
		return RecordingPayloadV1{}, ErrSnapshotUnavailable
	}
	payload := RecordingPayloadV1{
		Version:       RecordingVersionV1,
		Channel:       ChannelObserved,
		Epoch:         uint64(header.Cursor.Epoch),
		Sequence:      uint64(header.Cursor.Sequence),
		CapturedAtUTC: header.Clock.ReceivedUTC,
		Vehicles:      make([]RecordingVehicleV1, 0, len(state.Vehicles)),
	}
	if source, ok := state.SourceTime.Value(); ok {
		nanoseconds := source.Nanoseconds()
		payload.SourceTimeNS = &nanoseconds
	}
	for _, vehicle := range state.Vehicles {
		slot, err := m.slot(vehicle.Identity.Vehicle)
		if err != nil {
			return RecordingPayloadV1{}, err
		}
		sample := RecordingVehicleV1{
			SessionSlot: slot,
			Quality:     QualityUnknown,
		}
		qualities := make([]Quality, 0, 5)
		if value, ok := vehicle.SpeedMPS.Value(); ok {
			sample.SpeedMS = value
			sample.Presence |= PresenceSpeed
			qualities = append(qualities, mapQuality(vehicle.SpeedMPS.Freshness()))
		}
		if value, ok := vehicle.Throttle.Value(); ok {
			sample.Throttle = float32(value)
			sample.Presence |= PresenceThrottle
			qualities = append(qualities, mapQuality(vehicle.Throttle.Freshness()))
		}
		if value, ok := vehicle.Brake.Value(); ok {
			sample.Brake = float32(value)
			sample.Presence |= PresenceBrake
			qualities = append(qualities, mapQuality(vehicle.Brake.Freshness()))
		}
		if value, ok := vehicle.Gear.Value(); ok {
			if value < math.MinInt16 || value > math.MaxInt16 {
				return RecordingPayloadV1{}, ErrInvalidRecording
			}
			sample.Gear = int16(value)
			sample.Presence |= PresenceGear
			qualities = append(qualities, mapQuality(vehicle.Gear.Freshness()))
		}
		if value, ok := vehicle.InPit.Value(); ok {
			sample.InPit = bool(value)
			sample.Presence |= PresencePit
			qualities = append(qualities, mapQuality(vehicle.InPit.Freshness()))
		}
		sample.Quality = worstQuality(qualities)
		payload.Vehicles = append(payload.Vehicles, sample)
	}
	if err := payload.Validate(); err != nil {
		return RecordingPayloadV1{}, err
	}
	return payload, nil
}

func (m *Mapper) Fact(
	fact envelope.Fact[core.SessionFact],
) (RecordingFactV1, error) {
	header := fact.Header()
	value := fact.Value()
	factType, err := mapFactType(value.Kind)
	if err != nil {
		return RecordingFactV1{}, err
	}
	var slot uint16
	if value.Identity.Vehicle != "" {
		slot, err = m.slot(value.Identity.Vehicle)
		if err != nil {
			return RecordingFactV1{}, err
		}
	}
	result := RecordingFactV1{
		Version:                RecordingVersionV1,
		Channel:                ChannelFact,
		Epoch:                  uint64(header.Cursor.Epoch),
		FactSequence:           uint64(value.Sequence),
		OccurredAtUTC:          value.OccurredUTC,
		CausalSnapshotSequence: uint64(header.Cursor.Sequence),
		FactType:               factType,
		SessionSlot:            slot,
		Quality:                QualityCurrent,
	}
	if value.Kind == core.FactLapCompleted {
		result.Value = float64(value.Lap)
		result.Presence = PresenceFactValue
	}
	if err := result.Validate(); err != nil {
		return RecordingFactV1{}, err
	}
	return result, nil
}

func (m *Mapper) Batch(
	snapshot envelope.Snapshot[core.ObservedState],
	facts []envelope.Fact[core.SessionFact],
) (RecordingBatch, error) {
	payload, err := m.Payload(snapshot)
	if err != nil {
		return RecordingBatch{}, err
	}
	result := RecordingBatch{
		Observed: []RecordingPayloadV1{payload},
		Facts:    make([]RecordingFactV1, 0, len(facts)),
		Accepted: payload.Cursor(),
	}
	for _, fact := range facts {
		mapped, mapErr := m.Fact(fact)
		if mapErr != nil {
			return RecordingBatch{}, mapErr
		}
		if mapped.Epoch != payload.Epoch ||
			mapped.CausalSnapshotSequence > payload.Sequence {
			return RecordingBatch{}, ErrInvalidRecording
		}
		result.Facts = append(result.Facts, mapped)
	}
	if err := result.Validate(); err != nil {
		return RecordingBatch{}, err
	}
	return result, nil
}

func (m *Mapper) slot(vehicleID identity.VehicleID) (uint16, error) {
	if vehicleID == "" {
		return 0, ErrInvalidRecording
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if slot := m.slots[vehicleID]; slot != 0 {
		return slot, nil
	}
	if int(m.nextSlot) >= core.MaxSessionVehicleHistory {
		return 0, ErrVehicleSlotsFull
	}
	m.nextSlot++
	m.slots[vehicleID] = m.nextSlot
	return m.nextSlot, nil
}

func mapQuality(freshness schema.Freshness) Quality {
	switch freshness {
	case schema.FreshnessFresh:
		return QualityCurrent
	case schema.FreshnessStale:
		return QualityStale
	case schema.FreshnessMissing:
		return QualityMissing
	case schema.FreshnessInvalid:
		return QualityInvalid
	default:
		return QualityUnknown
	}
}

func worstQuality(values []Quality) Quality {
	if len(values) == 0 {
		return QualityMissing
	}
	worst := QualityCurrent
	for _, value := range values {
		if qualitySeverity(value) > qualitySeverity(worst) {
			worst = value
		}
	}
	return worst
}

func qualitySeverity(value Quality) int {
	switch value {
	case QualityCurrent:
		return 0
	case QualityStale:
		return 1
	case QualityMissing:
		return 2
	case QualityInvalid:
		return 3
	default:
		return 4
	}
}

func mapFactType(kind core.FactKind) (FactType, error) {
	switch kind {
	case core.FactSessionStarted:
		return FactSessionStarted, nil
	case core.FactSessionEnded:
		return FactSessionEnded, nil
	case core.FactLapCompleted:
		return FactLapCompleted, nil
	case core.FactPitEntered:
		return FactPitEntered, nil
	case core.FactPitExited:
		return FactPitExited, nil
	case core.FactDriverChanged:
		return FactDriverChanged, nil
	case core.FactConnectionLost:
		return FactConnectionLost, nil
	case core.FactConnectionRecovered:
		return FactConnectionRecovered, nil
	default:
		return FactUnknown, fmt.Errorf("%w: %d", ErrUnknownFactKind, kind)
	}
}
