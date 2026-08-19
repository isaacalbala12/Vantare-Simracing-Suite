package app

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
)

const telemetryPayloadOverflowBucket = ^uint64(0)

var telemetryPayloadBucketBounds = [...]uint64{
	1 * 1024,
	4 * 1024,
	16 * 1024,
	64 * 1024,
	128 * 1024,
	256 * 1024,
	512 * 1024,
	telemetryPayloadOverflowBucket,
}

var telemetryApplyDurationBucketBounds = [...]uint64{
	10, 25, 50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000,
	telemetryPayloadOverflowBucket,
}

type TelemetryPayloadPercentiles struct {
	Count uint64
	P50   uint64
	P95   uint64
	P99   uint64
}

type telemetryPayloadHistogram struct {
	count   uint64
	buckets [len(telemetryPayloadBucketBounds)]uint64
}

type TelemetryDurationPercentiles struct {
	Count uint64
	P50   uint64
	P99   uint64
}

type telemetryDurationHistogram struct {
	count   uint64
	buckets [len(telemetryApplyDurationBucketBounds)]uint64
}

func (histogram *telemetryDurationHistogram) observe(value uint64) {
	histogram.count++
	for index, upper := range telemetryApplyDurationBucketBounds {
		if value <= upper {
			histogram.buckets[index]++
			return
		}
	}
}

func (histogram telemetryDurationHistogram) snapshot() TelemetryDurationPercentiles {
	return TelemetryDurationPercentiles{
		Count: histogram.count,
		P50:   histogram.percentile(50),
		P99:   histogram.percentile(99),
	}
}

func (histogram telemetryDurationHistogram) percentile(percent uint64) uint64 {
	if histogram.count == 0 {
		return 0
	}
	target := (histogram.count*percent + 99) / 100
	var cumulative uint64
	for index, count := range histogram.buckets {
		cumulative += count
		if cumulative >= target {
			return telemetryApplyDurationBucketBounds[index]
		}
	}
	return telemetryPayloadOverflowBucket
}

func (histogram *telemetryPayloadHistogram) observe(value uint64) {
	histogram.count++
	for index, upper := range telemetryPayloadBucketBounds {
		if value <= upper {
			histogram.buckets[index]++
			return
		}
	}
}

func (histogram telemetryPayloadHistogram) snapshot() TelemetryPayloadPercentiles {
	return TelemetryPayloadPercentiles{
		Count: histogram.count,
		P50:   histogram.percentile(50),
		P95:   histogram.percentile(95),
		P99:   histogram.percentile(99),
	}
}

func (histogram telemetryPayloadHistogram) percentile(percent uint64) uint64 {
	if histogram.count == 0 {
		return 0
	}
	target := (histogram.count*percent + 99) / 100
	var cumulative uint64
	for index, count := range histogram.buckets {
		cumulative += count
		if cumulative >= target {
			return telemetryPayloadBucketBounds[index]
		}
	}
	return telemetryPayloadOverflowBucket
}

type telemetryCoreMetricStore struct {
	mu                       sync.Mutex
	framesDropped            map[string]uint64
	framesRejected           map[string]uint64
	publishFailures          map[string]uint64
	consumerPanics           map[string]uint64
	payloadBytes             map[string]*telemetryPayloadHistogram
	lifecycleTransitions     map[string]uint64
	watchdogDegradations     uint64
	applyDurationUs          telemetryDurationHistogram
	overlayV2PayloadBytes    map[string]*telemetryPayloadHistogram
	overlayV2BuildDurationUs telemetryDurationHistogram
}

func (store *telemetryCoreMetricStore) increment(target *map[string]uint64, label string) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if *target == nil {
		*target = make(map[string]uint64)
	}
	(*target)[label]++
}

func (store *telemetryCoreMetricStore) dropFrame(reason string) {
	store.increment(&store.framesDropped, reason)
}

func (store *telemetryCoreMetricStore) rejectFrame(stage, reason string) {
	store.increment(&store.framesRejected, stage+"."+reason)
}

