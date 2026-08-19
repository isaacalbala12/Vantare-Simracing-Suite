package engine

import (
	"context"
	"slices"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

type factCollector struct {
	values []envelope.Fact[core.SessionFact]
}

func (collector *factCollector) WriteFacts(_ context.Context, facts []envelope.Fact[core.SessionFact]) error {
	collector.values = append(collector.values, facts...)
	return nil
}

func newEngineResult(
	state envelope.Snapshot[derive.FinalState],
	facts []envelope.Fact[core.SessionFact],
) EngineResult {
	return EngineResult{
		State:  state,
		Facts:  slices.Clone(facts),
		Cursor: state.Header().Cursor,
	}
}
