// Package engine owns the single canonical telemetry application boundary.
package engine

import (
	"context"
	"fmt"
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

type observationReducer interface {
	Prepare(core.Batch) (core.ReducerCandidate, error)
	Commit(core.ReducerCandidate)
}

type sessionCoordinator interface {
	Prepare(context.Context, envelope.Snapshot[core.ObservedState]) (core.CoordinatorCandidate, error)
	Commit(core.CoordinatorCandidate)
}

type derivationPipeline interface {
	Prepare(context.Context, envelope.Snapshot[core.ObservedState]) (derive.PipelineCandidate, error)
	Commit(derive.PipelineCandidate)
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
	mu          sync.Mutex
	reducer     observationReducer
	coordinator sessionCoordinator
	derive      derivationPipeline
}

// New builds an engine around the existing canonical stages.
func New(reducer *core.Reducer, coordinator *core.SessionCoordinator, pipeline *derive.Pipeline) *TelemetryEngine {
	return newWithStages(reducer, coordinator, pipeline)
}

func newWithStages(reducer observationReducer, coordinator sessionCoordinator, pipeline derivationPipeline) *TelemetryEngine {
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
	engine.mu.Lock()
	defer engine.mu.Unlock()

	reducerCandidate, err := engine.reducer.Prepare(batch)
	if err != nil {
		return EngineResult{}, err
	}
	observed := reducerCandidate.Snapshot()
	coordinatorCandidate, err := engine.coordinator.Prepare(ctx, observed)
	if err != nil {
		return EngineResult{}, err
	}
	pipelineCandidate, err := engine.derive.Prepare(ctx, observed)
	if err != nil {
		return EngineResult{}, err
	}

	// Every fallible stage has won. These commits are in-memory pointer/value
	// replacements and cannot reject, so no partially committed error path
	// exists after the first mutation.
	engine.reducer.Commit(reducerCandidate)
	engine.coordinator.Commit(coordinatorCandidate)
	engine.derive.Commit(pipelineCandidate)
	return newEngineResult(pipelineCandidate.Snapshot(), coordinatorCandidate.Facts()), nil
}
