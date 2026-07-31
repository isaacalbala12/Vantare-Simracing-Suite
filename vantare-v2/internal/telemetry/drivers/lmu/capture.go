package lmu

import (
	"encoding/binary"
	"errors"
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
	ids     map[int32]int32
	nextID  int32
}

func NewFrameSanitizer(build BuildEvidence) (*FrameSanitizer, error) {
	profile := profileFromBuild(build)
	if !profile.supported {
		return nil, ErrUnsanitizableFrame
	}
	return &FrameSanitizer{
		profile: profile, ids: make(map[int32]int32), nextID: -1,
	}, nil
}

func (sanitizer *FrameSanitizer) Sanitize(input []byte) ([]byte, error) {
	if sanitizer == nil || len(input) != ObjectOutSize {
		return nil, ErrUnsanitizableFrame
	}
	if observation, err := parseWithProfile(input, time.Unix(1, 0).UTC(), sanitizer.profile); err != nil ||
		observation.Compatibility != CompatibilityKnown {
		return nil, ErrUnsanitizableFrame
	}
	output := make([]byte, ObjectOutSize)
	copyRange(output, input, 1696, 4) // session type
	copyRange(output, input, 1700, 8) // source time
	copyRange(output, input, 1736, 4) // vehicle count
	copyRange(output, input, 1740, 1) // phase
	if !writeCString(output[1632:1696], "Track-01") {
		return nil, ErrUnsanitizableFrame
	}

	playerIndex := int(input[128465])
	playerPresent := input[128466] == 1
	output[128465] = input[128465]
	output[128466] = input[128466]
	if !playerPresent {
		return output, nil
	}
	scoringBase, ok := playerScoringEvidence(
		input,
		int32(binary.LittleEndian.Uint32(input[1736:])),
		playerIndex,
	)
	if !ok {
		return nil, ErrUnsanitizableFrame
	}
	telemetryBase := telemetryOffset + playerIndex*telemetryStride
	identifier := sanitizer.remapID(
		int32(binary.LittleEndian.Uint32(input[telemetryBase:])),
	)
	binary.LittleEndian.PutUint32(output[telemetryBase:], uint32(identifier))
	binary.LittleEndian.PutUint32(output[scoringBase:], uint32(identifier))
	if !writeCString(output[telemetryBase+32:telemetryBase+96], "Vehicle-01") ||
		!writeCString(output[telemetryBase+96:telemetryBase+160], "Track-01") ||
		!writeCString(output[scoringBase+36:scoringBase+100], "Vehicle-01") {
		return nil, ErrUnsanitizableFrame
	}
	output[scoringBase+scoringIsPlayerOffset] = 1
	output[scoringBase+scoringInPitsOffset] = input[scoringBase+scoringInPitsOffset]
	for _, span := range []struct {
		offset int
		size   int
	}{
		{telemetryBase + 20, 4},
		{telemetryBase + 184, 8},
		{telemetryBase + 192, 8},
		{telemetryBase + 200, 8},
		{telemetryBase + 352, 4},
		{telemetryBase + 356, 8},
		{telemetryBase + 420, 8},
		{telemetryBase + 428, 8},
		{telemetryBase + 444, 8},
	} {
		copyRange(output, input, span.offset, span.size)
	}
	return output, nil
}

func (sanitizer *FrameSanitizer) remapID(value int32) int32 {
	sanitizer.mu.Lock()
	defer sanitizer.mu.Unlock()
	if mapped, ok := sanitizer.ids[value]; ok {
		return mapped
	}
	mapped := sanitizer.nextID
	sanitizer.nextID--
	if mapped == value {
		mapped = sanitizer.nextID
		sanitizer.nextID--
	}
	sanitizer.ids[value] = mapped
	return mapped
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
