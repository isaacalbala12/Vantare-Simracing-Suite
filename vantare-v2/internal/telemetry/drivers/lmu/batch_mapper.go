package lmu

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

var (
	ErrBatchSinkRequired       = errors.New("LMU batch mapper requires a sink")
	ErrBatchMapperRequired     = errors.New("LMU observation batch sink requires a mapper")
	ErrIncompatibleObservation = errors.New("LMU batch mapper requires a compatible canonical observation")
	ErrInvalidSessionIdentity  = errors.New("LMU observation has invalid session identity")
	ErrInvalidVehicleCount     = errors.New("LMU observation vehicle count does not match grid")
	ErrInvalidSourceSlot       = errors.New("LMU observation contains a negative source slot")
	ErrDuplicateSourceSlot     = errors.New("LMU observation contains a duplicate source slot")
	ErrInvalidPlayerIdentity   = errors.New("LMU observation has ambiguous player identity")
)

const (
	batchSource  envelope.SourceID = "lmu-canonical"
	batchEventID identity.EventID  = "lmu-event-1"
)

type sessionSignature struct {
	track       string
	sessionType session.Type
}

type mappedSlot struct {
	vehicleID identity.VehicleID
}

type batchMapperState struct {
	initialized    bool
	sessionCounter uint64
	cursor         schema.Cursor
	sessionID      identity.SessionID
	playerID       identity.VehicleID
	lastFresh      sessionSignature
	hasFresh       bool
	lastSourceTime time.Duration
	hasSourceTime  bool
	active         map[VehicleSourceID]mappedSlot
	generations    map[VehicleSourceID]uint64
}

// BatchMapper is a long-lived, synchronous identity owner. It is deliberately
// separate from Driver instances so a transient driver reconnect cannot reset
// event, session, cursor, or source-slot generations.
type BatchMapper struct {
	mu    sync.Mutex
	state batchMapperState
}

// ObservationBatchSink binds the long-lived mapper to the canonical batch
// consumer. DriverManager can reuse this same adapter when it recreates a
// transient Driver, so driver lifetimes never reset canonical identity.
type ObservationBatchSink struct {
	mapper *BatchMapper
	sink   telemetrycore.BatchSink
}

var _ driver.ObservationSink[Observation] = (*ObservationBatchSink)(nil)

func NewBatchMapper() *BatchMapper {
	return &BatchMapper{state: emptyBatchMapperState()}
}

func NewObservationBatchSink(mapper *BatchMapper, sink telemetrycore.BatchSink) (*ObservationBatchSink, error) {
	if mapper == nil {
		return nil, ErrBatchMapperRequired
	}
	if sink == nil {
		return nil, ErrBatchSinkRequired
	}
	return &ObservationBatchSink{mapper: mapper, sink: sink}, nil
}

func (sink *ObservationBatchSink) WriteObservation(ctx context.Context, observation Observation) error {
	return sink.mapper.WriteObservation(ctx, observation, sink.sink)
}

func emptyBatchMapperState() batchMapperState {
	return batchMapperState{
		active:      make(map[VehicleSourceID]mappedSlot),
		generations: make(map[VehicleSourceID]uint64),
	}
}

// WriteObservation validates and maps one complete fused observation, writes
// it once, and commits mapper state only after the sink accepts the batch.
func (mapper *BatchMapper) WriteObservation(ctx context.Context, observation Observation, sink telemetrycore.BatchSink) error {
	if ctx == nil {
		return fmt.Errorf("map LMU observation: nil context")
	}
	if sink == nil {
		return ErrBatchSinkRequired
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	mapper.mu.Lock()
	defer mapper.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}

	candidate := cloneBatchMapperState(mapper.state)
	batch, err := candidate.mapObservation(observation)
	if err != nil {
		return err
	}
	batch.State.Vehicles = append([]telemetrycore.VehicleState(nil), batch.State.Vehicles...)
	if err := sink.WriteBatch(ctx, batch); err != nil {
		return fmt.Errorf("write mapped LMU batch: %w", err)
	}
	mapper.state = candidate
	return nil
}

