package diff

import (
	"time"

	"github.com/vantare/overlays/v2/internal/core"
	"github.com/vantare/overlays/v2/pkg/models"
)

// Payload is a partial telemetry update for Wails/SSE (see V2 doc §7.9).
type Payload struct {
	T int64          `json:"t"`
	D map[string]any `json:"d"`
}

// Compute returns changed fields between prev and next. nil if next is nil.
// First emission (prev nil) includes all present fields.
func Compute(prev, next *models.Telemetry) *Payload {
	if next == nil {
		return nil
	}
	d := map[string]any{}
	now := time.Now().UnixMilli()

	if prev == nil || prev.Connected != next.Connected {
		d["connected"] = next.Connected
	}
	if prev == nil || prev.PlayerHasVehicle != next.PlayerHasVehicle {
		d["playerHasVehicle"] = next.PlayerHasVehicle
	}

	diffPlayer(d, playerOf(prev), next.Player)
	diffSession(d, sessionOf(prev), next.Session)
	if vehiclesChanged(prev, next) {
		d["vehicles"] = next.Vehicles
	}

	if len(d) == 0 {
		return nil
	}
	return &Payload{T: now, D: d}
}

func playerOf(t *models.Telemetry) *models.PlayerTelemetry {
	if t == nil {
		return nil
	}
	return t.Player
}

func sessionOf(t *models.Telemetry) *models.SessionInfo {
	if t == nil {
		return nil
	}
	return t.Session
}

func diffPlayer(d map[string]any, prev, next *models.PlayerTelemetry) {
	if next == nil {
		if prev != nil {
			d["player"] = nil
		}
		return
	}
	pd := map[string]any{}
	if prev == nil || prev.Gear != next.Gear {
		pd["gear"] = next.Gear
	}
	if prev == nil || core.ShouldEmit(prev.Speed, next.Speed, core.ThresholdSpeedMPS) {
		pd["speed"] = next.Speed
	}
	if prev == nil || core.ShouldEmit(prev.EngineRPM, next.EngineRPM, core.ThresholdRPM) {
		pd["rpm"] = next.EngineRPM
	}
	if prev == nil || core.ShouldEmit(prev.Fuel, next.Fuel, core.ThresholdFuel) {
		pd["fuel"] = next.Fuel
	}
	if prev == nil || core.ShouldEmit(prev.DeltaBest, next.DeltaBest, core.ThresholdGap) {
		pd["deltaBest"] = next.DeltaBest
	}
	if prev == nil || core.ShouldEmit(prev.Throttle, next.Throttle, 0.01) {
		pd["throttle"] = next.Throttle
	}
	if prev == nil || core.ShouldEmit(prev.Brake, next.Brake, 0.01) {
		pd["brake"] = next.Brake
	}
	if prev == nil || core.ShouldEmit(prev.Steering, next.Steering, 0.01) {
		pd["steering"] = next.Steering
	}
	if prev == nil || prev.LapNumber != next.LapNumber {
		pd["lapNumber"] = next.LapNumber
	}
	if len(pd) > 0 {
		d["player"] = pd
	}
}

func diffSession(d map[string]any, prev, next *models.SessionInfo) {
	if next == nil {
		return
	}
	sd := map[string]any{}
	if prev == nil || prev.TrackName != next.TrackName {
		sd["trackName"] = next.TrackName
	}
	if prev == nil || prev.GamePhase != next.GamePhase {
		sd["gamePhase"] = next.GamePhase
	}
	if prev == nil || prev.NumVehicles != next.NumVehicles {
		sd["numVehicles"] = next.NumVehicles
	}
	if prev == nil || core.ShouldEmit(prev.SessionTime, next.SessionTime, 0.01) {
		sd["sessionTime"] = next.SessionTime
	}
	if len(sd) > 0 {
		d["session"] = sd
	}
}

func vehiclesChanged(prev, next *models.Telemetry) bool {
	if prev == nil {
		return next != nil && len(next.Vehicles) > 0
	}
	pv, nv := prev.Vehicles, next.Vehicles
	if len(pv) != len(nv) {
		return true
	}
	byID := make(map[int32]models.VehicleScoring, len(pv))
	for _, v := range pv {
		byID[v.ID] = v
	}
	for _, v := range nv {
		old, ok := byID[v.ID]
		if !ok {
			return true
		}
		if old.Place != v.Place || old.TotalLaps != v.TotalLaps ||
			old.IsPlayer != v.IsPlayer || old.InPits != v.InPits {
			return true
		}
		if old.DriverName != v.DriverName || old.VehicleClass != v.VehicleClass {
			return true
		}
		if core.ShouldEmit(old.TimeBehindLeader, v.TimeBehindLeader, core.ThresholdGap) {
			return true
		}
	}
	return false
}
