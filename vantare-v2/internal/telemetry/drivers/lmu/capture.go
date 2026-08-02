package lmu

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

var ErrUnsanitizableFrame = errors.New("LMU frame cannot be sanitized safely")

var ErrDiagnosticCapture = errors.New("LMU diagnostic capture failed")

const (
	diagnosticCaptureRateHz       = 5
	diagnosticCaptureAttempts     = 20
	diagnosticCaptureWindow       = 250 * time.Millisecond
	diagnosticCaptureRetrySpacing = 10 * time.Millisecond
)

type SanitizationFailureCode string

const (
	SanitizationSize                 SanitizationFailureCode = "size"
	SanitizationParser               SanitizationFailureCode = "parser"
	SanitizationVehicleCount         SanitizationFailureCode = "vehicle-count"
	SanitizationSessionString        SanitizationFailureCode = "session-string"
	SanitizationSessionValues        SanitizationFailureCode = "session-values"
	SanitizationTelemetryID          SanitizationFailureCode = "telemetry-id"
	SanitizationTelemetryIDDuplicate SanitizationFailureCode = "telemetry-id-duplicate"
	SanitizationScoringString        SanitizationFailureCode = "scoring-string"
	SanitizationScoringBoolean       SanitizationFailureCode = "scoring-boolean"
	SanitizationScoringFinite        SanitizationFailureCode = "scoring-finite"
	SanitizationScoringCompletedLaps SanitizationFailureCode = "scoring-completed-laps"
	SanitizationScoringSector        SanitizationFailureCode = "scoring-sector"
	SanitizationScoringPosition      SanitizationFailureCode = "scoring-position"
	SanitizationScoringPitStops      SanitizationFailureCode = "scoring-pit-stops"
	SanitizationScoringPenalties     SanitizationFailureCode = "scoring-penalties"
	SanitizationScoringLapsNext      SanitizationFailureCode = "scoring-laps-next"
	SanitizationScoringLapsLeader    SanitizationFailureCode = "scoring-laps-leader"
	SanitizationScoringLapTime       SanitizationFailureCode = "scoring-lap-time"
	SanitizationScoringID            SanitizationFailureCode = "scoring-id"
	SanitizationScoringIDDuplicate   SanitizationFailureCode = "scoring-id-duplicate"
	SanitizationIDBijection          SanitizationFailureCode = "id-bijection"
	SanitizationPlayerDuplicate      SanitizationFailureCode = "player-duplicate"
	SanitizationAlias                SanitizationFailureCode = "alias"
	SanitizationUnknown              SanitizationFailureCode = "unknown"
)

// sanitizationFailure contains a closed code only. It must never retain source
// bytes, values, row numbers, names or offsets.
type sanitizationFailure struct {
	code SanitizationFailureCode
}

func (failure sanitizationFailure) Error() string {
	return fmt.Sprintf("%s: %s", ErrUnsanitizableFrame, failure.code)
}

func (failure sanitizationFailure) Unwrap() error { return ErrUnsanitizableFrame }

func SanitizationCode(err error) (SanitizationFailureCode, bool) {
	var failure sanitizationFailure
	if !errors.As(err, &failure) {
		return "", false
	}
	return failure.code, true
}

func sanitizationError(code SanitizationFailureCode) error {
	return sanitizationFailure{code: code}
}

type DiagnosticRetryError struct {
	attempts int
	counts   map[string]int
	last     error
}

func (failure *DiagnosticRetryError) Error() string {
	if failure == nil {
		return ErrDiagnosticCapture.Error()
	}
	codes := make([]string, 0, len(failure.counts))
	for code := range failure.counts {
		codes = append(codes, code)
	}
	slices.Sort(codes)
	parts := make([]string, 0, len(codes))
	for _, code := range codes {
		parts = append(parts, fmt.Sprintf("%s=%d", code, failure.counts[code]))
	}
	return fmt.Sprintf("%s: attempts exhausted after %d: %s", ErrDiagnosticCapture, failure.attempts, strings.Join(parts, ","))
}

func (failure *DiagnosticRetryError) Unwrap() []error {
	if failure == nil || failure.last == nil {
		return []error{ErrDiagnosticCapture}
	}
	return []error{ErrDiagnosticCapture, failure.last}
}

func (failure *DiagnosticRetryError) AttemptCount() int {
	if failure == nil {
		return 0
	}
	return failure.attempts
}

func (failure *DiagnosticRetryError) FailureCounts() map[string]int {
	result := make(map[string]int)
	if failure == nil {
		return result
	}
	for code, count := range failure.counts {
		result[code] = count
	}
	return result
}

type SanitizedFrame struct {
	CapturedAtUTC time.Time
	Payload       []byte
}

type DiagnosticCaptureKind string

const (
	DiagnosticCaptureSharedMemory DiagnosticCaptureKind = "lmu-shared-memory"
	DiagnosticCaptureREST         DiagnosticCaptureKind = "lmu-rest-overlap"
)

