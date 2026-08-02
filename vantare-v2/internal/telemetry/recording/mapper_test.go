package recording

import (
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestMapperProducesClosedPseudonymousPayloadAndPreservesPresentZero(t *testing.T) {
	t.Parallel()
	received := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	header := envelope.Header{
		Cursor: schema.Cursor{Epoch: 1, Sequence: 1},
		Clock: schema.NewClock(
			mustField(t, 12*time.Second, schema.FreshnessFresh),
			schema.MissingField[time.Duration](),
			received,
		),
		Identity: identity.RunIdentity{
			Event: "private-event-id", Session: "private-session-id",
			Vehicle: "private-player-id", Driver: "private-driver-id",
		},
	}
	state := core.ObservedState{
		SourceTime: mustField(t, 12*time.Second, schema.FreshnessFresh),
		Vehicles: []core.VehicleState{{
			Identity: identity.RunIdentity{
				Event: "private-event-id", Session: "private-session-id",
				Vehicle: "private-vehicle-id", Driver: "private-driver-id",
			},
			Name:     mustField(t, vehicle.VehicleName("Private Driver"), schema.FreshnessFresh),
			SpeedMPS: mustField(t, 0.0, schema.FreshnessFresh),
			Throttle: mustField(t, schema.Ratio(0), schema.FreshnessFresh),
			Brake:    mustField(t, schema.Ratio(0), schema.FreshnessFresh),
			Gear:     mustField(t, vehicle.Gear(0), schema.FreshnessFresh),
			InPit:    mustField(t, pit.InPit(false), schema.FreshnessFresh),
		}},
	}
	snapshot, err := envelope.NewSnapshot(header, state, cloneStateForMapperTest)
	if err != nil {
		t.Fatalf("NewSnapshot() error = %v", err)
	}
	payload, err := NewMapper().Payload(snapshot)
	if err != nil {
		t.Fatalf("Payload() error = %v", err)
	}
	if len(payload.Vehicles) != 1 || payload.Vehicles[0].SessionSlot != 1 ||
		payload.Vehicles[0].Presence != PresenceSpeed|PresenceThrottle|PresenceBrake|PresenceGear|PresencePit ||
		payload.Vehicles[0].Throttle != 0 || payload.Vehicles[0].Brake != 0 ||
		payload.Vehicles[0].Gear != 0 || payload.Vehicles[0].InPit {
		t.Fatalf("payload = %#v", payload)
	}
	encoded, err := EncodePayloadV1(payload)
	if err != nil {
		t.Fatalf("EncodePayloadV1() error = %v", err)
	}
	for _, secret := range []string{
		"private-event-id", "private-session-id", "private-player-id",
		"private-driver-id", "private-vehicle-id", "Private Driver",
	} {
		if strings.Contains(string(encoded), secret) {
			t.Fatalf("encoded payload leaked %q: %s", secret, encoded)
		}
	}
}

func TestMapperKeepsSlotsStableWithinSessionAndFactsSeparate(t *testing.T) {
	t.Parallel()
	mapper := NewMapper()
	first := mapperSnapshot(t, 1, "vehicle-a")
	second := mapperSnapshot(t, 2, "vehicle-a")
	firstPayload, err := mapper.Payload(first)
	if err != nil {
		t.Fatalf("Payload(first) error = %v", err)
	}
	secondPayload, err := mapper.Payload(second)
	if err != nil {
		t.Fatalf("Payload(second) error = %v", err)
	}
	if firstPayload.Vehicles[0].SessionSlot != secondPayload.Vehicles[0].SessionSlot {
		t.Fatalf("slot changed: %d -> %d", firstPayload.Vehicles[0].SessionSlot, secondPayload.Vehicles[0].SessionSlot)
	}
	fact := envelope.NewFact(
		envelope.Header{Cursor: schema.Cursor{Epoch: 1, Sequence: 2}},
		core.SessionFact{
			Sequence:    1,
			Kind:        core.FactLapCompleted,
			OccurredUTC: time.Date(2026, 7, 30, 12, 0, 2, 0, time.UTC),
			Identity: identity.RunIdentity{
				Event: "event-secret", Session: "session-secret", Vehicle: "vehicle-a",
			},
			Lap: 3,
		},
	)
	batch, err := mapper.Batch(second, []envelope.Fact[core.SessionFact]{fact})
	if err != nil {
		t.Fatalf("Batch() error = %v", err)
	}
	if len(batch.Facts) != 1 || batch.Facts[0].SessionSlot != firstPayload.Vehicles[0].SessionSlot ||
		batch.Facts[0].FactSequence != 1 || batch.Facts[0].CausalSnapshotSequence != 2 ||
		batch.Accepted != (Cursor{Epoch: 1, Sequence: 2}) {
		t.Fatalf("batch = %#v", batch)
	}
}

func mapperSnapshot(t *testing.T, sequence schema.Sequence, vehicleID identity.VehicleID) envelope.Snapshot[core.ObservedState] {
	t.Helper()
	header := envelope.Header{
		Cursor: schema.Cursor{Epoch: 1, Sequence: sequence},
		Clock: schema.NewClock(
			schema.MissingField[time.Duration](),
			schema.MissingField[time.Duration](),
			time.Date(2026, 7, 30, 12, 0, int(sequence), 0, time.UTC),
		),
		Identity: identity.RunIdentity{Event: "event", Session: "session", Vehicle: vehicleID},
	}
	state := core.ObservedState{Vehicles: []core.VehicleState{{
		Identity: identity.RunIdentity{Event: "event", Session: "session", Vehicle: vehicleID},
		SpeedMPS: mustField(t, 50.0, schema.FreshnessFresh),
	}}}
	snapshot, err := envelope.NewSnapshot(header, state, cloneStateForMapperTest)
	if err != nil {
		t.Fatalf("NewSnapshot() error = %v", err)
	}
	return snapshot
}

func cloneStateForMapperTest(state core.ObservedState) core.ObservedState {
	state.Vehicles = append([]core.VehicleState(nil), state.Vehicles...)
	return state
}

func mustField[T comparable](t *testing.T, value T, freshness schema.Freshness) schema.Field[T] {
	t.Helper()
	field, err := schema.NewField(value, schema.ProvenanceObserved, freshness)
	if err != nil {
		t.Fatalf("NewField() error = %v", err)
	}
	return field
}
