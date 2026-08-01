package lmu

import (
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
)

func TestRealLMU13FixturePublishesValidatedSpatialGeometry(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	got, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Vehicles) != 44 {
		t.Fatalf("vehicles = %d, want 44", len(got.Vehicles))
	}
	for index, current := range got.Vehicles {
		if current.WorldPosition.Freshness() != schema.FreshnessFresh ||
			current.LocalVelocity.Freshness() != schema.FreshnessFresh ||
			current.Orientation.Freshness() != schema.FreshnessFresh {
			t.Fatalf("row %d spatial freshness = position:%v velocity:%v orientation:%v", index,
				current.WorldPosition.Freshness(), current.LocalVelocity.Freshness(), current.Orientation.Freshness())
		}
	}

	player := vehicleBySourceID(t, got, 0)
	position, _ := player.WorldPosition.Value()
	velocity, _ := player.LocalVelocity.Value()
	orientation, _ := player.Orientation.Value()
	assertNear(t, position.X, -487.8100280761719, 1e-12)
	assertNear(t, position.Z, -482.8159484863281, 1e-12)
	assertNear(t, velocity.Z, -15.5912675857544, 1e-12)
	assertNear(t, orientation.Row2.X, -0.8669500350952148, 1e-12)
	assertNear(t, determinant(orientation), 1, 1e-6)

	// Independent test oracle: matrix columns map the world-space delta into
	// LMU local +X left, +Y up, +Z rearward. Source ID 30 is demonstrably on
	// the positive local-X side in this hash-pinned real capture.
	rival := vehicleBySourceID(t, got, 30)
	rivalPosition, _ := rival.WorldPosition.Value()
	local := worldDeltaInVehicleFrame(position, rivalPosition, orientation)
	assertNear(t, local.X, 63.8869364506716, 1e-6)
	assertNear(t, local.Y, -2.26703562668103, 1e-6)
	assertNear(t, local.Z, 189.645536363618, 1e-6)
	if local.X <= 0 {
		t.Fatalf("known positive-left oracle became %+v", local)
	}
}

func TestSpatialInvalidityFailsClosedWithoutRejectingOtherTelemetry(t *testing.T) {
	input := knownBuffer(t)
	base, _ := lmu13Layout.ScoringRows.rowBase(0)
	writeFloat64(input, base+lmu13Layout.Scoring.WorldPosition.Offset, math.NaN())
	writeFloat64(input, base+lmu13Layout.Scoring.LocalVelocity.Offset, math.Inf(1))
	for index := 0; index < lmu13Layout.Scoring.Orientation.Count; index++ {
		writeFloat64(input, base+lmu13Layout.Scoring.Orientation.Offset+index*8, 0)
	}

	got, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if got.Compatibility != CompatibilityKnown || len(got.Vehicles) != 44 {
		t.Fatalf("non-spatial telemetry was rejected: compatibility=%v rows=%d", got.Compatibility, len(got.Vehicles))
	}
	row := got.Vehicles[0]
	if row.WorldPosition.Freshness() != schema.FreshnessInvalid ||
		row.LocalVelocity.Freshness() != schema.FreshnessInvalid ||
		row.Orientation.Freshness() != schema.FreshnessInvalid {
		t.Fatalf("invalid geometry escaped: position=%v velocity=%v orientation=%v",
			row.WorldPosition.Freshness(), row.LocalVelocity.Freshness(), row.Orientation.Freshness())
	}
	if row.Position.Freshness() != schema.FreshnessFresh {
		t.Fatalf("standings position was collateral damage: %v", row.Position.Freshness())
	}
}

