package lmu

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"time"

	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

const (
	DeltaTraceVersion     = 1
	DeltaTraceMaxSamples  = 18_000
	DeltaTraceMaxDuration = 30 * time.Minute

	deltaTraceInterval              = 100 * time.Millisecond
	deltaTraceWrapMinimumDropMeters = 100.0
)

var (
	ErrDeltaTraceIncomplete = errors.New("LMU delta trace does not contain two complete comparable non-pit laps")
	ErrDeltaTraceLimit      = errors.New("LMU delta trace reached its sample limit")
)

type DeltaTraceQuality string

const (
	DeltaTraceFresh   DeltaTraceQuality = "fresh"
	DeltaTraceStale   DeltaTraceQuality = "stale"
	DeltaTraceMissing DeltaTraceQuality = "missing"
	DeltaTraceInvalid DeltaTraceQuality = "invalid"
)

// DeltaTraceSample is an exact diagnostic allowlist. It intentionally has no
// vehicle/source identity, driver or track labels, paths, wall clock or raw
// Shared Memory bytes.
type DeltaTraceSample struct {
	Version              uint16            `json:"version"`
	SampleIndex          uint32            `json:"sample_index"`
	ElapsedOffsetNS      int64             `json:"elapsed_offset_ns"`
	SourceTimeNS         *int64            `json:"source_time_ns"`
	LapNumber            *int64            `json:"lap_number"`
	LapDistanceMeters    *float64          `json:"lap_distance_m"`
	SpeedMetersPerSecond *float64          `json:"speed_mps"`
	InPit                *bool             `json:"in_pit"`
	Quality              DeltaTraceQuality `json:"quality"`
}

type DeltaTraceSummary struct {
	Samples       int
	CompletedLaps int
	Duration      time.Duration
}

type DeltaTraceDiagnostics struct {
	Samples             int
	Fresh               int
	Stale               int
	Missing             int
	Invalid             int
	MinimumLap          int64
	MaximumLap          int64
	Wraps               int
	CompletedLaps       int
	Invalidations       int
	PendingExpirations  int
	LapRegressions      int
	DistanceRegressions int
}

func (diagnostics DeltaTraceDiagnostics) String() string {
	return fmt.Sprintf(
		"samples=%d quality[fresh=%d stale=%d missing=%d invalid=%d] laps=%d..%d wraps=%d completed=%d invalidations=%d pending_expirations=%d lap_regressions=%d distance_regressions=%d",
		diagnostics.Samples, diagnostics.Fresh, diagnostics.Stale, diagnostics.Missing, diagnostics.Invalid,
		diagnostics.MinimumLap, diagnostics.MaximumLap, diagnostics.Wraps, diagnostics.CompletedLaps,
		diagnostics.Invalidations, diagnostics.PendingExpirations, diagnostics.LapRegressions, diagnostics.DistanceRegressions,
	)
}

type DeltaTraceArtifact struct {
	data    []byte
	digest  string
	summary DeltaTraceSummary
}

func (artifact DeltaTraceArtifact) Bytes() []byte              { return bytes.Clone(artifact.data) }
func (artifact DeltaTraceArtifact) SHA256() string             { return artifact.digest }
func (artifact DeltaTraceArtifact) Summary() DeltaTraceSummary { return artifact.summary }

type deltaTraceCollector struct {
	elapsed    func() time.Duration
	started    time.Duration
	onComplete func()

	hasSample         bool
	lastSampleElapsed time.Duration
	samples           []DeltaTraceSample
	progress          deltaTraceProgress
}

var _ drivercontract.ObservationSink[Observation] = (*deltaTraceCollector)(nil)

func newDeltaTraceCollector(elapsed func() time.Duration, onComplete func()) *deltaTraceCollector {
	if elapsed == nil {
		started := time.Now()
		elapsed = func() time.Duration { return time.Since(started) }
	}
	if onComplete == nil {
		onComplete = func() {}
	}
	return &deltaTraceCollector{elapsed: elapsed, started: elapsed(), onComplete: onComplete}
}

