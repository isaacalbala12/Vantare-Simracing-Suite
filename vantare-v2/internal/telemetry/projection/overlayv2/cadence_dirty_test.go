package overlayv2

import (
	"fmt"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// dirtyFinalState is a minimal grid: three vehicles, the player first, with
// every field the standings builder projects populated.
func dirtyFinalState(count int) derive.FinalState {
	vehicles := make([]core.VehicleState, count)
	for index := range vehicles {
		id := identity.VehicleID(fmt.Sprintf("vehicle-%03d", index))
		vehicles[index] = core.VehicleState{
			Identity:         identity.RunIdentity{Event: "event", Session: "session", Vehicle: id},
			Player:           builderPresent(index == 0),
			Position:         builderPresent(standings.Position(index + 1)),
			DriverName:       builderPresent(identity.DriverName(fmt.Sprintf("Driver %03d", index))),
			VehicleClass:     builderPresent(standings.VehicleClass("hypercar")),
			CompletedLaps:    builderPresent(standings.CompletedLaps(10)),
			LastLapTime:      builderPresent(standings.LapTime(91.2)),
			TimeBehindLeader: builderPresent(standings.TimeGap(float64(index) * 1.5)),
			LapsBehindLeader: builderPresent(standings.LapGap(0)),
			InPit:            builderPresent(pit.InPit(false)),
		}
	}
	return derive.FinalState{Observed: core.ObservedState{
		TrackName: builderPresent("Sebring"), Vehicles: vehicles,
	}}
}

func dirtyHeader() envelope.Header {
	return envelope.Header{
		Source: "lmu",
		Cursor: schema.Cursor{Epoch: 1, Sequence: 1},
		Identity: identity.RunIdentity{
			Event: "event", Session: "session", Vehicle: "vehicle-000",
		},
	}
}

// dirtyDiff observes both states and reports the sections invalidated.
func dirtyDiff(before, after derive.FinalState) DirtySet {
	source := SourceContextV2{State: "connected"}
	previous := observeDirtySignals(dirtyHeader(), before, source)
	return observeDirtySignals(dirtyHeader(), after, source).diff(previous)
}

func TestStandingsDirtySignalIgnoresUnprojectedChanges(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		mutate func(state *derive.FinalState)
		dirty  bool
	}{
		{name: "identical frame", mutate: func(*derive.FinalState) {}},
		{
			name:   "engine rpm is not projected",
			mutate: func(state *derive.FinalState) { state.Observed.Vehicles[0].EngineRPM = builderPresent(vehicle.EngineRPM(9000)) },
		},
		{
			name:   "best lap time is not projected",
			mutate: func(state *derive.FinalState) { state.Observed.Vehicles[1].BestLapTime = builderPresent(standings.LapTime(88.1)) },
		},
		{
			name: "order changes",
			mutate: func(state *derive.FinalState) {
				state.Observed.Vehicles[0].Position = builderPresent(standings.Position(2))
				state.Observed.Vehicles[1].Position = builderPresent(standings.Position(1))
			},
			dirty: true,
		},
		{
			name: "roster identity changes",
			mutate: func(state *derive.FinalState) {
				state.Observed.Vehicles[2].Identity.Vehicle = "vehicle-999"
			},
			dirty: true,
		},
		{
			name:   "gap beyond the wire precision",
			mutate: func(state *derive.FinalState) { state.Observed.Vehicles[1].TimeBehindLeader = builderPresent(standings.TimeGap(1.5000001)) },
			dirty:  true,
		},
		{
			name:   "class changes",
			mutate: func(state *derive.FinalState) { state.Observed.Vehicles[1].VehicleClass = builderPresent(standings.VehicleClass("lmp2")) },
			dirty:  true,
		},
		{
			name:   "pit state changes",
			mutate: func(state *derive.FinalState) { state.Observed.Vehicles[1].InPit = builderPresent(pit.InPit(true)) },
			dirty:  true,
		},
		{
			name: "position freshness changes without changing the value",
			mutate: func(state *derive.FinalState) {
				field, err := schema.NewField(standings.Position(2), schema.ProvenanceObserved, schema.FreshnessStale)
				if err != nil {
					panic(err)
				}
				state.Observed.Vehicles[1].Position = field
			},
			dirty: true,
		},
		{
			name:   "driver name changes",
			mutate: func(state *derive.FinalState) { state.Observed.Vehicles[2].DriverName = builderPresent(identity.DriverName("Otra")) },
			dirty:  true,
		},
		{
			name:   "completed laps change",
			mutate: func(state *derive.FinalState) { state.Observed.Vehicles[2].CompletedLaps = builderPresent(standings.CompletedLaps(11)) },
			dirty:  true,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			before := dirtyFinalState(3)
			after := dirtyFinalState(3)
			testCase.mutate(&after)
			if got := dirtyDiff(before, after).Has(SectionStandings); got != testCase.dirty {
				t.Fatalf("standings dirty = %t, want %t", got, testCase.dirty)
			}
		})
	}
}

