package engineer_test

import (
	"testing"

	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

func TestConsumerSurfaceUsesOnlyEngineerTypes(t *testing.T) {
	t.Parallel()

	manifest, err := engineer.NewManifest([]engineer.Capability{
		{ID: "vehicle.speed", State: engineer.CapabilitySupported},
	})
	if err != nil {
		t.Fatalf("NewManifest(): %v", err)
	}
	if manifest.State("vehicle.speed") != engineer.CapabilitySupported {
		t.Fatal("manifest did not expose the declared capability")
	}

	context := engineer.Context{
		Epoch: 1,
		Identity: engineer.Identity{
			Event:   "event",
			Session: "session",
			Vehicle: "vehicle",
			Team:    "team",
			Driver:  "driver",
		},
	}
	boundary, err := engineer.ClassifyBoundary(context, context)
	if err != nil {
		t.Fatalf("ClassifyBoundary(): %v", err)
	}
	if boundary != engineer.BoundaryContinuous {
		t.Fatalf("boundary = %v, want continuous", boundary)
	}

	var field engineer.Field[int]
	var _ engineer.Provenance = field.Provenance()
	var observation engineer.ObservationV1
	var _ engineer.Context = observation.Context
	var _ engineer.Manifest = observation.Manifest
	var _ engineer.Field[float64] = observation.Player.Speed
	var snapshot engineer.ObservationSnapshotV1
	var _ uint64 = uint64(snapshot.Epoch)
	var _ engineer.ObservationV1 = snapshot.ObservationV1
}
