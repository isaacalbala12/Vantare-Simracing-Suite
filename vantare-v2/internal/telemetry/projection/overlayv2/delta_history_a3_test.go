package overlayv2

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func deltaHistoryState(tb testing.TB, freshness schema.Freshness, count int) derive.FinalState {
	tb.Helper()
	final, ok := builderFinalState(tb, 1).Value()
	if !ok {
		tb.Fatal("missing final state")
	}
	final.Derived.Delta.Freshness = freshness
	final.Derived.Delta.History = make([]derive.DeltaSample, count)
	origin := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	for index := range final.Derived.Delta.History {
		final.Derived.Delta.History[index] = derive.DeltaSample{
			Cursor:      schema.Cursor{Epoch: 3, Sequence: schema.Sequence(index + 1)},
			CapturedAt:  origin.Add(time.Duration(index) * 100 * time.Millisecond),
			SourceTime:  time.Duration(index) * 100 * time.Millisecond,
			LapDistance: standings.LapDistance(float64(index) * 42.5),
			Seconds:     session.DeltaSeconds(-0.238 + float64(index)*0.001),
		}
	}
	// No usable reference on purpose: history must be published even without
	// an effective delta.
	final.Derived.Delta.PersonalBest = schema.MissingField[session.DeltaSeconds]()
	final.Derived.Delta.SessionBest = schema.MissingField[session.DeltaSeconds]()
	final.Derived.Delta.PreviousLap = schema.MissingField[session.DeltaSeconds]()
	return final
}

func assertDeltaHistoryAligned(tb testing.TB, view DeltaViewV2, count int) DeltaHistoryV2 {
	tb.Helper()
	history := view.History
	if len(history.CapturedAtMS) != count || len(history.Seconds) != count {
		tb.Fatalf("history lengths = %d/%d, want %d/%d",
			len(history.CapturedAtMS), len(history.Seconds), count, count)
	}
	return history
}

func TestBuildDeltaPublishesHistoryEvenWithoutEffectiveDelta(t *testing.T) {
	t.Parallel()

	final := deltaHistoryState(t, schema.FreshnessFresh, 3)
	view := BuildDelta(final, DefaultPreferencesV2())
	if view.Reference != "" {
		t.Fatalf("reference = %q, want empty without a usable reference", view.Reference)
	}
	if view.Trend != "" {
		t.Fatalf("trend = %q, want empty: delta-trace owns the concept", view.Trend)
	}
	history := assertDeltaHistoryAligned(t, view, 3)
	if history.Q != QualityFresh {
		t.Fatalf("history quality = %q, want fresh", history.Q)
	}
	origin := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	for index := range history.CapturedAtMS {
		if want := origin.Add(time.Duration(index) * 100 * time.Millisecond).UnixMilli(); history.CapturedAtMS[index] != want {
			t.Fatalf("capturedAtMS[%d] = %d, want absolute UnixMilli %d", index, history.CapturedAtMS[index], want)
		}
		if want := float64(session.DeltaSeconds(-0.238 + float64(index)*0.001)); history.Seconds[index] != want {
			t.Fatalf("seconds[%d] = %v, want %v", index, history.Seconds[index], want)
		}
	}
}

func TestBuildDeltaHistoryDerivesQualityFromFreshness(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		freshness schema.Freshness
		quality   Quality
		count     int
	}{
		{"fresh", schema.FreshnessFresh, QualityFresh, 2},
		{"stale", schema.FreshnessStale, QualityStale, 2},
		{"missing", schema.FreshnessMissing, QualityMissing, 0},
		{"invalid", schema.FreshnessInvalid, QualityInvalid, 0},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			final := deltaHistoryState(t, test.freshness, 2)
			history := BuildDelta(final, DefaultPreferencesV2()).History
			if history.Q != test.quality {
				t.Fatalf("history quality = %q, want %q", history.Q, test.quality)
			}
			assertDeltaHistoryAligned(t, BuildDelta(final, DefaultPreferencesV2()), test.count)
		})
	}
}

func TestBuildDeltaHistoryIsCappedAt120AndCopies(t *testing.T) {
	t.Parallel()

	final := deltaHistoryState(t, schema.FreshnessFresh, derive.MaxSelfDeltaHistory+10)
	view := BuildDelta(final, DefaultPreferencesV2())
	history := assertDeltaHistoryAligned(t, view, derive.MaxSelfDeltaHistory)
	// Tail window: the oldest samples are dropped, the newest survive.
	if want := float64(session.DeltaSeconds(-0.238 + float64(10)*0.001)); history.Seconds[0] != want {
		t.Fatalf("seconds[0] = %v, want tail %v", history.Seconds[0], want)
	}
	// Ownership: mutating the view must not touch the canonical history.
	history.CapturedAtMS[0] = -1
	history.Seconds[0] = -999
	if final.Derived.Delta.History[10].CapturedAt.UnixMilli() == -1 ||
		final.Derived.Delta.History[10].Seconds == session.DeltaSeconds(-999) {
		t.Fatal("BuildDelta aliased the canonical history instead of copying it")
	}
}

func TestBuildDeltaHistoryStaysEmptyWithoutSamples(t *testing.T) {
	t.Parallel()

	final := deltaHistoryState(t, schema.FreshnessFresh, 0)
	view := BuildDelta(final, DefaultPreferencesV2())
	history := assertDeltaHistoryAligned(t, view, 0)
	if history.Q != QualityFresh {
		t.Fatalf("empty history quality = %q, want fresh", history.Q)
	}
}
