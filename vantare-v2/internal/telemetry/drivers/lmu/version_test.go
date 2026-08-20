package lmu

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBuildEvidenceUsesExplicitAllowlist(t *testing.T) {
	tests := []struct {
		name     string
		evidence BuildEvidence
		want     string
		ok       bool
	}{
		{name: "file only exact", evidence: BuildEvidence{FileVersion: "1.3.0.0"}, want: supportedLMUVersion, ok: true},
		{name: "product only normalizes", evidence: BuildEvidence{ProductVersion: "1.3.0"}, want: supportedLMUVersion, ok: true},
		{name: "both exact", evidence: BuildEvidence{FileVersion: "1.3.0.0", ProductVersion: "1.3.0.0"}, want: supportedLMUVersion, ok: true},
		{name: "both equivalent after normalization", evidence: BuildEvidence{FileVersion: "1.3.0", ProductVersion: "1.3.0.0"}, want: supportedLMUVersion, ok: true},
		{name: "file newer contradicts product", evidence: BuildEvidence{FileVersion: "1.4.0.0", ProductVersion: "1.3.0.0"}},
		{name: "product newer contradicts file", evidence: BuildEvidence{FileVersion: "1.3.0.0", ProductVersion: "1.4.0.0"}},
		{name: "both same and evidence-pinned", evidence: BuildEvidence{FileVersion: "1.4.0.0", ProductVersion: "1.4.0.0"}, want: diagnosticLMUVersion, ok: true},
		{name: "both empty", evidence: BuildEvidence{}},
		{name: "file only newer not allowlisted", evidence: BuildEvidence{FileVersion: "1.4.0.0"}},
		{name: "one malformed and one allowlisted", evidence: BuildEvidence{FileVersion: "path/C:/private/1.3.0.0", ProductVersion: "1.3.0.0"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := tt.evidence.supportedVersion()
			if got != tt.want || ok != tt.ok {
				t.Fatalf("supportedVersion = %q,%v want %q,%v", got, ok, tt.want, tt.ok)
			}
		})
	}
}

func TestLMU14BuildRequiresAndHasPinnedSanitizedFixtures(t *testing.T) {
	evidence := BuildEvidence{
		FileVersion:    diagnosticLMUVersion,
		ProductVersion: diagnosticLMUVersion,
	}
	if !hasPinnedSanitizedFixtures(diagnosticLMUVersion) {
		t.Fatal("LMU 1.4 is missing pinned menu, track or REST evidence")
	}
	if version, supported := evidence.supportedVersion(); !supported || version != diagnosticLMUVersion {
		t.Fatalf("production supportedVersion() = %q,%v after pinned evidence", version, supported)
	}
}

