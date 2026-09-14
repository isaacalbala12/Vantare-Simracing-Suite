package engineer

import (
	"reflect"
	"slices"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

func BenchmarkObservationProjection(b *testing.B) {
	input := fullGridInput(b)
	manifest := mustManifest(b,
		Capability{ID: CapabilitySession, State: CapabilitySupported},
		Capability{ID: CapabilityStandings, State: CapabilitySupported},
		Capability{ID: CapabilityControls, State: CapabilitySupported},
		Capability{ID: CapabilityPit, State: CapabilitySupported},
		Capability{ID: CapabilityFuel, State: CapabilitySupported},
		Capability{ID: CapabilityGaps, State: CapabilitySupported},
		Capability{ID: CapabilitySpatial, State: CapabilitySupported},
	)
	b.ReportAllocs()
	for b.Loop() {
		if _, err := ProjectObservationV1(input, manifest); err != nil {
			b.Fatal(err)
		}
	}
}

func TestObservationProjectionReadsCoreWithoutCloningOrAliasing(t *testing.T) {
	input := fullGridInput(t)
	before, ok := input.Value()
	if !ok {
		t.Fatal("fixture unavailable")
	}
	clones := 0
	tracked, err := envelope.NewSnapshotOwned(input.Header(), before, func(value derive.FinalState) derive.FinalState {
		clones++
		value.Observed.Vehicles = slices.Clone(value.Observed.Vehicles)
		value.Derived.Gaps.Vehicles = slices.Clone(value.Derived.Gaps.Vehicles)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	manifest := mustManifest(t,
		Capability{ID: CapabilitySession, State: CapabilitySupported},
		Capability{ID: CapabilityStandings, State: CapabilitySupported},
		Capability{ID: CapabilityControls, State: CapabilitySupported},
		Capability{ID: CapabilityPit, State: CapabilitySupported},
		Capability{ID: CapabilityFuel, State: CapabilitySupported},
		Capability{ID: CapabilityGaps, State: CapabilitySupported},
		Capability{ID: CapabilitySpatial, State: CapabilitySupported},
	)
	first, err := ProjectObservationV1(tracked, manifest)
	if err != nil {
		t.Fatal(err)
	}
	if clones != 0 {
		t.Errorf("read-only projection cloned Core %d times", clones)
	}
	first.Vehicles[0].ID = "caller mutation"
	second, err := ProjectObservationV1(tracked, manifest)
	if err != nil {
		t.Fatal(err)
	}
	if second.Vehicles[0].ID != "car-4" {
		t.Fatal("observation output is aliased")
	}
	got, ok := tracked.Peek()
	original, originalOK := input.Value()
	if !ok || !originalOK || !reflect.DeepEqual(got, original) {
		t.Fatal("projection mutated the committed Core")
	}
}