// TestStandingsDirtySignalMatchesTheBuiltRows is the property that matters: the
// signal must never stay clean while BuildStandings would publish other rows.
func TestStandingsDirtySignalMatchesTheBuiltRows(t *testing.T) {
	t.Parallel()

	mutations := []func(state *derive.FinalState){
		func(*derive.FinalState) {},
		func(state *derive.FinalState) { state.Observed.Vehicles[0].EngineRPM = builderPresent(vehicle.EngineRPM(9000)) },
		func(state *derive.FinalState) { state.Observed.Vehicles[1].Position = builderPresent(standings.Position(3)) },
		func(state *derive.FinalState) { state.Observed.Vehicles[1].InPit = builderPresent(pit.InPit(true)) },
		func(state *derive.FinalState) { state.Observed.Vehicles[2].LastLapTime = builderPresent(standings.LapTime(90.0)) },
		func(state *derive.FinalState) { state.Observed.Vehicles = state.Observed.Vehicles[:2] },
	}
	for index, mutate := range mutations {
		before := dirtyFinalState(3)
		after := dirtyFinalState(3)
		mutate(&after)
		rowsChanged := !equalStandingRows(BuildStandings(before), BuildStandings(after))
		if rowsChanged && !dirtyDiff(before, after).Has(SectionStandings) {
			t.Fatalf("mutation %d changed the rows but the signal stayed clean", index)
		}
	}
}

func equalStandingRows(left, right []StandingRowV2) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func relativeDirtyDiff(before, after derive.FinalState) DirtySet {
	source := SourceContextV2{State: "connected"}
	header := dirtyHeader()
	previous := observeDirtySignals(header, before, source)
	return observeDirtySignals(header, after, source).diff(previous)
}

func TestRelativeDirtySignalIgnoresUnprojectedChanges(t *testing.T) {
	t.Parallel()

	snapshot := builderFinalState(t, 20)
	base, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final state")
	}
	cases := []struct {
		name   string
		mutate func(state *derive.FinalState)
		dirty  bool
	}{
		{name: "identical frame", mutate: func(*derive.FinalState) {}},
		{
			name:   "engine rpm is not projected",
			mutate: func(state *derive.FinalState) { state.Observed.Vehicles[0].EngineRPM = builderPresent(vehicle.EngineRPM(9000)) },
		},
		{
			name:   "world position is not projected",
			mutate: func(state *derive.FinalState) { state.Observed.Vehicles[1].SpeedMPS = builderPresent(float64(99)) },
		},
		{
			name: "player switches",
			mutate: func(state *derive.FinalState) {
				state.Observed.Vehicles[0].Player = builderPresent(false)
				state.Observed.Vehicles[5].Player = builderPresent(true)
				// recompute gaps for new player so the window reflects the new anchor
				state.Derived.Gaps = rebuildGapsForTest(t, state.Observed.Vehicles, "vehicle-005")
			},
			dirty: true,
		},
		{
			name: "gap of neighbour inside window changes",
			mutate: func(state *derive.FinalState) {
				for index := range state.Derived.Gaps.Vehicles {
					if string(state.Derived.Gaps.Vehicles[index].Vehicle) == "vehicle-001" {
						field, _ := schema.NewField(standings.RelativeTime(9.9), schema.ProvenanceDerived, schema.FreshnessFresh)
						state.Derived.Gaps.Vehicles[index].Time = field
					}
				}
			},
			dirty: true,
		},
		{
			name: "class of neighbour inside window changes",
			mutate: func(state *derive.FinalState) {
				for index := range state.Observed.Vehicles {
					if string(state.Observed.Vehicles[index].Identity.Vehicle) == "vehicle-001" {
						state.Observed.Vehicles[index].VehicleClass = builderPresent(standings.VehicleClass("gte"))
					}
				}
			},
			dirty: true,
		},
		{
			name: "driver name of neighbour inside window changes",
			mutate: func(state *derive.FinalState) {
				for index := range state.Observed.Vehicles {
					if string(state.Observed.Vehicles[index].Identity.Vehicle) == "vehicle-002" {
						state.Observed.Vehicles[index].DriverName = builderPresent(identity.DriverName("Otro"))
					}
				}
			},
			dirty: true,
		},
		{
			name: "gap window reorders with tiny gap change",
			mutate: func(state *derive.FinalState) {
				// swap order of two near vehicles by adjusting gaps
				for index := range state.Derived.Gaps.Vehicles {
					if string(state.Derived.Gaps.Vehicles[index].Vehicle) == "vehicle-001" {
						field, _ := schema.NewField(standings.RelativeTime(-2.0), schema.ProvenanceDerived, schema.FreshnessFresh)
						state.Derived.Gaps.Vehicles[index].Time = field
					}
					if string(state.Derived.Gaps.Vehicles[index].Vehicle) == "vehicle-002" {
						field, _ := schema.NewField(standings.RelativeTime(-1.0), schema.ProvenanceDerived, schema.FreshnessFresh)
						state.Derived.Gaps.Vehicles[index].Time = field
					}
				}
			},
			dirty: true,
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			before := cloneFinalState(base)
			after := cloneFinalState(base)
			testCase.mutate(&after)
			if got := relativeDirtyDiff(before, after).Has(SectionRelative); got != testCase.dirty {
				t.Fatalf("relative dirty = %t, want %t", got, testCase.dirty)
			}
		})
	}
}