func TestPinnedFixtureEvidenceRequiresEveryConfiguredSHA256(t *testing.T) {
	menu := supportedLMUVersions[supportedLMUVersion].menuSHA256
	track := supportedLMUVersions[supportedLMUVersion].trackSHA256
	restMenu := supportedLMUVersions[diagnosticLMUVersion].restMenuSHA256
	restTrack := supportedLMUVersions[diagnosticLMUVersion].restTrackSHA256
	for _, test := range []struct {
		name     string
		evidence pinnedFixtureEvidence
		want     bool
	}{
		{name: "both", evidence: pinnedFixtureEvidence{menuSHA256: menu, trackSHA256: track}, want: true},
		{name: "all REST-required", evidence: pinnedFixtureEvidence{
			menuSHA256: menu, trackSHA256: track, restMenuSHA256: restMenu,
			restTrackSHA256: restTrack, requireREST: true,
		}, want: true},
		{name: "REST-required menu missing", evidence: pinnedFixtureEvidence{
			menuSHA256: menu, trackSHA256: track, restTrackSHA256: restTrack, requireREST: true,
		}},
		{name: "REST-required track missing", evidence: pinnedFixtureEvidence{
			menuSHA256: menu, trackSHA256: track, restMenuSHA256: restMenu, requireREST: true,
		}},
		{name: "menu only", evidence: pinnedFixtureEvidence{menuSHA256: menu}},
		{name: "track only", evidence: pinnedFixtureEvidence{trackSHA256: track}},
		{name: "invalid menu", evidence: pinnedFixtureEvidence{menuSHA256: strings.Repeat("z", 64), trackSHA256: track}},
		{name: "short track", evidence: pinnedFixtureEvidence{menuSHA256: menu, trackSHA256: track[:63]}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := test.evidence.pinned(); got != test.want {
				t.Fatalf("pinned() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestLMU14PinnedFixturesMatchSanitizedArtifactsAndReplay(t *testing.T) {
	evidence := supportedLMUVersions[diagnosticLMUVersion]
	root := filepath.Join("..", "..", "..", "..", "testdata")
	fixtures := []struct {
		name string
		file string
		hash string
	}{
		{name: "menu Shared Memory", file: "lmu-1.4-menu-fixture.bin", hash: evidence.menuSHA256},
		{name: "track Shared Memory", file: "lmu-1.4-track-fixture.bin", hash: evidence.trackSHA256},
		{name: "menu REST", file: "lmu-1.4-rest-menu-fixture.json", hash: evidence.restMenuSHA256},
		{name: "track REST", file: "lmu-1.4-rest-track-fixture.json", hash: evidence.restTrackSHA256},
	}
	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			payload, err := os.ReadFile(filepath.Join(root, fixture.file))
			if err != nil {
				t.Fatal(err)
			}
			digest := sha256.Sum256(payload)
			if got := hex.EncodeToString(digest[:]); got != fixture.hash {
				t.Fatalf("SHA-256 = %s, want pinned evidence", got)
			}
		})
	}
	build := BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion}
	for _, test := range []struct {
		name     string
		file     string
		player   bool
		vehicles int32
	}{
		{name: "menu", file: "lmu-1.4-menu-fixture.bin"},
		{name: "track", file: "lmu-1.4-track-fixture.bin", player: true, vehicles: 38},
	} {
		t.Run(test.name+" replay", func(t *testing.T) {
			payload, err := os.ReadFile(filepath.Join(root, test.file))
			if err != nil {
				t.Fatal(err)
			}
			assertOnlyAllowedDiagnosticBytes(t, payload, payload)
			observation, err := parseWithBuild(payload, time.Unix(1, 0).UTC(), build)
			if err != nil {
				t.Fatal(err)
			}
			player, playerPresent := observation.PlayerPresent.Value()
			vehicles, vehiclesPresent := observation.VehicleCount.Value()
			if observation.Compatibility != CompatibilityKnown || !playerPresent || player != test.player ||
				!vehiclesPresent || int32(vehicles) != test.vehicles {
				t.Fatalf("compatibility=%v player=%v,%v vehicles=%v,%v", observation.Compatibility, player, playerPresent, vehicles, vehiclesPresent)
			}
		})
	}
	for _, test := range []struct {
		name   string
		file   string
		status string
	}{
		{name: "menu", file: "lmu-1.4-rest-menu-fixture.json", status: "empty"},
		{name: "track", file: "lmu-1.4-rest-track-fixture.json", status: "live"},
	} {
		t.Run(test.name+" REST schema", func(t *testing.T) {
			payload, err := os.ReadFile(filepath.Join(root, test.file))
			if err != nil {
				t.Fatal(err)
			}
			var document diagnosticRESTDocument
			if err := json.Unmarshal(payload, &document); err != nil {
				t.Fatal(err)
			}
			if document.Schema != "vantare.lmu-rest-overlap.v1" || document.Status != test.status {
				t.Fatalf("schema=%q status=%q", document.Schema, document.Status)
			}
		})
	}
}

