package overlayv2

import (
	"math"
	"sort"

	spottergeometry "github.com/vantare/overlays/v2/internal/spotter/geometry"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

const radarRangeM = 30.0
const radarMaxCars = 16

// BuildRadar publishes observed positions relative to the player's heading.
// A missing or stale player pose is unavailable, never an empty safe road.
func BuildRadar(final derive.FinalState) RadarViewV2 {
	unavailable := RadarViewV2{Mode: ModeNone, Cars: []RadarCarV2{}}
	player, found := playerVehicle(final.Observed.Vehicles)
	if !found || player.Orientation.Freshness() != schema.FreshnessFresh {
		return unavailable
	}
	position, quality, ok := spotterWorldPosition(player.WorldPosition)
	if !ok || quality != QualityFresh {
		return unavailable
	}
	yaw, ok := playerYaw(player.Orientation)
	if !ok {
		return unavailable
	}
	if inPit, present := player.InPit.Value(); present && bool(inPit) {
		return unavailable
	}

	cars := make([]RadarCarV2, 0, 8)
	playerPoint := spottergeometry.Vec3{X: position.X, Y: position.Y, Z: position.Z}
	for _, opponent := range final.Observed.Vehicles {
		if opponent.Identity.Vehicle == player.Identity.Vehicle {
			continue
		}
		if inPit, present := opponent.InPit.Value(); present && bool(inPit) {
			continue
		}
		if distance, present := opponent.LapDistance.Value(); present && float64(distance) < 0 {
			continue
		}
		other, otherQuality, ok := spotterWorldPosition(opponent.WorldPosition)
		if !ok || otherQuality != QualityFresh || math.Abs(other.Y-position.Y) > 5 {
			continue
		}
		aligned := spottergeometry.AlignOpponentXZ(yaw, playerPoint,
			spottergeometry.Vec3{X: other.X, Y: other.Y, Z: other.Z})
		if aligned.X*aligned.X+aligned.Z*aligned.Z > radarRangeM*radarRangeM {
			continue
		}
		cars = append(cars, RadarCarV2{
			ID: string(opponent.Identity.Vehicle), X: aligned.X, Z: aligned.Z,
			Overlap: spottergeometry.ClassifyAlignedOverlap(aligned, false,
				spottergeometry.DefaultOverlapConfig()).InOverlap,
		})
	}
	sort.Slice(cars, func(i, j int) bool {
		a := cars[i].X*cars[i].X + cars[i].Z*cars[i].Z
		b := cars[j].X*cars[j].X + cars[j].Z*cars[j].Z
		if a == b {
			return cars[i].ID < cars[j].ID
		}
		return a < b
	})
	if len(cars) > radarMaxCars {
		cars = cars[:radarMaxCars]
	}
	return RadarViewV2{Mode: ModeXYZ, Cars: cars}
}
