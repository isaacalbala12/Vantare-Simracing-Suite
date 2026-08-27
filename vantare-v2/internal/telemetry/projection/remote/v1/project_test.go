package v1

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

func TestProjectRepresentativeSnapshotMatchesGolden(t *testing.T) {
	update := mustProject(t, representativeSnapshot(t))
	if update.Version != VersionV1 || update.Kind != KindFull || update.CanonicalVersion != CanonicalVersionV1 {
		t.Fatalf("envelope = version %d kind %q canonical %d", update.Version, update.Kind, update.CanonicalVersion)
	}
	if update.StreamEpoch != 7 || update.Revision != 42 || update.SessionID != "remote-session-1" {
		t.Fatalf("identity envelope = %+v", update)
	}
	if update.Player.VehicleID != "vehicle-001" {
		t.Fatalf("player vehicle = %q", update.Player.VehicleID)
	}
	if update.Player.Brake.Value == nil || *update.Player.Brake.Value != 0 || update.Player.Brake.Quality != QualityFresh {
		t.Fatalf("fresh zero brake lost presence: %+v", update.Player.Brake)
	}
	if len(update.Vehicles) != 2 || update.Vehicles[1].LapDistanceMeters.Quality != QualityStale {
		t.Fatalf("vehicles = %+v", update.Vehicles)
	}
	assertGoldenMatchesEncoded(t, "active.golden.json", update)
}

func TestProjectMinimalSnapshotMatchesGolden(t *testing.T) {
	update := mustProject(t, minimalSnapshot(t))
	if update.Player.VehicleID != "" {
		t.Fatalf("minimal player id = %q", update.Player.VehicleID)
	}
	if update.Vehicles == nil || len(update.Vehicles) != 0 {
		t.Fatalf("minimal vehicles = %#v, want non-nil empty list", update.Vehicles)
	}
	if update.Session.Track.Quality != QualityMissing || update.Player.SpeedMPS.Quality != QualityMissing {
		t.Fatalf("minimal update invented values: %+v", update)
	}
	assertGoldenMatchesEncoded(t, "minimal.golden.json", update)
}

func TestProjectAcceptsFreshDeltaReferenceWithUnavailableSeconds(t *testing.T) {
	tests := []struct {
		name    string
		seconds schema.Field[session.DeltaSeconds]
		want    Quality
	}{
		{name: "missing", seconds: schema.MissingField[session.DeltaSeconds](), want: QualityMissing},
		{name: "invalid", seconds: fixtureDerived(session.DeltaSeconds(0), schema.FreshnessInvalid), want: QualityInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			base := representativeSnapshot(t)
			final, ok := base.Value()
			if !ok {
				t.Fatal("representative snapshot unavailable")
			}
			final.Derived.Delta.Seconds = tt.seconds

			update, err := Project(fixtureSnapshot(t, base.Header(), final))
			if err != nil {
				t.Fatalf("Project() error = %v", err)
			}
			if update.Player.DeltaSeconds.Quality != tt.want || update.Player.DeltaSeconds.Value != nil {
				t.Fatalf("delta seconds = %+v, want quality %q without value", update.Player.DeltaSeconds, tt.want)
			}
			if update.Player.DeltaReference.Quality != QualityFresh || update.Player.DeltaReference.Value == nil {
				t.Fatalf("delta reference = %+v, want fresh value", update.Player.DeltaReference)
			}
			if _, err := Encode(update); err != nil {
				t.Fatalf("Encode(projected update) error = %v", err)
			}
		})
	}
}

func TestEncodedPayloadFits104Vehicles(t *testing.T) {
	encoded, err := Encode(mustProject(t, sizedSnapshot(t, MaxVehiclesV1)))
	if err != nil {
		t.Fatalf("Encode(104 vehicles) error = %v", err)
	}
	if len(encoded) >= MaxPayloadBytesV1 {
		t.Fatalf("104 vehicle payload = %d bytes, limit = %d", len(encoded), MaxPayloadBytesV1)
	}
	t.Logf("104 vehicle payload: %d bytes of %d", len(encoded), MaxPayloadBytesV1)
}

func assertGoldenMatchesEncoded(t testing.TB, name string, update RemoteCanonicalUpdateV1) {
	t.Helper()
	wantPretty, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read golden %s: %v", name, err)
	}
	var want bytes.Buffer
	if err := json.Compact(&want, wantPretty); err != nil {
		t.Fatalf("compact golden %s: %v", name, err)
	}
	got, err := Encode(update)
	if err != nil {
		t.Fatalf("Encode() error = %v", err)
	}
	if !bytes.Equal(got, want.Bytes()) {
		t.Fatalf("encoded update differs from %s\ngot:  %s\nwant: %s", name, got, want.Bytes())
	}
}