func TestSpatialZeroPositionAndVelocityRemainPresent(t *testing.T) {
	input := knownBuffer(t)
	base, _ := lmu13Layout.ScoringRows.rowBase(0)
	for index := 0; index < 3; index++ {
		writeFloat64(input, base+lmu13Layout.Scoring.WorldPosition.Offset+index*8, 0)
		writeFloat64(input, base+lmu13Layout.Scoring.LocalVelocity.Offset+index*8, 0)
	}
	writeIdentityOrientation(input, base+lmu13Layout.Scoring.Orientation.Offset)

	got, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	row := got.Vehicles[0]
	position, positionPresent := row.WorldPosition.Value()
	velocity, velocityPresent := row.LocalVelocity.Value()
	if !positionPresent || !velocityPresent || position != (spatial.Position{}) || velocity != (spatial.LocalVelocity{}) {
		t.Fatalf("legitimate zero lost: position=(%+v,%v) velocity=(%+v,%v)", position, positionPresent, velocity, velocityPresent)
	}
}

func TestInvalidPlayerFastGeometryFallsBackToCorrelatedScoringRow(t *testing.T) {
	input := knownBuffer(t)
	telemetryBase, _ := lmu13Layout.TelemetryRows.rowBase(43)
	writeFloat64(input, telemetryBase+lmu13Layout.Telemetry.WorldPosition.Offset, math.NaN())
	writeFloat64(input, telemetryBase+lmu13Layout.Telemetry.LocalVelocity.Offset, math.Inf(1))
	for index := 0; index < lmu13Layout.Telemetry.Orientation.Count; index++ {
		writeFloat64(input, telemetryBase+lmu13Layout.Telemetry.Orientation.Offset+index*8, 0)
	}

	got, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	player := vehicleBySourceID(t, got, 0)
	position, present := player.WorldPosition.Value()
	if !present || player.WorldPosition.Freshness() != schema.FreshnessFresh {
		t.Fatalf("scoring fallback position = (%+v,%v,%v)", position, present, player.WorldPosition.Freshness())
	}
	assertNear(t, position.X, -485.3604736328125, 1e-12)
	if player.LocalVelocity.Freshness() != schema.FreshnessFresh || player.Orientation.Freshness() != schema.FreshnessFresh {
		t.Fatalf("scoring fallback quality = velocity:%v orientation:%v", player.LocalVelocity.Freshness(), player.Orientation.Freshness())
	}
}

func vehicleBySourceID(t testing.TB, observation Observation, id VehicleSourceID) VehicleObservation {
	t.Helper()
	for _, current := range observation.Vehicles {
		if current.SourceID == id {
			return current
		}
	}
	t.Fatalf("source ID %d not found", id)
	return VehicleObservation{}
}

func worldDeltaInVehicleFrame(player, opponent spatial.Position, orientation spatial.Orientation) spatial.Vector3 {
	delta := spatial.Vector3{X: opponent.X - player.X, Y: opponent.Y - player.Y, Z: opponent.Z - player.Z}
	return spatial.Vector3{
		X: delta.X*orientation.Row0.X + delta.Y*orientation.Row1.X + delta.Z*orientation.Row2.X,
		Y: delta.X*orientation.Row0.Y + delta.Y*orientation.Row1.Y + delta.Z*orientation.Row2.Y,
		Z: delta.X*orientation.Row0.Z + delta.Y*orientation.Row1.Z + delta.Z*orientation.Row2.Z,
	}
}

func determinant(value spatial.Orientation) float64 {
	return value.Row0.X*(value.Row1.Y*value.Row2.Z-value.Row1.Z*value.Row2.Y) -
		value.Row0.Y*(value.Row1.X*value.Row2.Z-value.Row1.Z*value.Row2.X) +
		value.Row0.Z*(value.Row1.X*value.Row2.Y-value.Row1.Y*value.Row2.X)
}

func writeIdentityOrientation(buffer []byte, offset int) {
	for index, value := range []float64{1, 0, 0, 0, 1, 0, 0, 0, 1} {
		writeFloat64(buffer, offset+index*8, value)
	}
}

func writeFloat64(buffer []byte, offset int, value float64) {
	binary.LittleEndian.PutUint64(buffer[offset:], math.Float64bits(value))
}

func assertNear(t testing.TB, got, want, tolerance float64) {
	t.Helper()
	if math.Abs(got-want) > tolerance {
		t.Fatalf("value = %.15f, want %.15f (+/-%g)", got, want, tolerance)
	}
}