func TestLMU14PinnedRESTOverlapMatchesPinnedSharedMemory(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..", "testdata")
	sharedBytes, err := os.ReadFile(filepath.Join(root, "lmu-1.4-track-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	shared, err := parseWithBuild(
		sharedBytes,
		time.Unix(1, 0).UTC(),
		BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion},
	)
	if err != nil || shared.Compatibility != CompatibilityKnown {
		t.Fatalf("Shared Memory replay compatibility=%v error=%v", shared.Compatibility, err)
	}
	restBytes, err := os.ReadFile(filepath.Join(root, "lmu-1.4-rest-track-fixture.json"))
	if err != nil {
		t.Fatal(err)
	}
	var rest diagnosticRESTDocument
	if err := json.Unmarshal(restBytes, &rest); err != nil {
		t.Fatal(err)
	}
	fieldNumber := func(field diagnosticRESTField) (float64, bool) {
		value, ok := field.Value.(float64)
		return value, ok && field.Freshness == "fresh"
	}
	fieldBool := func(field diagnosticRESTField) (bool, bool) {
		value, ok := field.Value.(bool)
		return value, ok && field.Freshness == "fresh"
	}
	track, trackPresent := shared.TrackName.Value()
	if restTrack, ok := rest.Session.Track.Value.(string); !ok || rest.Session.Track.Freshness != "fresh" ||
		!trackPresent || restTrack != track {
		t.Fatalf("track overlap is not exact")
	}
	sessionType, sessionPresent := shared.SessionType.Value()
	if restType, ok := rest.Session.Type.Value.(string); !ok || rest.Session.Type.Freshness != "fresh" ||
		!sessionPresent || restType != diagnosticSessionType(sessionType) {
		t.Fatalf("session overlap is not exact")
	}
	vehicleCount, vehicleCountPresent := shared.VehicleCount.Value()
	restVehicleCount, restVehicleCountPresent := fieldNumber(rest.Session.VehicleCount)
	if !vehicleCountPresent || !restVehicleCountPresent || restVehicleCount != float64(vehicleCount) {
		t.Fatalf("vehicle-count overlap is not exact")
	}
	playerPresent, playerPresenceKnown := shared.PlayerPresent.Value()
	restPlayerPresent, restPlayerPresenceKnown := fieldBool(rest.Player.Present)
	if !playerPresenceKnown || !restPlayerPresenceKnown || restPlayerPresent != playerPresent || !playerPresent {
		t.Fatalf("player-presence overlap is not exact")
	}
	var player VehicleObservation
	for _, vehicle := range shared.Vehicles {
		if value, present := vehicle.Player.Value(); present && value {
			player = vehicle
			break
		}
	}
	position, positionPresent := player.Position.Value()
	laps, lapsPresent := player.CompletedLaps.Value()
	stops, stopsPresent := player.PitStopCount.Value()
	restPosition, restPositionPresent := fieldNumber(rest.Player.Position)
	restLaps, restLapsPresent := fieldNumber(rest.Player.CompletedLaps)
	restStops, restStopsPresent := fieldNumber(rest.Player.PitStopCount)
	if !positionPresent || !lapsPresent || !stopsPresent ||
		!restPositionPresent || restPosition != float64(position) ||
		!restLapsPresent || restLaps != float64(laps) ||
		!restStopsPresent || restStops != float64(stops) {
		t.Fatalf("player overlap is not exact")
	}
	sharedTime, sharedTimePresent := shared.SourceTime.Value()
	restTime, restTimePresent := fieldNumber(rest.Session.SourceTimeSeconds)
	if !sharedTimePresent || !restTimePresent || math.Abs(sharedTime.Seconds()-restTime) > defaultFreshnessLimit.Seconds() {
		t.Fatalf("source-time overlap exceeds freshness limit")
	}
}