func (store *telemetryCoreMetricStore) observeApplyDuration(duration time.Duration) {
	microseconds := duration.Microseconds()
	if microseconds < 0 {
		microseconds = 0
	}
	store.mu.Lock()
	store.applyDurationUs.observe(uint64(microseconds))
	store.mu.Unlock()
}

func (store *telemetryCoreMetricStore) observeOverlayV2BuildDuration(duration time.Duration) {
	microseconds := duration.Microseconds()
	if microseconds < 0 {
		microseconds = 0
	}
	store.mu.Lock()
	store.overlayV2BuildDurationUs.observe(uint64(microseconds))
	store.mu.Unlock()
}

func (store *telemetryCoreMetricStore) observeOverlayV2Payload(vehicles int, size uint64) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.overlayV2PayloadBytes == nil {
		store.overlayV2PayloadBytes = make(map[string]*telemetryPayloadHistogram)
	}
	label := strconv.Itoa(max(vehicles, 0))
	histogram := store.overlayV2PayloadBytes[label]
	if histogram == nil {
		histogram = &telemetryPayloadHistogram{}
		store.overlayV2PayloadBytes[label] = histogram
	}
	histogram.observe(size)
}

func (store *telemetryCoreMetricStore) publishFailure(product string) {
	store.increment(&store.publishFailures, product)
}

func (store *telemetryCoreMetricStore) consumerPanic(boundary string) {
	store.increment(&store.consumerPanics, boundary)
}

func (store *telemetryCoreMetricStore) observePayload(product string, size uint64) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.payloadBytes == nil {
		store.payloadBytes = make(map[string]*telemetryPayloadHistogram)
	}
	histogram := store.payloadBytes[product]
	if histogram == nil {
		histogram = &telemetryPayloadHistogram{}
		store.payloadBytes[product] = histogram
	}
	histogram.observe(size)
}

func (store *telemetryCoreMetricStore) lifecycleTransition(from, to telemetryRuntimeLifecycle) {
	store.increment(&store.lifecycleTransitions, lifecycleTransitionLabel(from, to))
}

func (store *telemetryCoreMetricStore) watchdogDegradation() {
	store.mu.Lock()
	store.watchdogDegradations++
	store.mu.Unlock()
}

func (store *telemetryCoreMetricStore) snapshot() telemetryCoreMetricSnapshot {
	store.mu.Lock()
	defer store.mu.Unlock()
	payloadBytes := make(map[string]TelemetryPayloadPercentiles, len(store.payloadBytes))
	for product, histogram := range store.payloadBytes {
		payloadBytes[product] = histogram.snapshot()
	}
	overlayV2PayloadBytes := make(map[string]TelemetryPayloadPercentiles, len(store.overlayV2PayloadBytes))
	for vehicles, histogram := range store.overlayV2PayloadBytes {
		overlayV2PayloadBytes[vehicles] = histogram.snapshot()
	}
	return telemetryCoreMetricSnapshot{
		framesDropped:            cloneMetricMap(store.framesDropped),
		framesRejected:           cloneMetricMap(store.framesRejected),
		publishFailures:          cloneMetricMap(store.publishFailures),
		consumerPanics:           cloneMetricMap(store.consumerPanics),
		payloadBytes:             payloadBytes,
		lifecycleTransitions:     cloneMetricMap(store.lifecycleTransitions),
		watchdogDegradations:     store.watchdogDegradations,
		applyDurationUs:          store.applyDurationUs.snapshot(),
		overlayV2PayloadBytes:    overlayV2PayloadBytes,
		overlayV2BuildDurationUs: store.overlayV2BuildDurationUs.snapshot(),
	}
}

