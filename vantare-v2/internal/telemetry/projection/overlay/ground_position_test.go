package overlay

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
)

func positionField(t *testing.T, value spatial.Position, freshness schema.Freshness) schema.Field[spatial.Position] {
	t.Helper()
	field, err := schema.NewField(value, schema.ProvenanceObserved, freshness)
	if err != nil {
		t.Fatal(err)
	}
	return field
}

func TestGroundPositionQuantisesToCentimetres(t *testing.T) {
	// The player's real position in the hash-pinned 44-vehicle fixture.
	source := spatial.Position{X: -487.8100280761719, Y: 12.5, Z: -482.8159484863281}

	got := groundPosition(positionField(t, source, schema.FreshnessFresh))

	if !got.Present {
		t.Fatal("a fresh position was published as absent")
	}
	if got.Value.XCentimetres != -48781 || got.Value.ZCentimetres != -48282 {
		t.Fatalf("quantised to %+v, want {-48781 -48282}", got.Value)
	}
	if got.Provenance != projection.ProvenanceObserved || got.Freshness != projection.FreshnessFresh {
		t.Fatalf("quality was not carried across: %v/%v", got.Provenance, got.Freshness)
	}
}

// Geometry the driver rejected must not read as a place a car is. The contract
// expresses that through Available rather than by blanking the value, the same
// way every other field does, so consumers have one rule to follow.
func TestGroundPositionKeepsQualityInsteadOfInventingAPosition(t *testing.T) {
	invalid := groundPosition(positionField(t, spatial.Position{X: 100, Z: 200}, schema.FreshnessInvalid))
	if projection.Available(invalid) {
		t.Fatalf("invalid geometry passed the availability check: %+v", invalid)
	}
	if invalid.Freshness != projection.FreshnessInvalid {
		t.Fatalf("invalid geometry lost its freshness: %v", invalid.Freshness)
	}

	// A missing field carries no value at all, which is why it cannot be built
	// with one.
	missing := groundPosition(schema.Field[spatial.Position]{})
	if projection.Available(missing) || missing.Present {
		t.Fatalf("missing geometry arrived as a position: %+v", missing)
	}
	if missing.Value != (GroundPositionV1{}) {
		t.Fatalf("missing geometry invented %+v", missing.Value)
	}
}

// A car really can sit at the world origin, and the shared-memory driver has a
// test proving zero is a legitimate observation. Publishing it as absent would
// silently delete a car from the map.
func TestGroundPositionPublishesALegitimateZero(t *testing.T) {
	got := groundPosition(positionField(t, spatial.Position{}, schema.FreshnessFresh))

	if !got.Present || !projection.Available(got) {
		t.Fatalf("a legitimate zero was dropped: %+v", got)
	}
	if got.Value != (GroundPositionV1{}) {
		t.Fatalf("zero became %+v", got.Value)
	}
}

func TestGroundPositionStaysWithinInt32(t *testing.T) {
	for name, value := range map[string]float64{
		"beyond positive": math.MaxInt32,
		"beyond negative": -math.MaxInt32,
	} {
		t.Run(name, func(t *testing.T) {
			got := groundPosition(positionField(t, spatial.Position{X: value, Z: value}, schema.FreshnessFresh))
			if got.Value.XCentimetres == 0 || got.Value.ZCentimetres == 0 {
				t.Fatalf("saturation collapsed to zero: %+v", got.Value)
			}
		})
	}
}

func TestSpatialCapabilityFollowsUsablePositions(t *testing.T) {
	present := VehicleV1{GroundPosition: groundPosition(
		positionField(t, spatial.Position{X: 1, Z: 2}, schema.FreshnessFresh))}
	absent := VehicleV1{GroundPosition: groundPosition(
		positionField(t, spatial.Position{X: 1, Z: 2}, schema.FreshnessInvalid))}

	if got := capabilities(PayloadV1{Vehicles: []VehicleV1{absent}}); hasSpatial(got) {
		t.Fatalf("spatial was declared without a usable position: %v", got)
	}
	if got := capabilities(PayloadV1{Vehicles: []VehicleV1{absent, present}}); !hasSpatial(got) {
		t.Fatalf("spatial was not declared despite a usable position: %v", got)
	}
}

func hasSpatial(list []Capability) bool {
	for _, current := range list {
		if current == CapabilitySpatial {
			return true
		}
	}
	return false
}
