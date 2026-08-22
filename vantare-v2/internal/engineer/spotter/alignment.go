package spotter

import (
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
	"github.com/vantare/overlays/v2/internal/spotter/geometry"
)

type AlignedOpponent = geometry.AlignedOpponent

func YawFromRF2Orientation(o telemetry.Orientation) float64 {
	yaw, _ := geometry.YawFromForward(geometry.Vec3{X: o.Row2.X, Y: o.Row2.Y, Z: o.Row2.Z})
	return yaw
}

func AlignOpponentXZ(playerYaw float64, player telemetry.Vec3, opponent telemetry.Vec3) AlignedOpponent {
	return geometry.AlignOpponentXZ(playerYaw,
		geometry.Vec3{X: player.X, Y: player.Y, Z: player.Z},
		geometry.Vec3{X: opponent.X, Y: opponent.Y, Z: opponent.Z})
}

func sideFromAlignedX(x float64) Side {
	return geometry.ClassifyAlignedOverlap(geometry.AlignedOpponent{X: x}, false, geometry.DefaultOverlapConfig()).Side
}