func (state *batchMapperState) mapObservation(observation Observation) (telemetrycore.Batch, error) {
	signature, freshSignature, playerSlot, err := validateMapperObservation(observation)
	if err != nil {
		return telemetrycore.Batch{}, err
	}

	first := !state.initialized
	clockChange := observation.ClockChange
	if sourceTime, present := usableField(observation.SourceTime); present {
		if state.hasSourceTime && clockChange == ClockContinuous {
			clockChange = classifyClock(state.lastSourceTime, sourceTime)
		}
		state.lastSourceTime = sourceTime
		state.hasSourceTime = true
	}
	sessionBoundary := !first && clockChange == ClockReset
	if !sessionBoundary && !first && freshSignature && state.hasFresh && signature != state.lastFresh {
		sessionBoundary = true
	}
	epochBoundary := sessionBoundary || (!first && clockChange == ClockWrap)

	if first {
		state.sessionCounter = 1
		state.sessionID = sessionID(state.sessionCounter)
	} else if sessionBoundary {
		state.sessionCounter++
		state.sessionID = sessionID(state.sessionCounter)
		state.playerID = ""
		state.active = make(map[VehicleSourceID]mappedSlot)
		state.generations = make(map[VehicleSourceID]uint64)
	}

	vehicles := make([]telemetrycore.VehicleState, len(observation.Vehicles))
	nextActive := make(map[VehicleSourceID]mappedSlot, len(observation.Vehicles))
	var observedPlayer identity.VehicleID
	for index, source := range observation.Vehicles {
		mapped, exists := state.active[source.SourceID]
		if !exists {
			generation := state.generations[source.SourceID] + 1
			mapped = mappedSlot{
				vehicleID: vehicleID(source.SourceID, generation),
			}
			state.generations[source.SourceID] = generation
		}
		nextActive[source.SourceID] = mapped
		vehicles[index] = mapVehicle(source, mapped.vehicleID, state.sessionID)
		if playerSlot != nil && source.SourceID == *playerSlot {
			observedPlayer = mapped.vehicleID
		}
	}

	if observedPlayer == "" {
		state.playerID = ""
	} else if state.playerID != observedPlayer {
		if !first && !sessionBoundary {
			epochBoundary = true
		}
		state.playerID = observedPlayer
	}
	state.active = nextActive

	transition := schema.TransitionContinuous
	if epochBoundary {
		transition = schema.TransitionSourceReset
	}
	cursor, err := state.cursor.Advance(transition)
	if err != nil {
		return telemetrycore.Batch{}, fmt.Errorf("advance LMU mapper cursor: %w", err)
	}
	state.cursor = cursor
	state.initialized = true
	if freshSignature {
		state.lastFresh = signature
		state.hasFresh = true
	}

	headerIdentity := identity.RunIdentity{Event: batchEventID, Session: state.sessionID, Vehicle: state.playerID}
	return telemetrycore.Batch{
		Header: envelope.Header{
			Source:   batchSource,
			Cursor:   cursor,
			Clock:    schema.NewClock(observation.SourceTime, observation.SourceTime, observation.ReceivedUTC),
			Identity: headerIdentity,
		},
		State: telemetrycore.ObservedState{
			SourceTime:    observation.SourceTime,
			EndTime:       observation.EndTime,
			MaximumLaps:   observation.MaximumLaps,
			TrackName:     observation.TrackName,
			SessionType:   observation.SessionType,
			VehicleCount:  observation.VehicleCount,
			PlayerPresent: observation.PlayerPresent,
			Vehicles:      vehicles,
		},
	}, nil
}

