package engine

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

// S3.2: CoordinatorCandidate.Facts() ya devuelve copia propia (frontera
// publica). newEngineResult clonaba otra vez el mismo slice. Estos tests fijan
// la propiedad que permite quitar el segundo clon sin nueva API borrow:
// mutar EngineResult.Facts no contamina al coordinador ni al siguiente Apply,
// y los valores siguen identicos al camino legacy.

func TestEngineS32ResultFactsOwnedAfterMutate(t *testing.T) {
	t.Parallel()
	coordinator := core.NewSessionCoordinator(core.SessionCoordinatorConfig{})
	engine := New(core.NewReducer(), coordinator, derive.NewPipeline(derive.Config{}))

	got, err := engine.Apply(context.Background(), engineBatch(1))
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if len(got.Facts) == 0 {
		t.Fatal("Apply() facts empty, want session-started fact")
	}
	orig := got.Facts[0].Value()
	mutated := orig
	mutated.Sequence = 9999
	mutated.Kind = 255
	got.Facts[0] = envelope.NewFact(got.Facts[0].Header(), mutated)

	_, seq, ok := coordinator.Current()
	if !ok {
		t.Fatal("coordinator has no state after Apply")
	}
	if seq == 9999 {
		t.Fatal("mutation of EngineResult.Facts leaked into coordinator")
	}

	next, err := engine.Apply(context.Background(), engineBatch(2))
	if err != nil {
		t.Fatalf("second Apply() error = %v", err)
	}
	for _, fact := range next.Facts {
		if fact.Value().Sequence == 9999 {
			t.Fatal("mutation leaked into next Apply facts")
		}
	}
}

func TestEngineS32FactsMatchLegacyValues(t *testing.T) {
	t.Parallel()
	batch := engineBatch(1)
	now := func() time.Time { return batch.Header.Clock.ReceivedUTC }
	legacyCoordinator := core.NewSessionCoordinator(core.SessionCoordinatorConfig{Now: now})
	legacyReducer := core.NewReducer()
	legacyObserved, err := legacyReducer.Apply(batch)
	if err != nil {
		t.Fatalf("legacy reducer Apply() error = %v", err)
	}
	legacyFacts := &testFactCollector{}
	if err := legacyCoordinator.Apply(context.Background(), legacyObserved, legacyFacts); err != nil {
		t.Fatalf("legacy coordinator Apply() error = %v", err)
	}

	engine := New(
		core.NewReducer(),
		core.NewSessionCoordinator(core.SessionCoordinatorConfig{Now: now}),
		derive.NewPipeline(derive.Config{}),
	)
	got, err := engine.Apply(context.Background(), batch)
	if err != nil {
		t.Fatalf("engine Apply() error = %v", err)
	}
	if len(got.Facts) != len(legacyFacts.values) {
		t.Fatalf("facts len = %d, legacy = %d", len(got.Facts), len(legacyFacts.values))
	}
	for i := range got.Facts {
		if got.Facts[i] != legacyFacts.values[i] {
			t.Fatalf("fact[%d] = %#v, legacy = %#v", i, got.Facts[i], legacyFacts.values[i])
		}
	}
}
