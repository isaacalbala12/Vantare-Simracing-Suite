package overlayv2

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestRadarMarksPhysicalProximity(t *testing.T) {
	view := BuildRadar(spotterState(t, spotterPlayer{},
		spotterOpponent{x: 6, z: 8},
		spotterOpponent{x: 6, z: 8.1},
	))
	if len(view.Cars) != 2 || !view.Cars[0].Near || view.Cars[1].Near {
		t.Fatalf("physical proximity threshold = %+v", view.Cars)
	}
}

func TestRadarMarksOnlyConfirmedCarsLappedByPlayer(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(*derive.FinalState)
		want    bool
	}{
		{"full lap behind", func(*derive.FinalState) {}, true},
		{"timing line is not a full lap", func(state *derive.FinalState) {
			state.Observed.Vehicles[0].LapDistance = builderPresent(standings.LapDistance(10))
			state.Observed.Vehicles[1].LapDistance = builderPresent(standings.LapDistance(4990))
		}, false},
		{"stale lap count", func(state *derive.FinalState) {
			state.Observed.Vehicles[1].CompletedLaps = builderField(t, standings.CompletedLaps(9), schema.FreshnessStale)
		}, false},
		{"missing track length", func(state *derive.FinalState) {
			state.Observed.TrackLength = schema.MissingField[standings.LapDistance]()
		}, false},
		{"rival ahead", func(state *derive.FinalState) {
			state.Observed.Vehicles[1].CompletedLaps = builderPresent(standings.CompletedLaps(11))
		}, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state := spotterState(t, spotterPlayer{}, spotterOpponent{x: 4, z: 0})
			state.Observed.TrackLength = builderPresent(standings.LapDistance(5000))
			state.Observed.Vehicles[0].CompletedLaps = builderPresent(standings.CompletedLaps(10))
			state.Observed.Vehicles[0].LapDistance = builderPresent(standings.LapDistance(100))
			state.Observed.Vehicles[1].CompletedLaps = builderPresent(standings.CompletedLaps(9))
			state.Observed.Vehicles[1].LapDistance = builderPresent(standings.LapDistance(100))
			test.prepare(&state)
			view := BuildRadar(state)
			if len(view.Cars) != 1 || view.Cars[0].Lapped != test.want {
				t.Fatalf("radar lapped = %+v, want %v", view.Cars, test.want)
			}
		})
	}
}

func TestRadarRotatesNearbyCarsIntoPlayerFrame(t *testing.T) {
	view := BuildRadar(spotterState(t, spotterPlayer{yaw: math.Pi / 2},
		spotterOpponent{x: 0, z: 5},
		spotterOpponent{x: 8, z: 0},
		spotterOpponent{x: 0, z: -31},
		spotterOpponent{x: 24, z: 24},
	))
	if view.Mode != ModeXYZ || len(view.Cars) != 2 {
		t.Fatalf("radar = %+v, want two nearby cars in xyz mode", view)
	}
	if got := view.Cars[0]; math.Abs(got.X-5) > 0.001 || math.Abs(got.Z) > 0.001 || !got.Overlap {
		t.Errorf("side car = %+v, want left overlap at (5,0)", got)
	}
	if got := view.Cars[1]; math.Abs(got.X) > 0.001 || math.Abs(got.Z+8) > 0.001 || got.Overlap {
		t.Errorf("rear car = %+v, want rear at (0,-8)", got)
	}
}

func TestRadarDoesNotInventUnavailableOrPitCars(t *testing.T) {
	for _, player := range []spotterPlayer{{positionMissing: true}, {orientationMissing: true}, {inPit: true}} {
		view := BuildRadar(spotterState(t, player, spotterOpponent{x: 4, z: 0}))
		if view.Mode != ModeNone || len(view.Cars) != 0 {
			t.Fatalf("player %+v: radar = %+v, want unavailable", player, view)
		}
	}
	view := BuildRadar(spotterState(t, spotterPlayer{},
		spotterOpponent{x: 4, z: 0, inPit: true},
		spotterOpponent{x: 5, z: 0, positionMissing: true},
	))
	if view.Mode != ModeXYZ || len(view.Cars) != 0 {
		t.Fatalf("filtered rivals: radar = %+v, want empty available radar", view)
	}
}