func (collector *deltaTraceCollector) WriteObservation(ctx context.Context, observation Observation) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	now := collector.elapsed()
	if now < collector.started {
		return errors.New("LMU delta trace monotonic clock regressed")
	}
	offset := now - collector.started
	if collector.hasSample && offset-collector.lastSampleElapsed < deltaTraceInterval {
		return nil
	}
	if len(collector.samples) >= DeltaTraceMaxSamples {
		return ErrDeltaTraceLimit
	}
	sample := makeDeltaTraceSample(uint32(len(collector.samples)), offset, observation)
	collector.samples = append(collector.samples, sample)
	collector.hasSample = true
	collector.lastSampleElapsed = offset
	if collector.progress.Apply(sample) {
		collector.onComplete()
	}
	return nil
}

func (collector *deltaTraceCollector) Artifact() (DeltaTraceArtifact, error) {
	if collector.progress.completed < 2 {
		return DeltaTraceArtifact{}, fmt.Errorf("%w: %s", ErrDeltaTraceIncomplete, collector.Diagnostics())
	}
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	for _, sample := range collector.samples {
		if err := encoder.Encode(sample); err != nil {
			return DeltaTraceArtifact{}, fmt.Errorf("encode LMU delta trace: %w", err)
		}
	}
	digest := sha256.Sum256(output.Bytes())
	duration := time.Duration(0)
	if len(collector.samples) > 0 {
		duration = time.Duration(collector.samples[len(collector.samples)-1].ElapsedOffsetNS)
	}
	return DeltaTraceArtifact{
		data:   bytes.Clone(output.Bytes()),
		digest: hex.EncodeToString(digest[:]),
		summary: DeltaTraceSummary{
			Samples: len(collector.samples), CompletedLaps: collector.progress.completed, Duration: duration,
		},
	}, nil
}

func (collector *deltaTraceCollector) Diagnostics() DeltaTraceDiagnostics {
	result := DeltaTraceDiagnostics{
		Samples: len(collector.samples), Wraps: collector.progress.wraps, CompletedLaps: collector.progress.completed,
		Invalidations: collector.progress.invalidations, PendingExpirations: collector.progress.pendingExpirations,
		LapRegressions: collector.progress.lapRegressions, DistanceRegressions: collector.progress.distanceRegressions,
	}
	hasLap := false
	for _, sample := range collector.samples {
		switch sample.Quality {
		case DeltaTraceFresh:
			result.Fresh++
		case DeltaTraceStale:
			result.Stale++
		case DeltaTraceMissing:
			result.Missing++
		default:
			result.Invalid++
		}
		if sample.LapNumber == nil {
			continue
		}
		if !hasLap || *sample.LapNumber < result.MinimumLap {
			result.MinimumLap = *sample.LapNumber
		}
		if !hasLap || *sample.LapNumber > result.MaximumLap {
			result.MaximumLap = *sample.LapNumber
		}
		hasLap = true
	}
	return result
}

func makeDeltaTraceSample(index uint32, offset time.Duration, observation Observation) DeltaTraceSample {
	sample := DeltaTraceSample{
		Version: DeltaTraceVersion, SampleIndex: index, ElapsedOffsetNS: int64(offset), Quality: DeltaTraceFresh,
	}
	readTraceDuration(observation.SourceTime, &sample.SourceTimeNS, &sample.Quality)

	player, quality := tracePlayer(observation)
	sample.Quality = worstTraceQuality(sample.Quality, quality)
	if player == nil {
		return sample
	}
	readTraceLap(player.LapNumber, &sample.LapNumber, &sample.Quality)
	readTraceFloat(player.LapDistance, &sample.LapDistanceMeters, &sample.Quality, true)
	readTraceFloat(player.SpeedMPS, &sample.SpeedMetersPerSecond, &sample.Quality, true)
	readTracePit(player.InPit, &sample.InPit, &sample.Quality)
	return sample
}

func tracePlayer(observation Observation) (*VehicleObservation, DeltaTraceQuality) {
	present, quality, ok := traceValue(observation.PlayerPresent)
	if !ok || !present {
		return nil, worstTraceQuality(quality, DeltaTraceMissing)
	}
	var player *VehicleObservation
	for index := range observation.Vehicles {
		isPlayer, markerQuality, markerOK := traceValue(observation.Vehicles[index].Player)
		quality = worstTraceQuality(quality, markerQuality)
		if !markerOK || !isPlayer {
			continue
		}
		if player != nil {
			return nil, DeltaTraceInvalid
		}
		player = &observation.Vehicles[index]
	}
	if player == nil {
		return nil, DeltaTraceMissing
	}
	return player, quality
}