func validateMapperObservation(observation Observation) (sessionSignature, bool, *VehicleSourceID, error) {
	if observation.Source != SourceCanonical || observation.Compatibility != CompatibilityKnown || observation.ClockChange > ClockWrap {
		return sessionSignature{}, false, nil, ErrIncompatibleObservation
	}
	track, trackPresent := usableField(observation.TrackName)
	sessionType, typePresent := usableField(observation.SessionType)
	if !trackPresent || strings.TrimSpace(track) == "" || !typePresent || !sessionType.Known() {
		return sessionSignature{}, false, nil, ErrInvalidSessionIdentity
	}
	count, countPresent := usableField(observation.VehicleCount)
	if !countPresent || count < 0 || len(observation.Vehicles) > lmu13Layout.ScoringRows.Maximum || int(count) != len(observation.Vehicles) {
		return sessionSignature{}, false, nil, ErrInvalidVehicleCount
	}
	playerPresent, playerPresenceKnown := usableField(observation.PlayerPresent)
	if !playerPresenceKnown {
		return sessionSignature{}, false, nil, ErrInvalidPlayerIdentity
	}

	seen := make(map[VehicleSourceID]struct{}, len(observation.Vehicles))
	var playerSlot *VehicleSourceID
	for index := range observation.Vehicles {
		current := observation.Vehicles[index]
		if current.SourceID < 0 {
			return sessionSignature{}, false, nil, ErrInvalidSourceSlot
		}
		if _, duplicate := seen[current.SourceID]; duplicate {
			return sessionSignature{}, false, nil, ErrDuplicateSourceSlot
		}
		seen[current.SourceID] = struct{}{}
		isPlayer, known := usableField(current.Player)
		if !known {
			return sessionSignature{}, false, nil, ErrInvalidPlayerIdentity
		}
		if isPlayer {
			if playerSlot != nil {
				return sessionSignature{}, false, nil, ErrInvalidPlayerIdentity
			}
			slot := current.SourceID
			playerSlot = &slot
		}
	}
	if playerPresent != (playerSlot != nil) {
		return sessionSignature{}, false, nil, ErrInvalidPlayerIdentity
	}
	fresh := observation.TrackName.Freshness() == schema.FreshnessFresh &&
		observation.SessionType.Freshness() == schema.FreshnessFresh
	return sessionSignature{track: track, sessionType: sessionType}, fresh, playerSlot, nil
}

func mapVehicle(source VehicleObservation, id identity.VehicleID, sessionID identity.SessionID) telemetrycore.VehicleState {
	return telemetrycore.VehicleState{
		Identity:         identity.RunIdentity{Event: batchEventID, Session: sessionID, Vehicle: id},
		DriverName:       source.DriverName,
		Name:             source.VehicleName,
		VehicleClass:     source.VehicleClass,
		Player:           source.Player,
		Sector:           source.Sector,
		LapDistance:      source.LapDistance,
		BestLapTime:      source.BestLapTime,
		LastLapTime:      source.LastLapTime,
		EstimatedLapTime: source.EstimatedLapTime,
		LapNumber:        source.LapNumber,
		Gear:             source.Gear,
		EngineRPM:        source.EngineRPM,
		SpeedMPS:         source.SpeedMPS,
		Throttle:         source.Throttle,
		Brake:            source.Brake,
		Clutch:           source.Clutch,
		Position:         source.Position,
		CompletedLaps:    source.CompletedLaps,
		InPit:            source.InPit,
		PitStopCount:     source.PitStopCount,
		PenaltyCount:     source.PenaltyCount,
		TimeBehindLeader: source.TimeBehindLeader,
		LapsBehindLeader: source.LapsBehindLeader,
		TimeBehindNext:   source.TimeBehindNext,
		LapsBehindNext:   source.LapsBehindNext,
		Fuel:             source.Fuel,
		WorldPosition:    source.WorldPosition,
		LocalVelocity:    source.LocalVelocity,
		Orientation:      source.Orientation,
	}
}

func cloneBatchMapperState(input batchMapperState) batchMapperState {
	result := input
	result.active = make(map[VehicleSourceID]mappedSlot, len(input.active))
	for slot, mapped := range input.active {
		result.active[slot] = mapped
	}
	result.generations = make(map[VehicleSourceID]uint64, len(input.generations))
	for slot, generation := range input.generations {
		result.generations[slot] = generation
	}
	return result
}

func usableField[T comparable](field schema.Field[T]) (T, bool) {
	value, present := field.Value()
	return value, present && field.Freshness() != schema.FreshnessInvalid
}

func sessionID(counter uint64) identity.SessionID {
	return identity.SessionID(fmt.Sprintf("lmu-session-%d", counter))
}

func vehicleID(slot VehicleSourceID, generation uint64) identity.VehicleID {
	return identity.VehicleID(fmt.Sprintf("lmu-slot-%d-generation-%d", slot, generation))
}
