package lmu

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestFrameSanitizerRebuildsFromZeroAndPreservesParserFacts(t *testing.T) {
	input := knownBuffer(t)
	original := append([]byte(nil), input...)
	sanitizer, err := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil {
		t.Fatal(err)
	}
	output, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatalf("Sanitize() error = %v", err)
	}
	if !bytes.Equal(input, original) {
		t.Fatal("Sanitize() mutated the input buffer")
	}
	if len(output) != ObjectOutSize || output[500] != 0 || output[130000] != 0 {
		t.Fatal("unknown bytes survived sanitization")
	}
	assertOnlyAllowedDiagnosticBytes(t, input, output)
	body := string(output)
	for _, forbidden := range []string{"driver-", "Circuit", "SyntheticUser", "synthetic-account-id"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("sanitized frame leaked %q", forbidden)
		}
	}
	if !strings.Contains(body, "Track-01") || !strings.Contains(body, "Vehicle-01") {
		t.Fatal("synthetic aliases are absent")
	}
	parsed, err := parseWithBuild(output, time.Unix(2, 0).UTC(), BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil || parsed.Compatibility != CompatibilityKnown {
		t.Fatalf("sanitized parse = %#v, %v", parsed, err)
	}
	track, ok := parsed.TrackName.Value()
	if !ok || track != "Track-01" {
		t.Fatalf("track = %q,%v", track, ok)
	}
	vehicle, ok := parsed.VehicleName.Value()
	if !ok || string(vehicle) != "Vehicle-01" {
		t.Fatalf("vehicle = %q,%v", vehicle, ok)
	}
	originalParsed, err := parseWithBuild(input, time.Unix(2, 0).UTC(), BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil {
		t.Fatal(err)
	}
	assertDiagnosticPlayerScopeEqual(t, originalParsed, parsed)
}

func TestFrameSanitizerRejectsUnknownBuildFingerprintAndShortFrames(t *testing.T) {
	if _, err := NewFrameSanitizer(BuildEvidence{}); !errors.Is(err, ErrUnsanitizableFrame) {
		t.Fatalf("NewFrameSanitizer(unknown) error = %v", err)
	}
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	for _, input := range [][]byte{nil, make([]byte, ObjectOutSize-1)} {
		if _, err := sanitizer.Sanitize(input); !errors.Is(err, ErrUnsanitizableFrame) {
			t.Fatalf("Sanitize(len=%d) error = %v", len(input), err)
		}
	}
}

func TestFrameSanitizerRemapsIdentityStablyWithinCapture(t *testing.T) {
	input := knownBuffer(t)
	playerIndex := int(input[128465])
	base := telemetryOffset + playerIndex*telemetryStride
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	first, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatal(err)
	}
	secondInput := append([]byte(nil), input...)
	binary.LittleEndian.PutUint32(secondInput[base:], binary.LittleEndian.Uint32(input[base:]))
	second, err := sanitizer.Sanitize(secondInput)
	if err != nil {
		t.Fatal(err)
	}
	if binary.LittleEndian.Uint32(first[base:]) != binary.LittleEndian.Uint32(second[base:]) {
		t.Fatal("same source ID received different aliases")
	}
	if binary.LittleEndian.Uint32(first[base:]) == binary.LittleEndian.Uint32(input[base:]) {
		t.Fatal("source ID survived sanitization")
	}
}

func TestCaptureTapIsBoundedCopiesAndClosesIdempotently(t *testing.T) {
	tap, err := NewCaptureTap(1)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().Round(0).UTC()
	payload := make([]byte, ObjectOutSize)
	payload[10] = 1
	reservation, ok := tap.Reserve(now)
	if !ok || !reservation.Commit(payload) {
		t.Fatal("first reservation/commit failed")
	}
	payload[10] = 2
	if _, ok := tap.Reserve(now.Add(time.Second)); ok {
		t.Fatal("saturated Reserve() = true")
	}
	frame := <-tap.Frames()
	if frame.Payload[10] != 1 {
		t.Fatal("tap retained caller-owned buffer")
	}
	tap.Close()
	tap.Close()
	if _, open := <-tap.Frames(); open {
		t.Fatal("tap channel remained open")
	}
	stats := tap.Stats()
	if stats.Offered != 1 || stats.Dropped != 1 || !stats.Closed {
		t.Fatalf("Stats() = %#v", stats)
	}
}

