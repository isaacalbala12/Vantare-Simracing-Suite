package lmu

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"
)

func TestLMU13WindowsSourceTypesHaveAuditedWidths(t *testing.T) {
	tests := []struct {
		kind  windowsSourceType
		name  string
		width int
	}{
		{sourceInt32, "int32", 4},
		{sourceInt16, "int16", 2},
		{sourceInt8, "int8", 1},
		{sourceUint8, "uint8", 1},
		{sourceBool8, "bool8", 1},
		{sourceFloat64, "float64", 8},
		{sourceChar, "char", 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if string(tt.kind) != tt.name || tt.kind.width() != tt.width {
				t.Fatalf("source type = %q/%d, want %q/%d", tt.kind, tt.kind.width(), tt.name, tt.width)
			}
		})
	}
}

func TestLMU13LayoutMatchesAuditedOffsetsAndSourceTypes(t *testing.T) {
	tests := []struct {
		field  layoutField
		scope  layoutScope
		offset int
		kind   windowsSourceType
		count  int
	}{
		{lmu13Layout.Session.TrackName, scopeSession, 1632, sourceChar, 64},
		{lmu13Layout.Session.SessionType, scopeSession, 1696, sourceInt32, 1},
		{lmu13Layout.Session.CurrentTime, scopeSession, 1700, sourceFloat64, 1},
		{lmu13Layout.Session.EndTime, scopeSession, 1708, sourceFloat64, 1},
		{lmu13Layout.Session.MaximumLaps, scopeSession, 1716, sourceInt32, 1},
		{lmu13Layout.Session.VehicleCount, scopeSession, 1736, sourceInt32, 1},

		{lmu13Layout.Scoring.VehicleSourceSlot, scopeScoringRow, 0, sourceInt32, 1},
		{lmu13Layout.Scoring.DriverLabel, scopeScoringRow, 4, sourceChar, 32},
		{lmu13Layout.Scoring.VehicleLabel, scopeScoringRow, 36, sourceChar, 64},
		{lmu13Layout.Scoring.CompletedLaps, scopeScoringRow, 100, sourceInt16, 1},
		{lmu13Layout.Scoring.Sector, scopeScoringRow, 102, sourceInt8, 1},
		{lmu13Layout.Scoring.LapDistance, scopeScoringRow, 104, sourceFloat64, 1},
		{lmu13Layout.Scoring.BestLapTime, scopeScoringRow, 144, sourceFloat64, 1},
		{lmu13Layout.Scoring.LastLapTime, scopeScoringRow, 168, sourceFloat64, 1},
		{lmu13Layout.Scoring.PitStopCount, scopeScoringRow, 192, sourceInt16, 1},
		{lmu13Layout.Scoring.PenaltyCount, scopeScoringRow, 194, sourceInt16, 1},
		{lmu13Layout.Scoring.PlayerMarker, scopeScoringRow, 196, sourceBool8, 1},
		{lmu13Layout.Scoring.InPits, scopeScoringRow, 198, sourceBool8, 1},
		{lmu13Layout.Scoring.Position, scopeScoringRow, 199, sourceUint8, 1},
		{lmu13Layout.Scoring.VehicleClass, scopeScoringRow, 200, sourceChar, 32},
		{lmu13Layout.Scoring.TimeBehindNext, scopeScoringRow, 232, sourceFloat64, 1},
		{lmu13Layout.Scoring.LapsBehindNext, scopeScoringRow, 240, sourceInt32, 1},
		{lmu13Layout.Scoring.TimeBehindLeader, scopeScoringRow, 244, sourceFloat64, 1},
		{lmu13Layout.Scoring.LapsBehindLeader, scopeScoringRow, 252, sourceInt32, 1},
		{lmu13Layout.Scoring.EstimatedLapTime, scopeScoringRow, 472, sourceFloat64, 1},
		{lmu13Layout.Scoring.WorldPosition, scopeScoringRow, 264, sourceFloat64, 3},
		{lmu13Layout.Scoring.LocalVelocity, scopeScoringRow, 288, sourceFloat64, 3},
		{lmu13Layout.Scoring.Orientation, scopeScoringRow, 336, sourceFloat64, 9},

		{lmu13Layout.Telemetry.VehicleSourceSlot, scopeTelemetryRow, 0, sourceInt32, 1},
		{lmu13Layout.Telemetry.LapNumber, scopeTelemetryRow, 20, sourceInt32, 1},
		{lmu13Layout.Telemetry.WorldPosition, scopeTelemetryRow, 160, sourceFloat64, 3},
		{lmu13Layout.Telemetry.LocalVelocity, scopeTelemetryRow, 184, sourceFloat64, 3},
		{lmu13Layout.Telemetry.Orientation, scopeTelemetryRow, 232, sourceFloat64, 9},
		{lmu13Layout.Telemetry.Gear, scopeTelemetryRow, 352, sourceInt32, 1},
		{lmu13Layout.Telemetry.EngineRPM, scopeTelemetryRow, 356, sourceFloat64, 1},
		{lmu13Layout.Telemetry.Throttle, scopeTelemetryRow, 420, sourceFloat64, 1},
		{lmu13Layout.Telemetry.Brake, scopeTelemetryRow, 428, sourceFloat64, 1},
		{lmu13Layout.Telemetry.Clutch, scopeTelemetryRow, 444, sourceFloat64, 1},
		{lmu13Layout.Telemetry.FuelLiters, scopeTelemetryRow, 524, sourceFloat64, 1},
		{lmu13Layout.Telemetry.FuelCapacityLiters, scopeTelemetryRow, 608, sourceFloat64, 1},
		{lmu13Layout.Telemetry.DeltaBest, scopeTelemetryRow, 696, sourceFloat64, 1},
		{lmu13Layout.Telemetry.Overheating, scopeTelemetryRow, 541, sourceUint8, 1},
		{lmu13Layout.Telemetry.Detached, scopeTelemetryRow, 542, sourceUint8, 1},
		{lmu13Layout.Telemetry.DentSeverity, scopeTelemetryRow, 544, sourceUint8, 8},
		{lmu13Layout.Telemetry.WheelDetachedFL, scopeTelemetryRow, 1026, sourceUint8, 1},
		{lmu13Layout.Telemetry.WheelDetachedFR, scopeTelemetryRow, 1286, sourceUint8, 1},
		{lmu13Layout.Telemetry.WheelDetachedRL, scopeTelemetryRow, 1546, sourceUint8, 1},
		{lmu13Layout.Telemetry.WheelDetachedRR, scopeTelemetryRow, 1806, sourceUint8, 1},
	}

	if lmu13Layout.Version != "1.3.0.0" || lmu13Layout.ObjectSize != 324820 {
		t.Fatalf("layout identity = %q/%d, want pinned LMU 1.3/324820", lmu13Layout.Version, lmu13Layout.ObjectSize)
	}
	if lmu13Layout.ScoringRows != (rowLayout{Base: 2192, Stride: 584, Maximum: 104}) {
		t.Fatalf("scoring rows = %+v", lmu13Layout.ScoringRows)
	}
	if lmu13Layout.TelemetryRows != (rowLayout{Base: 128468, Stride: 1888, Maximum: 104}) {
		t.Fatalf("telemetry rows = %+v", lmu13Layout.TelemetryRows)
	}

	for _, tt := range tests {
		t.Run(tt.field.Name, func(t *testing.T) {
			if tt.field.Scope != tt.scope || tt.field.Offset != tt.offset || tt.field.Type != tt.kind || tt.field.Count != tt.count {
				t.Fatalf("field = %+v, want scope=%s offset=%d type=%s count=%d", tt.field, tt.scope, tt.offset, tt.kind, tt.count)
			}
		})
	}
	if got := len(lmu13Layout.admittedFields()); got != len(tests) {
		t.Fatalf("admitted fields = %d, want %d", got, len(tests))
	}
}

