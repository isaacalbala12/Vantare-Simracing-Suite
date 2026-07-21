package lmu

import (
	"context"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
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
			got, err := Parse(buf, time.Date(2026, 7, 21, 12, 0, 0, 0, time.FixedZone("local", 3600)))
			if err != nil {
				t.Fatal(err)
			}
			if got.Compatibility != CompatibilityKnown || got.Fingerprint != knownFingerprint {
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

func TestParseRejectsShortAndDegradesUnknownSignature(t *testing.T) {
	if _, err := Parse(make([]byte, ObjectOutSize-1), time.Now()); err != ErrIncompatibleBuffer {
		t.Fatalf("error = %v", err)
	}
	for _, tt := range []struct {
		name string
		buf  []byte
	}{
		{name: "all zero", buf: make([]byte, ObjectOutSize)},
		{name: "plausible invariants without positive evidence", buf: plausibleUnknownBuffer()},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Parse(tt.buf, time.Now())
			if err != nil {
				t.Fatal(err)
			}
			if got.Compatibility != CompatibilityUnknown {
				t.Fatalf("compatibility = %v", got.Compatibility)
			}
			if got.Fingerprint != unknownFingerprint {
				t.Fatalf("fingerprint = %q", got.Fingerprint)
			}
			assertNoPublishedFields(t, got)
		})
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
	got, err := Parse(buf, time.Now())
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
	got, err := Parse(buf, time.Now())
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
	got, err := Parse(buf, time.Now())
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
	f.Fuzz(func(t *testing.T, buf []byte) { _, _ = Parse(buf, time.Unix(0, 0)) })
}

func BenchmarkParseTrackFixture(b *testing.B) {
	buf, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, err := Parse(buf, time.Unix(0, 0)); err != nil {
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
	b.ReportAllocs()
	b.SetBytes(ObjectOutSize)
	for b.Loop() {
		if err := readStable(context.Background(), reader, destination, scratch, defaultStableComparisons); err != nil {
			b.Fatal(err)
		}
		if _, err := Parse(destination, time.Unix(0, 0)); err != nil {
			b.Fatal(err)
		}
	}
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
