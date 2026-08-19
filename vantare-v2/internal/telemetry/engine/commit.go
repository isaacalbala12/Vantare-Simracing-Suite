package engine

import (
	"slices"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

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