// DiagnosticCaptureArtifact is safe to persist only after construction by
// this package. Payload is either a D4A zero-rebuilt frame or the closed REST
// overlap document; Summary never contains raw response data or source names.
type DiagnosticCaptureArtifact struct {
	kind          DiagnosticCaptureKind
	capturedAtUTC time.Time
	payload       []byte
	sha256        string
	summary       string
	// sourceTrackDigest exists only in memory long enough to correlate the
	// sanitized Shared Memory capture with REST. The original track name is
	// never retained or persisted.
	sourceTrackDigest    [sha256.Size]byte
	sourceTrackDigestSet bool
}

func (artifact DiagnosticCaptureArtifact) Kind() DiagnosticCaptureKind { return artifact.kind }
func (artifact DiagnosticCaptureArtifact) CapturedAtUTC() time.Time    { return artifact.capturedAtUTC }
func (artifact DiagnosticCaptureArtifact) SHA256() string              { return artifact.sha256 }
func (artifact DiagnosticCaptureArtifact) Summary() string             { return artifact.summary }

type DiagnosticProbeResult struct {
	Kind    DiagnosticCaptureKind
	SHA256  string
	Summary string
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

// newDiagnosticFrameSanitizer accepts only the exact diagnostic candidate
// build. The returned sanitizer cannot alter supportedVersion or the
// production allowlist.
func newDiagnosticFrameSanitizer(build BuildEvidence) (*FrameSanitizer, error) {
	profile, ok := diagnosticCandidateProfile(build)
	if !ok {
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

// CaptureSanitizedSharedMemory takes one stable snapshot from the modular LMU
// mapping. Raw bytes are cleared before return and never leave this package.
func CaptureSanitizedSharedMemory(ctx context.Context) (DiagnosticCaptureArtifact, error) {
	if ctx == nil {
		return DiagnosticCaptureArtifact{}, ErrDiagnosticCapture
	}
	bounded, cancel := context.WithTimeout(ctx, diagnosticCaptureWindow)
	defer cancel()
	return captureSanitizedSharedMemory(bounded, readLMUBuildEvidence, openSharedMemory, time.Now)
}

// ProbeSanitizedSharedMemory runs the complete candidate validation without
// persisting an artifact. Only its closed summary and digest leave this
// package; the sanitized payload is cleared before return.
func ProbeSanitizedSharedMemory(ctx context.Context) (DiagnosticProbeResult, error) {
	artifact, err := CaptureSanitizedSharedMemory(ctx)
	if err != nil {
		return DiagnosticProbeResult{}, err
	}
	result := DiagnosticProbeResult{
		Kind:    artifact.kind,
		SHA256:  artifact.sha256,
		Summary: artifact.summary,
	}
	clear(artifact.payload)
	return result, nil
}

func captureSanitizedSharedMemory(
	ctx context.Context,
	build buildProvider,
	open openMemory,
	now func() time.Time,
) (DiagnosticCaptureArtifact, error) {
	return captureSanitizedSharedMemoryWithRetry(ctx, build, open, now, waitDiagnosticCaptureRetry)
}

type diagnosticRetryWait func(context.Context) error

func captureSanitizedSharedMemoryWithRetry(
	ctx context.Context,
	build buildProvider,
	open openMemory,
	now func() time.Time,
	wait diagnosticRetryWait,
) (artifact DiagnosticCaptureArtifact, resultErr error) {
	if ctx == nil || build == nil || open == nil || now == nil || wait == nil {
		return DiagnosticCaptureArtifact{}, ErrDiagnosticCapture
	}
	if err := ctx.Err(); err != nil {
		return DiagnosticCaptureArtifact{}, err
	}
	evidence, err := build()
	if err != nil {
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: read build evidence", ErrDiagnosticCapture)
	}
	sanitizer, err := newDiagnosticFrameSanitizer(evidence)
	if err != nil {
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: build is not the diagnostic candidate", ErrDiagnosticCapture)
	}
	reader, err := open()
	if err != nil {
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: open shared memory", ErrDiagnosticCapture)
	}
	defer func() {
		if closeErr := reader.Close(); closeErr != nil {
			resultErr = errors.Join(resultErr, fmt.Errorf("%w: close shared memory", ErrDiagnosticCapture))
		}
	}()
	input := make([]byte, ObjectOutSize)
	scratch := make([]byte, ObjectOutSize)
	defer clear(input)
	defer clear(scratch)
	failures := make(map[string]int)
	var lastFailure error
	for attempt := 1; attempt <= diagnosticCaptureAttempts; attempt++ {
		if err := readStable(ctx, reader, input, scratch, defaultStableComparisons); err != nil {
			if ctx.Err() != nil {
				return DiagnosticCaptureArtifact{}, diagnosticRetryResult(ctx.Err(), attempt-1, failures, lastFailure)
			}
			if errors.Is(err, ErrIncompatibleBuffer) {
				return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: stable snapshot unavailable: %w", ErrDiagnosticCapture, sanitizationError(SanitizationSize))
			}
			code := "snapshot-read"
			if errors.Is(err, ErrIncoherentSnapshot) {
				code = "snapshot-unstable"
			}
			failures[code]++
			lastFailure = err
		} else {
			captured, err := buildSharedMemoryDiagnosticArtifact(input, now().Round(0).UTC(), sanitizer)
			if err == nil {
				return captured, nil
			}
			code, retryable := retryableSanitizationFailure(err)
			if !retryable {
				return DiagnosticCaptureArtifact{}, err
			}
			failures[string(code)]++
			lastFailure = err
		}
		if attempt == diagnosticCaptureAttempts {
			return DiagnosticCaptureArtifact{}, newDiagnosticRetryError(attempt, failures, lastFailure)
		}
		if err := wait(ctx); err != nil {
			return DiagnosticCaptureArtifact{}, diagnosticRetryResult(err, attempt, failures, lastFailure)
		}
	}
	return DiagnosticCaptureArtifact{}, newDiagnosticRetryError(diagnosticCaptureAttempts, failures, lastFailure)
}

func waitDiagnosticCaptureRetry(ctx context.Context) error {
	timer := time.NewTimer(diagnosticCaptureRetrySpacing)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func diagnosticRetryResult(
	err error,
	attempts int,
	counts map[string]int,
	last error,
) error {
	if errors.Is(err, context.DeadlineExceeded) && attempts > 0 {
		return newDiagnosticRetryError(attempts, counts, last)
	}
	return err
}

func newDiagnosticRetryError(attempts int, counts map[string]int, last error) error {
	copyCounts := make(map[string]int, len(counts))
	for code, count := range counts {
		copyCounts[code] = count
	}
	return &DiagnosticRetryError{attempts: attempts, counts: copyCounts, last: last}
}

func retryableSanitizationFailure(err error) (SanitizationFailureCode, bool) {
	code, present := SanitizationCode(err)
	if !present {
		return "", false
	}
	switch code {
	case SanitizationVehicleCount,
		SanitizationSessionString,
		SanitizationSessionValues,
		SanitizationTelemetryID,
		SanitizationTelemetryIDDuplicate,
		SanitizationScoringString,
		SanitizationScoringBoolean,
		SanitizationScoringFinite,
		SanitizationScoringCompletedLaps,
		SanitizationScoringSector,
		SanitizationScoringPosition,
		SanitizationScoringPitStops,
		SanitizationScoringPenalties,
		SanitizationScoringLapsNext,
		SanitizationScoringLapsLeader,
		SanitizationScoringLapTime,
		SanitizationScoringID,
		SanitizationScoringIDDuplicate,
		SanitizationIDBijection,
		SanitizationPlayerDuplicate:
		return code, true
	default:
		return code, false
	}
}

func buildSharedMemoryDiagnosticArtifact(
	input []byte,
	capturedAt time.Time,
	sanitizer *FrameSanitizer,
) (DiagnosticCaptureArtifact, error) {
	if sanitizer == nil || capturedAt.IsZero() || capturedAt.Location() != time.UTC {
		return DiagnosticCaptureArtifact{}, ErrDiagnosticCapture
	}
	payload, err := sanitizer.Sanitize(input)
	if err != nil {
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: sanitize shared memory: %w", ErrDiagnosticCapture, err)
	}
	parsed, err := parseWithProfile(payload, capturedAt, sanitizer.profile)
	if err != nil || parsed.Compatibility != CompatibilityKnown {
		clear(payload)
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: sanitized replay rejected", ErrDiagnosticCapture)
	}
	sourceTrack, sourceTrackOK := readCStringField(input, lmu13Layout.Session.TrackName, 0, true)
	if !sourceTrackOK {
		clear(payload)
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: source track unavailable", ErrDiagnosticCapture)
	}
	track, _ := parsed.TrackName.Value()
	vehicles, _ := parsed.VehicleCount.Value()
	player, _ := parsed.PlayerPresent.Value()
	sourceTime, _ := parsed.SourceTime.Value()
	sessionType, _ := parsed.SessionType.Value()
	artifact := newDiagnosticArtifact(
		DiagnosticCaptureSharedMemory,
		capturedAt,
		payload,
		fmt.Sprintf(
			"build=%s track=%s session=%s source_time=%.3fs vehicles=%d player=%t",
			sanitizer.profile.version,
			track,
			diagnosticSessionType(sessionType),
			sourceTime.Seconds(),
			vehicles,
			player,
		),
	)
	artifact.sourceTrackDigest = sha256.Sum256([]byte(normalizeTrackName(sourceTrack)))
	artifact.sourceTrackDigestSet = true
	return artifact, nil
}

// CaptureSanitizedREST decodes the loopback REST endpoints first and only then
// serializes the closed session/player overlap. A non-live response is
// admissible only beside a valid no-player menu frame, where every overlap is
// forced to missing. Original bodies never reach the artifact.
func CaptureSanitizedREST(
	ctx context.Context,
	sharedMemory DiagnosticCaptureArtifact,
) (DiagnosticCaptureArtifact, error) {
	started := time.Now()
	cfg := normalizeRESTConfig(defaultRESTConfig(), time.Now, func() time.Duration {
		return time.Since(started)
	})
	return captureSanitizedRESTForSharedMemory(ctx, cfg, sharedMemory)
}

func captureSanitizedRESTForSharedMemory(
	ctx context.Context,
	cfg *restConfig,
	sharedMemory DiagnosticCaptureArtifact,
) (DiagnosticCaptureArtifact, error) {
	if ctx == nil || cfg == nil {
		return DiagnosticCaptureArtifact{}, ErrDiagnosticCapture
	}
	shared, err := parseDiagnosticSharedMemoryArtifact(sharedMemory)
	if err != nil {
		return DiagnosticCaptureArtifact{}, err
	}
	observation, complete := pollREST(ctx, cfg, &restCache{})
	if err := ctx.Err(); err != nil {
		return DiagnosticCaptureArtifact{}, err
	}
	if observation.REST.Standings.Status == RESTEndpointMalformed ||
		observation.REST.SessionInfo.Status == RESTEndpointMalformed {
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: malformed REST response", ErrDiagnosticCapture)
	}
	player, playerKnown := shared.PlayerPresent.Value()
	if !playerKnown {
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: Shared Memory player state is not usable", ErrDiagnosticCapture)
	}
	if !player {
		if complete {
			return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: live REST is not admissible for menu capture", ErrDiagnosticCapture)
		}
		status, allowed := diagnosticMenuRESTStatus(observation.REST)
		if !allowed {
			return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: REST menu status is not admissible", ErrDiagnosticCapture)
		}
		return buildRESTStatusArtifact(observation, status)
	}
	if !complete {
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: REST overlap is not live for track capture", ErrDiagnosticCapture)
	}
	if !diagnosticRESTCorrelatesWithShared(
		shared,
		observation.REST,
		sharedMemory.sourceTrackDigest,
		sharedMemory.sourceTrackDigestSet,
	) {
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: REST overlap is not correlated", ErrDiagnosticCapture)
	}
	return buildRESTOverlapArtifact(observation)
}

func parseDiagnosticSharedMemoryArtifact(artifact DiagnosticCaptureArtifact) (Observation, error) {
	if artifact.kind != DiagnosticCaptureSharedMemory || !artifact.valid() {
		return Observation{}, ErrDiagnosticCapture
	}
	profile, ok := diagnosticCandidateProfile(BuildEvidence{
		FileVersion:    diagnosticLMUVersion,
		ProductVersion: diagnosticLMUVersion,
	})
	if !ok {
		return Observation{}, ErrDiagnosticCapture
	}
	observation, err := parseWithProfile(artifact.payload, artifact.capturedAtUTC, profile)
	if err != nil || observation.Compatibility != CompatibilityKnown {
		return Observation{}, fmt.Errorf("%w: Shared Memory artifact is not replayable", ErrDiagnosticCapture)
	}
	return observation, nil
}

func diagnosticRESTCorrelatesWithShared(
	shared Observation,
	rest RESTObservation,
	sourceTrackDigest [sha256.Size]byte,
	sourceTrackDigestSet bool,
) bool {
	if rest.Status != RESTStatusLive ||
		!freshEqual(shared.SessionType, rest.SessionType) ||
		!freshEqual(shared.VehicleCount, rest.VehicleCount) {
		return false
	}
	restTrack, restTrackPresent := rest.TrackName.Field.Value()
	if !sourceTrackDigestSet || !restTrackPresent ||
		rest.TrackName.Field.Freshness() != schema.FreshnessFresh ||
		sha256.Sum256([]byte(normalizeTrackName(restTrack))) != sourceTrackDigest {
		return false
	}
	sharedPlayer, sharedPlayerPresent := shared.PlayerPresent.Value()
	restPlayer, restPlayerPresent := rest.PlayerPresent.Field.Value()
	if !sharedPlayerPresent || shared.PlayerPresent.Freshness() != schema.FreshnessFresh ||
		!restPlayerPresent || rest.PlayerPresent.Field.Freshness() != schema.FreshnessFresh ||
		!sharedPlayer || !restPlayer {
		return false
	}
	var player VehicleObservation
	playerFound := false
	for _, vehicle := range shared.Vehicles {
		isPlayer, known := vehicle.Player.Value()
		if known && isPlayer {
			player = vehicle
			playerFound = true
			break
		}
	}
	if !playerFound ||
		!freshEqual(player.Position, rest.PlayerPosition) ||
		!freshEqual(player.CompletedLaps, rest.CompletedLaps) ||
		!freshEqual(player.PitStopCount, rest.PitStopCount) {
		return false
	}
	sharedTime, sharedTimePresent := shared.SourceTime.Value()
	restTime, restTimePresent := rest.SourceTime.Field.Value()
	if !sharedTimePresent || shared.SourceTime.Freshness() != schema.FreshnessFresh ||
		!restTimePresent || rest.SourceTime.Field.Freshness() != schema.FreshnessFresh ||
		rest.SourceTime.UpdatedUTC.IsZero() {
		return false
	}
	wallAdvance := rest.SourceTime.UpdatedUTC.Sub(shared.ReceivedUTC)
	if wallAdvance < 0 {
		return false
	}
	difference := sharedTime + wallAdvance - restTime
	if difference < 0 {
		difference = -difference
	}
	return difference <= defaultFreshnessLimit
}

func freshEqual[T comparable](preferred schema.Field[T], alternative TimedField[T]) bool {
	left, leftPresent := preferred.Value()
	right, rightPresent := alternative.Field.Value()
	return leftPresent && rightPresent &&
		preferred.Freshness() == schema.FreshnessFresh &&
		alternative.Field.Freshness() == schema.FreshnessFresh &&
		left == right
}

func diagnosticMenuRESTStatus(rest RESTObservation) (string, bool) {
	status := "unsupported"
	for _, endpoint := range []RESTEndpointStatus{rest.Standings.Status, rest.SessionInfo.Status} {
		switch endpoint {
		case RESTEndpointOffline, RESTEndpointTimeout:
			status = "unavailable"
		case RESTEndpointEmpty:
			if status != "unavailable" {
				status = "empty"
			}
		case RESTEndpointUnsupported:
		default:
			return "", false
		}
	}
	return status, true
}

func buildRESTOverlapArtifact(observation Observation) (DiagnosticCaptureArtifact, error) {
	document := diagnosticRESTDocumentFromObservation(observation)
	return encodeRESTDiagnosticArtifact(document)
}

func buildRESTStatusArtifact(
	observation Observation,
	status string,
) (DiagnosticCaptureArtifact, error) {
	missing := diagnosticRESTField{Freshness: "missing"}
	document := diagnosticRESTDocument{
		Schema:        "vantare.lmu-rest-overlap.v1",
		CapturedAtUTC: observation.ReceivedUTC,
		Status:        status,
		Endpoints: diagnosticRESTEndpoints{
			Standings:   diagnosticMenuRESTEndpointFrom(observation.REST.Standings),
			SessionInfo: diagnosticMenuRESTEndpointFrom(observation.REST.SessionInfo),
		},
		Session: diagnosticRESTSession{
			Track: missing, SourceTimeSeconds: missing, Type: missing, VehicleCount: missing,
		},
		Player: diagnosticRESTPlayer{
			Present: missing, Position: missing, CompletedLaps: missing, PitStopCount: missing,
		},
	}
	return encodeRESTDiagnosticArtifact(document)
}

func diagnosticRESTDocumentFromObservation(observation Observation) diagnosticRESTDocument {
	return diagnosticRESTDocument{
		Schema:        "vantare.lmu-rest-overlap.v1",
		CapturedAtUTC: observation.ReceivedUTC,
		Status:        "live",
		Endpoints: diagnosticRESTEndpoints{
			Standings:   diagnosticRESTEndpointFrom(observation.REST.Standings),
			SessionInfo: diagnosticRESTEndpointFrom(observation.REST.SessionInfo),
		},
		Session: diagnosticRESTSession{
			Track: diagnosticTimedField(observation.REST.TrackName, func(string) any {
				return "Track-01"
			}),
			SourceTimeSeconds: diagnosticTimedField(observation.REST.SourceTime, func(value time.Duration) any {
				return value.Seconds()
			}),
			Type: diagnosticTimedField(observation.REST.SessionType, func(value session.Type) any {
				return diagnosticSessionType(value)
			}),
			VehicleCount: diagnosticInt32TimedField(observation.REST.VehicleCount),
		},
		Player: diagnosticRESTPlayer{
			Present: diagnosticTimedField(observation.REST.PlayerPresent, func(value bool) any {
				return value
			}),
			Position:      diagnosticInt32TimedField(observation.REST.PlayerPosition),
			CompletedLaps: diagnosticInt32TimedField(observation.REST.CompletedLaps),
			PitStopCount:  diagnosticInt32TimedField(observation.REST.PitStopCount),
		},
	}
}

func encodeRESTDiagnosticArtifact(document diagnosticRESTDocument) (DiagnosticCaptureArtifact, error) {
	payload, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return DiagnosticCaptureArtifact{}, fmt.Errorf("%w: encode REST overlap", ErrDiagnosticCapture)
	}
	player, _ := document.Player.Present.Value.(bool)
	vehicles, _ := document.Session.VehicleCount.Value.(int32)
	return newDiagnosticArtifact(
		DiagnosticCaptureREST,
		document.CapturedAtUTC,
		append(payload, '\n'),
		fmt.Sprintf("status=%s vehicles=%d player=%t", document.Status, vehicles, player),
	), nil
}

func diagnosticMenuRESTEndpointFrom(value RESTEndpointSnapshot) diagnosticRESTEndpoint {
	status := "unsupported"
	switch value.Status {
	case RESTEndpointOffline, RESTEndpointTimeout:
		status = "unavailable"
	case RESTEndpointEmpty:
		status = "empty"
	}
	return diagnosticRESTEndpoint{
		Status:         status,
		LastAttemptUTC: value.LastAttemptUTC,
		LastSuccessUTC: value.LastSuccessUTC,
	}
}

func newDiagnosticArtifact(
	kind DiagnosticCaptureKind,
	capturedAt time.Time,
	payload []byte,
	summary string,
) DiagnosticCaptureArtifact {
	digest := sha256.Sum256(payload)
	return DiagnosticCaptureArtifact{
		kind:          kind,
		capturedAtUTC: capturedAt,
		payload:       payload,
		sha256:        hex.EncodeToString(digest[:]),
		summary:       summary,
	}
}

// WriteSanitizedCapture creates a new artifact without replacing an existing
// file. It verifies kind, structure and hash immediately before persistence.
func WriteSanitizedCapture(path string, artifact DiagnosticCaptureArtifact) (resultErr error) {
	if strings.TrimSpace(path) == "" || !artifact.valid() {
		return ErrDiagnosticCapture
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("%w: create output", ErrDiagnosticCapture)
	}
	written := false
	defer func() {
		if !written {
			_ = os.Remove(path)
		}
	}()
	writtenBytes, err := file.Write(artifact.payload)
	if err != nil || writtenBytes != len(artifact.payload) {
		_ = file.Close()
		return fmt.Errorf("%w: write output", ErrDiagnosticCapture)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("%w: sync output", ErrDiagnosticCapture)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("%w: close output", ErrDiagnosticCapture)
	}
	written = true
	return nil
}

// WriteSanitizedCapturePair reserves both destinations before writing either
// payload and removes both reservations after any error. Existing files are
// never opened for writing.
func WriteSanitizedCapturePair(
	sharedPath string,
	shared DiagnosticCaptureArtifact,
	restPath string,
	rest DiagnosticCaptureArtifact,
) (resultErr error) {
	if shared.kind != DiagnosticCaptureSharedMemory || rest.kind != DiagnosticCaptureREST ||
		!shared.valid() || !rest.valid() || strings.TrimSpace(sharedPath) == "" || strings.TrimSpace(restPath) == "" {
		return ErrDiagnosticCapture
	}
	sharedAbsolute, sharedErr := filepath.Abs(sharedPath)
	restAbsolute, restErr := filepath.Abs(restPath)
	if sharedErr != nil || restErr != nil || strings.EqualFold(sharedAbsolute, restAbsolute) {
		return ErrDiagnosticCapture
	}
	for _, path := range []string{sharedPath, restPath} {
		if _, err := os.Lstat(path); err == nil || !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("%w: output already exists or cannot be inspected", ErrDiagnosticCapture)
		}
	}
	sharedFile, err := os.OpenFile(sharedPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("%w: reserve Shared Memory output", ErrDiagnosticCapture)
	}
	restFile, err := os.OpenFile(restPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		_ = sharedFile.Close()
		_ = os.Remove(sharedPath)
		return fmt.Errorf("%w: reserve REST output", ErrDiagnosticCapture)
	}
	complete := false
	defer func() {
		if complete {
			return
		}
		_ = sharedFile.Close()
		_ = restFile.Close()
		_ = os.Remove(sharedPath)
		_ = os.Remove(restPath)
	}()
	if err := writeAndSyncDiagnosticFile(sharedFile, shared.payload); err != nil {
		return err
	}
	if err := writeAndSyncDiagnosticFile(restFile, rest.payload); err != nil {
		return err
	}
	if err := sharedFile.Close(); err != nil {
		return fmt.Errorf("%w: close Shared Memory output", ErrDiagnosticCapture)
	}
	if err := restFile.Close(); err != nil {
		return fmt.Errorf("%w: close REST output", ErrDiagnosticCapture)
	}
	complete = true
	return nil
}

func writeAndSyncDiagnosticFile(file *os.File, payload []byte) error {
	written, err := file.Write(payload)
	if err != nil || written != len(payload) {
		return fmt.Errorf("%w: write output", ErrDiagnosticCapture)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("%w: sync output", ErrDiagnosticCapture)
	}
	return nil
}

func (artifact DiagnosticCaptureArtifact) valid() bool {
	if artifact.capturedAtUTC.IsZero() || artifact.capturedAtUTC.Location() != time.UTC || artifact.summary == "" {
		return false
	}
	digest := sha256.Sum256(artifact.payload)
	if artifact.sha256 != hex.EncodeToString(digest[:]) {
		return false
	}
	switch artifact.kind {
	case DiagnosticCaptureSharedMemory:
		return len(artifact.payload) == ObjectOutSize
	case DiagnosticCaptureREST:
		return json.Valid(artifact.payload)
	default:
		return false
	}
}

type diagnosticRESTDocument struct {
	Schema        string                  `json:"schema"`
	CapturedAtUTC time.Time               `json:"captured_at_utc"`
	Status        string                  `json:"status"`
	Endpoints     diagnosticRESTEndpoints `json:"endpoints"`
	Session       diagnosticRESTSession   `json:"session"`
	Player        diagnosticRESTPlayer    `json:"player"`
}

type diagnosticRESTEndpoints struct {
	Standings   diagnosticRESTEndpoint `json:"standings"`
	SessionInfo diagnosticRESTEndpoint `json:"session_info"`
}

type diagnosticRESTEndpoint struct {
	Status         string    `json:"status"`
	LastAttemptUTC time.Time `json:"last_attempt_utc"`
	LastSuccessUTC time.Time `json:"last_success_utc"`
}

type diagnosticRESTSession struct {
	Track             diagnosticRESTField `json:"track"`
	SourceTimeSeconds diagnosticRESTField `json:"source_time_seconds"`
	Type              diagnosticRESTField `json:"type"`
	VehicleCount      diagnosticRESTField `json:"vehicle_count"`
}

type diagnosticRESTPlayer struct {
	Present       diagnosticRESTField `json:"present"`
	Position      diagnosticRESTField `json:"position"`
	CompletedLaps diagnosticRESTField `json:"completed_laps"`
	PitStopCount  diagnosticRESTField `json:"pit_stop_count"`
}

type diagnosticRESTField struct {
	Freshness  string `json:"freshness"`
	UpdatedUTC string `json:"updated_utc,omitempty"`
	Value      any    `json:"value,omitempty"`
}

func diagnosticRESTEndpointFrom(value RESTEndpointSnapshot) diagnosticRESTEndpoint {
	return diagnosticRESTEndpoint{
		Status:         "fresh",
		LastAttemptUTC: value.LastAttemptUTC,
		LastSuccessUTC: value.LastSuccessUTC,
	}
}

func diagnosticTimedField[T comparable](value TimedField[T], transform func(T) any) diagnosticRESTField {
	result := diagnosticRESTField{Freshness: diagnosticFreshness(value.Field.Freshness())}
	if !value.UpdatedUTC.IsZero() {
		result.UpdatedUTC = value.UpdatedUTC.UTC().Format(time.RFC3339Nano)
	}
	fieldValue, present := value.Field.Value()
	if present {
		result.Value = transform(fieldValue)
	}
	return result
}

func diagnosticInt32TimedField[T ~int32](value TimedField[T]) diagnosticRESTField {
	return diagnosticTimedField(value, func(fieldValue T) any { return int32(fieldValue) })
}

func diagnosticFreshness(value schema.Freshness) string {
	switch value {
	case schema.FreshnessFresh:
		return "fresh"
	case schema.FreshnessStale:
		return "stale"
	case schema.FreshnessInvalid:
		return "invalid"
	default:
		return "missing"
	}
}

func diagnosticSessionType(value session.Type) string {
	switch value {
	case session.TypePractice:
		return "practice"
	case session.TypeQualifying:
		return "qualifying"
	case session.TypeRace:
		return "race"
	case session.TypeWarmup:
		return "warmup"
	case session.TypeEndurance:
		return "endurance"
	default:
		return "invalid"
	}
}

func (sanitizer *FrameSanitizer) Sanitize(input []byte) ([]byte, error) {
	if sanitizer == nil {
		return nil, sanitizationError(SanitizationUnknown)
	}
	if len(input) != ObjectOutSize {
		return nil, sanitizationError(SanitizationSize)
	}
	observation, err := parseWithProfile(input, time.Unix(1, 0).UTC(), sanitizer.profile)
	if err != nil {
		return nil, sanitizationError(SanitizationParser)
	}
	if observation.Compatibility != CompatibilityKnown {
		return nil, sanitizationError(diagnoseSanitizationFailure(input, observation))
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
			return nil, sanitizationError(SanitizationAlias)
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
			lmu13Layout.Scoring.WorldPosition,
			lmu13Layout.Scoring.LocalVelocity,
			lmu13Layout.Scoring.Orientation,
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
			return nil, sanitizationError(SanitizationAlias)
		}
	}
	for row := 0; row < count; row++ {
		base, _ := lmu13Layout.TelemetryRows.rowBase(row)
		sourceID := readInt32(input, base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset)
		identity, ok := sanitizer.remapID(sourceID, forbiddenIDs)
		if !ok {
			return nil, sanitizationError(SanitizationAlias)
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
			lmu13Layout.Telemetry.WorldPosition,
			lmu13Layout.Telemetry.LocalVelocity,
			lmu13Layout.Telemetry.Orientation,
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

func diagnoseSanitizationFailure(input []byte, observation Observation) SanitizationFailureCode {
	switch {
	case strings.HasSuffix(observation.Fingerprint, "evidence=vehicle-count-invalid"):
		return SanitizationVehicleCount
	case strings.HasSuffix(observation.Fingerprint, "evidence=session-string-invalid"):
		return SanitizationSessionString
	case strings.HasSuffix(observation.Fingerprint, "evidence=session-values-invalid"):
		return SanitizationSessionValues
	case strings.HasSuffix(observation.Fingerprint, "evidence=active-grid-invalid"):
		vehicles := readInt32(input, lmu13Layout.Session.VehicleCount.Offset)
		if vehicles < 0 || vehicles > int32(lmu13Layout.ScoringRows.Maximum) {
			return SanitizationVehicleCount
		}
		return diagnoseActiveGridFailure(input, int(vehicles))
	default:
		return SanitizationUnknown
	}
}

func diagnoseActiveGridFailure(input []byte, count int) SanitizationFailureCode {
	telemetryByID := make(map[VehicleSourceID]struct{}, count)
	for row := 0; row < count; row++ {
		base, ok := lmu13Layout.TelemetryRows.rowBase(row)
		if !ok {
			return SanitizationUnknown
		}
		id := VehicleSourceID(readInt32(input, base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset))
		if id < 0 {
			return SanitizationTelemetryID
		}
		if _, duplicate := telemetryByID[id]; duplicate {
			return SanitizationTelemetryIDDuplicate
		}
		telemetryByID[id] = struct{}{}
	}

	scoringIDs := make(map[VehicleSourceID]struct{}, count)
	playerSeen := false
	for row := 0; row < count; row++ {
		base, ok := lmu13Layout.ScoringRows.rowBase(row)
		if !ok {
			return SanitizationUnknown
		}
		if code := diagnoseScoringRowFailure(input, base); code != "" {
			return code
		}
		id := VehicleSourceID(readInt32(input, base+lmu13Layout.Scoring.VehicleSourceSlot.Offset))
		if id < 0 {
			return SanitizationScoringID
		}
		if _, duplicate := scoringIDs[id]; duplicate {
			return SanitizationScoringIDDuplicate
		}
		scoringIDs[id] = struct{}{}
		if _, matched := telemetryByID[id]; !matched {
			return SanitizationIDBijection
		}
		if input[base+lmu13Layout.Scoring.PlayerMarker.Offset] == 1 {
			if playerSeen {
				return SanitizationPlayerDuplicate
			}
			playerSeen = true
		}
	}
	if len(scoringIDs) != len(telemetryByID) {
		return SanitizationIDBijection
	}
	return SanitizationUnknown
}

func diagnoseScoringRowFailure(input []byte, base int) SanitizationFailureCode {
	_, driverOK := readCStringField(input, lmu13Layout.Scoring.DriverLabel, base, true)
	_, vehicleOK := readCStringField(input, lmu13Layout.Scoring.VehicleLabel, base, true)
	_, classOK := readCStringField(input, lmu13Layout.Scoring.VehicleClass, base, true)
	if !driverOK || !vehicleOK || !classOK {
		return SanitizationScoringString
	}
	playerRaw := input[base+lmu13Layout.Scoring.PlayerMarker.Offset]
	inPitRaw := input[base+lmu13Layout.Scoring.InPits.Offset]
	if playerRaw > 1 || inPitRaw > 1 {
		return SanitizationScoringBoolean
	}
	lapDistance := readFloat64(input, base+lmu13Layout.Scoring.LapDistance.Offset)
	timeNext := readFloat64(input, base+lmu13Layout.Scoring.TimeBehindNext.Offset)
	timeLeader := readFloat64(input, base+lmu13Layout.Scoring.TimeBehindLeader.Offset)
	if !finite(lapDistance) || !finite(timeNext) || !finite(timeLeader) {
		return SanitizationScoringFinite
	}
	completed := readInt16(input, base+lmu13Layout.Scoring.CompletedLaps.Offset)
	_, sectorOK := parseSector(readInt8(input, base+lmu13Layout.Scoring.Sector.Offset))
	position := int32(input[base+lmu13Layout.Scoring.Position.Offset])
	pitStops := readInt16(input, base+lmu13Layout.Scoring.PitStopCount.Offset)
	penalties := readInt16(input, base+lmu13Layout.Scoring.PenaltyCount.Offset)
	lapsNext := readInt32(input, base+lmu13Layout.Scoring.LapsBehindNext.Offset)
	lapsLeader := readInt32(input, base+lmu13Layout.Scoring.LapsBehindLeader.Offset)
	if completed < 0 {
		return SanitizationScoringCompletedLaps
	}
	if !sectorOK {
		return SanitizationScoringSector
	}
	if position < 1 || position > maxVehicles {
		return SanitizationScoringPosition
	}
	if pitStops < 0 {
		return SanitizationScoringPitStops
	}
	if penalties < 0 {
		return SanitizationScoringPenalties
	}
	if lapsNext < 0 {
		return SanitizationScoringLapsNext
	}
	if lapsLeader < 0 {
		return SanitizationScoringLapsLeader
	}
	for _, value := range []float64{
		readFloat64(input, base+lmu13Layout.Scoring.BestLapTime.Offset),
		readFloat64(input, base+lmu13Layout.Scoring.LastLapTime.Offset),
		readFloat64(input, base+lmu13Layout.Scoring.EstimatedLapTime.Offset),
	} {
		if !finite(value) {
			return SanitizationScoringLapTime
		}
	}
	return ""
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
