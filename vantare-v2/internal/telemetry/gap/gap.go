package gap

import "github.com/vantare/overlays/v2/pkg/models"

// ComputeTimeGaps fills TimeGapToPlayer for every vehicle relative to the player.
// Positive value means the vehicle is ahead on track; negative means behind.
// The gap is physical: only the wrapped distance within one lap is used,
// so a car one lap ahead but immediately behind the player shows a small
// negative gap, not the full extra lap.
func ComputeTimeGaps(t *models.Telemetry) {
	if t == nil || t.Player == nil || len(t.Vehicles) == 0 {
		return
	}

	playerIdx := -1
	playerLapDistance := 0.0
	for i, v := range t.Vehicles {
		if v.IsPlayer {
			playerIdx = i
			playerLapDistance = v.LapDistance
			break
		}
	}
	if playerIdx < 0 {
		return
	}

	trackLength := estimateTrackLength(t.Vehicles)
	if trackLength <= 0 {
		return
	}

	playerRefLap := estimateLapTime(t.Vehicles[playerIdx])

	for i := range t.Vehicles {
		v := &t.Vehicles[i]
		if v.IsPlayer {
			v.TimeGapToPlayer = 0
			continue
		}
		if v.LapDistance < 0 {
			continue
		}

		lapDelta := v.LapDistance - playerLapDistance
		if lapDelta > trackLength/2 {
			lapDelta -= trackLength
		} else if lapDelta < -trackLength/2 {
			lapDelta += trackLength
		}
		refLap := playerRefLap
		if refLap <= 0 {
			refLap = estimateLapTime(*v)
		}
		var speed float64
		if refLap > 0 {
			speed = trackLength / refLap
		}
		if speed <= 0 {
			if t.Player.Speed > 1 {
				speed = t.Player.Speed
			}
		}
		if speed > 0 {
			v.TimeGapToPlayer = lapDelta / speed
		}
	}
}

func estimateTrackLength(vehicles []models.VehicleScoring) float64 {
	max := 0.0
	for _, v := range vehicles {
		if v.LapDistance > max {
			max = v.LapDistance
		}
	}
	return max
}

func estimateLapTime(v models.VehicleScoring) float64 {
	if v.EstimatedLapTime > 0 {
		return v.EstimatedLapTime
	}
	if v.BestLapTime > 0 {
		return v.BestLapTime
	}
	return 0
}