func TestLMU13LayoutReadsPinnedTrackFixture(t *testing.T) {
	buf := readPinnedLMU13Fixture(t, "lmu-fixture.bin", "959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff")
	readPinnedLMU13Fixture(t, "lmu-menu-fixture.bin", "8fc09829441e11a466bc9ff92e1a667b819eb6cf83cdf16891d7ed756d887f1a")

	assertLayoutString(t, buf, lmu13Layout.Session.TrackName, "Circuit de Barcelona")
	assertLayoutInt64(t, buf, lmu13Layout.Session.SessionType, 1)
	assertLayoutFloat(t, buf, lmu13Layout.Session.CurrentTime, 112.6)
	assertLayoutFloat(t, buf, lmu13Layout.Session.EndTime, 3605)
	assertLayoutInt64(t, buf, lmu13Layout.Session.MaximumLaps, 0)
	assertLayoutInt64(t, buf, lmu13Layout.Session.VehicleCount, 44)

	const playerRow = 43
	scoringBase, ok := lmu13Layout.ScoringRows.rowBase(playerRow)
	if !ok {
		t.Fatal("audited player scoring row is outside the layout")
	}
	telemetryBase, ok := lmu13Layout.TelemetryRows.rowBase(playerRow)
	if !ok {
		t.Fatal("audited player telemetry row is outside the layout")
	}

	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.VehicleSourceSlot, 0)
	assertLayoutStringAt(t, buf, scoringBase, lmu13Layout.Scoring.DriverLabel, "player")
	assertLayoutStringAt(t, buf, scoringBase, lmu13Layout.Scoring.VehicleLabel, "ADESS Factory Racing Team 2025 #46:ELMS")
	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.CompletedLaps, 0)
	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.Sector, 1)
	assertLayoutFloatAt(t, buf, scoringBase, lmu13Layout.Scoring.LapDistance, 1068.2296142578125)
	assertLayoutFloatAt(t, buf, scoringBase, lmu13Layout.Scoring.BestLapTime, -1)
	assertLayoutFloatAt(t, buf, scoringBase, lmu13Layout.Scoring.LastLapTime, 0)
	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.PitStopCount, 0)
	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.PenaltyCount, 0)
	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.PlayerMarker, 1)
	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.InPits, 0)
	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.Position, 9)
	assertLayoutStringAt(t, buf, scoringBase, lmu13Layout.Scoring.VehicleClass, "LMP3")
	assertLayoutFloatAt(t, buf, scoringBase, lmu13Layout.Scoring.TimeBehindNext, 17.1153507232666)
	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.LapsBehindNext, 0)
	assertLayoutFloatAt(t, buf, scoringBase, lmu13Layout.Scoring.TimeBehindLeader, 66.6352081298828)
	assertLayoutInt64At(t, buf, scoringBase, lmu13Layout.Scoring.LapsBehindLeader, 0)
	assertLayoutFloatAt(t, buf, scoringBase, lmu13Layout.Scoring.EstimatedLapTime, 98.6324920654297)
	assertLayoutFloatElementAt(t, buf, scoringBase, lmu13Layout.Scoring.WorldPosition, 0, -485.3604736328125)
	assertLayoutFloatElementAt(t, buf, scoringBase, lmu13Layout.Scoring.WorldPosition, 2, -481.41119384765625)
	assertLayoutFloatElementAt(t, buf, scoringBase, lmu13Layout.Scoring.Orientation, 6, -0.866686701774597)
	assertLayoutFloatElementAt(t, buf, scoringBase, lmu13Layout.Scoring.Orientation, 8, 0.497451931238174)

	assertLayoutInt64At(t, buf, telemetryBase, lmu13Layout.Telemetry.VehicleSourceSlot, 0)
	assertLayoutInt64At(t, buf, telemetryBase, lmu13Layout.Telemetry.LapNumber, 0)
	assertLayoutFloatElementAt(t, buf, telemetryBase, lmu13Layout.Telemetry.WorldPosition, 0, -487.8100280761719)
	assertLayoutFloatElementAt(t, buf, telemetryBase, lmu13Layout.Telemetry.WorldPosition, 2, -482.815948486328)
	assertLayoutFloatElementAt(t, buf, telemetryBase, lmu13Layout.Telemetry.LocalVelocity, 0, 0.00766611099243164)
	assertLayoutFloatElementAt(t, buf, telemetryBase, lmu13Layout.Telemetry.LocalVelocity, 1, 0.171518176794052)
	assertLayoutFloatElementAt(t, buf, telemetryBase, lmu13Layout.Telemetry.LocalVelocity, 2, -15.5912675857544)
	assertLayoutFloatElementAt(t, buf, telemetryBase, lmu13Layout.Telemetry.Orientation, 6, -0.8669500350952148)
	assertLayoutFloatElementAt(t, buf, telemetryBase, lmu13Layout.Telemetry.Orientation, 8, 0.4970053732395172)
	assertLayoutInt64At(t, buf, telemetryBase, lmu13Layout.Telemetry.Gear, 1)
	assertLayoutFloatAt(t, buf, telemetryBase, lmu13Layout.Telemetry.EngineRPM, 3395.99191193568)
	assertLayoutFloatAt(t, buf, telemetryBase, lmu13Layout.Telemetry.Throttle, 0)
	assertLayoutFloatAt(t, buf, telemetryBase, lmu13Layout.Telemetry.Brake, 0)
	assertLayoutFloatAt(t, buf, telemetryBase, lmu13Layout.Telemetry.Clutch, 0)
	assertLayoutFloatAt(t, buf, telemetryBase, lmu13Layout.Telemetry.FuelLiters, 99.5865732777237)
	assertLayoutFloatAt(t, buf, telemetryBase, lmu13Layout.Telemetry.FuelCapacityLiters, 100)
}

