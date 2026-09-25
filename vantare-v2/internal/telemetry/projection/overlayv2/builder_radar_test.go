package overlayv2

import (
	"math"
	"testing"
)

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
