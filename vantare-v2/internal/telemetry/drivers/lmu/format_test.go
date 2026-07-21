package lmu

import (
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
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
	buf := make([]byte, ObjectOutSize)
	binary.LittleEndian.PutUint32(buf[1736:], uint32(maxVehicles+1))
	buf[1740] = 255
	got, err := Parse(buf, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if got.Compatibility != CompatibilityUnknown {
		t.Fatalf("compatibility = %v", got.Compatibility)
	}
	if got.VehicleCount.Freshness() != schema.FreshnessInvalid {
		t.Fatal("invalid count was not explicit")
	}
}

func TestParseMarksNonFiniteAndOutOfRangeFieldsInvalid(t *testing.T) {
	buf := make([]byte, ObjectOutSize)
	buf[128466] = 1
	base := telemetryOffset
	binary.LittleEndian.PutUint64(buf[base+356:], math.Float64bits(math.NaN()))
	binary.LittleEndian.PutUint64(buf[base+184:], math.Float64bits(math.Inf(1)))
	binary.LittleEndian.PutUint64(buf[base+420:], math.Float64bits(2))
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
