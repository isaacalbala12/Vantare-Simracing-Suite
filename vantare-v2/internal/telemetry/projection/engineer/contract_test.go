package engineer

import (
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

const (
	capabilitySpeed CapabilityID = "vehicle.speed"
	capabilityFuel  CapabilityID = "vehicle.fuel"
)

func TestFieldSeparatesZeroMissingStaleInvalidAndUnsupported(t *testing.T) {
	t.Parallel()

	manifest := mustManifest(t,
		Capability{ID: capabilitySpeed, State: CapabilitySupported},
		Capability{ID: capabilityFuel, State: CapabilityUnsupported},
	)
	zero := mustCanonicalField(t, 0, schema.FreshnessFresh)
	stale := mustCanonicalField(t, 12, schema.FreshnessStale)
	invalid := mustCanonicalField(t, 14, schema.FreshnessInvalid)

	tests := []struct {
		name        string
		build       func() (Field[int], error)
		wantState   ValueState
		wantValue   int
		wantPresent bool
		wantUsable  bool
	}{
		{
			name: "present zero",
			build: func() (Field[int], error) {
				return newField(manifest, capabilitySpeed, zero)
			},
			wantState:   ValueFresh,
			wantValue:   0,
			wantPresent: true,
			wantUsable:  true,
		},
		{
			name: "missing",
			build: func() (Field[int], error) {
				return newField(manifest, capabilitySpeed, schema.MissingField[int]())
			},
			wantState: ValueMissing,
		},
		{
			name: "stale",
			build: func() (Field[int], error) {
				return newField(manifest, capabilitySpeed, stale)
			},
			wantState:   ValueStale,
			wantValue:   12,
			wantPresent: true,
		},
		{
			name: "invalid",
			build: func() (Field[int], error) {
				return newField(manifest, capabilitySpeed, invalid)
			},
			wantState:   ValueInvalid,
			wantValue:   14,
			wantPresent: true,
		},
		{
			name: "unsupported",
			build: func() (Field[int], error) {
				return newUnsupportedField[int](manifest, capabilityFuel)
			},
			wantState: ValueUnsupported,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			field, err := tt.build()
			if err != nil {
				t.Fatalf("build field: %v", err)
			}
			value, present := field.Value()
			if field.State() != tt.wantState || value != tt.wantValue ||
				present != tt.wantPresent || field.Usable() != tt.wantUsable {
				t.Fatalf("field = state %v value %d present %v usable %v, want %v %d %v %v",
					field.State(), value, present, field.Usable(),
					tt.wantState, tt.wantValue, tt.wantPresent, tt.wantUsable)
			}
			if present && field.Provenance() != ProvenanceObserved {
				t.Fatalf("provenance = %v, want observed", field.Provenance())
			}
		})
	}
}

