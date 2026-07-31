package lmu

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
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
	if !strings.Contains(body, "Track-01") || !strings.Contains(body, "Driver-001") ||
		!strings.Contains(body, "Vehicle-001") || !strings.Contains(body, "Class-001") {
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
	if len(parsed.Vehicles) != 44 {
		t.Fatalf("sanitized grid rows=%d, want 44", len(parsed.Vehicles))
	}
	vehicle, ok := parsed.Vehicles[0].VehicleName.Value()
	if !ok || string(vehicle) != "Vehicle-001" {
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
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	first, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatal(err)
	}
	secondInput := append([]byte(nil), input...)
	second, err := sanitizer.Sanitize(secondInput)
	if err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 44; index++ {
		scoringBase, _ := lmu13Layout.ScoringRows.rowBase(index)
		telemetryBase, _ := lmu13Layout.TelemetryRows.rowBase(index)
		if binary.LittleEndian.Uint32(first[scoringBase:]) != binary.LittleEndian.Uint32(second[scoringBase:]) ||
			binary.LittleEndian.Uint32(first[telemetryBase:]) != binary.LittleEndian.Uint32(second[telemetryBase:]) {
			t.Fatalf("row %d source ID received unstable aliases", index)
		}
		if binary.LittleEndian.Uint32(first[scoringBase:]) == binary.LittleEndian.Uint32(input[scoringBase:]) {
			t.Fatalf("row %d source ID survived sanitization", index)
		}
	}
}

func TestFrameSanitizerNeverUsesAnyActiveSourceIDAsAnAlias(t *testing.T) {
	input := knownBuffer(t)
	activeIDs := make(map[uint32]struct{}, 44)
	for row := 0; row < 44; row++ {
		id := uint32(1_000_001 + row)
		activeIDs[id] = struct{}{}
		scoringBase, _ := lmu13Layout.ScoringRows.rowBase(row)
		telemetryBase, _ := lmu13Layout.TelemetryRows.rowBase(row)
		binary.LittleEndian.PutUint32(input[scoringBase:], id)
		binary.LittleEndian.PutUint32(input[telemetryBase:], id)
	}
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	output, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatal(err)
	}
	for row := 0; row < 44; row++ {
		scoringBase, _ := lmu13Layout.ScoringRows.rowBase(row)
		telemetryBase, _ := lmu13Layout.TelemetryRows.rowBase(row)
		for _, id := range []uint32{
			binary.LittleEndian.Uint32(output[scoringBase:]),
			binary.LittleEndian.Uint32(output[telemetryBase:]),
		} {
			if _, leaked := activeIDs[id]; leaked {
				t.Fatalf("row %d sanitized source ID %d matches an active source ID", row, id)
			}
		}
	}
}