func TestDriverSaturatedTapDoesNotAllocateSanitizedFrame(t *testing.T) {
	source := knownBuffer(t)
	tap, _ := NewCaptureTap(1)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	reservation, ok := tap.Reserve(now)
	if !ok || !reservation.Commit(make([]byte, ObjectOutSize)) {
		t.Fatal("failed to saturate tap")
	}
	driver := newDriver(config{captureTap: tap, rest: nil})
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	allocations := testing.AllocsPerRun(100, func() {
		driver.captureDiagnosticFrame(now.Add(time.Second), source, sanitizer)
	})
	if allocations != 0 {
		t.Fatalf("saturated driver path allocations = %.2f, want 0", allocations)
	}
	// AllocsPerRun performs one warm-up invocation before the 100 measured runs.
	if stats := tap.Stats(); stats.Offered != 1 || stats.Dropped != 101 {
		t.Fatalf("Stats() = %#v", stats)
	}
}

func TestDriverFeedsSanitizedTapWithoutSecondSharedMemoryOpen(t *testing.T) {
	reader := &testReader{data: knownBuffer(t)}
	tap, _ := NewCaptureTap(2)
	opens := 0
	driver := newTestDriver(config{
		open: func() (memoryReader, error) {
			opens++
			return reader, nil
		},
		captureTap: tap,
	})
	sink := &collectingSink{values: make(chan Observation, 1)}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	<-sink.values
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v", err)
	}
	if opens != 1 || reader.closes != 1 {
		t.Fatalf("opens=%d closes=%d", opens, reader.closes)
	}
	frame, ok := <-tap.Frames()
	if !ok || len(frame.Payload) != ObjectOutSize {
		t.Fatalf("tap frame = %d,%v", len(frame.Payload), ok)
	}
	if _, open := <-tap.Frames(); open {
		t.Fatal("tap was not closed during driver teardown")
	}
}

