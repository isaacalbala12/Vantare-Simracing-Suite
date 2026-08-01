package engineer

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestProjectObservationV1GoldenPreservesCapabilityAndFieldSemantics(t *testing.T) {
	t.Parallel()

	manifest := mustManifest(t,
		Capability{ID: CapabilitySession, State: CapabilitySupported},
		Capability{ID: CapabilityStandings, State: CapabilitySupported},
		Capability{ID: CapabilityControls, State: CapabilitySupported},
		Capability{ID: CapabilityPit, State: CapabilityUnsupported},
	)

	got, err := ProjectObservationV1(engineerInput(t), manifest)
	if err != nil {
		t.Fatalf("ProjectObservationV1() error = %v", err)
	}
	if got.Context.Epoch != 3 || got.Context.Identity.Vehicle != "car-4" {
		t.Fatalf("context = %+v", got.Context)
	}
	if value, present := got.Player.Throttle.Value(); !present || value != 0 ||
		got.Player.Throttle.State() != ValueFresh || !got.Player.Throttle.Usable() {
		t.Fatalf("fresh zero throttle lost semantics: state=%v value=%v present=%v usable=%v",
			got.Player.Throttle.State(), value, present, got.Player.Throttle.Usable())
	}
	if got.Player.Speed.State() != ValueStale || got.Player.Speed.Usable() {
		t.Fatalf("stale speed became usable: state=%v usable=%v",
			got.Player.Speed.State(), got.Player.Speed.Usable())
	}
	if got.TrackName.State() != ValueMissing {
		t.Fatalf("missing track = %v", got.TrackName.State())
	}
	if got.Player.InPit.State() != ValueUnsupported ||
		got.Player.PitStopCount.State() != ValueUnsupported {
		t.Fatalf("unsupported pit fields = inPit:%v stops:%v",
			got.Player.InPit.State(), got.Player.PitStopCount.State())
	}
	if got.Manifest.State(CapabilityControls) != CapabilitySupported {
		t.Fatal("observation did not retain its owned manifest")
	}

	if got.ProjectionVersion != VersionV1 || got.Sequence != 5 || got.CapturedAt == "" {
		t.Fatalf("transversal metadata lost: %+v", got.Metadata)
	}
	assertAdapterGolden(t, describeObservation(got.ObservationV1), "engineer_observation_v1.golden.txt")
}

func TestAdaptProjectedV1TreatsUnknownSupportedUnsupportedAndDegradedSafely(t *testing.T) {
	t.Parallel()

	projected, err := ProjectV1(engineerInput(t))
	if err != nil {
		t.Fatal(err)
	}
	identity := identityFromHeader(engineerHeader())

	tests := []struct {
		name          string
		manifest      Manifest
		wantErr       error
		wantThrottle  ValueState
		wantPit       ValueState
		throttleWorks bool
	}{
		{
			name: "supported controls and unknown absent pit",
			manifest: mustManifest(t,
				Capability{ID: CapabilitySession, State: CapabilitySupported},
				Capability{ID: CapabilityStandings, State: CapabilitySupported},
				Capability{ID: CapabilityControls, State: CapabilitySupported},
			),
			wantThrottle:  ValueFresh,
			wantPit:       ValueMissing,
			throttleWorks: true,
		},
		{
			name: "degraded controls require consumer policy",
			manifest: mustManifest(t,
				Capability{ID: CapabilitySession, State: CapabilitySupported},
				Capability{ID: CapabilityStandings, State: CapabilitySupported},
				Capability{ID: CapabilityControls, State: CapabilityDegraded},
			),
			wantThrottle: ValueFresh,
			wantPit:      ValueMissing,
		},
		{
			name: "unsupported absent pit is explicit",
			manifest: mustManifest(t,
				Capability{ID: CapabilitySession, State: CapabilitySupported},
				Capability{ID: CapabilityStandings, State: CapabilitySupported},
				Capability{ID: CapabilityControls, State: CapabilitySupported},
				Capability{ID: CapabilityPit, State: CapabilityUnsupported},
			),
			wantThrottle:  ValueFresh,
			wantPit:       ValueUnsupported,
			throttleWorks: true,
		},
		{
			name: "unknown capability cannot accompany available values",
			manifest: mustManifest(t,
				Capability{ID: CapabilitySession, State: CapabilitySupported},
				Capability{ID: CapabilityStandings, State: CapabilitySupported},
			),
			wantErr: ErrProjectionCapabilityConflict,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := adaptProjectedV1(projected.Metadata, identity, projected.PayloadV1, tt.manifest)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("AdaptProjectedV1() error = %v, want %v", err, tt.wantErr)
			}
			if tt.wantErr != nil {
				return
			}
			if got.Player.Throttle.State() != tt.wantThrottle ||
				got.Player.Throttle.Usable() != tt.throttleWorks {
				t.Fatalf("throttle = state:%v usable:%v, want state:%v usable:%v",
					got.Player.Throttle.State(), got.Player.Throttle.Usable(),
					tt.wantThrottle, tt.throttleWorks)
			}
			if got.Player.InPit.State() != tt.wantPit {
				t.Fatalf("in pit state = %v, want %v", got.Player.InPit.State(), tt.wantPit)
			}
		})
	}
}

