// Package engine owns the single canonical telemetry application boundary.
package engine

import (
	"context"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

type observationReducer interface {
	Apply(core.Batch) (envelope.Snapshot[core.ObservedState], error)
}

type sessionCoordinator interface {
	Apply(context.Context, envelope.Snapshot[core.ObservedState], core.FactBatchSink) error
}

type derivationPipeline interface {
	Apply(context.Context, envelope.Snapshot[core.ObservedState]) (envelope.Snapshot[derive.FinalState], error)
}

// EngineResult is the complete output of one accepted canonical batch.
// State, Facts and Cursor belong to the same application attempt.
type EngineResult struct {
	State  envelope.Snapshot[derive.FinalState]
	Facts  []envelope.Fact[core.SessionFact]
	Cursor schema.Cursor
}

// TelemetryEngine is the facade for the canonical reducer, session lifecycle
// and deterministic derivation chain. F3 moves their commits behind this
// boundary incrementally; this first cut preserves their existing semantics.
type TelemetryEngine struct {
	reducer     observationReducer
	coordinator sessionCoordinator
	derive      derivationPipeline
}

// New builds an engine around the existing canonical stages.
func New(reducer *core.Reducer, coordinator *core.SessionCoordinator, pipeline *derive.Pipeline) *TelemetryEngine {
	return &TelemetryEngine{reducer: reducer, coordinator: coordinator, derive: pipeline}
}

// Apply runs one already-mapped canonical batch through the existing stages.
func (engine *TelemetryEngine) Apply(ctx context.Context, batch core.Batch) (EngineResult, error) {
	if ctx == nil {
		return EngineResult{}, fmt.Errorf("apply telemetry batch: nil context")
	}
	if err := ctx.Err(); err != nil {
		return EngineResult{}, err
	}

	observed, err := engine.reducer.Apply(batch)
	if err != nil {
		return EngineResult{}, err
	}
	facts := &factCollector{}
	if err := engine.coordinator.Apply(ctx, observed, facts); err != nil {
		return EngineResult{}, err
	}
	final, err := engine.derive.Apply(ctx, observed)
	if err != nil {
		return EngineResult{}, err
	}
	return newEngineResult(final, facts.values), nil
}
