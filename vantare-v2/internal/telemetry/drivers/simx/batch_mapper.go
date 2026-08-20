package simx

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

var (
	// ErrBatchSinkRequired reports a mapping call without a sink.
	ErrBatchSinkRequired = errors.New("simx batch sink is required")
	// ErrInvalidSessionIdentity reports a frame that does not yet describe a
	// coherent session.
	ErrInvalidSessionIdentity = errors.New("simx observation has no usable session identity")
	// ErrInvalidVehicleCount reports a grid that disagrees with its count.
	ErrInvalidVehicleCount = errors.New("simx observation vehicle count does not match the grid")
	// ErrDuplicateSlot reports two grid rows in the same slot.
	ErrDuplicateSlot = errors.New("simx observation repeats a grid slot")
)

// IsUnmappableFrame classifies the errors that describe a frame which does not
// yet represent a coherent session. They are discarded, never fatal, exactly as
// the LMU driver does; the composition root receives this predicate through the
// registration and never names it.
func IsUnmappableFrame(err error) bool {
	return errors.Is(err, ErrInvalidSessionIdentity) ||
		errors.Is(err, ErrInvalidVehicleCount) ||
		errors.Is(err, ErrDuplicateSlot)
}

// BatchMapper turns synthetic observations into canonical batches. Identity is
// stable for the whole session and the cursor advances monotonically; a session
// boundary resets the epoch.
type BatchMapper struct {
	mu    sync.Mutex
	state mapperState
}

// mapperState is the mapper's whole mutable state. It is a separate value type
// so a candidate can be prepared, mapped and only then committed, without ever
// copying the mutex that guards it.
type mapperState struct {
	cursor         schema.Cursor
	sessionCounter uint64
	sessionID      identity.SessionID
	initialized    bool
}

// NewBatchMapper builds an unstarted mapper.
func NewBatchMapper() *BatchMapper { return &BatchMapper{} }

// WriteObservation maps one observation and commits mapper state only after
// the sink accepts the batch.
func (mapper *BatchMapper) WriteObservation(ctx context.Context, observation Observation, sink telemetrycore.BatchSink) error {
	if ctx == nil {
		return fmt.Errorf("map simx observation: nil context")
	}
	if sink == nil {
		return ErrBatchSinkRequired
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	mapper.mu.Lock()
	defer mapper.mu.Unlock()

	candidate := mapper.state
	batch, err := candidate.mapObservation(observation)
	if err != nil {
		return err
	}
	if err := sink.WriteBatch(ctx, batch); err != nil {
		return fmt.Errorf("write mapped simx batch: %w", err)
	}
	mapper.state = candidate
	return nil
}

func (mapper *mapperState) mapObservation(observation Observation) (telemetrycore.Batch, error) {
	track, trackPresent := usable(observation.TrackName)
	sessionType, typePresent := usable(observation.SessionType)
	if !trackPresent || strings.TrimSpace(track) == "" || !typePresent || !sessionType.Known() {
		return telemetrycore.Batch{}, ErrInvalidSessionIdentity
	}
	count, countPresent := usable(observation.VehicleCount)
	if !countPresent || int(count) != len(observation.Vehicles) {
		return telemetrycore.Batch{}, ErrInvalidVehicleCount
	}
	seen := make(map[int]struct{}, len(observation.Vehicles))
	for _, row := range observation.Vehicles {
		if row.Slot < 0 {
			return telemetrycore.Batch{}, ErrDuplicateSlot
		}
		if _, duplicate := seen[row.Slot]; duplicate {
			return telemetrycore.Batch{}, ErrDuplicateSlot
		}
		seen[row.Slot] = struct{}{}
	}

	first := !mapper.initialized
	boundary := !first && observation.Boundary
	if first || boundary {
		mapper.sessionCounter++
		mapper.sessionID = sessionID(mapper.sessionCounter)
	}

	transition := schema.TransitionContinuous
	if boundary {
		transition = schema.TransitionSourceReset
	}
	cursor, err := mapper.cursor.Advance(transition)
	if err != nil {
		return telemetrycore.Batch{}, fmt.Errorf("advance simx mapper cursor: %w", err)
	}
	mapper.cursor = cursor
	mapper.initialized = true

	vehicles := make([]telemetrycore.VehicleState, 0, len(observation.Vehicles))
	var player identity.VehicleID
	for _, row := range observation.Vehicles {
		id := vehicleID(row.Slot)
		if isPlayer, present := usable(row.Player); present && bool(isPlayer) {
			player = id
		}
		vehicles = append(vehicles, mapVehicle(row, id, mapper.sessionID))
	}

	return telemetrycore.Batch{
		Header: envelope.Header{
			Source: batchSource,
			Cursor: cursor,
			Clock:  schema.NewClock(observation.SourceTime, observation.SourceTime, observation.ReceivedUTC),
			Identity: identity.RunIdentity{
				Event:   batchEventID,
				Session: mapper.sessionID,
				Vehicle: player,
			},
		},
		State: telemetrycore.ObservedState{
			SourceTime:    observation.SourceTime,
			TrackName:     observation.TrackName,
			SessionType:   observation.SessionType,
			VehicleCount:  observation.VehicleCount,
			PlayerPresent: observation.PlayerPresent,
			Vehicles:      vehicles,
		},
	}, nil
}

func mapVehicle(row VehicleObservation, id identity.VehicleID, session identity.SessionID) telemetrycore.VehicleState {
	return telemetrycore.VehicleState{
		Identity:         identity.RunIdentity{Event: batchEventID, Session: session, Vehicle: id},
		DriverName:       row.DriverName,
		Name:             row.VehicleName,
		VehicleClass:     row.VehicleClass,
		Player:           row.Player,
		LapDistance:      row.LapDistance,
		BestLapTime:      row.BestLapTime,
		LastLapTime:      row.LastLapTime,
		Gear:             row.Gear,
		EngineRPM:        row.EngineRPM,
		SpeedMPS:         row.SpeedMPS,
		Throttle:         row.Throttle,
		Brake:            row.Brake,
		Position:         row.Position,
		CompletedLaps:    row.CompletedLaps,
		InPit:            row.InPit,
		TimeBehindLeader: row.TimeBehindLeader,
		LapsBehindLeader: row.LapsBehindLeader,
		TimeBehindNext:   row.TimeBehindNext,
		LapsBehindNext:   row.LapsBehindNext,
		Fuel:             row.Fuel,
	}
}

func usable[T comparable](field schema.Field[T]) (T, bool) {
	value, present := field.Value()
	if !present || field.Freshness() == schema.FreshnessMissing || field.Freshness() == schema.FreshnessInvalid {
		var zero T
		return zero, false
	}
	return value, true
}