func TestDriverDropsSaturatedTapWithoutBlockingLive(t *testing.T) {
	reader := &testReader{data: knownBuffer(t)}
	tap, _ := NewCaptureTap(1)
	ticks := &manualTicker{ticks: make(chan time.Time, 1)}
	current := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	driver := newTestDriver(config{
		open:       func() (memoryReader, error) { return reader, nil },
		newTicker:  func(time.Duration) ticker { return ticks },
		captureTap: tap,
		now: func() time.Time {
			value := current
			current = current.Add(time.Second)
			return value
		},
	})
	sink := &collectingSink{values: make(chan Observation, 2)}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	<-sink.values
	ticks.ticks <- time.Now()
	select {
	case <-sink.values:
	case <-time.After(time.Second):
		t.Fatal("saturated tap blocked live telemetry")
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	stats := tap.Stats()
	if stats.Offered != 1 || stats.Dropped != 1 {
		t.Fatalf("tap stats = %#v", stats)
	}
}

func assertDiagnosticPlayerScopeEqual(t testing.TB, original, sanitized Observation) {
	t.Helper()
	if original.Compatibility != sanitized.Compatibility ||
		original.SourceTime != sanitized.SourceTime ||
		original.SessionType != sanitized.SessionType ||
		original.VehicleCount != sanitized.VehicleCount ||
		original.PlayerPresent != sanitized.PlayerPresent ||
		original.LapNumber != sanitized.LapNumber ||
		original.Gear != sanitized.Gear ||
		original.EngineRPM != sanitized.EngineRPM ||
		original.SpeedMPS != sanitized.SpeedMPS ||
		original.Throttle != sanitized.Throttle ||
		original.Brake != sanitized.Brake ||
		original.Clutch != sanitized.Clutch ||
		original.InPit != sanitized.InPit {
		t.Fatalf("sanitized replay changed audited player/global fields:\noriginal=%#v\nsanitized=%#v", original, sanitized)
	}
	for _, field := range []schema.Freshness{
		sanitized.PlayerPosition.Freshness(),
		sanitized.CompletedLaps.Freshness(),
		sanitized.PitStopCount.Freshness(),
	} {
		if field != schema.FreshnessMissing {
			t.Fatalf("sanitized frame invented an unparsed grid field: %v", field)
		}
	}
}

func FuzzFrameSanitizerNeverPanicsOrLeaksUnknownBytes(f *testing.F) {
	f.Add(knownBuffer(f))
	f.Add(make([]byte, ObjectOutSize))
	f.Fuzz(func(t *testing.T, input []byte) {
		original := append([]byte(nil), input...)
		sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
		output, err := sanitizer.Sanitize(input)
		if !bytes.Equal(input, original) {
			t.Fatal("Sanitize() mutated fuzz input")
		}
		if err == nil {
			if len(output) != ObjectOutSize {
				t.Fatalf("Sanitize() len = %d", len(output))
			}
			assertOnlyAllowedDiagnosticBytes(t, input, output)
		}
	})
}

func BenchmarkDriverCapturePath(b *testing.B) {
	source := knownBuffer(b)
	build := BuildEvidence{FileVersion: supportedLMUVersion}
	b.Run("tap-absent", func(b *testing.B) {
		driver := newDriver(config{rest: nil})
		profile := profileFromBuild(build)
		sanitizer, _ := NewFrameSanitizer(build)
		b.ReportAllocs()
		for b.Loop() {
			driver.captureDiagnosticFrame(time.Unix(1, 0).UTC(), source, sanitizer)
			if _, err := parseWithProfile(source, time.Unix(1, 0).UTC(), profile); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("tap-active", func(b *testing.B) {
		tap, _ := NewCaptureTap(1)
		driver := newDriver(config{captureTap: tap, rest: nil})
		profile := profileFromBuild(build)
		sanitizer, _ := NewFrameSanitizer(build)
		at := time.Unix(1, 0).UTC()
		b.ReportAllocs()
		for b.Loop() {
			driver.captureDiagnosticFrame(at, source, sanitizer)
			<-tap.Frames()
			if _, err := parseWithProfile(source, at, profile); err != nil {
				b.Fatal(err)
			}
			at = at.Add(time.Second)
		}
	})
	b.Run("tap-saturated", func(b *testing.B) {
		tap, _ := NewCaptureTap(1)
		driver := newDriver(config{captureTap: tap, rest: nil})
		profile := profileFromBuild(build)
		sanitizer, _ := NewFrameSanitizer(build)
		at := time.Unix(1, 0).UTC()
		reservation, _ := tap.Reserve(at)
		reservation.Commit(make([]byte, ObjectOutSize))
		b.ReportAllocs()
		for b.Loop() {
			driver.captureDiagnosticFrame(at.Add(time.Second), source, sanitizer)
			if _, err := parseWithProfile(source, at, profile); err != nil {
				b.Fatal(err)
			}
		}
	})
}

func assertOnlyAllowedDiagnosticBytes(t testing.TB, input, output []byte) {
	t.Helper()
	if len(input) != ObjectOutSize || len(output) != ObjectOutSize {
		t.Fatalf("unexpected frame lengths: input=%d output=%d", len(input), len(output))
	}
	allowed := make([]bool, ObjectOutSize)
	mark := func(offset, size int) {
		for index := offset; index < offset+size; index++ {
			allowed[index] = true
		}
	}
	mark(1632, 64)
	mark(1696, 4)
	mark(1700, 8)
	mark(1736, 4)
	mark(1740, 1)
	mark(128465, 2)

	playerIndex := int(input[128465])
	if input[128466] == 1 {
		scoringBase, ok := playerScoringEvidence(
			input,
			int32(binary.LittleEndian.Uint32(input[1736:])),
			playerIndex,
		)
		if !ok {
			t.Fatal("accepted frame lacks player scoring evidence")
		}
		telemetryBase := telemetryOffset + playerIndex*telemetryStride
		for _, span := range []struct {
			offset int
			size   int
		}{
			{telemetryBase, 4},
			{telemetryBase + 20, 4},
			{telemetryBase + 32, 128},
			{telemetryBase + 184, 24},
			{telemetryBase + 352, 12},
			{telemetryBase + 420, 16},
			{telemetryBase + 444, 8},
			{scoringBase, 4},
			{scoringBase + 36, 64},
			{scoringBase + scoringIsPlayerOffset, 1},
			{scoringBase + scoringInPitsOffset, 1},
		} {
			mark(span.offset, span.size)
		}
		assertCStringEquals(t, output[telemetryBase+32:telemetryBase+96], "Vehicle-01")
		assertCStringEquals(t, output[telemetryBase+96:telemetryBase+160], "Track-01")
		assertCStringEquals(t, output[scoringBase+36:scoringBase+100], "Vehicle-01")
	}
	assertCStringEquals(t, output[1632:1696], "Track-01")
	for index, value := range output {
		if !allowed[index] && value != 0 {
			t.Fatalf("byte %d outside allowlist = 0x%02x", index, value)
		}
	}
}

func assertCStringEquals(t testing.TB, value []byte, expected string) {
	t.Helper()
	want := make([]byte, len(value))
	copy(want, expected)
	if !bytes.Equal(value, want) {
		t.Fatalf("C string = %q, want %q", value, want)
	}
}
