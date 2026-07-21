package lmu

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/pkg/models"
)

const fixtureSanitizerVersion = "numeric-whitelist-v1"

type fixtureCapture struct {
	State       string `json:"state"`
	CapturedAt  string `json:"capturedAt"`
	Provenance  string `json:"provenance"`
	LMUVersion  string `json:"lmuVersion"`
	Fingerprint string `json:"fingerprint"`
}

type fixtureManifest struct {
	SchemaVersion int            `json:"schemaVersion"`
	Capture       fixtureCapture `json:"capture"`
	Sanitization  struct {
		Version string `json:"version"`
		Policy  string `json:"policy"`
	} `json:"sanitization"`
	SHA256          string                  `json:"sha256"`
	Session         *models.SessionInfo     `json:"session"`
	Telemetry       fixtureTelemetrySummary `json:"telemetry"`
	Vehicles        []models.VehicleScoring `json:"vehicles"`
	PlayerTelemetry *models.PlayerTelemetry `json:"playerTelemetry"`
}

type fixtureTelemetrySummary struct {
	PlayerVehicleIdx int  `json:"playerVehicleIdx"`
	PlayerHasVehicle bool `json:"playerHasVehicle"`
}

type byteSpan struct {
	offset int
	size   int
}

func copySpan(dst, src []byte, span byteSpan) {
	if span.offset < 0 || span.size < 0 || span.offset+span.size > len(src) || span.offset+span.size > len(dst) {
		return
	}
	copy(dst[span.offset:span.offset+span.size], src[span.offset:span.offset+span.size])
}

func writeRedactedString(dst []byte, offset, size int, value string) {
	if offset < 0 || size < 1 || offset+size > len(dst) {
		return
	}
	for i := offset; i < offset+size; i++ {
		dst[i] = 0
	}
	copy(dst[offset:offset+size-1], value)
}

// sanitizeFixture uses a zero-filled buffer and copies only fields that the
// audited parsers consume. Free-form identity strings are never copied.
func sanitizeFixture(src []byte) []byte {
	dst := make([]byte, ObjectOutSize)
	if len(src) < ObjectOutSize {
		return dst
	}

	for _, span := range []byteSpan{
		{scoringTrackName, 64},
		{scoringSession, 4}, {scoringCurrentET, 8}, {1704, 4}, {1708, 8}, {1720, 8},
		{scoringNumVehicles, 4}, {scoringGamePhase, 1},
		{scoringAmbientTemp, 8}, {scoringTrackTemp, 8},
		{telemetryPlayerVehicleIdx, 2},
	} {
		copySpan(dst, src, span)
	}
	writeRedactedString(dst, scoringPlayerName, 32, "player")

	vehicleNumeric := []byteSpan{
		{vehicleScoringID, 4}, {vehicleScoringTotalLaps, 28},
		{vehicleScoringBestLapTime, 48}, {vehicleScoringPitstops, 8},
		{vehicleScoringTimeBehindNext, 24}, {264, 144},
		{vehicleScoringPitState, 8}, {vehicleScoringEstimatedLapTime, 8},
		{vehicleScoringFlag, 1}, {vehicleScoringFuelFraction, 1},
	}
	for i := 0; i < 104; i++ {
		base := vehicleScoringOffset + i*vehicleScoringStride
		for _, relative := range vehicleNumeric {
			copySpan(dst, src, byteSpan{base + relative.offset, relative.size})
		}
		copySpan(dst, src, byteSpan{base + vehicleScoringVehicleName, 64})
		copySpan(dst, src, byteSpan{base + vehicleScoringVehicleClass, 32})
		if readString(src, base+vehicleScoringDriverName, 32) != "" {
			alias := fmt.Sprintf("driver-%03d", i+1)
			if src[base+vehicleScoringIsPlayer] != 0 {
				alias = "player"
			}
			writeRedactedString(dst, base+vehicleScoringDriverName, 32, alias)
		}
	}

	telemetryNumeric := []byteSpan{
		{vehicleTelemetryID, 4}, {vehicleTelemetryLapNumber, 4},
		{160, 24}, {vehicleTelemetryLocalVel, 24}, {232, 72},
		{vehicleTelemetryGear, 12},
		{vehicleTelemetryFilteredThrottle, 8}, {vehicleTelemetryFilteredBrake, 8},
		{vehicleTelemetryFilteredSteering, 8}, {vehicleTelemetryFilteredClutch, 8},
		{vehicleTelemetryFuel, 8}, {vehicleTelemetryFuelCapacity, 8},
		{vehicleTelemetryDeltaBest, 8}, {vehicleTelemetryTimeGapPlaceAhead, 8},
		{175, 1}, {182, 1}, {191, 1}, {239, 1}, {263, 1}, {278, 1},
		{411, 1}, {427, 1}, {443, 1}, {459, 1}, {786, 13},
	}
	for i := 0; i < 104; i++ {
		base := telemetryTelemOffset + i*telemetryTelemStride
		for _, relative := range telemetryNumeric {
			copySpan(dst, src, byteSpan{base + relative.offset, relative.size})
		}
		copySpan(dst, src, byteSpan{base + vehicleTelemetryVehicleName, 64})
		copySpan(dst, src, byteSpan{base + vehicleTelemetryTrackName, 64})
		for wheel := 0; wheel < 4; wheel++ {
			wheelBase := base + 152 + wheel*260
			for _, field := range []byteSpan{{24, 8}, {48, 48}, {112, 3}} {
				copySpan(dst, src, byteSpan{wheelBase + field.offset, field.size})
			}
		}
	}
	return dst
}