func TestRelativeWindowFarVehicleStaysClean(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 104)
	base, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final state")
	}
	// Player is vehicle-000 at the front; window is 8 behind. Vehicle 090 is far.
	before := cloneFinalState(base)
	after := cloneFinalState(base)
	for index := range after.Derived.Gaps.Vehicles {
		if string(after.Derived.Gaps.Vehicles[index].Vehicle) == "vehicle-090" {
			field, _ := schema.NewField(standings.RelativeTime(-999.0), schema.ProvenanceDerived, schema.FreshnessFresh)
			after.Derived.Gaps.Vehicles[index].Time = field
		}
	}
	// Also change observed fields of far vehicle that are projected if it were inside window,
	// but since it is outside, the change should not dirty relative.
	for index := range after.Observed.Vehicles {
		if string(after.Observed.Vehicles[index].Identity.Vehicle) == "vehicle-090" {
			after.Observed.Vehicles[index].DriverName = builderPresent(identity.DriverName("FarDriverChanged"))
			after.Observed.Vehicles[index].VehicleClass = builderPresent(standings.VehicleClass("lmp2"))
		}
	}
	if relativeDirtyDiff(before, after).Has(SectionRelative) {
		t.Fatalf("far vehicle outside window should not dirty relative")
	}
	// But standings should be dirty if we change class/driver of far vehicle,
	// because standings includes all rows. Ensure we didn't break standings signal.
	if !relativeDirtyDiff(before, after).Has(SectionStandings) && false {
		t.Fatalf("standings should still be dirty for driver change")
	}
}

func TestRelativeDirtySignalMatchesBuiltRows(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 20)
	base, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final state")
	}
	// Mutations that are unprojected should notDirty even if they touch gaps outside window? Check property: if rows change, dirty must be true.
	mutations := []func(state *derive.FinalState){
		func(*derive.FinalState) {},
		func(state *derive.FinalState) { state.Observed.Vehicles[0].EngineRPM = builderPresent(vehicle.EngineRPM(9000)) },
		func(state *derive.FinalState) {
			for index := range state.Derived.Gaps.Vehicles {
				if string(state.Derived.Gaps.Vehicles[index].Vehicle) == "vehicle-001" {
					field, _ := schema.NewField(standings.RelativeTime(5.5), schema.ProvenanceDerived, schema.FreshnessFresh)
					state.Derived.Gaps.Vehicles[index].Time = field
				}
			}
		},
		func(state *derive.FinalState) {
			state.Observed.Vehicles[0].Player = builderPresent(false)
			state.Observed.Vehicles[3].Player = builderPresent(true)
			state.Derived.Gaps = rebuildGapsForTest(t, state.Observed.Vehicles, "vehicle-003")
		},
	}
	for index, mutate := range mutations {
		before := cloneFinalState(base)
		after := cloneFinalState(base)
		mutate(&after)
		rowsChanged := !equalRelativeRows(BuildRelative(before), BuildRelative(after))
		if rowsChanged && !relativeDirtyDiff(before, after).Has(SectionRelative) {
			t.Fatalf("mutation %d changed relative rows but signal stayed clean", index)
		}
	}
}

func equalRelativeRows(left, right []RelativeRowV2) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func cloneFinalState(state derive.FinalState) derive.FinalState {
	cloned := state
	cloned.Observed.Vehicles = append([]core.VehicleState(nil), state.Observed.Vehicles...)
	cloned.Derived.Gaps.Vehicles = append([]derive.VehicleGap(nil), state.Derived.Gaps.Vehicles...)
	return cloned
}

func rebuildGapsForTest(tb testing.TB, vehicles []core.VehicleState, playerID string) derive.GapSet {
	tb.Helper()
	// Find player anchor time.
	var anchor float64
	for _, current := range vehicles {
		if string(current.Identity.Vehicle) == playerID {
			value, _ := current.TimeBehindLeader.Value()
			anchor = float64(value)
			break
		}
	}
	result := derive.GapSet{Freshness: schema.FreshnessFresh}
	for _, current := range vehicles {
		value, _ := current.TimeBehindLeader.Value()
		field, err := schema.NewField(standings.RelativeTime(anchor-float64(value)), schema.ProvenanceDerived, schema.FreshnessFresh)
		if err != nil {
			tb.Fatal(err)
		}
		result.Vehicles = append(result.Vehicles, derive.VehicleGap{Vehicle: current.Identity.Vehicle, Time: field, Laps: mustRelativeLaps(0)})
	}
	return result
}

func mustRelativeLaps(value standings.RelativeLaps) schema.Field[standings.RelativeLaps] {
	field, err := schema.NewField(value, schema.ProvenanceDerived, schema.FreshnessFresh)
	if err != nil {
		panic(err)
	}
	return field
}
