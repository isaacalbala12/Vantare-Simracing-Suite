package overlayv2

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

func TestDeltaReferencesWireForIndependentWidgets(t *testing.T) {
	final := deltaState(t,
		deltaField(t, -0.238, schema.ProvenanceObserved, schema.FreshnessFresh),
		deltaField(t, 0.912, schema.ProvenanceDerived, schema.FreshnessStale),
		deltaField(t, -0.710, schema.ProvenanceDerived, schema.FreshnessFresh),
	)
	view := BuildDelta(final, DefaultPreferencesV2())
	want := []DeltaReferenceViewV2{
		{Requested: DeltaReferencePersonalBest, Reference: DeltaReferencePersonalBest, Seconds: QValue[float64]{V: -0.238, Q: QualityFresh}, Authority: AuthorityNative},
		{Requested: DeltaReferenceSessionBest, Reference: DeltaReferenceSessionBest, Seconds: QValue[float64]{V: 0.912, Q: QualityStale}, Authority: AuthorityDerived},
		{Requested: DeltaReferencePreviousLap, Reference: DeltaReferencePreviousLap, Seconds: QValue[float64]{V: -0.710, Q: QualityFresh}, Authority: AuthorityDerived},
	}
	if len(view.References) != len(want) {
		t.Fatalf("references = %#v", view.References)
	}
	for i, expected := range want {
		if view.References[i] != expected {
			t.Fatalf("reference %d = %#v, want %#v", i, view.References[i], expected)
		}
	}
	// Shared with the real TypeScript store/registry regression, covering the wire.
	payload, err := json.MarshalIndent(view, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	payload = append(payload, '\n')
	const path = "testdata/delta_references.golden.json"
	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.WriteFile(path, payload, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	golden, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) != string(golden) {
		t.Fatalf("delta reference wire differs from shared golden: %s", payload)
	}
}

func TestDeltaReferenceResponsesDiscloseFallbackAndAbsence(t *testing.T) {
	missing := schema.MissingField[session.DeltaSeconds]()
	final := deltaState(t, missing, missing, deltaField(t, 0, schema.ProvenanceDerived, schema.FreshnessStale))
	for _, reference := range BuildDelta(final, DefaultPreferencesV2()).References {
		if reference.Reference != DeltaReferencePreviousLap || reference.Seconds.Q != QualityStale || reference.Seconds.V != 0 {
			t.Fatalf("fallback must preserve effective reference and stale zero: %#v", reference)
		}
	}
	final.Derived.Delta.PreviousLap = missing
	for _, reference := range BuildDelta(final, DefaultPreferencesV2()).References {
		if reference.Reference != "" || reference.Seconds.Q != QualityMissing || reference.Authority != "" {
			t.Fatalf("absence invented a resolution: %#v", reference)
		}
	}
}

func TestDeltaPreviousLapChangePublishesWithPersonalBestUnchanged(t *testing.T) {
	snapshot := builderFinalState(t, 1)
	before, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing state")
	}
	before.Derived.Delta.PersonalBest = deltaField(t, -0.2, schema.ProvenanceObserved, schema.FreshnessFresh)
	before.Derived.Delta.PreviousLap = deltaField(t, 0.5, schema.ProvenanceDerived, schema.FreshnessFresh)
	after := before
	after.Derived.Delta.PreviousLap = deltaField(t, 0.7, schema.ProvenanceDerived, schema.FreshnessFresh)
	if !dirtyDiff(before, after).Has(SectionDelta) {
		t.Fatal("previous-lap change did not mark Delta dirty")
	}
	projector := NewCachedProjector(SectionCadence{Fast: 50 * time.Millisecond, Mid: time.Second, Slow: time.Second, DirtyCeiling: time.Second})
	for i, state := range []derive.FinalState{before, after} {
		header := snapshot.Header()
		header.Cursor.Sequence += schema.Sequence(i)
		next, err := envelope.NewSnapshot(header, state, cloneFinalState)
		if err != nil {
			t.Fatal(err)
		}
		update, err := projector.Project(next, builderSourceContext(), DefaultPreferencesV2(), uint64(i+1), cadenceOrigin.Add(time.Duration(i)*50*time.Millisecond))
		if err != nil {
			t.Fatal(err)
		}
		expected, present := state.Derived.Delta.PreviousLap.Value()
		if !present {
			t.Fatal("expected previous-lap reference")
		}
		if update.Frame.Delta.Seconds.V != -0.2 || update.Frame.Delta.References[2].Seconds.V != float64(expected) {
			t.Fatalf("tick %d lost independent reference: %#v", i, update.Frame.Delta)
		}
	}
}