func TestLMU13LayoutBoundsAndNonOverlap(t *testing.T) {
	if got := lmu13Layout.ScoringRows.end(); got != 62928 {
		t.Fatalf("scoring end = %d, want 62928", got)
	}
	if got := lmu13Layout.TelemetryRows.end(); got != ObjectOutSize {
		t.Fatalf("telemetry end = %d, want ObjectOutSize=%d", got, ObjectOutSize)
	}
	if lmu13Layout.ScoringRows.end() > lmu13Layout.TelemetryRows.Base {
		t.Fatal("scoring rows overlap telemetry rows")
	}

	fields := lmu13Layout.admittedFields()
	var sessionEnd int
	for _, field := range fields {
		if field.width() <= 0 {
			t.Fatalf("field %q has invalid width %d", field.Name, field.width())
		}
		limit := lmu13Layout.ObjectSize
		if field.Scope == scopeScoringRow {
			limit = lmu13Layout.ScoringRows.Stride
		}
		if field.Scope == scopeTelemetryRow {
			limit = lmu13Layout.TelemetryRows.Stride
		}
		if field.Offset < 0 || field.end() > limit {
			t.Fatalf("field %q range [%d,%d) exceeds %s limit %d", field.Name, field.Offset, field.end(), field.Scope, limit)
		}
		if field.Scope == scopeSession && field.end() > sessionEnd {
			sessionEnd = field.end()
		}
	}
	if sessionEnd > lmu13Layout.ScoringRows.Base {
		t.Fatalf("session fields end at %d and overlap scoring base %d", sessionEnd, lmu13Layout.ScoringRows.Base)
	}

	for _, scope := range []layoutScope{scopeSession, scopeScoringRow, scopeTelemetryRow} {
		assertNoLayoutFieldOverlap(t, fieldsForScope(fields, scope))
	}
}