type telemetryCoreMetricSnapshot struct {
	framesDropped            map[string]uint64
	framesRejected           map[string]uint64
	publishFailures          map[string]uint64
	consumerPanics           map[string]uint64
	payloadBytes             map[string]TelemetryPayloadPercentiles
	lifecycleTransitions     map[string]uint64
	watchdogDegradations     uint64
	applyDurationUs          TelemetryDurationPercentiles
	overlayV2PayloadBytes    map[string]TelemetryPayloadPercentiles
	overlayV2BuildDurationUs TelemetryDurationPercentiles
}

func cloneMetricMap(source map[string]uint64) map[string]uint64 {
	clone := make(map[string]uint64, len(source))
	for label, value := range source {
		clone[label] = value
	}
	return clone
}

func lifecycleTransitionLabel(from, to telemetryRuntimeLifecycle) string {
	return telemetryRuntimeLifecycleName(from) + "->" + telemetryRuntimeLifecycleName(to)
}

func telemetryRuntimeLifecycleName(value telemetryRuntimeLifecycle) string {
	switch value {
	case telemetryRuntimeNew:
		return "new"
	case telemetryRuntimeStarting:
		return "starting"
	case telemetryRuntimeRunning:
		return "running"
	case telemetryRuntimeTerminal:
		return "terminal"
	default:
		return "unknown"
	}
}

func telemetryRejectedFrameLabel(err error) (string, string) {
	for _, candidate := range []struct {
		target error
		stage  string
		reason string
	}{
		{lmu.ErrIncompatibleObservation, "map", "incompatible-observation"},
		{lmu.ErrInvalidSessionIdentity, "map", "invalid-session-identity"},
		{lmu.ErrInvalidVehicleCount, "map", "invalid-vehicle-count"},
		{lmu.ErrInvalidSourceSlot, "map", "invalid-source-slot"},
		{lmu.ErrDuplicateSourceSlot, "map", "duplicate-source-slot"},
		{lmu.ErrInvalidPlayerIdentity, "map", "invalid-player-identity"},
		{telemetrycore.ErrInvalidInitialCursor, "reduce", "invalid-initial-cursor"},
		{telemetrycore.ErrStaleBatch, "reduce", "stale-batch"},
		{telemetrycore.ErrSequenceGap, "reduce", "sequence-gap"},
		{telemetrycore.ErrEpochGap, "reduce", "epoch-gap"},
		{telemetrycore.ErrInvalidEpochReset, "reduce", "invalid-epoch-reset"},
		{telemetrycore.ErrDuplicateVehicle, "reduce", "duplicate-vehicle"},
		{telemetrycore.ErrMissingVehicleID, "reduce", "missing-vehicle-id"},
		{telemetrycore.ErrVehicleRunMismatch, "reduce", "vehicle-run-mismatch"},
		{telemetrycore.ErrVehicleCountMismatch, "reduce", "vehicle-count-mismatch"},
		{telemetrycore.ErrIncompleteRunIdentity, "reduce", "incomplete-run-identity"},
		{telemetrycore.ErrRunIdentityChanged, "reduce", "run-identity-changed"},
		{telemetrycore.ErrFactBatchOverflow, "coordinate", "fact-batch-overflow"},
		{telemetrycore.ErrFactSequenceExhausted, "coordinate", "fact-sequence-exhausted"},
		{telemetrycore.ErrVehicleHistoryOverflow, "coordinate", "vehicle-history-overflow"},
		{derive.ErrInvalidDefinition, "derive", "invalid-definition"},
		{derive.ErrStaleSnapshot, "derive", "stale-snapshot"},
		{derive.ErrSequenceGap, "derive", "sequence-gap"},
		{derive.ErrEpochGap, "derive", "epoch-gap"},
		{derive.ErrInvalidEpochReset, "derive", "invalid-epoch-reset"},
		{derive.ErrIdentityChanged, "derive", "identity-changed"},
		{context.Canceled, "engine", "context-canceled"},
		{context.DeadlineExceeded, "engine", "deadline-exceeded"},
	} {
		if errors.Is(err, candidate.target) {
			return candidate.stage, candidate.reason
		}
	}
	return "engine", "unknown"
}
