package overlayv2

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// TestBuildControlsProjectsAbsoluteMotionHistory is the A1 projection RED:
// the wire history carries absolute capture instants plus per-sample motion
// quality, all arrays index-aligned with the pedals.
func TestBuildControlsProjectsAbsoluteMotionHistory(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	view := BuildControls(final).History
	if view.Q != QualityFresh {
		t.Fatalf("history quality = %q, want fresh", view.Q)
	}
	samples := final.Derived.ControlsHistory.Samples
	if len(samples) != 2 {
		t.Fatalf("fixture carries %d samples, want 2", len(samples))
	}
	assertControlsAligned(t, view, len(samples))
	for index, sample := range samples {
		if view.CapturedAtMS[index] != sample.CapturedAt.UnixMilli() {
			t.Fatalf("CapturedAtMS[%d] = %d, want %d", index, view.CapturedAtMS[index], sample.CapturedAt.UnixMilli())
		}
	}
	// The fixture holds the player at 50 m/s, 7200 rpm, gear 4: the wire must
	// carry the source m/s value, never a km/h conversion.
	if view.SpeedMPS[0].Q != QualityFresh || view.SpeedMPS[0].V != 50 {
		t.Fatalf("SpeedMPS[0] = %+v, want {50 fresh} in m/s", view.SpeedMPS[0])
	}
	if view.RPM[0].Q != QualityFresh || view.RPM[0].V != 7200 {
		t.Fatalf("RPM[0] = %+v, want {7200 fresh}", view.RPM[0])
	}
	if view.Gear[0].Q != QualityFresh || view.Gear[0].V != 4 {
		t.Fatalf("Gear[0] = %+v, want {4 fresh}", view.Gear[0])
	}
}

// TestBuildControlsKeepsPerSampleMotionQuality is the A1 projection RED for
// quality: every QValue preserves missing/stale/invalid/fresh, a missing value
// omits V on the wire, and no array is ever shortened by a missing sample.
func TestBuildControlsKeepsPerSampleMotionQuality(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	staleSpeed, err := schema.NewField(60.0, schema.ProvenanceObserved, schema.FreshnessStale)
	if err != nil {
		t.Fatal(err)
	}
	invalidRPM, err := schema.NewField(vehicle.EngineRPM(6500), schema.ProvenanceObserved, schema.FreshnessInvalid)
	if err != nil {
		t.Fatal(err)
	}
	samples := final.Derived.ControlsHistory.Samples
	samples[0].SpeedMPS = staleSpeed
	samples[0].EngineRPM = invalidRPM
	samples[0].Gear = schema.MissingField[vehicle.Gear]()
	samples[1].SpeedMPS = schema.MissingField[float64]()
	final.Derived.ControlsHistory.Samples = samples

	view := BuildControls(final).History
	assertControlsAligned(t, view, 2)
	if view.SpeedMPS[0].Q != QualityStale || view.SpeedMPS[0].V != 60 {
		t.Fatalf("stale speed must keep its value: %+v", view.SpeedMPS[0])
	}
	if view.RPM[0].Q != QualityInvalid || view.RPM[0].V != 6500 {
		t.Fatalf("invalid rpm must keep its value: %+v", view.RPM[0])
	}
	if view.Gear[0].Q != QualityMissing {
		t.Fatalf("missing gear must stay missing: %+v", view.Gear[0])
	}
	if view.SpeedMPS[1].Q != QualityMissing {
		t.Fatalf("missing speed must stay missing: %+v", view.SpeedMPS[1])
	}
	payload, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		Gear    []map[string]any `json:"gear"`
		SpeedMS []map[string]any `json:"speedMPS"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, cell := range append(decoded.Gear[:1], decoded.SpeedMS[1:]...) {
		if _, present := cell["v"]; present {
			t.Fatalf("missing QValue must omit v on the wire: %v", cell)
		}
	}
	if !strings.Contains(string(payload), `"capturedAtMS"`) {
		t.Fatalf("wire history must publish capturedAtMS: %s", payload)
	}
	if strings.Contains(string(payload), `"windowMs"`) {
		t.Fatalf("wire history must not publish windowMs anymore: %s", payload)
	}
}

// TestBuildControlsAtTheCanonicalMaximumStaysAligned caps the A1 worst case:
// the full 120-sample window with per-sample quality stays index-aligned.
func TestBuildControlsAtTheCanonicalMaximumStaysAligned(t *testing.T) {
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
	view := BuildControls(final).History
	assertControlsAligned(t, view, derive.MaxControlsHistory)
}

func assertControlsAligned(t *testing.T, view ControlsHistoryV2, count int) {
	t.Helper()
	lengths := map[string]int{
		"capturedAtMS": len(view.CapturedAtMS),
		"throttle":     len(view.Throttle),
		"brake":        len(view.Brake),
		"clutch":       len(view.Clutch),
		"speedMPS":     len(view.SpeedMPS),
		"rpm":          len(view.RPM),
		"gear":         len(view.Gear),
	}
	for name, length := range lengths {
		if length != count {
			t.Fatalf("array %s has %d entries, want %d (aligned): %+v", name, length, count, lengths)
		}
	}
}
