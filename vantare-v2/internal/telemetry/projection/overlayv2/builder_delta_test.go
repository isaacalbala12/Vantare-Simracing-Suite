package overlayv2

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

func deltaState(tb testing.TB, personal, sessionBest, previous schema.Field[session.DeltaSeconds]) derive.FinalState {
	tb.Helper()
	final, ok := builderFinalState(tb, 1).Value()
	if !ok {
		tb.Fatal("missing final state")
	}
	final.Derived.Delta.PersonalBest = personal
	final.Derived.Delta.SessionBest = sessionBest
	final.Derived.Delta.PreviousLap = previous
	return final
}

func deltaField(tb testing.TB, value float64, provenance schema.Provenance, freshness schema.Freshness) schema.Field[session.DeltaSeconds] {
	tb.Helper()
	field, err := schema.NewField(session.DeltaSeconds(value), provenance, freshness)
	if err != nil {
		tb.Fatal(err)
	}
	return field
}

func TestBuildDeltaPublishesRequestedEffectiveAndAvailableReferences(t *testing.T) {
	t.Parallel()

	missing := schema.MissingField[session.DeltaSeconds]()
	final := deltaState(t,
		deltaField(t, -0.238, schema.ProvenanceObserved, schema.FreshnessFresh),
		deltaField(t, 0.912, schema.ProvenanceDerived, schema.FreshnessFresh),
		missing,
	)

	view := BuildDelta(final, DefaultPreferencesV2())
	if view.Requested != DeltaReferencePersonalBest || view.Reference != DeltaReferencePersonalBest {
		t.Fatalf("requested/effective = %q/%q", view.Requested, view.Reference)
	}
	if view.Seconds.Q != QualityFresh || view.Seconds.V != -0.238 {
		t.Fatalf("seconds = %#v", view.Seconds)
	}
	if view.Authority != AuthorityNative {
		t.Fatalf("observed personal best must be native, got %q", view.Authority)
	}
	want := []string{DeltaReferencePersonalBest, DeltaReferenceSessionBest}
	if len(view.Available) != len(want) {
		t.Fatalf("available = %#v, want %#v", view.Available, want)
	}
	for index, name := range want {
		if view.Available[index] != name {
			t.Fatalf("available = %#v, want %#v", view.Available, want)
		}
	}
	if view.Trend != "" {
		t.Fatalf("trend has no canonical signal and must stay empty, got %q", view.Trend)
	}
}

func TestBuildDeltaFallsBackToTheBestAvailableReferenceAndSaysSo(t *testing.T) {
	t.Parallel()

	final := deltaState(t,
		schema.MissingField[session.DeltaSeconds](),
		schema.MissingField[session.DeltaSeconds](),
		deltaField(t, 1.5, schema.ProvenanceDerived, schema.FreshnessStale),
	)

	preferences := DefaultPreferencesV2()
	preferences.DeltaReference = DeltaReferenceSessionBest
	view := BuildDelta(final, preferences)
	if view.Requested != DeltaReferenceSessionBest {
		t.Fatalf("requested = %q", view.Requested)
	}
	if view.Reference != DeltaReferencePreviousLap {
		t.Fatalf("effective = %q, want the only available reference", view.Reference)
	}
	if view.Seconds.Q != QualityStale || view.Seconds.V != 1.5 {
		t.Fatalf("seconds = %#v", view.Seconds)
	}
	if view.Authority != AuthorityDerived {
		t.Fatalf("reconstructed reference must be derived, got %q", view.Authority)
	}
}

func TestBuildDeltaWithoutAnyUsableReferenceIsMissingAndNeverInvented(t *testing.T) {
	t.Parallel()

	invalid, err := schema.NewField(session.DeltaSeconds(0), schema.ProvenanceDerived, schema.FreshnessInvalid)
	if err != nil {
		t.Fatal(err)
	}
	nonFinite := deltaField(t, math.Inf(1), schema.ProvenanceDerived, schema.FreshnessFresh)
	final := deltaState(t, invalid, nonFinite, schema.MissingField[session.DeltaSeconds]())

	view := BuildDelta(final, DefaultPreferencesV2())
	if view.Reference != "" || view.Seconds.Q != QualityMissing || view.Authority != "" {
		t.Fatalf("unavailable delta invented a value: %#v", view)
	}
	if view.Available == nil || len(view.Available) != 0 {
		t.Fatalf("available must be an empty array, not null: %#v", view.Available)
	}
	if view.Requested != DeltaReferencePersonalBest {
		t.Fatalf("requested must survive an unavailable reference, got %q", view.Requested)
	}
}

func TestNormalizedPreferencesRejectsAnUnknownDeltaReference(t *testing.T) {
	t.Parallel()

	got := normalizedPreferences(PreferencesV2{DeltaReference: "theoretical-best"})
	if got.DeltaReference != DeltaReferencePersonalBest {
		t.Fatalf("unknown reference = %q, want the default", got.DeltaReference)
	}
}
