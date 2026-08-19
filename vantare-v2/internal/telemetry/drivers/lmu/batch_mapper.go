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
	identitypolicy "github.com/vantare/overlays/v2/internal/telemetry/identity"
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

type batchMapperState struct {
	initialized         bool
	sessionCounter      uint64
	cursor              schema.Cursor
	sessionID           identity.SessionID
	playerID            identity.VehicleID
	lastFresh           sessionSignature
	hasFresh            bool
	lastSourceTime      time.Duration
	hasSourceTime       bool
	frame               uint64
	slotGrace           uint64
	slots               *identitypolicy.SlotTracker[VehicleSourceID]
	slotGraceReopen     uint64
	slotGenerationBumps uint64
}

type BatchMapperConfig struct {
	SlotGraceFrames uint64
}

type BatchMapperMetrics struct {
	SlotGraceReopen     uint64
	SlotGenerationBumps uint64
}

// BatchMapper is a long-lived, synchronous identity owner. It is deliberately
// separate from Driver instances so a transient driver reconnect cannot reset
// event, session, cursor, or source-slot generations.
type BatchMapper struct {
	mu    sync.Mutex
	state batchMapperState
}

type preparedObservation struct {
	candidate batchMapperState
	batch     telemetrycore.Batch
}

// ObservationBatchSink binds the long-lived mapper to the canonical batch
// consumer. DriverManager can reuse this same adapter when it recreates a
// transient Driver, so driver lifetimes never reset canonical identity.
type ObservationBatchSink struct {
	mapper *BatchMapper
	sink   telemetrycore.BatchSink
}

var _ driver.ObservationSink[Observation] = (*ObservationBatchSink)(nil)

func NewBatchMapper(configs ...BatchMapperConfig) *BatchMapper {
	config := BatchMapperConfig{}
	if len(configs) != 0 {
		config = configs[0]
	}
	return &BatchMapper{state: emptyBatchMapperState(config.SlotGraceFrames)}
}

func (mapper *BatchMapper) Metrics() BatchMapperMetrics {
	if mapper == nil {
		return BatchMapperMetrics{}
	}
	mapper.mu.Lock()
	defer mapper.mu.Unlock()
	return BatchMapperMetrics{
		SlotGraceReopen:     mapper.state.slotGraceReopen,
		SlotGenerationBumps: mapper.state.slotGenerationBumps,
	}
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

// IsUnmappableFrame distingue "este frame no describe una sesion mapeable" de
// "el mapper esta mal construido". Los seis errores de validateMapperObservation
// son estados intermedios normales: en menus, boxes, pantallas de carga y
// cambios de sesion la memoria compartida publica buffers que aun no describen
// una sesion coherente.
//
// El mapper los sigue devolviendo: clasificar es su trabajo. Quien decide que no
// son fatales es el consumidor, que ademas los contabiliza como rechazados. Sin
// esa distincion cualquiera de ellos llegaba hasta DriverManager, que no los
// reconoce como reintentables y llamaba a setTerminal: un unico frame de garaje
// apagaba la telemetria hasta reiniciar la aplicacion.
func IsUnmappableFrame(err error) bool {
	return errors.Is(err, ErrIncompatibleObservation) ||
		errors.Is(err, ErrInvalidSessionIdentity) ||
		errors.Is(err, ErrInvalidVehicleCount) ||
		errors.Is(err, ErrInvalidSourceSlot) ||
		errors.Is(err, ErrDuplicateSourceSlot) ||
		errors.Is(err, ErrInvalidPlayerIdentity)
}

func emptyBatchMapperState(grace uint64) batchMapperState {
	if grace == 0 {
		grace = identitypolicy.DefaultSlotGraceFrames
	}
	return batchMapperState{
		slotGrace: grace,
		slots:     identitypolicy.NewSlotTracker[VehicleSourceID](grace),
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

	prepared, err := mapper.prepareObservation(observation)
	if err != nil {
		return err
	}
	if err := sink.WriteBatch(ctx, prepared.batch); err != nil {
		return fmt.Errorf("write mapped LMU batch: %w", err)
	}
	mapper.commit(prepared)
	return nil
}

// prepareObservation builds an owned candidate. In particular, advancing the
// candidate cursor does not advance the mapper cursor visible to the next
// observation; commit happens only after the complete engine apply succeeds.
func (mapper *BatchMapper) prepareObservation(observation Observation) (preparedObservation, error) {
	candidate := cloneBatchMapperState(mapper.state)
	batch, err := candidate.mapObservation(observation)
	if err != nil {
		return preparedObservation{}, err
	}
	batch.State.Vehicles = append([]telemetrycore.VehicleState(nil), batch.State.Vehicles...)
	return preparedObservation{candidate: candidate, batch: batch}, nil
}

func (mapper *BatchMapper) commit(prepared preparedObservation) {
	mapper.state = prepared.candidate
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
	// A usable but stale P->Q signature is not authority to merge Q into P.
	// Open a boundary when it disagrees with the last fresh signature; only a
	// fresh signature becomes the new baseline.
	if !sessionBoundary && !first && state.hasFresh && signature != state.lastFresh {
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
		state.frame = 0
		state.slots = identitypolicy.NewSlotTracker[VehicleSourceID](state.slotGrace)
	}
	state.frame++

	vehicles := make([]telemetrycore.VehicleState, len(observation.Vehicles))
	var observedPlayer identity.VehicleID
	for index, source := range observation.Vehicles {
		fingerprint := slotFingerprint(source)
		outcome := state.slots.Observe(source.SourceID, fingerprint, state.frame)
		if outcome.Reopened {
			state.slotGraceReopen++
		}
		if outcome.Bumped {
			state.slotGenerationBumps++
		}
		mappedVehicleID := vehicleID(source.SourceID, outcome.Generation)
		vehicles[index] = mapVehicle(source, mappedVehicleID, state.sessionID)
		if playerSlot != nil && source.SourceID == *playerSlot {
			observedPlayer = mappedVehicleID
		}
	}

	state.playerID = observedPlayer

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

func slotFingerprint(source VehicleObservation) identitypolicy.SlotFingerprint {
	driverName, _ := usableField(source.DriverName)
	class, _ := usableField(source.VehicleClass)
	return identitypolicy.SlotFingerprint{
		SourceKey: fmt.Sprint(source.SourceID),
		Driver:    string(driverName),
		Class:     string(class),
	}
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
	driverName, _ := usableField(source.DriverName)
	return telemetrycore.VehicleState{
		Identity:         identity.RunIdentity{Event: batchEventID, Session: sessionID, Vehicle: id, Driver: identity.DriverID(driverName)},
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
		DeltaBest:        source.DeltaBest,
		WorldPosition:    source.WorldPosition,
		LocalVelocity:    source.LocalVelocity,
		Orientation:      source.Orientation,
	}
}

func cloneBatchMapperState(input batchMapperState) batchMapperState {
	result := input
	result.slots = input.slots.Clone()
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