func readTraceDuration(field schema.Field[time.Duration], output **int64, quality *DeltaTraceQuality) {
	value, current, ok := traceValue(field)
	*quality = worstTraceQuality(*quality, current)
	if !ok || value < 0 {
		if ok {
			*quality = DeltaTraceInvalid
		}
		return
	}
	converted := int64(value)
	*output = &converted
}

func readTraceLap(field schema.Field[session.LapNumber], output **int64, quality *DeltaTraceQuality) {
	value, current, ok := traceValue(field)
	*quality = worstTraceQuality(*quality, current)
	if !ok || value < 0 {
		if ok {
			*quality = DeltaTraceInvalid
		}
		return
	}
	converted := int64(value)
	*output = &converted
}

func readTraceFloat[T ~float64](field schema.Field[T], output **float64, quality *DeltaTraceQuality, nonNegative bool) {
	value, current, ok := traceValue(field)
	*quality = worstTraceQuality(*quality, current)
	converted := float64(value)
	if !ok || math.IsNaN(converted) || math.IsInf(converted, 0) || (nonNegative && converted < 0) {
		if ok {
			*quality = DeltaTraceInvalid
		}
		return
	}
	*output = &converted
}

func readTracePit(field schema.Field[pit.InPit], output **bool, quality *DeltaTraceQuality) {
	value, current, ok := traceValue(field)
	*quality = worstTraceQuality(*quality, current)
	if !ok {
		return
	}
	converted := bool(value)
	*output = &converted
}

func traceValue[T comparable](field schema.Field[T]) (T, DeltaTraceQuality, bool) {
	value, present := field.Value()
	if !present || field.Freshness() == schema.FreshnessMissing {
		return value, DeltaTraceMissing, false
	}
	if field.Provenance() != schema.ProvenanceObserved || field.Freshness() == schema.FreshnessInvalid {
		return value, DeltaTraceInvalid, false
	}
	switch field.Freshness() {
	case schema.FreshnessFresh:
		return value, DeltaTraceFresh, true
	case schema.FreshnessStale:
		return value, DeltaTraceStale, true
	default:
		return value, DeltaTraceInvalid, false
	}
}

func worstTraceQuality(left, right DeltaTraceQuality) DeltaTraceQuality {
	rank := func(value DeltaTraceQuality) int {
		switch value {
		case DeltaTraceFresh:
			return 0
		case DeltaTraceStale:
			return 1
		case DeltaTraceMissing:
			return 2
		default:
			return 3
		}
	}
	if rank(right) > rank(left) {
		return right
	}
	return left
}

type deltaTraceProgress struct {
	hasLast             bool
	lastLap             int64
	lastDistance        float64
	lastSourceNS        int64
	synchronized        bool
	candidateOK         bool
	pendingWrap         bool
	pendingReset        bool
	pendingAtNS         int64
	candidateSamples    int
	candidateMinimum    float64
	candidateMaximum    float64
	hasComparisonBase   bool
	comparisonMinimum   float64
	comparisonMaximum   float64
	completed           int
	wraps               int
	invalidations       int
	pendingExpirations  int
	lapRegressions      int
	distanceRegressions int
}

