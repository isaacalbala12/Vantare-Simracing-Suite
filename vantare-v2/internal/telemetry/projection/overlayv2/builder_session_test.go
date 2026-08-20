package overlayv2

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

func TestBuildSessionProjectsTheCanonicalSessionSlice(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	view := BuildSession(final)
	if view.Track.Q != QualityFresh || view.Track.V != "Sebring" {
		t.Fatalf("track = %#v", view.Track)
	}
	if view.Phase.Q != QualityFresh || view.Phase.V != "race" {
		t.Fatalf("phase = %#v", view.Phase)
	}
	if view.RemainingSeconds.Q == QualityMissing {
		t.Fatalf("remaining must come from the derived pipeline: %#v", view.RemainingSeconds)
	}
}

// The canonical ObservedState has no session flag signal. The builder must
// declare that absence rather than defaulting to green, which is what keeps the
// racing-flags widget at parity between Overlay v1 and v2.
func TestBuildSessionDeclaresTheAbsentFlagAsMissing(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	view := BuildSession(final)
	if view.Flag.Q != QualityMissing || view.Flag.V != "" {
		t.Fatalf("flag must stay missing while the canonical state has none: %#v", view.Flag)
	}
}

func TestBuildSessionPreservesFieldQuality(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Observed.TrackName = builderField(t, "Sebring", schema.FreshnessStale)
	final.Observed.MaximumLaps = schema.MissingField[session.MaximumLaps]()
	view := BuildSession(final)
	if view.Track.Q != QualityStale || view.Track.V != "Sebring" {
		t.Fatalf("stale track not preserved: %#v", view.Track)
	}
	if view.MaximumLaps.Q != QualityMissing || view.MaximumLaps.V != 0 {
		t.Fatalf("missing maxLaps not preserved: %#v", view.MaximumLaps)
	}
}