func TestFieldRejectsValueWithoutUsableCapability(t *testing.T) {
	t.Parallel()

	fresh := mustCanonicalField(t, 42, schema.FreshnessFresh)
	tests := []struct {
		name     string
		manifest Manifest
		id       CapabilityID
		wantErr  error
	}{
		{
			name:     "capability absent",
			manifest: mustManifest(t, Capability{ID: capabilityFuel, State: CapabilitySupported}),
			id:       capabilitySpeed,
			wantErr:  ErrCapabilityUnknown,
		},
		{
			name:     "capability explicitly unknown",
			manifest: mustManifest(t, Capability{ID: capabilitySpeed, State: CapabilityUnknown}),
			id:       capabilitySpeed,
			wantErr:  ErrCapabilityUnknown,
		},
		{
			name:     "capability unsupported",
			manifest: mustManifest(t, Capability{ID: capabilitySpeed, State: CapabilityUnsupported}),
			id:       capabilitySpeed,
			wantErr:  ErrCapabilityUnsupported,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if _, err := newField(tt.manifest, tt.id, fresh); !errors.Is(err, tt.wantErr) {
				t.Fatalf("newField() error = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestFieldAllowsMissingWhenCapabilityIsUnknown(t *testing.T) {
	t.Parallel()

	manifest := mustManifest(t, Capability{ID: capabilitySpeed, State: CapabilityUnknown})
	field, err := newField(manifest, capabilitySpeed, schema.MissingField[int]())
	if err != nil {
		t.Fatalf("newField() missing: %v", err)
	}
	if field.State() != ValueMissing || field.Usable() {
		t.Fatalf("missing unknown field = state %v usable %v", field.State(), field.Usable())
	}
}

func TestDegradedCapabilityRequiresAnExplicitConsumerDecision(t *testing.T) {
	t.Parallel()

	manifest := mustManifest(t, Capability{ID: capabilitySpeed, State: CapabilityDegraded})
	field, err := newField(manifest, capabilitySpeed, mustCanonicalField(t, 20, schema.FreshnessFresh))
	if err != nil {
		t.Fatalf("newField() degraded: %v", err)
	}
	if field.State() != ValueFresh || field.CapabilityState() != CapabilityDegraded || field.Usable() {
		t.Fatalf("degraded field = state %v capability %v usable %v",
			field.State(), field.CapabilityState(), field.Usable())
	}
}

func TestManifestRejectsInvalidEntriesAndOwnsItsSlice(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		entries []Capability
		wantErr error
	}{
		{name: "empty id", entries: []Capability{{State: CapabilitySupported}}, wantErr: ErrInvalidCapability},
		{name: "unknown state value", entries: []Capability{{ID: capabilitySpeed, State: CapabilityState(255)}}, wantErr: ErrInvalidCapability},
		{name: "duplicate id", entries: []Capability{{ID: capabilitySpeed, State: CapabilitySupported}, {ID: capabilitySpeed, State: CapabilityDegraded}}, wantErr: ErrDuplicateCapability},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if _, err := NewManifest(tt.entries); !errors.Is(err, tt.wantErr) {
				t.Fatalf("NewManifest() error = %v, want %v", err, tt.wantErr)
			}
		})
	}

	entries := []Capability{{ID: capabilitySpeed, State: CapabilitySupported}}
	manifest, err := NewManifest(entries)
	if err != nil {
		t.Fatalf("NewManifest(): %v", err)
	}
	entries[0].State = CapabilityUnsupported
	first := manifest.Entries()
	first[0].State = CapabilityUnsupported
	if got := manifest.State(capabilitySpeed); got != CapabilitySupported {
		t.Fatalf("manifest leaked mutable entries: state=%v", got)
	}
}

func TestClassifyBoundaryDefinesIdentityCancellation(t *testing.T) {
	t.Parallel()

	baseIdentity := testIdentity("event-a", "session-a", "car-a", "team-a", "driver-a")
	base := Context{Epoch: 4, Identity: baseIdentity}

	tests := []struct {
		name       string
		next       Context
		want       Boundary
		wantCancel bool
		wantErr    error
	}{
		{name: "continuous latest wins snapshot", next: Context{Epoch: 4, Identity: baseIdentity}, want: BoundaryContinuous},
		{name: "driver changed", next: Context{Epoch: 4, Identity: testIdentity("event-a", "session-a", "car-a", "team-a", "driver-b")}, want: BoundaryDriverChanged, wantCancel: true},
		{name: "team changed", next: Context{Epoch: 4, Identity: testIdentity("event-a", "session-a", "car-a", "team-b", "driver-a")}, want: BoundaryTeamChanged, wantCancel: true},
		{name: "skipped epoch is a full snapshot reset", next: Context{Epoch: 7, Identity: baseIdentity}, want: BoundaryEpochReset, wantCancel: true},
		{name: "vehicle changed", next: Context{Epoch: 5, Identity: testIdentity("event-a", "session-a", "car-b", "team-a", "driver-a")}, want: BoundaryVehicleChanged, wantCancel: true},
		{name: "session changed", next: Context{Epoch: 5, Identity: testIdentity("event-a", "session-b", "car-a", "team-a", "driver-a")}, want: BoundarySessionChanged, wantCancel: true},
		{name: "event changed", next: Context{Epoch: 5, Identity: testIdentity("event-b", "session-b", "car-a", "team-a", "driver-a")}, want: BoundaryEventChanged, wantCancel: true},
		{name: "event changed without epoch fails closed", next: Context{Epoch: 4, Identity: testIdentity("event-b", "session-a", "car-a", "team-a", "driver-a")}, want: BoundaryEventChanged, wantCancel: true, wantErr: ErrProjectionIdentityChange},
		{name: "session changed without epoch fails closed", next: Context{Epoch: 4, Identity: testIdentity("event-a", "session-b", "car-a", "team-a", "driver-a")}, want: BoundarySessionChanged, wantCancel: true, wantErr: ErrProjectionIdentityChange},
		{name: "vehicle changed without epoch fails closed", next: Context{Epoch: 4, Identity: testIdentity("event-a", "session-a", "car-b", "team-a", "driver-a")}, want: BoundaryVehicleChanged, wantCancel: true, wantErr: ErrProjectionIdentityChange},
		{name: "stale epoch", next: Context{Epoch: 3, Identity: baseIdentity}, wantErr: ErrStaleProjection},
		{name: "zero epoch", next: Context{Identity: baseIdentity}, wantErr: ErrInvalidProjectionEpoch},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ClassifyBoundary(base, tt.next)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("ClassifyBoundary() error = %v, want %v", err, tt.wantErr)
			}
			if tt.wantErr != nil && !tt.wantCancel {
				return
			}
			if got != tt.want || got.CancelsPending() != tt.wantCancel {
				t.Fatalf("boundary = %v cancel=%v, want %v cancel=%v",
					got, got.CancelsPending(), tt.want, tt.wantCancel)
			}
		})
	}
}

func mustManifest(t *testing.T, entries ...Capability) Manifest {
	t.Helper()
	manifest, err := NewManifest(entries)
	if err != nil {
		t.Fatalf("NewManifest(): %v", err)
	}
	return manifest
}

func mustCanonicalField[T comparable](t *testing.T, value T, freshness schema.Freshness) schema.Field[T] {
	t.Helper()
	field, err := schema.NewField(value, schema.ProvenanceObserved, freshness)
	if err != nil {
		t.Fatalf("schema.NewField(): %v", err)
	}
	return field
}

func testIdentity(event, session, vehicle, team, driver string) Identity {
	return Identity{
		Event:   EventID(event),
		Session: SessionID(session),
		Vehicle: VehicleID(vehicle),
		Team:    TeamID(team),
		Driver:  DriverID(driver),
	}
}