func (progress *deltaTraceProgress) Apply(sample DeltaTraceSample) bool {
	if sample.Quality != DeltaTraceFresh || sample.SourceTimeNS == nil || sample.LapNumber == nil ||
		sample.LapDistanceMeters == nil || sample.InPit == nil || *sample.InPit {
		progress.invalidations++
		progress.invalidate()
		return false
	}
	lap := *sample.LapNumber
	distance := *sample.LapDistanceMeters
	source := *sample.SourceTimeNS
	if !progress.hasLast {
		progress.remember(lap, distance, source)
		return false
	}
	lapStep := lap - progress.lastLap
	if lapStep < 0 {
		progress.lapRegressions++
		progress.clearComparison()
	}
	if source == progress.lastSourceNS {
		if lap == progress.lastLap && distance == progress.lastDistance {
			return false
		}
		progress.invalidations++
		progress.invalidate()
		progress.remember(lap, distance, source)
		return false
	}
	if progress.pendingReset {
		if source < progress.lastSourceNS || time.Duration(source-progress.pendingAtNS) > 5*deltaTraceInterval {
			progress.pendingExpirations++
			progress.invalidations++
			progress.invalidate()
			progress.remember(lap, distance, source)
			return false
		}
		switch lapStep {
		case 0:
			if distance < progress.lastDistance {
				if progress.lastDistance-distance < deltaTraceWrapMinimumDropMeters {
					progress.rememberSourceTime(source)
					return false
				}
				progress.distanceRegressions++
				progress.invalidations++
				progress.invalidate()
				progress.remember(lap, distance, source)
				return false
			}
			progress.remember(lap, distance, source)
			return false
		case 1:
			progress.completeWrap(distance)
			progress.remember(lap, distance, source)
			return progress.completed >= 2
		default:
			progress.invalidations++
			progress.invalidate()
			progress.remember(lap, distance, source)
			return false
		}
	}
	switch {
	case lapStep == 0:
		if progress.pendingWrap {
			if source < progress.lastSourceNS || time.Duration(source-progress.pendingAtNS) > 5*deltaTraceInterval {
				progress.pendingExpirations++
				progress.invalidations++
				progress.invalidate()
				progress.remember(lap, distance, source)
				return false
			}
			if distance < progress.lastDistance && progress.lastDistance-distance >= deltaTraceWrapMinimumDropMeters {
				progress.completeWrap(distance)
				progress.remember(lap, distance, source)
				return progress.completed >= 2
			}
			if distance < progress.lastDistance {
				progress.rememberSourceTime(source)
			} else {
				progress.remember(lap, distance, source)
			}
			return false
		}
		if source < progress.lastSourceNS {
			progress.invalidations++
			progress.invalidate()
			progress.remember(lap, distance, source)
			return false
		}
		if distance < progress.lastDistance {
			if progress.lastDistance-distance < deltaTraceWrapMinimumDropMeters {
				progress.rememberSourceTime(source)
				return false
			}
			progress.pendingReset = true
			progress.pendingAtNS = source
			progress.remember(lap, distance, source)
			return false
		}
		progress.observeCandidate(distance)
		progress.remember(lap, distance, source)
	case lapStep == 1 && source > progress.lastSourceNS:
		if distance >= progress.lastDistance {
			progress.pendingWrap = true
			progress.pendingAtNS = source
			progress.remember(lap, distance, source)
			return false
		}
		progress.completeWrap(distance)
		progress.remember(lap, distance, source)
	default:
		progress.invalidations++
		progress.invalidate()
		progress.remember(lap, distance, source)
	}
	return progress.completed >= 2
}

func (progress *deltaTraceProgress) completeWrap(distance float64) {
	progress.wraps++
	progress.completeCandidate()
	progress.synchronized = true
	progress.candidateOK = true
	progress.candidateSamples = 1
	progress.candidateMinimum = distance
	progress.candidateMaximum = distance
	progress.pendingWrap = false
	progress.pendingReset = false
	progress.pendingAtNS = 0
}

func (progress *deltaTraceProgress) observeCandidate(distance float64) {
	if !progress.synchronized || !progress.candidateOK {
		return
	}
	if progress.candidateSamples == 0 {
		progress.candidateSamples = 1
		progress.candidateMinimum = distance
		progress.candidateMaximum = distance
		return
	}
	progress.candidateSamples++
	if distance < progress.candidateMinimum {
		progress.candidateMinimum = distance
	}
	if distance > progress.candidateMaximum {
		progress.candidateMaximum = distance
	}
}

func (progress *deltaTraceProgress) completeCandidate() {
	if !progress.synchronized || !progress.candidateOK || progress.candidateSamples < 2 || progress.candidateMaximum <= progress.candidateMinimum {
		return
	}
	if !progress.hasComparisonBase {
		progress.hasComparisonBase = true
		progress.comparisonMinimum = progress.candidateMinimum
		progress.comparisonMaximum = progress.candidateMaximum
		progress.completed = 1
		return
	}
	overlapMinimum := math.Max(progress.comparisonMinimum, progress.candidateMinimum)
	overlapMaximum := math.Min(progress.comparisonMaximum, progress.candidateMaximum)
	if overlapMaximum > overlapMinimum {
		progress.completed = 2
		return
	}
	progress.comparisonMinimum = progress.candidateMinimum
	progress.comparisonMaximum = progress.candidateMaximum
	progress.completed = 1
}