func TestAdaptProjectedV1PreservesInvalidAndNonObservedProvenance(t *testing.T) {
	t.Parallel()

	projected, err := ProjectV1(engineerInput(t))
	if err != nil {
		t.Fatal(err)
	}
	manifest := mustManifest(t,
		Capability{ID: CapabilitySession, State: CapabilitySupported},
		Capability{ID: CapabilityStandings, State: CapabilitySupported},
		Capability{ID: CapabilityControls, State: CapabilitySupported},
	)
	identity := identityFromHeader(engineerHeader())

	tests := []struct {
		name           string
		field          projection.Field[float64]
		wantState      ValueState
		wantProvenance Provenance
		wantValue      float64
		wantUsable     bool
	}{
		{
			name: "derived fresh value",
			field: projection.Field[float64]{
				Present:    true,
				Value:      0.25,
				Provenance: projection.ProvenanceDerived,
				Freshness:  projection.FreshnessFresh,
			},
			wantState:      ValueFresh,
			wantProvenance: ProvenanceDerived,
			wantValue:      0.25,
			wantUsable:     true,
		},
		{
			name: "estimated fresh value",
			field: projection.Field[float64]{
				Present:    true,
				Value:      0.5,
				Provenance: projection.ProvenanceEstimated,
				Freshness:  projection.FreshnessFresh,
			},
			wantState:      ValueFresh,
			wantProvenance: ProvenanceEstimated,
			wantValue:      0.5,
			wantUsable:     true,
		},
		{
			name: "invalid observed value remains diagnostic only",
			field: projection.Field[float64]{
				Present:    true,
				Value:      0.75,
				Provenance: projection.ProvenanceObserved,
				Freshness:  projection.FreshnessInvalid,
			},
			wantState:      ValueInvalid,
			wantProvenance: ProvenanceObserved,
			wantValue:      0.75,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := adaptProjectedV1(
				projected.Metadata,
				identity,
				withThrottle(projected.PayloadV1, tt.field),
				manifest,
			)
			if err != nil {
				t.Fatalf("adaptProjectedV1() error = %v", err)
			}
			value, present := got.Player.Throttle.Value()
			if !present || value != tt.wantValue ||
				got.Player.Throttle.State() != tt.wantState ||
				got.Player.Throttle.Provenance() != tt.wantProvenance ||
				got.Player.Throttle.Usable() != tt.wantUsable {
				t.Fatalf(
					"throttle = value:%v present:%t state:%v provenance:%v usable:%t, want value:%v present:true state:%v provenance:%v usable:%t",
					value,
					present,
					got.Player.Throttle.State(),
					got.Player.Throttle.Provenance(),
					got.Player.Throttle.Usable(),
					tt.wantValue,
					tt.wantState,
					tt.wantProvenance,
					tt.wantUsable,
				)
			}
		})
	}
}

