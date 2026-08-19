package app

import (
	"context"
	"fmt"
	"math"
	"reflect"
	"sync"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	telemetryengine "github.com/vantare/overlays/v2/internal/telemetry/engine"
)

const (
	defaultTelemetryShadowEvery  = uint64(30)
	defaultTelemetryShadowBudget = 2 * time.Millisecond
	telemetryShadowFloatEpsilon  = 1e-9
	telemetryShadowTimeTolerance = 10 * time.Millisecond
)

// telemetryShadow keeps the previous in-memory orchestration isolated from
// every product port. Stateful stages must consume every accepted batch to
// preserve histories and cursor continuity; only the expensive semantic
// comparison is sampled one in every N batches.
type telemetryShadow struct {
	mu sync.Mutex

	every  uint64
	budget time.Duration
	seen   uint64

	reducer *telemetrycore.Reducer
	coord   *telemetrycore.SessionCoordinator
	derive  *derive.Pipeline

	mismatches map[string]uint64
	disabled   bool
}

type telemetryShadowMetrics struct {
	mismatches map[string]uint64
	disabled   bool
}

func newTelemetryShadow(every uint64, budget time.Duration, now func() time.Time) *telemetryShadow {
	if every == 0 {
		every = defaultTelemetryShadowEvery
	}
	if budget <= 0 {
		budget = defaultTelemetryShadowBudget
	}
	return &telemetryShadow{
		every:   every,
		budget:  budget,
		reducer: telemetrycore.NewReducer(),
		coord:   telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{Now: now}),
		derive:  derive.NewPipeline(derive.Config{}),
	}
}

// observe never returns an error and owns no output port. A failure or budget
// overrun disables only this temporary verifier; the authority result remains
// untouched and continues to publication.
func (shadow *telemetryShadow) observe(ctx context.Context, batch telemetrycore.Batch, authority telemetryengine.EngineResult) {
	if shadow == nil {
		return
	}
	shadow.mu.Lock()
	defer shadow.mu.Unlock()
	if shadow.disabled {
		return
	}
	started := time.Now()
	legacy, err := shadow.applyLegacy(ctx, batch)
	shadow.seen++
	if err != nil {
		shadow.mismatch("shadow-error." + telemetryShadowErrorLabel(err))
		shadow.disabled = true
		return
	}
	if shadow.seen%shadow.every == 0 {
		if field := telemetryShadowDifference(authority, legacy); field != "" {
			shadow.mismatch(field)
		}
	}
	if time.Since(started) > shadow.budget {
		shadow.disabled = true
	}
}

func (shadow *telemetryShadow) applyLegacy(ctx context.Context, batch telemetrycore.Batch) (telemetryengine.EngineResult, error) {
	observed, err := shadow.reducer.Apply(batch)
	if err != nil {
		return telemetryengine.EngineResult{}, fmt.Errorf("reduce: %w", err)
	}
	coordinated, err := shadow.coord.Prepare(ctx, observed)
	if err != nil {
		return telemetryengine.EngineResult{}, fmt.Errorf("coordinate: %w", err)
	}
	shadow.coord.Commit(coordinated)
	final, err := shadow.derive.Apply(ctx, coordinated.Snapshot())
	if err != nil {
		return telemetryengine.EngineResult{}, fmt.Errorf("derive: %w", err)
	}
	return telemetryengine.EngineResult{
		State:  final,
		Facts:  coordinated.Facts(),
		Cursor: final.Header().Cursor,
	}, nil
}

func (shadow *telemetryShadow) mismatch(field string) {
	if shadow.mismatches == nil {
		shadow.mismatches = make(map[string]uint64)
	}
	shadow.mismatches[field]++
}

func (shadow *telemetryShadow) metrics() telemetryShadowMetrics {
	if shadow == nil {
		return telemetryShadowMetrics{}
	}
	shadow.mu.Lock()
	defer shadow.mu.Unlock()
	return telemetryShadowMetrics{
		mismatches: cloneMetricMap(shadow.mismatches),
		disabled:   shadow.disabled,
	}
}