func (progress *deltaTraceProgress) clearComparison() {
	progress.hasComparisonBase = false
	progress.comparisonMinimum = 0
	progress.comparisonMaximum = 0
	progress.completed = 0
}

func (progress *deltaTraceProgress) remember(lap int64, distance float64, source int64) {
	progress.hasLast = true
	progress.lastLap = lap
	progress.lastDistance = distance
	progress.lastSourceNS = source
}

func (progress *deltaTraceProgress) rememberSourceTime(source int64) {
	progress.lastSourceNS = source
}

func (progress *deltaTraceProgress) invalidate() {
	progress.hasLast = false
	progress.synchronized = false
	progress.candidateOK = false
	progress.pendingWrap = false
	progress.pendingReset = false
	progress.pendingAtNS = 0
	progress.candidateSamples = 0
	progress.candidateMinimum = 0
	progress.candidateMaximum = 0
}

type deltaTraceRunner func(context.Context, drivercontract.ObservationSink[Observation]) error

func CaptureDeltaTrace(ctx context.Context, duration time.Duration) (DeltaTraceArtifact, error) {
	return captureDeltaTrace(ctx, duration, New().Run)
}

func captureDeltaTrace(ctx context.Context, duration time.Duration, run deltaTraceRunner) (DeltaTraceArtifact, error) {
	if ctx == nil {
		return DeltaTraceArtifact{}, errors.New("LMU delta trace context is nil")
	}
	if duration <= 0 || duration > DeltaTraceMaxDuration {
		return DeltaTraceArtifact{}, fmt.Errorf("LMU delta trace duration must be within (0,%s]", DeltaTraceMaxDuration)
	}
	if run == nil {
		return DeltaTraceArtifact{}, errors.New("LMU delta trace runner is nil")
	}
	runContext, cancel := context.WithTimeout(ctx, duration)
	defer cancel()
	collector := newDeltaTraceCollector(nil, cancel)
	runErr := run(runContext, collector)
	artifact, artifactErr := collector.Artifact()
	if runErr != nil && !errors.Is(runErr, context.Canceled) && !errors.Is(runErr, context.DeadlineExceeded) {
		return DeltaTraceArtifact{}, fmt.Errorf("capture LMU delta trace: %w", runErr)
	}
	if artifactErr == nil {
		return artifact, nil
	}
	if err := ctx.Err(); err != nil {
		return DeltaTraceArtifact{}, err
	}
	return DeltaTraceArtifact{}, artifactErr
}

type deltaTraceFile interface {
	Write([]byte) (int, error)
	Sync() error
	Close() error
}

type deltaTraceOpener func(string) (deltaTraceFile, error)

// WriteDeltaTrace persists only a fully buffered artifact and refuses to
// replace an existing destination. A failed write removes its own partial file.
func WriteDeltaTrace(path string, artifact DeltaTraceArtifact) (err error) {
	return writeDeltaTrace(path, artifact, func(path string) (deltaTraceFile, error) {
		return os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	})
}

func writeDeltaTrace(path string, artifact DeltaTraceArtifact, open deltaTraceOpener) (err error) {
	if path == "" {
		return errors.New("LMU delta trace destination is empty")
	}
	if len(artifact.data) == 0 {
		return errors.New("LMU delta trace artifact is empty")
	}
	if open == nil {
		return errors.New("LMU delta trace opener is nil")
	}
	file, err := open(path)
	if err != nil {
		return fmt.Errorf("create LMU delta trace: %w", err)
	}
	committed := false
	closed := false
	defer func() {
		if !closed {
			closeErr := file.Close()
			if err == nil && closeErr != nil {
				err = fmt.Errorf("close LMU delta trace: %w", closeErr)
			}
		}
		if !committed {
			_ = os.Remove(path)
		}
	}()
	if _, err = file.Write(artifact.data); err != nil {
		return fmt.Errorf("write LMU delta trace: %w", err)
	}
	if err = file.Sync(); err != nil {
		return fmt.Errorf("sync LMU delta trace: %w", err)
	}
	if err = file.Close(); err != nil {
		closed = true
		return fmt.Errorf("close LMU delta trace: %w", err)
	}
	closed = true
	committed = true
	return nil
}