func buildFixtureManifest(buf []byte, capture fixtureCapture) fixtureManifest {
	telemetry := Parse(buf, ParseFull)
	manifest := fixtureManifest{SchemaVersion: 1, Capture: capture}
	manifest.Sanitization.Version = fixtureSanitizerVersion
	manifest.Sanitization.Policy = "zero-filled buffer plus audited numeric fields; identities replaced with deterministic aliases"
	sum := sha256.Sum256(buf)
	manifest.SHA256 = hex.EncodeToString(sum[:])
	manifest.Telemetry.PlayerVehicleIdx = int(readByte(buf, telemetryPlayerVehicleIdx))
	if telemetry != nil {
		manifest.Session = telemetry.Session
		manifest.Telemetry.PlayerHasVehicle = telemetry.PlayerHasVehicle
		manifest.Vehicles = telemetry.Vehicles
		manifest.PlayerTelemetry = telemetry.Player
	}
	return manifest
}

func writeFixturePair(t *testing.T, binPath string, raw []byte, capture fixtureCapture) {
	t.Helper()
	clean := sanitizeFixture(raw)
	manifest := buildFixtureManifest(clean, capture)
	jsonBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("marshal fixture manifest: %v", err)
	}
	jsonBytes = append(jsonBytes, '\n')
	if err := os.WriteFile(binPath, clean, 0o644); err != nil {
		t.Fatalf("write fixture binary: %v", err)
	}
	jsonPath := strings.TrimSuffix(binPath, filepath.Ext(binPath)) + ".json"
	if err := os.WriteFile(jsonPath, jsonBytes, 0o644); err != nil {
		t.Fatalf("write fixture manifest: %v", err)
	}
}

func TestRegenerateSanitizedFixture(t *testing.T) {
	if os.Getenv("LMU_REGENERATE_FIXTURE") != "1" {
		t.Skip("explicit fixture maintenance command only")
	}
	binPath, _ := fixturePaths()
	raw, err := os.ReadFile(binPath)
	if err != nil {
		t.Fatalf("read legacy fixture: %v", err)
	}
	writeFixturePair(t, binPath, raw, fixtureCapture{
		State:       "track",
		CapturedAt:  "legacy capture; exact timestamp unavailable",
		Provenance:  "fixture introduced by commit 5586c80; sanitized in ISA-30",
		LMUVersion:  "1.3.0 inferred from raw gameVersion=13000",
		Fingerprint: "LMU_Data/324820/telemetry-1888/scoring-584",
	})
}

func TestCaptureSanitizedMenuFixture(t *testing.T) {
	if os.Getenv("LMU_CAPTURE_MENU_FIXTURE") != "1" {
		t.Skip("requires LMU and explicit capture opt-in")
	}
	reader, err := Open()
	if err != nil {
		t.Fatalf("open LMU shared memory: %v", err)
	}
	defer reader.Close()
	raw := append([]byte(nil), reader.Bytes()...)
	root := filepath.Join("..", "..", "..", "testdata")
	writeFixturePair(t, filepath.Join(root, "lmu-menu-fixture.bin"), raw, fixtureCapture{
		State:       "menu",
		CapturedAt:  time.Now().UTC().Format(time.RFC3339),
		Provenance:  "direct read-only capture from LMU_Data during ISA-30",
		LMUVersion:  "1.3.0.0 from Le Mans Ultimate.exe metadata",
		Fingerprint: "LMU_Data/324820/telemetry-1888/scoring-584",
	})
}