func telemetryShadowDifference(authority, legacy telemetryengine.EngineResult) string {
	if authority.Cursor != legacy.Cursor {
		return "cursor"
	}
	if field := semanticDifference(reflect.ValueOf(authority.State.Header()), reflect.ValueOf(legacy.State.Header()), "state.header"); field != "" {
		return field
	}
	authorityState, authorityOK := authority.State.Value()
	legacyState, legacyOK := legacy.State.Value()
	if authorityOK != legacyOK {
		return "state.presence"
	}
	if field := semanticDifference(reflect.ValueOf(authorityState), reflect.ValueOf(legacyState), "state.value"); field != "" {
		return field
	}
	if len(authority.Facts) != len(legacy.Facts) {
		return "facts.length"
	}
	for index := range authority.Facts {
		prefix := fmt.Sprintf("facts[%d]", index)
		if field := semanticDifference(reflect.ValueOf(authority.Facts[index].Header()), reflect.ValueOf(legacy.Facts[index].Header()), prefix+".header"); field != "" {
			return field
		}
		if field := semanticDifference(reflect.ValueOf(authority.Facts[index].Value()), reflect.ValueOf(legacy.Facts[index].Value()), prefix+".value"); field != "" {
			return field
		}
	}
	return ""
}

func semanticDifference(left, right reflect.Value, path string) string {
	if !left.IsValid() || !right.IsValid() {
		if left.IsValid() == right.IsValid() {
			return ""
		}
		return path
	}
	if left.Type() != right.Type() {
		return path
	}
	if left.Type() == reflect.TypeOf(time.Time{}) && left.CanInterface() && right.CanInterface() {
		delta := left.Interface().(time.Time).Sub(right.Interface().(time.Time))
		if delta < -telemetryShadowTimeTolerance || delta > telemetryShadowTimeTolerance {
			return path
		}
		return ""
	}
	switch left.Kind() {
	case reflect.Interface, reflect.Pointer:
		if left.IsNil() || right.IsNil() {
			if left.IsNil() == right.IsNil() {
				return ""
			}
			return path
		}
		return semanticDifference(left.Elem(), right.Elem(), path)
	case reflect.Struct:
		for index := 0; index < left.NumField(); index++ {
			fieldPath := path + "." + left.Type().Field(index).Name
			if difference := semanticDifference(left.Field(index), right.Field(index), fieldPath); difference != "" {
				return difference
			}
		}
	case reflect.Slice, reflect.Array:
		if left.Len() != right.Len() {
			return path + ".length"
		}
		for index := 0; index < left.Len(); index++ {
			if difference := semanticDifference(left.Index(index), right.Index(index), fmt.Sprintf("%s[%d]", path, index)); difference != "" {
				return difference
			}
		}
	case reflect.Float32, reflect.Float64:
		leftFloat, rightFloat := left.Float(), right.Float()
		if math.IsNaN(leftFloat) && math.IsNaN(rightFloat) {
			return ""
		}
		scale := math.Max(1, math.Max(math.Abs(leftFloat), math.Abs(rightFloat)))
		if math.Abs(leftFloat-rightFloat) > telemetryShadowFloatEpsilon*scale {
			return path
		}
	case reflect.Bool:
		if left.Bool() != right.Bool() {
			return path
		}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		if left.Int() != right.Int() {
			return path
		}
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		if left.Uint() != right.Uint() {
			return path
		}
	case reflect.String:
		if left.String() != right.String() {
			return path
		}
	default:
		if left.CanInterface() && right.CanInterface() && !reflect.DeepEqual(left.Interface(), right.Interface()) {
			return path
		}
	}
	return ""
}

func telemetryShadowErrorLabel(err error) string {
	if err == nil {
		return "unknown"
	}
	return "apply"
}
