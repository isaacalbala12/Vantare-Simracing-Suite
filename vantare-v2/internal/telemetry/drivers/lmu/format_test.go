package lmu

import (
	"context"
	"encoding/binary"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestParseAuditedFixtures(t *testing.T) {
	tests := []struct {
		name       string
		file       string
		playerLive bool
	}{
		{name: "track", file: "lmu-fixture.bin", playerLive: true},
		{name: "menu", file: "lmu-menu-fixture.bin"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", tt.file))
			if err != nil {
				t.Fatal(err)
			}
			got, err := parseSupported(buf, time.Date(2026, 7, 21, 12, 0, 0, 0, time.FixedZone("local", 3600)))
			if err != nil {
				t.Fatal(err)
			}
			if got.Compatibility != CompatibilityKnown || !strings.Contains(got.Fingerprint, "build=1.3.0.0") {
				t.Fatalf("compatibility = %#v", got)
			}
			player, _ := got.PlayerPresent.Value()
			if player != tt.playerLive {
				t.Fatalf("player = %v, want %v", player, tt.playerLive)
			}
			if got.ReceivedUTC.Location() != time.UTC {
				t.Fatal("receipt time must be UTC")
			}
			if !tt.playerLive {
				if _, present := got.VehicleName.Value(); present {
					t.Fatal("menu invented a vehicle")
				}
				if _, present := got.InPit.Value(); present {
					t.Fatal("menu invented pit state")
				}
			} else if value, present := got.InPit.Value(); !present || bool(value) {
				t.Fatalf("track fixture in_pit = (%v,%v), want observed false", value, present)
			}
		})
	}
}

func TestParsePlayerInPitUsesDemonstratedScoringBooleanWithExplicitPresence(t *testing.T) {
	tests := []struct {
		name      string
		raw       byte
		freshness schema.Freshness
		value     bool
	}{
		{name: "false is present", raw: 0, freshness: schema.FreshnessFresh},
		{name: "true is present", raw: 1, freshness: schema.FreshnessFresh, value: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := knownBuffer(t)
			scoringBase, _ := lmu13Layout.ScoringRows.rowBase(43)
			buf[scoringBase+scoringInPitsOffset] = tt.raw
			got, err := parseSupported(buf, time.Unix(0, 0))
			if err != nil {
				t.Fatal(err)
			}
			if got.InPit.Freshness() != tt.freshness {
				t.Fatalf("freshness = %v, want %v", got.InPit.Freshness(), tt.freshness)
			}
			value, present := got.InPit.Value()
			if !present || bool(value) != tt.value {
				t.Fatalf("value = (%v,%v), want (%v,true)", value, present, tt.value)
			}
		})
	}
}

func TestParsePlayerNativeDeltaBestPreservesSignAndExplicitAvailability(t *testing.T) {
	tests := []struct {
		name        string
		delta       float64
		bestLap     float64
		freshness   schema.Freshness
		want        session.DeltaSeconds
		wantPresent bool
	}{
		{name: "negative gaining delta", delta: -0.245, bestLap: 90.5, freshness: schema.FreshnessFresh, want: -0.245, wantPresent: true},
		{name: "positive losing delta", delta: 0.380, bestLap: 90.5, freshness: schema.FreshnessFresh, want: 0.380, wantPresent: true},
		{name: "exact zero after a best lap", delta: 0, bestLap: 90.5, freshness: schema.FreshnessFresh, wantPresent: true},
		{name: "startup zero without reference", delta: 0, bestLap: 0, freshness: schema.FreshnessMissing},
		{name: "non finite delta", delta: math.NaN(), bestLap: 90.5, freshness: schema.FreshnessInvalid, wantPresent: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := knownBuffer(t)
			scoringBase, _ := lmu13Layout.ScoringRows.rowBase(43)
			binary.LittleEndian.PutUint64(buf[scoringBase+lmu13Layout.Scoring.BestLapTime.Offset:], math.Float64bits(tt.bestLap))
			telemetryBase := telemetryOffset + int(buf[128465])*telemetryStride
			binary.LittleEndian.PutUint64(buf[telemetryBase+696:], math.Float64bits(tt.delta))

			got, err := parseSupported(buf, time.Now())
			if err != nil {
				t.Fatal(err)
			}
			var player *VehicleObservation
			for index := range got.Vehicles {
				if value, present := got.Vehicles[index].Player.Value(); present && value {
					player = &got.Vehicles[index]
					break
				}
			}
			if player == nil {
				t.Fatal("parsed observation has no player")
			}
			if player.DeltaBest.Freshness() != tt.freshness {
				t.Fatalf("freshness = %v, want %v", player.DeltaBest.Freshness(), tt.freshness)
			}
			value, present := player.DeltaBest.Value()
			if present != tt.wantPresent || (present && value != tt.want) {
				t.Fatalf("delta = (%v,%t), want (%v,%t)", value, present, tt.want, tt.wantPresent)
			}
		})
	}
}