func TestLMU13LayoutAdmittedWindowsDoNotOverlapKnownExcludedWindows(t *testing.T) {
	excluded := []layoutField{
		{Name: "session.game_phase", Scope: scopeSession, Offset: 1740, Type: sourceUint8, Count: 1},
		{Name: "session.ambient_temperature", Scope: scopeSession, Offset: 1860, Type: sourceFloat64, Count: 1},
		{Name: "session.track_temperature", Scope: scopeSession, Offset: 1868, Type: sourceFloat64, Count: 1},
		{Name: "scoring.finish_status", Scope: scopeScoringRow, Offset: 103, Type: sourceUint8, Count: 1},
		{Name: "scoring.pit_state", Scope: scopeScoringRow, Offset: 457, Type: sourceUint8, Count: 1},
		{Name: "scoring.vehicle_flag", Scope: scopeScoringRow, Offset: 504, Type: sourceUint8, Count: 1},
		{Name: "scoring.fuel_fraction", Scope: scopeScoringRow, Offset: 578, Type: sourceUint8, Count: 1},
		{Name: "telemetry.filtered_steering", Scope: scopeTelemetryRow, Offset: 436, Type: sourceFloat64, Count: 1},
	}
	for _, admitted := range lmu13Layout.admittedFields() {
		for _, blocked := range excluded {
			if admitted.Scope != blocked.Scope {
				continue
			}
			if admitted.Offset < blocked.end() && blocked.Offset < admitted.end() {
				t.Fatalf("admitted field %q overlaps excluded window %q", admitted.Name, blocked.Name)
			}
		}
	}
}

func TestLMU13LayoutStopsAt104Rows(t *testing.T) {
	for _, rows := range []rowLayout{lmu13Layout.ScoringRows, lmu13Layout.TelemetryRows} {
		last, ok := rows.rowBase(103)
		if !ok || last+rows.Stride != rows.end() {
			t.Fatalf("last row = (%d,%v), end=%d", last, ok, rows.end())
		}
		for _, index := range []int{-1, 104, 105, math.MaxInt} {
			if base, ok := rows.rowBase(index); ok {
				t.Fatalf("rowBase(%d) = (%d,true), want rejected", index, base)
			}
		}
	}
}

func TestLMU13LayoutAdmitsNoExcludedFields(t *testing.T) {
	admitted := make(map[string]struct{})
	for _, field := range lmu13Layout.admittedFields() {
		if _, duplicate := admitted[field.Name]; duplicate {
			t.Fatalf("duplicate admitted field %q", field.Name)
		}
		admitted[field.Name] = struct{}{}
	}
	for _, excluded := range []string{
		"session.game_phase",
		"session.yellow_flag_state",
		"session.sector_flags",
		"session.time_remaining_raw",
		"session.ambient_temperature",
		"session.track_temperature",
		"scoring.finish_status",
		"scoring.pit_state",
		"scoring.vehicle_flag",
		"scoring.fuel_fraction",
		"vehicle.team",
		"vehicle.car_number",
		"vehicle.tyre_compound",
		"vehicle.virtual_energy",
		"weather",
	} {
		if _, ok := admitted[excluded]; ok {
			t.Fatalf("excluded field %q is admitted by LMU 1.3 layout", excluded)
		}
	}
}