func TestFrameSanitizerRebuildsFullGridAndDropsCanariesFromEveryExcludedRange(t *testing.T) {
	input := knownBuffer(t)
	allowed := diagnosticAllowedByteMask(input)
	for index := range input {
		if !allowed[index] {
			input[index] = 0xa5
		}
	}
	sanitizer, _ := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	output, err := sanitizer.Sanitize(input)
	if err != nil {
		t.Fatal(err)
	}
	assertOnlyAllowedDiagnosticBytes(t, input, output)
	for index, value := range output {
		if !allowed[index] && value != 0 {
			t.Fatalf("excluded byte %d survived as 0x%02x", index, value)
		}
	}
	parsed, err := parseSupported(output, time.Unix(0, 0).UTC())
	if err != nil || parsed.Compatibility != CompatibilityKnown || len(parsed.Vehicles) != 44 {
		t.Fatalf("rebuilt parse=(compatibility=%v rows=%d error=%v)", parsed.Compatibility, len(parsed.Vehicles), err)
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
		original.EndTime != sanitized.EndTime ||
		original.MaximumLaps != sanitized.MaximumLaps ||
		len(original.Vehicles) != len(sanitized.Vehicles) {
		t.Fatalf("sanitized replay changed audited player/global fields:\noriginal=%#v\nsanitized=%#v", original, sanitized)
	}
	for index := range original.Vehicles {
		left, right := original.Vehicles[index], sanitized.Vehicles[index]
		if left.SourceID == right.SourceID ||
			left.Player != right.Player || left.Position != right.Position ||
			left.CompletedLaps != right.CompletedLaps || left.Sector != right.Sector ||
			left.LapDistance != right.LapDistance || left.BestLapTime != right.BestLapTime ||
			left.LastLapTime != right.LastLapTime || left.EstimatedLapTime != right.EstimatedLapTime ||
			left.InPit != right.InPit || left.PitStopCount != right.PitStopCount ||
			left.PenaltyCount != right.PenaltyCount || left.TimeBehindLeader != right.TimeBehindLeader ||
			left.LapsBehindLeader != right.LapsBehindLeader || left.TimeBehindNext != right.TimeBehindNext ||
			left.LapsBehindNext != right.LapsBehindNext || left.LapNumber != right.LapNumber ||
			left.Gear != right.Gear || left.EngineRPM != right.EngineRPM || left.SpeedMPS != right.SpeedMPS ||
			left.Throttle != right.Throttle || left.Brake != right.Brake || left.Clutch != right.Clutch ||
			left.Fuel != right.Fuel {
			t.Fatalf("sanitized row %d changed numeric facts:\noriginal=%#v\nsanitized=%#v", index, left, right)
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

func BenchmarkSanitizeObjectOut44Vehicles(b *testing.B) {
	input := knownBuffer(b)
	sanitizer, err := NewFrameSanitizer(BuildEvidence{FileVersion: supportedLMUVersion})
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.SetBytes(ObjectOutSize)
	for b.Loop() {
		if _, err := sanitizer.Sanitize(input); err != nil {
			b.Fatal(err)
		}
	}
}

func assertOnlyAllowedDiagnosticBytes(t testing.TB, input, output []byte) {
	t.Helper()
	if len(input) != ObjectOutSize || len(output) != ObjectOutSize {
		t.Fatalf("unexpected frame lengths: input=%d output=%d", len(input), len(output))
	}
	allowed := diagnosticAllowedByteMask(input)
	assertCStringEquals(t, output[1632:1696], "Track-01")
	vehicles := int(readInt32(input, lmu13Layout.Session.VehicleCount.Offset))
	for row := 0; row < vehicles; row++ {
		base, _ := lmu13Layout.ScoringRows.rowBase(row)
		assertCStringEquals(t, output[base+4:base+36], fmt.Sprintf("Driver-%03d", row+1))
		assertCStringEquals(t, output[base+36:base+100], fmt.Sprintf("Vehicle-%03d", row+1))
		assertCStringEquals(t, output[base+200:base+232], fmt.Sprintf("Class-%03d", row+1))
	}
	for index, value := range output {
		if !allowed[index] && value != 0 {
			t.Fatalf("byte %d outside allowlist = 0x%02x", index, value)
		}
	}
}

func diagnosticAllowedByteMask(input []byte) []bool {
	allowed := make([]bool, ObjectOutSize)
	mark := func(offset, size int) {
		for index := offset; index < offset+size; index++ {
			allowed[index] = true
		}
	}
	for _, field := range []layoutField{
		lmu13Layout.Session.TrackName, lmu13Layout.Session.SessionType,
		lmu13Layout.Session.CurrentTime, lmu13Layout.Session.EndTime,
		lmu13Layout.Session.MaximumLaps, lmu13Layout.Session.VehicleCount,
	} {
		mark(field.Offset, field.width())
	}
	vehicles := int(readInt32(input, lmu13Layout.Session.VehicleCount.Offset))
	if vehicles < 0 || vehicles > lmu13Layout.ScoringRows.Maximum {
		return allowed
	}
	playerID := VehicleSourceID(-1)
	for row := 0; row < vehicles; row++ {
		base, _ := lmu13Layout.ScoringRows.rowBase(row)
		for _, field := range []layoutField{
			lmu13Layout.Scoring.VehicleSourceSlot, lmu13Layout.Scoring.DriverLabel,
			lmu13Layout.Scoring.VehicleLabel, lmu13Layout.Scoring.CompletedLaps,
			lmu13Layout.Scoring.Sector, lmu13Layout.Scoring.LapDistance,
			lmu13Layout.Scoring.BestLapTime, lmu13Layout.Scoring.LastLapTime,
			lmu13Layout.Scoring.PitStopCount, lmu13Layout.Scoring.PenaltyCount,
			lmu13Layout.Scoring.PlayerMarker, lmu13Layout.Scoring.InPits,
			lmu13Layout.Scoring.Position, lmu13Layout.Scoring.VehicleClass,
			lmu13Layout.Scoring.TimeBehindNext, lmu13Layout.Scoring.LapsBehindNext,
			lmu13Layout.Scoring.TimeBehindLeader, lmu13Layout.Scoring.LapsBehindLeader,
			lmu13Layout.Scoring.EstimatedLapTime,
		} {
			mark(base+field.Offset, field.width())
		}
		if input[base+lmu13Layout.Scoring.PlayerMarker.Offset] == 1 {
			playerID = VehicleSourceID(readInt32(input, base+lmu13Layout.Scoring.VehicleSourceSlot.Offset))
		}
	}
	for row := 0; row < vehicles; row++ {
		base, _ := lmu13Layout.TelemetryRows.rowBase(row)
		mark(base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset, lmu13Layout.Telemetry.VehicleSourceSlot.width())
		if VehicleSourceID(readInt32(input, base+lmu13Layout.Telemetry.VehicleSourceSlot.Offset)) != playerID {
			continue
		}
		for _, field := range []layoutField{
			lmu13Layout.Telemetry.LapNumber, lmu13Layout.Telemetry.LocalVelocity,
			lmu13Layout.Telemetry.Gear, lmu13Layout.Telemetry.EngineRPM,
			lmu13Layout.Telemetry.Throttle, lmu13Layout.Telemetry.Brake,
			lmu13Layout.Telemetry.Clutch, lmu13Layout.Telemetry.FuelLiters,
			lmu13Layout.Telemetry.FuelCapacityLiters,
		} {
			mark(base+field.Offset, field.width())
		}
	}
	return allowed
}

func assertCStringEquals(t testing.TB, value []byte, expected string) {
	t.Helper()
	want := make([]byte, len(value))
	copy(want, expected)
	if !bytes.Equal(value, want) {
		t.Fatalf("C string = %q, want %q", value, want)
	}
}
