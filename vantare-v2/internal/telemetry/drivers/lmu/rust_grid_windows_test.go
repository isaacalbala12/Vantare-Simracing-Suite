package lmu

import (
	"encoding/binary"
	"fmt"
	"reflect"
	"runtime"
	"syscall"
	"testing"
	"time"
	"unsafe"

	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

type rustGridMap struct {
	Count            uint32
	PlayerIndex      int32
	TelemetryIndices [maxVehicles]uint8
}

var parserComparisonSink Observation

func rustGridProc(t testing.TB) *syscall.Proc {
	t.Helper()
	dll := rustProbeDLL(t)
	proc, err := dll.FindProc("vantare_lmu_grid_map")
	if err != nil {
		t.Fatal(err)
	}
	return proc
}

func runRustGridMap(proc *syscall.Proc, data []byte, result *rustGridMap) uint32 {
	status, _, _ := proc.Call(
		uintptr(unsafe.Pointer(unsafe.SliceData(data))),
		uintptr(len(data)),
		uintptr(unsafe.Pointer(result)),
	)
	runtime.KeepAlive(data)
	runtime.KeepAlive(result)
	return uint32(status)
}

// Same fixed-array algorithm as the Rust DLL. This control separates the
// algorithmic benefit from the choice of language.
func goFixedGridMap(buf []byte, count int, mapping *rustGridMap) bool {
	if count < 0 || count > maxVehicles {
		return false
	}
	var telemetryIDs, scoringIDs [maxVehicles]int32
	for index := 0; index < count; index++ {
		id := readInt32(buf, telemetryOffset+index*telemetryStride)
		if id < 0 {
			return false
		}
		for prior := 0; prior < index; prior++ {
			if telemetryIDs[prior] == id {
				return false
			}
		}
		telemetryIDs[index] = id
	}
	mapping.Count = uint32(count)
	mapping.PlayerIndex = -1
	for index := 0; index < count; index++ {
		base := scoringOffset + index*scoringStride
		id := readInt32(buf, base)
		if id < 0 {
			return false
		}
		for prior := 0; prior < index; prior++ {
			if scoringIDs[prior] == id {
				return false
			}
		}
		scoringIDs[index] = id
		matched := false
		for telemetryIndex := 0; telemetryIndex < count; telemetryIndex++ {
			if telemetryIDs[telemetryIndex] == id {
				mapping.TelemetryIndices[index] = uint8(telemetryIndex)
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
		if buf[base+scoringIsPlayerOffset] == 1 {
			if mapping.PlayerIndex >= 0 {
				return false
			}
			mapping.PlayerIndex = int32(index)
		}
	}
	return true
}

// Go constructs every canonical field after either implementation maps IDs.
func parseActiveGridMapped(buf []byte, count int, proc *syscall.Proc) ([]VehicleObservation, int, bool) {
	var mapping rustGridMap
	if proc == nil {
		if !goFixedGridMap(buf, count, &mapping) {
			return nil, -1, false
		}
	} else if status := runRustGridMap(proc, buf, &mapping); status != 0 || int(mapping.Count) != count {
		return nil, -1, false
	}
	rows := make([]VehicleObservation, 0, count)
	for index := 0; index < count; index++ {
		base := scoringOffset + index*scoringStride
		row, valid := parseScoringRow(buf, base)
		if !valid {
			return nil, -1, false
		}
		if index == int(mapping.PlayerIndex) {
			telemetryBase := telemetryOffset + int(mapping.TelemetryIndices[index])*telemetryStride
			parsePlayerTelemetry(buf, telemetryBase, &row)
		}
		rows = append(rows, row)
	}
	normalizeLapProgressEvidence(rows)
	return rows, int(mapping.PlayerIndex), true
}

// Experimental twin of parseWithProfile. A nil proc selects fixed-array Go;
// a non-nil proc selects Rust. Keep parity tests on every real capture.
func parseWithProfileMapped(buf []byte, received time.Time, profile compatibilityProfile, proc *syscall.Proc) (Observation, error) {
	if len(buf) < ObjectOutSize {
		return Observation{}, ErrIncompatibleBuffer
	}
	result := Observation{
		Source:        SourceSharedMemory,
		ReceivedUTC:   received.Round(0).UTC(),
		Compatibility: CompatibilityUnknown,
		Fingerprint:   profile.unknownFingerprint(),
	}
	if !profile.supported {
		return result, nil
	}
	vehicles := readInt32(buf, lmu13Layout.Session.VehicleCount.Offset)
	if vehicles < 0 || vehicles > int32(lmu13Layout.ScoringRows.Maximum) {
		return rejectedObservation(result, profile, "vehicle-count-invalid"), nil
	}
	track, ok := readCStringField(buf, lmu13Layout.Session.TrackName, 0, true)
	if !ok {
		return rejectedObservation(result, profile, "session-string-invalid"), nil
	}
	currentSeconds := readFloat64(buf, lmu13Layout.Session.CurrentTime.Offset)
	endSeconds := readFloat64(buf, lmu13Layout.Session.EndTime.Offset)
	maximumLaps := readInt32(buf, lmu13Layout.Session.MaximumLaps.Offset)
	grid, playerIndex, valid := parseActiveGridMapped(buf, int(vehicles), proc)
	if !valid {
		return rejectedObservation(result, profile, "active-grid-invalid"), nil
	}
	playerPresent := playerIndex >= 0
	telemetryEvidence := "not-required-no-player"
	if playerPresent {
		telemetryEvidence = "player-id-correlated"
	}
	result.Compatibility = CompatibilityKnown
	result.Fingerprint = fmt.Sprintf(knownFingerprintFormat, profile.version, "active-grid-bijective", telemetryEvidence)
	result.PlayerPresent = observed(playerPresent)
	result.TrackName = observed(normalizeTrackName(track))
	length := readFloat64(buf, lmu13Layout.Session.TrackLength.Offset)
	if finite(length) && length > 0 {
		result.TrackLength = observed(standings.LapDistance(length))
	} else if length != 0 {
		result.TrackLength = invalid[standings.LapDistance]()
	}
	result.VehicleCount = validateCount(vehicles, 0, maxVehicles)
	result.SessionType = validateSessionType(readInt32(buf, lmu13Layout.Session.SessionType.Offset))
	result.SourceTime = validateDuration(currentSeconds)
	if vehicles > 0 {
		rain := readFloat64(buf, lmu13Layout.Session.RainFraction.Offset)
		result.RainFraction = invalid[weather.Fraction]()
		if finite(rain) && rain >= 0 && rain <= 1 {
			result.RainFraction = observed(weather.Fraction(rain))
		}
	}
	result.EndTime = invalid[session.EndTime]()
	if finite(endSeconds) && (!finite(currentSeconds) || endSeconds >= currentSeconds) {
		result.EndTime = observed(session.EndTime(endSeconds))
	}
	result.MaximumLaps = invalid[session.MaximumLaps]()
	if maximumLaps >= 0 {
		result.MaximumLaps = observed(session.MaximumLaps(maximumLaps))
	}
	result.Vehicles = grid
	if playerPresent {
		publishPlayer(&result, grid[playerIndex])
	}
	return result, nil
}

func TestRustGridParserMatchesGoOnSanitizedLMUCaptures(t *testing.T) {
	proc := rustGridProc(t)
	profile := profileFromBuild(BuildEvidence{FileVersion: supportedLMUVersion})
	when := time.Unix(1, 0).UTC()
	for _, name := range []string{
		"lmu-fixture.bin",
		"lmu-1.4-track-fixture.bin",
		"lmu-1.4.1.3-track-fixture.bin",
		"lmu-1.4.1.3-menu-fixture.bin",
	} {
		t.Run(name, func(t *testing.T) {
			data := fixtureBytes(t, name)
			want, wantErr := parseWithProfile(data, when, profile)
			for _, variant := range []struct {
				name string
				proc *syscall.Proc
			}{{"GoFixed", nil}, {"RustGrid", proc}} {
				got, gotErr := parseWithProfileMapped(data, when, profile, variant.proc)
				if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(gotErr, wantErr) {
					t.Fatalf("%s parser output differs: Go compatibility=%v vehicles=%d; variant compatibility=%v vehicles=%d; errors %v/%v", variant.name, want.Compatibility, len(want.Vehicles), got.Compatibility, len(got.Vehicles), wantErr, gotErr)
				}
			}
		})
	}
}

func TestRustGridParserRejectsSameCorruptionsAsGo(t *testing.T) {
	proc := rustGridProc(t)
	profile := profileFromBuild(BuildEvidence{FileVersion: supportedLMUVersion})
	when := time.Unix(1, 0).UTC()
	for _, test := range []struct {
		name   string
		mutate func([]byte)
	}{
		{"duplicate telemetry ID", func(data []byte) {
			copy(data[telemetryOffset+telemetryStride:], data[telemetryOffset:telemetryOffset+4])
		}},
		{"negative scoring ID", func(data []byte) { binary.LittleEndian.PutUint32(data[scoringOffset:], ^uint32(0)) }},
		{"duplicate scoring ID", func(data []byte) { copy(data[scoringOffset+scoringStride:], data[scoringOffset:scoringOffset+4]) }},
		{"two player markers", func(data []byte) {
			data[scoringOffset+scoringIsPlayerOffset] = 1
			data[scoringOffset+scoringStride+scoringIsPlayerOffset] = 1
		}},
		{"invalid player marker", func(data []byte) { data[scoringOffset+scoringIsPlayerOffset] = 2 }},
		{"invalid count", func(data []byte) { binary.LittleEndian.PutUint32(data[1736:], maxVehicles+1) }},
	} {
		t.Run(test.name, func(t *testing.T) {
			data := append([]byte(nil), fixtureBytes(t, "lmu-fixture.bin")...)
			test.mutate(data)
			want, wantErr := parseWithProfile(data, when, profile)
			for _, variant := range []struct {
				name string
				proc *syscall.Proc
			}{{"GoFixed", nil}, {"RustGrid", proc}} {
				got, gotErr := parseWithProfileMapped(data, when, profile, variant.proc)
				if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(gotErr, wantErr) {
					t.Fatalf("%s parser output differs after %s: Go compatibility=%v; variant compatibility=%v; errors %v/%v", variant.name, test.name, want.Compatibility, got.Compatibility, wantErr, gotErr)
				}
			}
		})
	}
}

func BenchmarkLMUParserGo(b *testing.B) {
	data := fixtureBytes(b, "lmu-fixture.bin")
	profile := profileFromBuild(BuildEvidence{FileVersion: supportedLMUVersion})
	when := time.Unix(1, 0).UTC()
	b.ReportAllocs()
	for b.Loop() {
		result, err := parseWithProfile(data, when, profile)
		if err != nil {
			b.Fatal(err)
		}
		parserComparisonSink = result
	}
}

func BenchmarkLMUParserRustGrid(b *testing.B) {
	proc := rustGridProc(b)
	data := fixtureBytes(b, "lmu-fixture.bin")
	profile := profileFromBuild(BuildEvidence{FileVersion: supportedLMUVersion})
	when := time.Unix(1, 0).UTC()
	b.ReportAllocs()
	for b.Loop() {
		result, err := parseWithProfileMapped(data, when, profile, proc)
		if err != nil {
			b.Fatal(err)
		}
		parserComparisonSink = result
	}
}

func BenchmarkLMUParserGoFixed(b *testing.B) {
	data := fixtureBytes(b, "lmu-fixture.bin")
	profile := profileFromBuild(BuildEvidence{FileVersion: supportedLMUVersion})
	when := time.Unix(1, 0).UTC()
	b.ReportAllocs()
	for b.Loop() {
		result, err := parseWithProfileMapped(data, when, profile, nil)
		if err != nil {
			b.Fatal(err)
		}
		parserComparisonSink = result
	}
}