func TestMenuDoesNotRequireTelemetryIndexWithoutPlayer(t *testing.T) {
	buf, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-menu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	buf[128465] = 255
	got, err := parseSupported(buf, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if got.Compatibility != CompatibilityKnown {
		t.Fatalf("compatibility=%v fingerprint=%q", got.Compatibility, got.Fingerprint)
	}
	if player, present := got.PlayerPresent.Value(); !present || player {
		t.Fatalf("player=%v present=%v", player, present)
	}
}

func TestParseRejectsShortAndBuildAbsentAllZeroRemainsUnknown(t *testing.T) {
	if _, err := Parse(make([]byte, ObjectOutSize-1), time.Now()); err != ErrIncompatibleBuffer {
		t.Fatalf("error = %v", err)
	}
	got, err := Parse(make([]byte, ObjectOutSize), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if got.Compatibility != CompatibilityUnknown || got.Fingerprint != unavailableFingerprint {
		t.Fatalf("observation = %#v", got)
	}
	assertNoPublishedFields(t, got)
}

// El fingerprint tiene tres formas y ninguna puede confundirse con otra:
// evidencia ausente, build leida pero no soportada, y build pinneada.
func TestFingerprintDistinguishesTheThreeEvidenceBranches(t *testing.T) {
	cases := []struct {
		name          string
		build         BuildEvidence
		compatibility Compatibility
		fingerprint   string
	}{
		{
			name:          "sin evidencia",
			build:         BuildEvidence{},
			compatibility: CompatibilityUnknown,
			fingerprint:   "LMU_Data/size=324820/evidence=unavailable",
		},
		{
			name:          "evidencia en blanco",
			build:         BuildEvidence{FileVersion: "  ", ProductVersion: "  "},
			compatibility: CompatibilityUnknown,
			fingerprint:   "LMU_Data/size=324820/evidence=unavailable",
		},
		{
			name:          "evidencia contradictoria",
			build:         BuildEvidence{FileVersion: "1.4.1.3", ProductVersion: "1.3.0.0"},
			compatibility: CompatibilityUnknown,
			fingerprint:   "LMU_Data/size=324820/evidence=unavailable",
		},
		{
			name:          "evidencia no normalizable",
			build:         BuildEvidence{FileVersion: "beta-1"},
			compatibility: CompatibilityUnknown,
			fingerprint:   "LMU_Data/size=324820/evidence=unavailable",
		},
		{
			name:          "build no soportada",
			build:         BuildEvidence{FileVersion: "9.9.9.9", ProductVersion: "9.9.9.9"},
			compatibility: CompatibilityUnknown,
			fingerprint:   "LMU_Data/size=324820/evidence=unsupported;build=9.9.9.9",
		},
		{
			name:          "build no soportada normalizada",
			build:         BuildEvidence{FileVersion: "9.9.9", ProductVersion: "9.9.9.0"},
			compatibility: CompatibilityUnknown,
			fingerprint:   "LMU_Data/size=324820/evidence=unsupported;build=9.9.9.0",
		},
		{
			name:          "diagnostica sin par completo no se promociona",
			build:         BuildEvidence{FileVersion: diagnosticLMUVersion1},
			compatibility: CompatibilityUnknown,
			fingerprint:   "LMU_Data/size=324820/evidence=unsupported;build=1.4.1.3",
		},
		{
			name:          "build pinneada",
			build:         BuildEvidence{FileVersion: supportedLMUVersion, ProductVersion: supportedLMUVersion},
			compatibility: CompatibilityKnown,
			fingerprint:   "LMU_Data/runtime:build=1.3.0.0;size=324820;evidence=active-grid-bijective;telemetry=not-required-no-player",
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := parseWithBuild(make([]byte, ObjectOutSize), time.Now(), testCase.build)
			if err != nil {
				t.Fatal(err)
			}
			if got.Compatibility != testCase.compatibility {
				t.Fatalf("compatibility = %v want %v", got.Compatibility, testCase.compatibility)
			}
			if got.Fingerprint != testCase.fingerprint {
				t.Fatalf("fingerprint = %q want %q", got.Fingerprint, testCase.fingerprint)
			}
		})
	}
}

func TestBuildApprovedMenuWithoutPlayerNameIsKnownWithoutFastTelemetry(t *testing.T) {
	buf := make([]byte, ObjectOutSize)
	got, err := parseSupported(buf, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if got.Compatibility != CompatibilityKnown {
		t.Fatalf("compatibility=%v fingerprint=%q", got.Compatibility, got.Fingerprint)
	}
	if got.Fingerprint != "LMU_Data/runtime:build=1.3.0.0;size=324820;evidence=active-grid-bijective;telemetry=not-required-no-player" {
		t.Fatalf("fingerprint=%q", got.Fingerprint)
	}
	if player, present := got.PlayerPresent.Value(); !present || player {
		t.Fatalf("player=%v present=%v", player, present)
	}
	assertNoFastTelemetry(t, got)
}

func TestPlayerCompatibilityDoesNotUsePersonalNameAsFormatEvidence(t *testing.T) {
	buf := knownBuffer(t)
	clear(buf[1748 : 1748+32])
	got, err := parseSupported(buf, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if got.Compatibility != CompatibilityKnown {
		t.Fatalf("compatibility=%v fingerprint=%q", got.Compatibility, got.Fingerprint)
	}
	if player, present := got.PlayerPresent.Value(); !present || !player {
		t.Fatalf("player=%v present=%v", player, present)
	}
}

func TestBuildApprovedMalformedMenuRemainsUnknown(t *testing.T) {
	tests := []struct {
		name     string
		evidence string
		mutate   func([]byte)
	}{
		{name: "vehicle count", evidence: "vehicle-count-invalid", mutate: func(buf []byte) { binary.LittleEndian.PutUint32(buf[1736:], maxVehicles+1) }},
		{name: "non-finite source time", evidence: "session-values-invalid", mutate: func(buf []byte) {
			binary.LittleEndian.PutUint64(buf[1700:], math.Float64bits(math.NaN()))
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := make([]byte, ObjectOutSize)
			buf[128465] = 255
			tt.mutate(buf)
			got, err := parseSupported(buf, time.Now())
			if err != nil {
				t.Fatal(err)
			}
			if got.Compatibility != CompatibilityUnknown {
				t.Fatalf("compatibility=%v fingerprint=%q", got.Compatibility, got.Fingerprint)
			}
			if got.Fingerprint != "LMU_Data/runtime:build=1.3.0.0;evidence="+tt.evidence {
				t.Fatalf("fingerprint=%q", got.Fingerprint)
			}
			assertNoPublishedFields(t, got)
		})
	}
}

func TestCompatibilityDiagnosticsNeverContainRawOrIdentity(t *testing.T) {
	short := []byte("player Circuit driver-private-identity")
	_, err := Parse(short, time.Now())
	if !errors.Is(err, ErrIncompatibleBuffer) {
		t.Fatalf("error = %v", err)
	}
	for _, forbidden := range []string{"player", "Circuit", "driver-private-identity"} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatalf("diagnostic leaked %q: %v", forbidden, err)
		}
	}
	unknown, err := Parse(plausibleUnknownBuffer(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"Circuit", "driver-private-identity"} {
		if strings.Contains(unknown.Fingerprint, forbidden) {
			t.Fatalf("fingerprint leaked identity: %q", unknown.Fingerprint)
		}
	}
}

func TestParseMarksNonFiniteAndOutOfRangeFieldsInvalid(t *testing.T) {
	buf := knownBuffer(t)
	buf[128466] = 1
	base := telemetryOffset + int(buf[128465])*telemetryStride
	binary.LittleEndian.PutUint64(buf[base+356:], math.Float64bits(math.NaN()))
	binary.LittleEndian.PutUint64(buf[base+184:], math.Float64bits(math.Inf(1)))
	binary.LittleEndian.PutUint64(buf[base+420:], math.Float64bits(2))
	binary.LittleEndian.PutUint64(buf[base+428:], math.Float64bits(0))
	binary.LittleEndian.PutUint64(buf[base+444:], math.Float64bits(0))
	got, err := parseSupported(buf, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	for name, freshness := range map[string]schema.Freshness{
		"rpm": got.EngineRPM.Freshness(), "speed": got.SpeedMPS.Freshness(), "throttle": got.Throttle.Freshness(),
	} {
		if freshness != schema.FreshnessInvalid {
			t.Fatalf("%s freshness = %v", name, freshness)
		}
	}
	if got.Brake.Freshness() != schema.FreshnessFresh || got.Clutch.Freshness() != schema.FreshnessFresh {
		t.Fatalf("independent valid controls were discarded: brake=%v clutch=%v", got.Brake.Freshness(), got.Clutch.Freshness())
	}
}

func TestParseRejectsOverflowedSpeedAndNegativeRPM(t *testing.T) {
	buf := knownBuffer(t)
	buf[128466] = 1
	base := telemetryOffset + int(buf[128465])*telemetryStride
	for _, offset := range []int{184, 192, 200} {
		binary.LittleEndian.PutUint64(buf[base+offset:], math.Float64bits(math.MaxFloat64))
	}
	binary.LittleEndian.PutUint64(buf[base+356:], math.Float64bits(-1))
	got, err := parseSupported(buf, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if got.SpeedMPS.Freshness() != schema.FreshnessInvalid {
		t.Fatal("overflowed sqrt must be invalid")
	}
	if got.EngineRPM.Freshness() != schema.FreshnessInvalid {
		t.Fatal("negative RPM must be invalid")
	}
}

func TestGearAndLapPreserveSourceValuesWithoutInventedRanges(t *testing.T) {
	buf := knownBuffer(t)
	buf[128466] = 1
	base := telemetryOffset + int(buf[128465])*telemetryStride
	binary.LittleEndian.PutUint32(buf[base+20:], uint32(math.MaxInt32))
	binary.LittleEndian.PutUint32(buf[base+352:], uint32(99))
	got, err := parseSupported(buf, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if value, ok := got.LapNumber.Value(); !ok || value != session.LapNumber(math.MaxInt32) {
		t.Fatalf("lap = %v,%v", value, ok)
	}
	if value, ok := got.Gear.Value(); !ok || value != vehicle.Gear(99) {
		t.Fatalf("gear = %v,%v", value, ok)
	}
}

func TestParseLMU13RealFixtureBuildsCompleteActiveGridBySourceID(t *testing.T) {
	buf := knownBuffer(t)
	got, err := parseSupported(buf, time.Unix(0, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if got.Compatibility != CompatibilityKnown || len(got.Vehicles) != 44 {
		t.Fatalf("compatibility=%v vehicles=%d", got.Compatibility, len(got.Vehicles))
	}
	scoringIDs := make(map[VehicleSourceID]int, 44)
	telemetryIDs := make(map[VehicleSourceID]int, 44)
	players := 0
	for index, row := range got.Vehicles {
		if _, duplicate := scoringIDs[row.SourceID]; duplicate || row.SourceID < 0 {
			t.Fatalf("scoring row %d invalid source ID %d", index, row.SourceID)
		}
		scoringIDs[row.SourceID] = index
		telemetryID := VehicleSourceID(readInt32(buf, lmu13Layout.TelemetryRows.Base+index*lmu13Layout.TelemetryRows.Stride))
		if _, duplicate := telemetryIDs[telemetryID]; duplicate || telemetryID < 0 {
			t.Fatalf("telemetry row %d invalid source ID %d", index, telemetryID)
		}
		telemetryIDs[telemetryID] = index
		player, present := row.Player.Value()
		if !present {
			t.Fatalf("row %d lost player-marker presence", index)
		}
		if player {
			players++
			if index != 43 || row.SourceID != 0 || telemetryIDs[row.SourceID] != 43 {
				t.Fatalf("player row=%d source=%d telemetry-row=%d", index, row.SourceID, telemetryIDs[row.SourceID])
			}
		}
	}
	if players != 1 || len(scoringIDs) != 44 || len(telemetryIDs) != 44 {
		t.Fatalf("players=%d scoring=%d telemetry=%d", players, len(scoringIDs), len(telemetryIDs))
	}
	for id := range scoringIDs {
		if _, present := telemetryIDs[id]; !present {
			t.Fatalf("scoring source ID %d missing from telemetry grid", id)
		}
	}
	for index := 44; index < lmu13Layout.TelemetryRows.Maximum; index++ {
		base, _ := lmu13Layout.TelemetryRows.rowBase(index)
		if id := readInt32(buf, base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset); id != 0 {
			t.Fatalf("inactive telemetry row %d source ID=%d, want zero fixture evidence", index, id)
		}
	}
}

func TestParsePlayerSelectionIgnoresHeadersPositionAndInactiveTail(t *testing.T) {
	fixture := knownBuffer(t)
	for _, tt := range []struct {
		name   string
		mutate func([]byte)
	}{
		{name: "header says row zero", mutate: func(buf []byte) { buf[128465], buf[128466] = 0, 1 }},
		{name: "header says no player", mutate: func(buf []byte) { buf[128465], buf[128466] = 255, 0 }},
		{name: "player position changes", mutate: func(buf []byte) {
			base, _ := lmu13Layout.ScoringRows.rowBase(43)
			buf[base+lmu13Layout.Scoring.Position.Offset] = 1
		}},
		{name: "inactive tail repeats player ID", mutate: func(buf []byte) {
			for index := 44; index < lmu13Layout.TelemetryRows.Maximum; index++ {
				base, _ := lmu13Layout.TelemetryRows.rowBase(index)
				binary.LittleEndian.PutUint32(buf[base:], 0)
			}
		}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			buf := append([]byte(nil), fixture...)
			tt.mutate(buf)
			got, err := parseSupported(buf, time.Unix(0, 0).UTC())
			if err != nil {
				t.Fatal(err)
			}
			player := playerVehicle(t, got)
			if player.SourceID != 0 {
				t.Fatalf("selected source ID=%d, want scoring mIsPlayer ID 0", player.SourceID)
			}
		})
	}
}

func TestParsePreservesScoringOrderWhileJoiningTelemetryOnlyBySourceID(t *testing.T) {
	buf := knownBuffer(t)
	firstBase, _ := lmu13Layout.ScoringRows.rowBase(0)
	secondBase, _ := lmu13Layout.ScoringRows.rowBase(1)
	firstID := VehicleSourceID(readInt32(buf, firstBase))
	secondID := VehicleSourceID(readInt32(buf, secondBase))
	firstRow := append([]byte(nil), buf[firstBase:firstBase+lmu13Layout.ScoringRows.Stride]...)
	copy(buf[firstBase:firstBase+lmu13Layout.ScoringRows.Stride], buf[secondBase:secondBase+lmu13Layout.ScoringRows.Stride])
	copy(buf[secondBase:secondBase+lmu13Layout.ScoringRows.Stride], firstRow)

	got, err := parseSupported(buf, time.Unix(0, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if got.Compatibility != CompatibilityKnown || got.Vehicles[0].SourceID != secondID || got.Vehicles[1].SourceID != firstID {
		t.Fatalf("scoring order was not preserved: first=%d second=%d", got.Vehicles[0].SourceID, got.Vehicles[1].SourceID)
	}
	if player := playerVehicle(t, got); player.SourceID != 0 || player.Fuel.Freshness() != schema.FreshnessFresh {
		t.Fatalf("ID join lost player telemetry: source=%d fuel=%v", player.SourceID, player.Fuel.Freshness())
	}
}

func TestParseRejectsInvalidActiveGridAtomically(t *testing.T) {
	fixture := knownBuffer(t)
	scoring0, _ := lmu13Layout.ScoringRows.rowBase(0)
	scoring1, _ := lmu13Layout.ScoringRows.rowBase(1)
	telemetry0, _ := lmu13Layout.TelemetryRows.rowBase(0)
	telemetry1, _ := lmu13Layout.TelemetryRows.rowBase(1)
	playerScoring, _ := lmu13Layout.ScoringRows.rowBase(43)
	for _, tt := range []struct {
		name   string
		mutate func([]byte)
	}{
		{name: "negative vehicle count", mutate: func(buf []byte) { binary.LittleEndian.PutUint32(buf[1736:], ^uint32(0)) }},
		{name: "vehicle count over maximum", mutate: func(buf []byte) { binary.LittleEndian.PutUint32(buf[1736:], 105) }},
		{name: "duplicate scoring ID", mutate: func(buf []byte) { copy(buf[scoring1:scoring1+4], buf[scoring0:scoring0+4]) }},
		{name: "negative scoring ID", mutate: func(buf []byte) { binary.LittleEndian.PutUint32(buf[scoring0:], ^uint32(0)) }},
		{name: "duplicate telemetry ID", mutate: func(buf []byte) { copy(buf[telemetry1:telemetry1+4], buf[telemetry0:telemetry0+4]) }},
		{name: "negative telemetry ID", mutate: func(buf []byte) { binary.LittleEndian.PutUint32(buf[telemetry0:], ^uint32(0)) }},
		{name: "active grids are not bijective", mutate: func(buf []byte) { binary.LittleEndian.PutUint32(buf[telemetry0:], math.MaxInt32) }},
		{name: "multiple scoring players", mutate: func(buf []byte) { buf[scoring0+lmu13Layout.Scoring.PlayerMarker.Offset] = 1 }},
		{name: "invalid player boolean", mutate: func(buf []byte) { buf[scoring0+lmu13Layout.Scoring.PlayerMarker.Offset] = 2 }},
		{name: "invalid in-pit boolean", mutate: func(buf []byte) { buf[scoring0+lmu13Layout.Scoring.InPits.Offset] = 2 }},
		{name: "zero one-based position", mutate: func(buf []byte) { buf[scoring0+lmu13Layout.Scoring.Position.Offset] = 0 }},
		{name: "negative completed laps", mutate: func(buf []byte) {
			binary.LittleEndian.PutUint16(buf[scoring0+lmu13Layout.Scoring.CompletedLaps.Offset:], ^uint16(0))
		}},
		{name: "unknown sector", mutate: func(buf []byte) { buf[scoring0+lmu13Layout.Scoring.Sector.Offset] = 3 }},
		{name: "non-finite current time", mutate: func(buf []byte) { binary.LittleEndian.PutUint64(buf[1700:], math.Float64bits(math.NaN())) }},
		{name: "end precedes current", mutate: func(buf []byte) { binary.LittleEndian.PutUint64(buf[1708:], math.Float64bits(1)) }},
		{name: "non-finite lap distance", mutate: func(buf []byte) {
			binary.LittleEndian.PutUint64(buf[scoring0+lmu13Layout.Scoring.LapDistance.Offset:], math.Float64bits(math.Inf(1)))
		}},
		{name: "unterminated track", mutate: func(buf []byte) {
			for index := 1632; index < 1696; index++ {
				buf[index] = 'x'
			}
		}},
		{name: "unterminated driver", mutate: func(buf []byte) {
			for index := scoring0 + 4; index < scoring0+36; index++ {
				buf[index] = 'x'
			}
		}},
		{name: "unterminated vehicle", mutate: func(buf []byte) {
			for index := scoring0 + 36; index < scoring0+100; index++ {
				buf[index] = 'x'
			}
		}},
		{name: "unterminated class", mutate: func(buf []byte) {
			for index := scoring0 + 200; index < scoring0+232; index++ {
				buf[index] = 'x'
			}
		}},
		{name: "player telemetry ID moved only outside active range", mutate: func(buf []byte) {
			binary.LittleEndian.PutUint32(buf[telemetry0:], math.MaxInt32)
			tail, _ := lmu13Layout.TelemetryRows.rowBase(44)
			binary.LittleEndian.PutUint32(buf[tail:], 1)
		}},
		{name: "player marker without active telemetry match", mutate: func(buf []byte) { binary.LittleEndian.PutUint32(buf[playerScoring:], math.MaxInt32) }},
	} {
		t.Run(tt.name, func(t *testing.T) {
			buf := append([]byte(nil), fixture...)
			tt.mutate(buf)
			got, err := parseSupported(buf, time.Unix(0, 0).UTC())
			if err != nil {
				t.Fatal(err)
			}
			if got.Compatibility != CompatibilityUnknown || len(got.Vehicles) != 0 {
				t.Fatalf("invalid grid published compatibility=%v vehicles=%d", got.Compatibility, len(got.Vehicles))
			}
			assertNoPublishedFields(t, got)
		})
	}
}

func TestParsePreservesLegitimateZeroAndFalseInPlayerRow(t *testing.T) {
	got, err := parseSupported(knownBuffer(t), time.Unix(0, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	player := playerVehicle(t, got)
	assertFieldValue(t, player.CompletedLaps, standings.CompletedLaps(0))
	assertFieldValue(t, player.PitStopCount, pit.StopCount(0))
	assertFieldValue(t, player.PenaltyCount, standings.PenaltyCount(0))
	assertFieldValue(t, player.InPit, pit.InPit(false))
	assertFieldValue(t, player.LapNumber, session.LapNumber(0))
	if _, present := player.BestLapTime.Value(); present {
		t.Fatal("negative best-lap sentinel became present")
	}
	if _, present := player.LastLapTime.Value(); present {
		t.Fatal("zero last-lap sentinel became present")
	}
	if fuel, present := player.Fuel.Value(); !present || !fuel.Valid() || fuel.Amount == 0 || fuel.Capacity != 100 {
		t.Fatalf("fuel=(%+v,%v)", fuel, present)
	}
	if end, present := got.EndTime.Value(); !present || end != session.EndTime(3605) {
		t.Fatalf("end=(%v,%v)", end, present)
	}
	assertFieldValue(t, got.MaximumLaps, session.MaximumLaps(0))
}

func TestParseNormalizesFiniteNegativeOptionalScoringSentinelsToMissing(t *testing.T) {
	buf := knownBuffer(t)
	base, _ := lmu13Layout.ScoringRows.rowBase(0)
	binary.LittleEndian.PutUint64(
		buf[base+lmu13Layout.Scoring.TimeBehindNext.Offset:],
		math.Float64bits(-0.5),
	)
	binary.LittleEndian.PutUint64(
		buf[base+lmu13Layout.Scoring.TimeBehindLeader.Offset:],
		math.Float64bits(-1),
	)
	binary.LittleEndian.PutUint64(
		buf[base+lmu13Layout.Scoring.LapDistance.Offset:],
		math.Float64bits(-1),
	)
	got, err := parseSupported(buf, time.Unix(0, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if got.Compatibility != CompatibilityKnown || len(got.Vehicles) == 0 {
		t.Fatalf("compatibility=%v vehicles=%d", got.Compatibility, len(got.Vehicles))
	}
	if _, present := got.Vehicles[0].TimeBehindNext.Value(); present ||
		got.Vehicles[0].TimeBehindNext.Freshness() != schema.FreshnessMissing {
		t.Fatalf("time behind next = %#v, want missing", got.Vehicles[0].TimeBehindNext)
	}
	if _, present := got.Vehicles[0].TimeBehindLeader.Value(); present ||
		got.Vehicles[0].TimeBehindLeader.Freshness() != schema.FreshnessMissing {
		t.Fatalf("time behind leader = %#v, want missing", got.Vehicles[0].TimeBehindLeader)
	}
	if _, present := got.Vehicles[0].LapDistance.Value(); present ||
		got.Vehicles[0].LapDistance.Freshness() != schema.FreshnessMissing {
		t.Fatalf("lap distance = %#v, want missing", got.Vehicles[0].LapDistance)
	}
	assertFieldValue(t, got.Vehicles[0].LapsBehindNext, standings.LapGap(0))
}

func TestParsePreservesSignedFiniteLapProgressAndMarksNonFiniteInvalid(t *testing.T) {
	buf := knownBuffer(t)
	base, _ := lmu13Layout.ScoringRows.rowBase(0)
	binary.LittleEndian.PutUint64(
		buf[base+lmu13Layout.Scoring.LapProgressTime.Offset:],
		math.Float64bits(-2.46),
	)
	got, err := parseSupported(buf, time.Unix(0, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	assertFieldValue(t, got.Vehicles[0].LapProgressTime, standings.LapProgressTime(-2.46))

	binary.LittleEndian.PutUint64(
		buf[base+lmu13Layout.Scoring.LapProgressTime.Offset:],
		math.Float64bits(math.NaN()),
	)
	got, err = parseSupported(buf, time.Unix(0, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if got.Vehicles[0].LapProgressTime.Freshness() != schema.FreshnessInvalid {
		t.Fatalf("lap progress = %#v, want invalid", got.Vehicles[0].LapProgressTime)
	}
}

func TestParseScoringRowPreservesFiniteZeroLapProgress(t *testing.T) {
	buf := knownBuffer(t)
	base, _ := lmu13Layout.ScoringRows.rowBase(0)
	row, valid := parseScoringRow(buf, base)
	if !valid {
		t.Fatal("scoring row rejected")
	}
	assertFieldValue(t, row.LapProgressTime, standings.LapProgressTime(0))
}

func TestParseMarksContradictoryUniformZeroLapProgressGridMissing(t *testing.T) {
	got, err := parseSupported(knownBuffer(t), time.Unix(0, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Vehicles) < 2 {
		t.Fatalf("vehicles = %d, want a grid", len(got.Vehicles))
	}
	for index, row := range got.Vehicles {
		if _, present := row.LapProgressTime.Value(); present || row.LapProgressTime.Freshness() != schema.FreshnessMissing {
			t.Fatalf("vehicle %d lap progress = %#v, want missing", index, row.LapProgressTime)
		}
	}
}

func playerVehicle(t testing.TB, observation Observation) VehicleObservation {
	t.Helper()
	for _, row := range observation.Vehicles {
		if value, present := row.Player.Value(); present && value {
			return row
		}
	}
	t.Fatal("observation has no scoring player")
	return VehicleObservation{}
}

func TestClassifyClockResetAndWrap(t *testing.T) {
	if got := classifyClock(time.Second, 2*time.Second); got != ClockContinuous {
		t.Fatal(got)
	}
	if got := classifyClock(10*time.Second, time.Second); got != ClockReset {
		t.Fatal(got)
	}
	if got := classifyClock(25*time.Hour, time.Second); got != ClockWrap {
		t.Fatal(got)
	}
}

func TestSessionTypeOnlyMapsDemonstratedLMUCodes(t *testing.T) {
	tests := []struct {
		code      int32
		value     session.Type
		freshness schema.Freshness
	}{
		{code: -1, freshness: schema.FreshnessInvalid},
		{code: 0, freshness: schema.FreshnessInvalid},
		{code: 1, value: session.TypePractice, freshness: schema.FreshnessFresh},
		{code: 2, value: session.TypePractice, freshness: schema.FreshnessFresh},
		{code: 3, value: session.TypePractice, freshness: schema.FreshnessFresh},
		{code: 4, value: session.TypePractice, freshness: schema.FreshnessFresh},
		{code: 5, value: session.TypeQualifying, freshness: schema.FreshnessFresh},
		{code: 6, value: session.TypeQualifying, freshness: schema.FreshnessFresh},
		{code: 7, value: session.TypeQualifying, freshness: schema.FreshnessFresh},
		{code: 8, value: session.TypeQualifying, freshness: schema.FreshnessFresh},
		{code: 9, value: session.TypeWarmup, freshness: schema.FreshnessFresh},
		{code: 10, value: session.TypeRace, freshness: schema.FreshnessFresh},
		{code: 11, value: session.TypeRace, freshness: schema.FreshnessFresh},
		{code: 12, value: session.TypeRace, freshness: schema.FreshnessFresh},
		{code: 13, value: session.TypeRace, freshness: schema.FreshnessFresh},
		{code: 14, freshness: schema.FreshnessInvalid},
	}
	for _, tt := range tests {
		field := validateSessionType(tt.code)
		if got := field.Freshness(); got != tt.freshness {
			t.Fatalf("code %d freshness = %v, want %v", tt.code, got, tt.freshness)
		}
		value, present := field.Value()
		if !present || value != tt.value {
			t.Fatalf("code %d value = (%v,%v), want (%v,true)", tt.code, value, present, tt.value)
		}
	}
}

func FuzzParseNeverPanics(f *testing.F) {
	f.Add(make([]byte, ObjectOutSize))
	f.Add([]byte{1, 2, 3})
	f.Fuzz(func(t *testing.T, buf []byte) {
		_, _ = Parse(buf, time.Unix(0, 0))
		_, _ = parseSupported(buf, time.Unix(0, 0))
	})
}

func BenchmarkParseTrackFixture(b *testing.B) {
	buf, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, err := parseSupported(buf, time.Unix(0, 0)); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkParseObjectOut44Vehicles(b *testing.B) {
	buf := knownBuffer(b)
	b.ReportAllocs()
	b.SetBytes(ObjectOutSize)
	for b.Loop() {
		observation, err := parseSupported(buf, time.Unix(0, 0).UTC())
		if err != nil || len(observation.Vehicles) != 44 {
			b.Fatalf("parse error=%v rows=%d", err, len(observation.Vehicles))
		}
	}
}

func BenchmarkStableCopyAndParseTrackFixture(b *testing.B) {
	source, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		b.Fatal(err)
	}
	destination := make([]byte, ObjectOutSize)
	scratch := make([]byte, ObjectOutSize)
	reader := &testReader{data: source}
	profile := profileFromBuild(BuildEvidence{FileVersion: supportedLMUVersion})
	b.ReportAllocs()
	b.SetBytes(ObjectOutSize)
	for b.Loop() {
		if err := readStable(context.Background(), reader, destination, scratch, defaultStableComparisons); err != nil {
			b.Fatal(err)
		}
		if _, err := parseWithProfile(destination, time.Unix(0, 0), profile); err != nil {
			b.Fatal(err)
		}
	}
}

func parseSupported(buf []byte, received time.Time) (Observation, error) {
	return parseWithBuild(buf, received, BuildEvidence{FileVersion: supportedLMUVersion})
}

func plausibleUnknownBuffer() []byte {
	buf := make([]byte, ObjectOutSize)
	binary.LittleEndian.PutUint32(buf[1736:], 1)
	buf[1740] = 5
	return buf
}

func knownBuffer(t testing.TB) []byte {
	t.Helper()
	buf, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	return buf
}

func assertNoPublishedFields(t *testing.T, got Observation) {
	t.Helper()
	if len(got.Vehicles) != 0 {
		t.Fatalf("published %d vehicle rows, want none", len(got.Vehicles))
	}
	freshness := []schema.Freshness{
		got.SourceTime.Freshness(), got.EndTime.Freshness(), got.MaximumLaps.Freshness(),
		got.TrackName.Freshness(), got.SessionType.Freshness(), got.VehicleCount.Freshness(),
		got.PlayerPresent.Freshness(), got.VehicleName.Freshness(), got.LapNumber.Freshness(), got.Gear.Freshness(),
		got.EngineRPM.Freshness(), got.SpeedMPS.Freshness(), got.Throttle.Freshness(), got.Brake.Freshness(), got.Clutch.Freshness(),
		got.PlayerPosition.Freshness(), got.CompletedLaps.Freshness(), got.PitStopCount.Freshness(), got.InPit.Freshness(), got.Fuel.Freshness(),
	}
	for index, value := range freshness {
		if value != schema.FreshnessMissing {
			t.Fatalf("field %d freshness = %v, want missing", index, value)
		}
	}
}

func assertNoFastTelemetry(t *testing.T, got Observation) {
	t.Helper()
	if len(got.Vehicles) != 0 {
		t.Fatalf("published %d vehicle rows without an active grid", len(got.Vehicles))
	}
	for index, value := range []schema.Freshness{
		got.VehicleName.Freshness(), got.LapNumber.Freshness(), got.Gear.Freshness(),
		got.EngineRPM.Freshness(), got.SpeedMPS.Freshness(), got.Throttle.Freshness(), got.Brake.Freshness(), got.Clutch.Freshness(),
		got.PlayerPosition.Freshness(), got.CompletedLaps.Freshness(), got.PitStopCount.Freshness(), got.InPit.Freshness(), got.Fuel.Freshness(),
	} {
		if value != schema.FreshnessMissing {
			t.Fatalf("fast field %d freshness = %v, want missing", index, value)
		}
	}
}
