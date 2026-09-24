package overlayv2

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestBuildDamageCarriesObservedTyreWearAndQuality(t *testing.T) {
	final, ok := builderFinalState(t, 1).Value()
	if !ok {
		t.Fatal("builder final state unavailable")
	}
	want := [4]float64{0.98, 0.91, 0.87, 0.93}
	final.Observed.Vehicles[0].TyreWear = builderPresent(want)
	view := BuildDamage(final)
	if view.TyreWear == nil || view.TyreWear.Q != QualityFresh || len(view.TyreWear.V) != 4 {
		t.Fatalf("fresh tyre wear missing: %#v", view.TyreWear)
	}
	for index, value := range want {
		if view.TyreWear.V[index] != value {
			t.Fatalf("wheel %d = %v, want %v", index, view.TyreWear.V[index], value)
		}
	}
	final.Observed.Vehicles[0].TyreWear, _ = schema.NewField(want, schema.ProvenanceObserved, schema.FreshnessStale)
	if got := BuildDamage(final).TyreWear; got == nil || got.Q != QualityStale {
		t.Fatalf("stale tyre wear quality = %#v", got)
	}
	final.Observed.Vehicles[0].TyreWear = schema.MissingField[[4]float64]()
	if got := BuildDamage(final).TyreWear; got != nil {
		t.Fatalf("missing tyre wear published as %#v", got)
	}
}
