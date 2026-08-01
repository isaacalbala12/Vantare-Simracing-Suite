package fusion

import (
	"math"

	"github.com/vantare/overlays/v2/internal/telemetry/lmuapi"
	"github.com/vantare/overlays/v2/pkg/models"
)

func Merge(base *models.Telemetry, standings []lmuapi.StandingRow, session *lmuapi.SessionInfo, deltaBest float64) *models.Telemetry {
	out := cloneTelemetry(base)
	if out == nil || !out.Connected {
		return &models.Telemetry{Connected: false}
	}
	if session != nil {
		out.Session = mergeSession(out.Session, session)
	}
	if len(standings) > 0 {
		out.Vehicles = rowsToVehicles(standings)
		if out.Player != nil {
			enrichPlayerFromRows(out.Player, standings, deltaBest)
		}
		out.PlayerHasVehicle = hasPlayer(standings)
	}
	if out.Player != nil {
		// P2-2: DeltaBest == 0 means "no data/not available", so we only overwrite if deltaBest != 0.
		// If deltaBest is valid and non-zero, we apply it.
		if deltaBest != 0 && IsValidDelta(deltaBest) {
			out.Player.DeltaBest = deltaBest
		}
	}
	return out
}

func mergeSession(existing *models.SessionInfo, src *lmuapi.SessionInfo) *models.SessionInfo {
	var s models.SessionInfo
	if existing != nil {
		s = *existing
	}
	s.TrackName = firstNonEmpty(src.TrackName, s.TrackName)
	s.SessionName = firstNonEmpty(src.Session, s.SessionName)
	s.GamePhase = src.GamePhase
	s.NumVehicles = src.NumberOfVehicles
	s.PlayerName = firstNonEmpty(src.PlayerName, s.PlayerName)
	s.SessionTime = src.CurrentEventTime
	s.TimeRemainingInGamePhase = src.TimeRemainingInGamePhase
	s.YellowFlagState = src.YellowFlagState
	s.SectorFlags = append([]string(nil), src.SectorFlag...)
	return &s
}

func rowsToVehicles(rows []lmuapi.StandingRow) []models.VehicleScoring {
	out := make([]models.VehicleScoring, 0, len(rows))
	for _, r := range rows {
		out = append(out, models.VehicleScoring{
			ID:                    r.SlotIDOrPositionID(),
			DriverName:            r.DriverName,
			DriverNumber:          r.CarNumber,
			TeamName:              r.FullTeamName,
			VehicleName:           r.VehicleName,
			Place:                 uint8(maxInt32(r.Position, 0)),
			TotalLaps:             r.LapsCompleted,
			VehicleClass:          r.CarClass,
			IsPlayer:              r.Player,
			InPits:                r.Pitting || r.InGarageStall || (r.PitState != "" && r.PitState != "NONE"),
			Pitting:               r.Pitting,
			InGarageStall:         r.InGarageStall,
			PitState:              r.PitState,
			Sector:                r.Sector,
			FinishStatus:          r.FinishStatus,
			TimeBehindLeader:      sanitizeTime(r.TimeBehindLeader),
			TimeBehindNext:        sanitizeTime(r.TimeBehindNext),
			LapsBehindLeader:      r.LapsBehindLeader,
			LapsBehindClassLeader: r.LapsBehindClassLeader,
			LapsBehindNext:        r.LapsBehindNext,
			LapDistance:           r.LapDistance,
			TimeIntoLap:           sanitizeTime(r.TimeIntoLap),
			BestLapTime:           r.BestLapTime,
			LastLapTime:           r.LastLapTime,
			EstimatedLapTime:      r.EstimatedLapTime,
			Pitstops:              r.Pitstops,
			Penalties:             r.Penalties,
			Qualification:         r.Qualification,
			Flag:                  r.Flag,
			FuelFraction:          r.FuelFraction,
		})
	}
	return out
}

func enrichPlayerFromRows(player *models.PlayerTelemetry, rows []lmuapi.StandingRow, deltaBest float64) {
	for _, r := range rows {
		if !r.Player {
			continue
		}
		player.VehicleName = firstNonEmpty(r.VehicleName, player.VehicleName)
		if deltaBest != 0 && IsValidDelta(deltaBest) {
			player.DeltaBest = deltaBest
		}
		return
	}
}

func hasPlayer(rows []lmuapi.StandingRow) bool {
	for _, r := range rows {
		if r.Player {
			return true
		}
	}
	return false
}

func cloneTelemetry(t *models.Telemetry) *models.Telemetry {
	if t == nil {
		return nil
	}
	c := *t
	if t.Player != nil {
		p := *t.Player
		c.Player = &p
	}
	if t.Session != nil {
		s := *t.Session
		c.Session = &s
	}
	if t.Vehicles != nil {
		c.Vehicles = append([]models.VehicleScoring(nil), t.Vehicles...)
	}
	return &c
}

func sanitizeTime(v float64) float64 {
	if !isValidTime(v) {
		return 0
	}
	return v
}

func isValidTime(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0
}

func IsValidDelta(v float64) bool {
	// Delta can be negative, but must not be NaN, Inf, or absurdly large (e.g., 10000+ seconds)
	return !math.IsNaN(v) && !math.IsInf(v, 0) && math.Abs(v) < 10000
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func maxInt32(v, min int32) int32 {
	if v < min {
		return min
	}
	return v
}
