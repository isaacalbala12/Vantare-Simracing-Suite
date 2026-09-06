package engine

import (
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

// newEngineResult recibe facts ya propios de CoordinatorCandidate.Facts()
// (copia en la frontera publica). No se clona de nuevo: el candidato es
// efimero y EngineResult es el unico dueno del slice.
func newEngineResult(
	state envelope.Snapshot[derive.FinalState],
	facts []envelope.Fact[core.SessionFact],
) EngineResult {
	return EngineResult{
		State:  state,
		Facts:  facts,
		Cursor: state.Header().Cursor,
	}
}