func TestAdaptProjectedV1FailsClosedOnContradictions(t *testing.T) {
	t.Parallel()

	projected, err := ProjectV1(engineerInput(t))
	if err != nil {
		t.Fatal(err)
	}
	identity := identityFromHeader(engineerHeader())
	supported := mustManifest(t,
		Capability{ID: CapabilitySession, State: CapabilitySupported},
		Capability{ID: CapabilityStandings, State: CapabilitySupported},
		Capability{ID: CapabilityControls, State: CapabilitySupported},
	)

	tests := []struct {
		name     string
		metadata projection.Metadata
		identity Identity
		payload  PayloadV1
		manifest Manifest
		wantErr  error
	}{
		{
			name:     "wrong projection version",
			metadata: withProjectionVersion(projected.Metadata, 2),
			identity: identity,
			payload:  projected.PayloadV1,
			manifest: supported,
			wantErr:  projection.ErrUnknownProjectionVersion,
		},
		{
			name:     "wrong canonical version",
			metadata: withCanonicalVersion(projected.Metadata, 2),
			identity: identity,
			payload:  projected.PayloadV1,
			manifest: supported,
			wantErr:  ErrProjectionCanonicalVersion,
		},
		{
			name:     "zero epoch",
			metadata: withEpoch(projected.Metadata, 0),
			identity: identity,
			payload:  projected.PayloadV1,
			manifest: supported,
			wantErr:  ErrInvalidProjectionEpoch,
		},
		{
			name:     "vehicle identity disagrees with payload",
			metadata: projected.Metadata,
			identity: testIdentity("event-2", "session-2", "other-car", "", ""),
			payload:  projected.PayloadV1,
			manifest: supported,
			wantErr:  ErrProjectionPayloadConflict,
		},
		{
			name:     "duplicate capability group",
			metadata: projected.Metadata,
			identity: identity,
			payload:  withCapabilityGroups(projected.PayloadV1, GroupControls, GroupControls),
			manifest: supported,
			wantErr:  ErrProjectionCapabilityConflict,
		},
		{
			name:     "unknown capability group",
			metadata: projected.Metadata,
			identity: identity,
			payload:  withCapabilityGroups(projected.PayloadV1, CapabilityGroup("future")),
			manifest: supported,
			wantErr:  ErrProjectionCapabilityConflict,
		},
		{
			name:     "declared groups disagree with fields",
			metadata: projected.Metadata,
			identity: identity,
			payload:  withCapabilityGroups(projected.PayloadV1, GroupSession),
			manifest: supported,
			wantErr:  ErrProjectionCapabilityConflict,
		},
		{
			name:     "unknown manifest capability",
			metadata: projected.Metadata,
			identity: identity,
			payload:  projected.PayloadV1,
			manifest: mustManifest(t,
				Capability{ID: CapabilitySession, State: CapabilitySupported},
				Capability{ID: CapabilityStandings, State: CapabilitySupported},
				Capability{ID: CapabilityControls, State: CapabilitySupported},
				Capability{ID: "future", State: CapabilitySupported},
			),
			wantErr: ErrProjectionCapabilityConflict,
		},
		{
			name:     "present value with unknown provenance",
			metadata: projected.Metadata,
			identity: identity,
			payload:  withThrottle(projected.PayloadV1, projection.Field[float64]{Present: true, Freshness: projection.FreshnessFresh}),
			manifest: supported,
			wantErr:  ErrProjectionCapabilityConflict,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if _, err := adaptProjectedV1(tt.metadata, tt.identity, tt.payload, tt.manifest); !errors.Is(err, tt.wantErr) {
				t.Fatalf("adaptProjectedV1() error = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestAdaptProjectedV1AllowsLatestWinsSequenceSkips(t *testing.T) {
	t.Parallel()

	projected, err := ProjectV1(engineerInput(t))
	if err != nil {
		t.Fatal(err)
	}
	manifest := mustManifest(t,
		Capability{ID: CapabilitySession, State: CapabilitySupported},
		Capability{ID: CapabilityStandings, State: CapabilitySupported},
		Capability{ID: CapabilityControls, State: CapabilitySupported},
	)
	identity := identityFromHeader(engineerHeader())
	first, err := adaptProjectedV1(projected.Metadata, identity, projected.PayloadV1, manifest)
	if err != nil {
		t.Fatal(err)
	}

	latest := projected.Metadata
	latest.Sequence = 999
	next, err := adaptProjectedV1(latest, identity, projected.PayloadV1, manifest)
	if err != nil {
		t.Fatalf("latest-wins gap rejected: %v", err)
	}
	boundary, err := ClassifyBoundary(first.Context, next.Context)
	if err != nil {
		t.Fatal(err)
	}
	if boundary != BoundaryContinuous {
		t.Fatalf("sequence-only skip boundary = %v, want continuous", boundary)
	}
}

func withProjectionVersion(metadata projection.Metadata, version projection.Version) projection.Metadata {
	metadata.ProjectionVersion = version
	return metadata
}

func withCanonicalVersion(metadata projection.Metadata, version schema.Version) projection.Metadata {
	metadata.CanonicalVersion = version
	return metadata
}

func withEpoch(metadata projection.Metadata, epoch uint64) projection.Metadata {
	metadata.Epoch = schema.Epoch(epoch)
	return metadata
}

func withCapabilityGroups(payload PayloadV1, groups ...CapabilityGroup) PayloadV1 {
	payload.Capabilities = append([]CapabilityGroup(nil), groups...)
	return payload
}

func withThrottle(payload PayloadV1, field projection.Field[float64]) PayloadV1 {
	payload.Player.Throttle = projection.Field[schema.Ratio]{
		Present:    field.Present,
		Value:      schema.Ratio(field.Value),
		Provenance: field.Provenance,
		Freshness:  field.Freshness,
	}
	return payload
}

func describeObservation(observation ObservationV1) string {
	field := func(name string, valueState ValueState, capabilityState CapabilityState, provenance Provenance, value any, present, usable bool) string {
		return fmt.Sprintf("%s state=%d capability=%d provenance=%d present=%t usable=%t value=%v",
			name, valueState, capabilityState, provenance, present, usable, value)
	}
	lines := []string{
		fmt.Sprintf("context epoch=%d event=%s session=%s vehicle=%s team=%s driver=%s",
			observation.Context.Epoch,
			observation.Context.Identity.Event,
			observation.Context.Identity.Session,
			observation.Context.Identity.Vehicle,
			observation.Context.Identity.Team,
			observation.Context.Identity.Driver),
	}
	for _, capability := range observation.Manifest.Entries() {
		lines = append(lines, fmt.Sprintf("capability %s=%d", capability.ID, capability.State))
	}
	track, trackPresent := observation.TrackName.Value()
	lines = append(lines, field("track", observation.TrackName.State(), observation.TrackName.CapabilityState(),
		observation.TrackName.Provenance(), track, trackPresent, observation.TrackName.Usable()))
	speed, speedPresent := observation.Player.Speed.Value()
	lines = append(lines, field("speed", observation.Player.Speed.State(), observation.Player.Speed.CapabilityState(),
		observation.Player.Speed.Provenance(), speed, speedPresent, observation.Player.Speed.Usable()))
	throttle, throttlePresent := observation.Player.Throttle.Value()
	lines = append(lines, field("throttle", observation.Player.Throttle.State(), observation.Player.Throttle.CapabilityState(),
		observation.Player.Throttle.Provenance(), throttle, throttlePresent, observation.Player.Throttle.Usable()))
	inPit, inPitPresent := observation.Player.InPit.Value()
	lines = append(lines, field("inPit", observation.Player.InPit.State(), observation.Player.InPit.CapabilityState(),
		observation.Player.InPit.Provenance(), inPit, inPitPresent, observation.Player.InPit.Usable()))
	return strings.Join(lines, "\n") + "\n"
}

func assertAdapterGolden(t *testing.T, got, name string) {
	t.Helper()
	want, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	if got != string(want) {
		t.Fatalf("adapter golden mismatch\n got:\n%s\nwant:\n%s", got, want)
	}
}
