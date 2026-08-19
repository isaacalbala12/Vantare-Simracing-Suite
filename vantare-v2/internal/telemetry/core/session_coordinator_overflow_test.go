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
	t.Skip("ISA-371 D-04: activar en F3")
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
