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
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
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
	if got.Compatibility != CompatibilityUnknown || got.Fingerprint != unknownFingerprint {
		t.Fatalf("observation = %#v", got)
	}
	assertNoPublishedFields(t, got)
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
	if got.Fingerprint != "LMU_Data/runtime:build=1.3.0.0;size=324820;evidence=menu-invariants;telemetry=not-required-no-player" {
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
		name   string
		mutate func([]byte)
	}{
		{name: "vehicle count", mutate: func(buf []byte) { binary.LittleEndian.PutUint32(buf[1736:], maxVehicles+1) }},
		{name: "phase", mutate: func(buf []byte) { buf[1740] = 10 }},
		{name: "player index", mutate: func(buf []byte) { buf[128465] = 254 }},
		{name: "player boolean", mutate: func(buf []byte) { buf[128466] = 2 }},
		{name: "non-finite source time", mutate: func(buf []byte) {
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
			if got.Fingerprint != "LMU_Data/runtime:build=1.3.0.0;evidence=menu-invariants-invalid" {
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
		"rpm": got.EngineRPM.Freshness(), "speed": got.SpeedMPS.Freshness(), "controls": got.Controls.Freshness(),
	} {
		if freshness != schema.FreshnessInvalid {
			t.Fatalf("%s freshness = %v", name, freshness)
		}
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

func TestPlayerCompatibilityRequiresCorrelatedScoringAndTelemetrySlots(t *testing.T) {
	fixture := knownBuffer(t)
	playerIndex := int(fixture[128465])
	telemetryBase := telemetryOffset + playerIndex*telemetryStride
	tests := []struct {
		name   string
		mutate func([]byte)
	}{
		{name: "artificial scoring only", mutate: func(buf []byte) { clear(buf[telemetryBase : telemetryBase+telemetryStride]) }},
		{name: "telemetry moved", mutate: func(buf []byte) {
			target := telemetryOffset + ((playerIndex+1)%maxVehicles)*telemetryStride
			copy(buf[target:target+telemetryStride], buf[telemetryBase:telemetryBase+telemetryStride])
			clear(buf[telemetryBase : telemetryBase+telemetryStride])
		}},
		{name: "telemetry ID corrupt", mutate: func(buf []byte) { binary.LittleEndian.PutUint32(buf[telemetryBase:], uint32(9999)) }},
		{name: "vehicle name incoherent", mutate: func(buf []byte) { copy(buf[telemetryBase+32:], []byte("different-vehicle\x00")) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := append([]byte(nil), fixture...)
			tt.mutate(buf)
			got, err := parseSupported(buf, time.Now())
			if err != nil {
				t.Fatal(err)
			}
			if got.Compatibility != CompatibilityUnknown {
				t.Fatalf("compatibility=%v fingerprint=%q", got.Compatibility, got.Fingerprint)
			}
			assertNoPublishedFields(t, got)
		})
	}
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
		freshness schema.Freshness
	}{
		{code: 1, freshness: schema.FreshnessFresh},
		{code: 3, freshness: schema.FreshnessFresh},
		{code: 4, freshness: schema.FreshnessFresh},
		{code: 5, freshness: schema.FreshnessFresh},
		{code: 2, freshness: schema.FreshnessInvalid},
		{code: 10, freshness: schema.FreshnessInvalid},
	}
	for _, tt := range tests {
		if got := validateSessionType(tt.code).Freshness(); got != tt.freshness {
			t.Fatalf("code %d freshness = %v, want %v", tt.code, got, tt.freshness)
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

func knownBuffer(t *testing.T) []byte {
	t.Helper()
	buf, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	return buf
}

func assertNoPublishedFields(t *testing.T, got Observation) {
	t.Helper()
	freshness := []schema.Freshness{
		got.SourceTime.Freshness(), got.TrackName.Freshness(), got.SessionType.Freshness(), got.VehicleCount.Freshness(),
		got.PlayerPresent.Freshness(), got.VehicleName.Freshness(), got.LapNumber.Freshness(), got.Gear.Freshness(),
		got.EngineRPM.Freshness(), got.SpeedMPS.Freshness(), got.Controls.Freshness(),
	}
	for index, value := range freshness {
		if value != schema.FreshnessMissing {
			t.Fatalf("field %d freshness = %v, want missing", index, value)
		}
	}
}

func assertNoFastTelemetry(t *testing.T, got Observation) {
	t.Helper()
	for index, value := range []schema.Freshness{
		got.VehicleName.Freshness(), got.LapNumber.Freshness(), got.Gear.Freshness(),
		got.EngineRPM.Freshness(), got.SpeedMPS.Freshness(), got.Controls.Freshness(),
	} {
		if value != schema.FreshnessMissing {
			t.Fatalf("fast field %d freshness = %v, want missing", index, value)
		}
	}
}
