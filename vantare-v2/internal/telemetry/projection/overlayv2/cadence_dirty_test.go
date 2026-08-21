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
