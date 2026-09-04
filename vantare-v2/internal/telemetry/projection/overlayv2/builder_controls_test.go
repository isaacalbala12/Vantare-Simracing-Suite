package overlayv2

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestBuildControlsPublishesTheCanonicalSeriesQuantized(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	// The fixture applies two batches one second apart with the player pedals
	// fresh, so the canonical derivation holds exactly two samples.
	if got := len(final.Derived.ControlsHistory.Samples); got != 2 {
		t.Fatalf("fixture carries %d canonical samples, want 2", got)
	}
	view := BuildControls(final).History
	if view.Q != QualityFresh {
		t.Fatalf("history quality = %q, want fresh", view.Q)
	}
	if len(view.Throttle) != 2 || len(view.Brake) != 2 || len(view.Clutch) != 2 {
		t.Fatalf("parallel arrays must have one entry per sample: %#v", view)
	}
	// Throttle 0.75 and brake 0.125 are the fixture pedals; per-mille keeps the
	// three decimals the widget draws.
	if view.Throttle[0] != 750 || view.Brake[0] != 125 || view.Clutch[0] != 0 {
		t.Fatalf("quantized sample = %d/%d/%d, want 750/125/0", view.Throttle[0], view.Brake[0], view.Clutch[0])
	}
	// The two fixture batches run one second apart: the wire carries both
	// absolute capture instants, never a reconstructed spacing.
	samples := final.Derived.ControlsHistory.Samples
	if len(view.CapturedAtMS) != 2 ||
		view.CapturedAtMS[0] != samples[0].CapturedAt.UnixMilli() ||
		view.CapturedAtMS[1] != samples[1].CapturedAt.UnixMilli() {
		t.Fatalf("capturedAtMS = %v, want the two real fixture instants", view.CapturedAtMS)
	}
	if view.CapturedAtMS[1]-view.CapturedAtMS[0] != 1000 {
		t.Fatalf("capturedAtMS span = %d, want the 1000 ms between the two fixture batches", view.CapturedAtMS[1]-view.CapturedAtMS[0])
	}
}

func TestBuildControlsQuantizesToThreeDecimalsAndClamps(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name  string
		ratio schema.Ratio
		want  int16
	}{
		{"rest is an exact zero", 0, 0},
		{"full travel is an exact one", 1, 1000},
		{"rounds half away from zero", 0.1235, 124},
		{"keeps the third decimal", 0.4567, 457},
		{"clamps above the schema range", 1.5, 1000},
		{"clamps below the schema range", -0.2, 0},
	} {
		if got := quantizeRatio(testCase.ratio); got != testCase.want {
			t.Errorf("%s: quantizeRatio(%v) = %d, want %d", testCase.name, testCase.ratio, got, testCase.want)
		}
	}
}

func TestBuildControlsWithoutACanonicalHistoryInventsNothing(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Derived.ControlsHistory = derive.ControlHistory{Freshness: schema.FreshnessMissing}
	view := BuildControls(final).History
	if view.Q != QualityMissing || view.Throttle != nil || view.CapturedAtMS != nil ||
		view.SpeedMPS != nil || view.RPM != nil || view.Gear != nil {
		t.Fatalf("an absent history must stay absent: %#v", view)
	}

	// An invalid reading is not a series either: the samples retained from
	// before must not be republished as if they were current.
	final.Derived.ControlsHistory = derive.ControlHistory{
		Freshness: schema.FreshnessInvalid,
		Samples:   []derive.ControlSample{{Throttle: 1}},
	}
	if view := BuildControls(final).History; view.Q != QualityInvalid || view.Throttle != nil {
		t.Fatalf("an invalid history must publish no samples: %#v", view)
	}
}

func TestBuildControlsKeepsAStaleSeriesMarkedStale(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Derived.ControlsHistory.Freshness = schema.FreshnessStale
	view := BuildControls(final).History
	if view.Q != QualityStale || len(view.Throttle) != 2 {
		t.Fatalf("a stale series is still a series, published as stale: %#v", view)
	}
}

func TestBuildControlsSinglePointKeepsItsRealInstant(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	final.Derived.ControlsHistory.Samples = final.Derived.ControlsHistory.Samples[:1]
	view := BuildControls(final).History
	if len(view.Throttle) != 1 || len(view.CapturedAtMS) != 1 {
		t.Fatalf("a single point is still one aligned row: %#v", view)
	}
	if want := final.Derived.ControlsHistory.Samples[0].CapturedAt.UnixMilli(); view.CapturedAtMS[0] != want {
		t.Fatalf("capturedAtMS = %d, want the real fixture instant %d", view.CapturedAtMS[0], want)
	}
}

// The full canonical window is the section's worst case. Measuring it here is
// what keeps TestFrameV2SyntheticFullUnder64KiBWith104Vehicles honest: the
// history belongs to the player alone, so it does not scale with the grid, but
// its cost has to be a number and not an assumption. The A1 shape carries one
// absolute instant plus three quality-bearing motion cells per sample, so the
// bound below is calibrated to that specified shape, not to the old
// pedals-only section.
func TestBuildControlsAtTheCanonicalMaximumStaysUnderTwelveKiB(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	samples := make([]derive.ControlSample, derive.MaxControlsHistory)
	origin := time.Date(2026, 8, 20, 10, 0, 0, 0, time.UTC)
	for index := range samples {
		samples[index] = derive.ControlSample{
			CapturedAt: origin.Add(time.Duration(index) * 16 * time.Millisecond),
			Throttle:   schema.Ratio(0.876), Brake: schema.Ratio(0.543), Clutch: schema.Ratio(0.321),
			SpeedMPS:  builderPresent(82.5),
			EngineRPM: builderPresent(vehicle.EngineRPM(7250)),
			Gear:      builderPresent(vehicle.Gear(6)),
		}
	}
	final.Derived.ControlsHistory = derive.ControlHistory{Freshness: schema.FreshnessFresh, Samples: samples}
	view := BuildControls(final)
	payload, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("controls section with %d samples: %d bytes", derive.MaxControlsHistory, len(payload))
	if len(payload) >= 12*1024 {
		t.Fatalf("controls section = %d bytes, want < %d", len(payload), 12*1024)
	}
	history := view.History
	if len(history.CapturedAtMS) != derive.MaxControlsHistory ||
		len(history.SpeedMPS) != derive.MaxControlsHistory ||
		len(history.RPM) != derive.MaxControlsHistory ||
		len(history.Gear) != derive.MaxControlsHistory {
		t.Fatalf("full window must stay index-aligned: %+v", map[string]int{
			"capturedAtMS": len(history.CapturedAtMS), "throttle": len(history.Throttle),
			"speedMPS": len(history.SpeedMPS), "rpm": len(history.RPM), "gear": len(history.Gear),
		})
	}
	if history.CapturedAtMS[derive.MaxControlsHistory-1]-history.CapturedAtMS[0] != int64(derive.MaxControlsHistory-1)*16 {
		t.Fatalf("capturedAtMS span = %d, want the full %d ms span of the series",
			history.CapturedAtMS[derive.MaxControlsHistory-1]-history.CapturedAtMS[0], (derive.MaxControlsHistory-1)*16)
	}
}