func TestLMU13LayoutAdmitsNativePlayerDeltaBest(t *testing.T) {
	for _, field := range lmu13Layout.admittedFields() {
		if field.Name != "telemetry.delta_best" {
			continue
		}
		if field.Scope != scopeTelemetryRow || field.Offset != 696 || field.Type != sourceFloat64 || field.Count != 1 {
			t.Fatalf("delta best layout = %+v", field)
		}
		return
	}
	t.Fatal("native telemetry.delta_best is not admitted")
}

func readPinnedLMU13Fixture(t *testing.T, name, wantHash string) []byte {
	t.Helper()
	buf, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	if got := fmt.Sprintf("%x", sha256.Sum256(buf)); got != wantHash {
		t.Fatalf("%s SHA-256 = %s, want %s", name, got, wantHash)
	}
	if len(buf) != lmu13Layout.ObjectSize {
		t.Fatalf("%s size = %d, want %d", name, len(buf), lmu13Layout.ObjectSize)
	}
	return buf
}

func assertNoLayoutFieldOverlap(t *testing.T, fields []layoutField) {
	t.Helper()
	for index, left := range fields {
		for _, right := range fields[index+1:] {
			if left.Offset < right.end() && right.Offset < left.end() {
				t.Fatalf("admitted fields overlap: %q [%d,%d) and %q [%d,%d)", left.Name, left.Offset, left.end(), right.Name, right.Offset, right.end())
			}
		}
	}
}

func fieldsForScope(fields []layoutField, scope layoutScope) []layoutField {
	var selected []layoutField
	for _, field := range fields {
		if field.Scope == scope {
			selected = append(selected, field)
		}
	}
	return selected
}

func assertLayoutString(t *testing.T, buf []byte, field layoutField, want string) {
	t.Helper()
	assertLayoutStringAt(t, buf, 0, field, want)
}

func assertLayoutStringAt(t *testing.T, buf []byte, base int, field layoutField, want string) {
	t.Helper()
	value := buf[base+field.Offset : base+field.end()]
	for index, char := range value {
		if char == 0 {
			value = value[:index]
			break
		}
	}
	if got := string(value); got != want {
		t.Fatalf("%s = %q, want %q", field.Name, got, want)
	}
}

func assertLayoutInt64(t *testing.T, buf []byte, field layoutField, want int64) {
	t.Helper()
	assertLayoutInt64At(t, buf, 0, field, want)
}

func assertLayoutInt64At(t *testing.T, buf []byte, base int, field layoutField, want int64) {
	t.Helper()
	offset := base + field.Offset
	var got int64
	switch field.Type {
	case sourceInt32:
		got = int64(int32(binary.LittleEndian.Uint32(buf[offset:])))
	case sourceInt16:
		got = int64(int16(binary.LittleEndian.Uint16(buf[offset:])))
	case sourceInt8:
		got = int64(int8(buf[offset]))
	case sourceUint8, sourceBool8:
		got = int64(buf[offset])
	default:
		t.Fatalf("%s is %s, not an integer source type", field.Name, field.Type)
	}
	if got != want {
		t.Fatalf("%s = %d, want %d", field.Name, got, want)
	}
}

func assertLayoutFloat(t *testing.T, buf []byte, field layoutField, want float64) {
	t.Helper()
	assertLayoutFloatAt(t, buf, 0, field, want)
}

func assertLayoutFloatAt(t *testing.T, buf []byte, base int, field layoutField, want float64) {
	t.Helper()
	assertLayoutFloatElementAt(t, buf, base, field, 0, want)
}

func assertLayoutFloatElementAt(t *testing.T, buf []byte, base int, field layoutField, index int, want float64) {
	t.Helper()
	if field.Type != sourceFloat64 || index < 0 || index >= field.Count {
		t.Fatalf("invalid float access for %s[%d]", field.Name, index)
	}
	offset := base + field.Offset + index*8
	got := math.Float64frombits(binary.LittleEndian.Uint64(buf[offset:]))
	if math.Abs(got-want) > 1e-12*math.Max(1, math.Abs(want)) {
		t.Fatalf("%s[%d] = %.15g, want %.15g", field.Name, index, got, want)
	}
}
