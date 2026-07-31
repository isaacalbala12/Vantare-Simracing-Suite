package lmu

import (
	"encoding/binary"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

var ErrUnsanitizableFrame = errors.New("LMU frame cannot be sanitized safely")

const diagnosticCaptureRateHz = 5

type SanitizedFrame struct {
	CapturedAtUTC time.Time
	Payload       []byte
}

type CaptureTapStats struct {
	Offered uint64
	Dropped uint64
	Skipped uint64
	Closed  bool
}

// CaptureTap is an optional, bounded diagnostic queue. Driver.Run is its only
// producer and closes it during teardown. There is no goroutine or second
// shared-memory reader hidden behind this type.
type CaptureTap struct {
	mu       sync.Mutex
	frames   chan SanitizedFrame
	closed   bool
	reserved int
	offered  atomic.Uint64
	dropped  atomic.Uint64
	skipped  atomic.Uint64
	lastAt   time.Time
}

func NewCaptureTap(capacity int) (*CaptureTap, error) {
	if capacity < 1 || capacity > 64 {
		return nil, errors.New("invalid LMU diagnostic capture tap capacity")
	}
	return &CaptureTap{frames: make(chan SanitizedFrame, capacity)}, nil
}

func (tap *CaptureTap) Frames() <-chan SanitizedFrame { return tap.frames }

type CaptureReservation struct {
	tap    *CaptureTap
	at     time.Time
	active bool
}

// Reserve performs all rate and capacity checks before the caller allocates a
// sanitized ObjectOut frame. A successful reservation must be committed or
// dropped exactly once.
func (tap *CaptureTap) Reserve(at time.Time) (CaptureReservation, bool) {
	if tap == nil || at.IsZero() || at.Location() != time.UTC {
		if tap != nil {
			tap.dropped.Add(1)
		}
		return CaptureReservation{}, false
	}
	tap.mu.Lock()
	defer tap.mu.Unlock()
	if tap.closed {
		tap.dropped.Add(1)
		return CaptureReservation{}, false
	}
	if len(tap.frames)+tap.reserved >= cap(tap.frames) {
		tap.dropped.Add(1)
		return CaptureReservation{}, false
	}
	if !tap.lastAt.IsZero() && at.Sub(tap.lastAt) < time.Second/diagnosticCaptureRateHz {
		tap.skipped.Add(1)
		return CaptureReservation{}, false
	}
	tap.lastAt = at
	tap.reserved++
	return CaptureReservation{tap: tap, at: at, active: true}, true
}

func (reservation *CaptureReservation) Commit(payload []byte) bool {
	return reservation.commit(payload, true)
}

func (reservation *CaptureReservation) commitOwned(payload []byte) bool {
	return reservation.commit(payload, false)
}

func (reservation *CaptureReservation) commit(payload []byte, copyPayload bool) bool {
	if reservation == nil || !reservation.active || reservation.tap == nil {
		return false
	}
	reservation.active = false
	tap := reservation.tap
	tap.mu.Lock()
	defer tap.mu.Unlock()
	tap.reserved--
	if len(payload) != ObjectOutSize || tap.closed ||
		len(tap.frames) >= cap(tap.frames) {
		tap.dropped.Add(1)
		return false
	}
	if copyPayload {
		payload = append([]byte(nil), payload...)
	}
	tap.frames <- SanitizedFrame{CapturedAtUTC: reservation.at, Payload: payload}
	tap.offered.Add(1)
	return true
}

func (reservation *CaptureReservation) Drop() {
	if reservation == nil || !reservation.active || reservation.tap == nil {
		return
	}
	reservation.active = false
	tap := reservation.tap
	tap.mu.Lock()
	tap.reserved--
	tap.mu.Unlock()
	tap.dropped.Add(1)
}

func (tap *CaptureTap) Close() {
	if tap == nil {
		return
	}
	tap.mu.Lock()
	defer tap.mu.Unlock()
	if tap.closed {
		return
	}
	tap.closed = true
	close(tap.frames)
}

func (tap *CaptureTap) Stats() CaptureTapStats {
	if tap == nil {
		return CaptureTapStats{}
	}
	tap.mu.Lock()
	closed := tap.closed
	tap.mu.Unlock()
	return CaptureTapStats{
		Offered: tap.offered.Load(),
		Dropped: tap.dropped.Load(),
		Skipped: tap.skipped.Load(),
		Closed:  closed,
	}
}

// FrameSanitizer rebuilds a known LMU_Data frame from zero. Only offsets
// consumed by the audited parser are retained; all free text and IDs are
// replaced with capture-local aliases.
type FrameSanitizer struct {
	profile compatibilityProfile
	mu      sync.Mutex
	ids     map[int32]sanitizedIdentity
	usedIDs map[int32]struct{}
	next    int
	nextID  int64
}

type sanitizedIdentity struct {
	ID    int32
	Alias int
}

func NewFrameSanitizer(build BuildEvidence) (*FrameSanitizer, error) {
	profile := profileFromBuild(build)
	if !profile.supported {
		return nil, ErrUnsanitizableFrame
	}
	return &FrameSanitizer{
		profile: profile,
		ids:     make(map[int32]sanitizedIdentity),
		usedIDs: make(map[int32]struct{}),
		next:    1,
		nextID:  1_000_001,
	}, nil
}

func (sanitizer *FrameSanitizer) Sanitize(input []byte) ([]byte, error) {
	if sanitizer == nil || len(input) != ObjectOutSize {
		return nil, ErrUnsanitizableFrame
	}
	observation, err := parseWithProfile(input, time.Unix(1, 0).UTC(), sanitizer.profile)
	if err != nil ||
		observation.Compatibility != CompatibilityKnown {
		return nil, ErrUnsanitizableFrame
	}
	output := make([]byte, ObjectOutSize)
	for _, field := range []layoutField{
		lmu13Layout.Session.SessionType,
		lmu13Layout.Session.CurrentTime,
		lmu13Layout.Session.EndTime,
		lmu13Layout.Session.MaximumLaps,
		lmu13Layout.Session.VehicleCount,
	} {
		copyLayoutField(output, input, field, 0)
	}
	if !writeCString(
		output[lmu13Layout.Session.TrackName.Offset:lmu13Layout.Session.TrackName.end()],
		"Track-01",
	) {
		return nil, ErrUnsanitizableFrame
	}

	playerID := VehicleSourceID(-1)
	for _, vehicle := range observation.Vehicles {
		if player, present := vehicle.Player.Value(); present && player {
			playerID = vehicle.SourceID
			break
		}
	}
	count := len(observation.Vehicles)
	forbiddenIDs := make(map[int32]struct{}, count)
	for _, row := range observation.Vehicles {
		forbiddenIDs[int32(row.SourceID)] = struct{}{}
	}
	for row := 0; row < count; row++ {
		base, _ := lmu13Layout.ScoringRows.rowBase(row)
		sourceID := readInt32(input, base+lmu13Layout.Scoring.VehicleSourceSlot.Offset)
		identity, ok := sanitizer.remapID(sourceID, forbiddenIDs)
		if !ok {
			return nil, ErrUnsanitizableFrame
		}
		binary.LittleEndian.PutUint32(
			output[base+lmu13Layout.Scoring.VehicleSourceSlot.Offset:],
			uint32(identity.ID),
		)
		for _, field := range []layoutField{
			lmu13Layout.Scoring.CompletedLaps,
			lmu13Layout.Scoring.Sector,
			lmu13Layout.Scoring.LapDistance,
			lmu13Layout.Scoring.BestLapTime,
			lmu13Layout.Scoring.LastLapTime,
			lmu13Layout.Scoring.PitStopCount,
			lmu13Layout.Scoring.PenaltyCount,
			lmu13Layout.Scoring.PlayerMarker,
			lmu13Layout.Scoring.InPits,
			lmu13Layout.Scoring.Position,
			lmu13Layout.Scoring.TimeBehindNext,
			lmu13Layout.Scoring.LapsBehindNext,
			lmu13Layout.Scoring.TimeBehindLeader,
			lmu13Layout.Scoring.LapsBehindLeader,
			lmu13Layout.Scoring.EstimatedLapTime,
		} {
			copyLayoutField(output, input, field, base)
		}
		if !writeCString(
			output[base+lmu13Layout.Scoring.DriverLabel.Offset:base+lmu13Layout.Scoring.DriverLabel.end()],
			fmt.Sprintf("Driver-%03d", identity.Alias),
		) || !writeCString(
			output[base+lmu13Layout.Scoring.VehicleLabel.Offset:base+lmu13Layout.Scoring.VehicleLabel.end()],
			fmt.Sprintf("Vehicle-%03d", identity.Alias),
		) || !writeCString(
			output[base+lmu13Layout.Scoring.VehicleClass.Offset:base+lmu13Layout.Scoring.VehicleClass.end()],
			fmt.Sprintf("Class-%03d", identity.Alias),
		) {
			return nil, ErrUnsanitizableFrame
		}
	}
	for row := 0; row < count; row++ {
		base, _ := lmu13Layout.TelemetryRows.rowBase(row)
		sourceID := readInt32(input, base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset)
		identity, ok := sanitizer.remapID(sourceID, forbiddenIDs)
		if !ok {
			return nil, ErrUnsanitizableFrame
		}
		binary.LittleEndian.PutUint32(
			output[base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset:],
			uint32(identity.ID),
		)
		if VehicleSourceID(sourceID) != playerID {
			continue
		}
		for _, field := range []layoutField{
			lmu13Layout.Telemetry.LapNumber,
			lmu13Layout.Telemetry.LocalVelocity,
			lmu13Layout.Telemetry.Gear,
			lmu13Layout.Telemetry.EngineRPM,
			lmu13Layout.Telemetry.Throttle,
			lmu13Layout.Telemetry.Brake,
			lmu13Layout.Telemetry.Clutch,
			lmu13Layout.Telemetry.FuelLiters,
			lmu13Layout.Telemetry.FuelCapacityLiters,
		} {
			copyLayoutField(output, input, field, base)
		}
	}
	return output, nil
}

func (sanitizer *FrameSanitizer) remapID(value int32, forbidden map[int32]struct{}) (sanitizedIdentity, bool) {
	sanitizer.mu.Lock()
	defer sanitizer.mu.Unlock()
	if mapped, ok := sanitizer.ids[value]; ok {
		if _, collision := forbidden[mapped.ID]; !collision {
			return mapped, true
		}
		mappedID, available := sanitizer.allocateID(forbidden)
		if !available {
			return sanitizedIdentity{}, false
		}
		mapped.ID = mappedID
		sanitizer.ids[value] = mapped
		return mapped, true
	}
	alias := sanitizer.next
	sanitizer.next++
	mapped, available := sanitizer.allocateID(forbidden)
	if !available {
		return sanitizedIdentity{}, false
	}
	identity := sanitizedIdentity{ID: mapped, Alias: alias}
	sanitizer.ids[value] = identity
	return identity, true
}

func (sanitizer *FrameSanitizer) allocateID(forbidden map[int32]struct{}) (int32, bool) {
	const maximumInt32 = int64(1<<31 - 1)
	for sanitizer.nextID <= maximumInt32 {
		candidate := int32(sanitizer.nextID)
		sanitizer.nextID++
		if _, collision := forbidden[candidate]; collision {
			continue
		}
		if _, used := sanitizer.usedIDs[candidate]; used {
			continue
		}
		sanitizer.usedIDs[candidate] = struct{}{}
		return candidate, true
	}
	return 0, false
}

func copyLayoutField(destination, source []byte, field layoutField, base int) {
	copyRange(destination, source, base+field.Offset, field.width())
}

func copyRange(destination, source []byte, offset, size int) {
	copy(destination[offset:offset+size], source[offset:offset+size])
}

func writeCString(destination []byte, value string) bool {
	clear(destination)
	if len(value) >= len(destination) {
		return false
	}
	copy(destination, value)
	return true
}