func TestDiagnosticCandidateProfileOnlyAcceptsExactLMU14Pair(t *testing.T) {
	tests := []struct {
		name     string
		evidence BuildEvidence
		version  string
		ok       bool
	}{
		{name: "exact pair", evidence: BuildEvidence{FileVersion: "1.4.0.0", ProductVersion: "1.4.0.0"}, version: diagnosticLMUVersion, ok: true},
		{name: "normalized pair", evidence: BuildEvidence{FileVersion: "1.4.0", ProductVersion: "1,4,0,0"}, version: diagnosticLMUVersion, ok: true},
		{name: "exact 1.4.1.3 pair", evidence: BuildEvidence{FileVersion: "1.4.1.3", ProductVersion: "1.4.1.3"}, version: diagnosticLMUVersion1, ok: true},
		{name: "normalized 1.4.1.3 pair", evidence: BuildEvidence{FileVersion: "1.4.1.3", ProductVersion: "1,4,1,3"}, version: diagnosticLMUVersion1, ok: true},
		{name: "1.4.1.3 file only", evidence: BuildEvidence{FileVersion: "1.4.1.3"}},
		{name: "1.4.1.3 contradictory", evidence: BuildEvidence{FileVersion: "1.4.1.3", ProductVersion: "1.4.0.0"}},
		{name: "unpinned 1.4.1.0 sibling", evidence: BuildEvidence{FileVersion: "1.4.1.0", ProductVersion: "1.4.1.0"}},
		{name: "unpinned 1.4.1.4 sibling", evidence: BuildEvidence{FileVersion: "1.4.1.4", ProductVersion: "1.4.1.4"}},
		{name: "file only", evidence: BuildEvidence{FileVersion: "1.4.0.0"}},
		{name: "product only", evidence: BuildEvidence{ProductVersion: "1.4.0.0"}},
		{name: "contradictory", evidence: BuildEvidence{FileVersion: "1.4.0.0", ProductVersion: "1.3.0.0"}},
		{name: "production version", evidence: BuildEvidence{FileVersion: "1.3.0.0", ProductVersion: "1.3.0.0"}},
		{name: "unknown future", evidence: BuildEvidence{FileVersion: "1.5.0.0", ProductVersion: "1.5.0.0"}},
		{name: "malformed", evidence: BuildEvidence{FileVersion: "private/1.4.0.0", ProductVersion: "1.4.0.0"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			profile, ok := diagnosticCandidateProfile(test.evidence)
			if ok != test.ok {
				t.Fatalf("diagnosticCandidateProfile() ok = %v, want %v", ok, test.ok)
			}
			if ok && (!profile.supported || profile.version != test.version) {
				t.Fatalf("candidate profile = %#v", profile)
			}
		})
	}
}

func TestBuildProfilesGateEveryOffsetField(t *testing.T) {
	fixture := knownBuffer(t)
	for _, tt := range []struct {
		name  string
		build BuildEvidence
		known bool
	}{
		{name: "allowlisted file", build: BuildEvidence{FileVersion: "1.3.0.0"}, known: true},
		{name: "allowlisted product", build: BuildEvidence{ProductVersion: "1.3.0"}, known: true},
		{name: "coherent versions", build: BuildEvidence{FileVersion: "1.3.0", ProductVersion: "1.3.0.0"}, known: true},
		{name: "file contradicts product", build: BuildEvidence{FileVersion: "1.4.0.0", ProductVersion: "1.3.0.0"}},
		{name: "product contradicts file", build: BuildEvidence{FileVersion: "1.3.0.0", ProductVersion: "1.4.0.0"}},
		{name: "absent", build: BuildEvidence{}},
		{name: "not allowlisted", build: BuildEvidence{FileVersion: "1.4.0.0"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseWithBuild(fixture, time.Now(), tt.build)
			if err != nil {
				t.Fatal(err)
			}
			if (got.Compatibility == CompatibilityKnown) != tt.known {
				t.Fatalf("compatibility=%v", got.Compatibility)
			}
			if tt.known {
				if !strings.Contains(got.Fingerprint, "build=1.3.0.0") {
					t.Fatalf("fingerprint=%q", got.Fingerprint)
				}
			} else {
				assertNoPublishedFields(t, got)
				if strings.Contains(got.Fingerprint, tt.build.FileVersion) && tt.build.FileVersion != "" {
					t.Fatalf("unsupported version leaked: %q", got.Fingerprint)
				}
			}
		})
	}
}
