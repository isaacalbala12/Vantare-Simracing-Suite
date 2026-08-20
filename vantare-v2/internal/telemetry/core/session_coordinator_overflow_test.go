package core

import (
	"context"
	"fmt"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestVehicleHistoryDoesNotOverflowInLongSession(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{})
	for sequence := 1; sequence <= 300; sequence++ {
		snapshot := coordinatorSnapshot(t, 1, schema.Sequence(sequence), "lmu", run("event", "session", "player", "team", "driver"), 1)
		state, _ := snapshot.Value()
		state.Vehicles[0].Identity.Vehicle = identity.VehicleID(fmt.Sprintf("vehicle-%03d", sequence))
		snapshot, _ = envelope.NewSnapshot(snapshot.Header(), state, cloneObservedState)
		if err := coordinator.Apply(context.Background(), snapshot, discardFactSink{}); err != nil {
			t.Fatalf("identity %d of 300 rejected: %v", sequence, err)
		}
	}
}

func TestIdentityEvictionKeepsBoundedMemory(t *testing.T) {
	coordinator := NewSessionCoordinator(SessionCoordinatorConfig{MaxVehicleHistory: 16})
	for sequence := 1; sequence <= 500; sequence++ {
		snapshot := coordinatorSnapshot(t, 1, schema.Sequence(sequence), "lmu", run("event", "session", "player", "team", "driver"), 1)
		state, _ := snapshot.Value()
		state.Vehicles[0].Identity.Vehicle = identity.VehicleID(fmt.Sprintf("vehicle-%03d", sequence))
		snapshot, _ = envelope.NewSnapshot(snapshot.Header(), state, cloneObservedState)
		if err := coordinator.Apply(context.Background(), snapshot, discardFactSink{}); err != nil {
			t.Fatalf("identity %d rejected: %v", sequence, err)
		}
		if got := len(coordinator.state.vehicles); got > 16 {
			t.Fatalf("identity history size = %d, want <= 16", got)
		}
	}
	if got := coordinator.Metrics().IdentityEvicted; got != 484 {
		t.Fatalf("IdentityEvicted = %d, want 484", got)
	}
}
