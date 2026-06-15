package gap

import "github.com/vantare/overlays/v2/pkg/models"

// ComputeTimeGaps fills TimeGapToPlayer for every vehicle relative to the player.
// Positive value means the vehicle is ahead on track; negative means behind.
func ComputeTimeGaps(t *models.Telemetry) {
	if t == nil || t.Player == nil || len(t.Vehicles) == 0 {
		return
	}

	playerIdx := -1
	playerLapDistance := 0.0
	playerTotalLaps := int16(0)
	for i, v := range t.Vehicles {
		if v.IsPlayer {
			playerIdx = i
			playerLapDistance = v.LapDistance
			playerTotalLaps = v.TotalLaps
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

	playerSpeed := t.Player.Speed
	playerRefLap := estimateLapTime(t.Vehicles[playerIdx])

	for i := range t.Vehicles {
		v := &t.Vehicles[i]
		if v.IsPlayer {
			v.TimeGapToPlayer = 0
			continue
		}
		if v.LapDistance <= 0 {
			continue
		}

		lapDelta := v.LapDistance - playerLapDistance
		if lapDelta > trackLength/2 {
			lapDelta -= trackLength
		} else if lapDelta < -trackLength/2 {
			lapDelta += trackLength
		}
		delta := lapDelta + float64(v.TotalLaps-playerTotalLaps)*trackLength
		refLap := playerRefLap
		if refLap <= 0 {
			refLap = estimateLapTime(*v) // fallback to target car's lap time
		}
		if refLap <= 0 {
			// ultimate fallback: instant speed, only when no lap time data exists
			if playerSpeed > 1.0 {
				v.TimeGapToPlayer = delta / playerSpeed
				continue
			}
		}
		if refLap > 0 {
			avgSpeed := trackLength / refLap
			v.TimeGapToPlayer = delta / avgSpeed
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
