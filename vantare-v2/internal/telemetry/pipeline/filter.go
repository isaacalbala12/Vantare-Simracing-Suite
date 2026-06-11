package pipeline

import (
	"github.com/vantare/overlays/v2/internal/core"
	"github.com/vantare/overlays/v2/pkg/models"
)

type Filter struct {
	last *models.Telemetry
}

func NewFilter() *Filter {
	return &Filter{}
}

func (f *Filter) ShouldPublish(next *models.Telemetry) (*models.Telemetry, bool) {
	if next == nil {
		return nil, false
	}
	if f.last == nil {
		f.last = cloneTelemetry(next)
		return f.last, true
	}
	if f.last.Connected != next.Connected || f.last.PlayerHasVehicle != next.PlayerHasVehicle {
		f.last = cloneTelemetry(next)
		return f.last, true
	}
	if !f.playerChanged(f.last, next) && !f.sessionChanged(f.last, next) && !f.vehiclesChanged(f.last, next) {
		return nil, false
	}
	f.last = cloneTelemetry(next)
	return f.last, true
}

func (f *Filter) playerChanged(prev, next *models.Telemetry) bool {
	pp, np := prev.Player, next.Player
	if (pp == nil) != (np == nil) {
		return true
	}
	if pp == nil {
		return false
	}
	if pp.Gear != np.Gear {
		return true
	}
	if core.ShouldEmit(pp.Speed, np.Speed, core.ThresholdSpeedMPS) {
		return true
	}
	if core.ShouldEmit(pp.EngineRPM, np.EngineRPM, core.ThresholdRPM) {
		return true
	}
	if core.ShouldEmit(pp.Fuel, np.Fuel, core.ThresholdFuel) {
		return true
	}
	if core.ShouldEmit(pp.DeltaBest, np.DeltaBest, core.ThresholdGap) {
		return true
	}
	if core.ShouldEmit(pp.Throttle, np.Throttle, 0.01) {
		return true
	}
	if core.ShouldEmit(pp.Brake, np.Brake, 0.01) {
		return true
	}
	if core.ShouldEmit(pp.Steering, np.Steering, 0.01) {
		return true
	}
	if pp.LapNumber != np.LapNumber {
		return true
	}
	return false
}

func (f *Filter) sessionChanged(prev, next *models.Telemetry) bool {
	ps, ns := prev.Session, next.Session
	if (ps == nil) != (ns == nil) {
		return true
	}
	if ps == nil {
		return false
	}
	if ps.TrackName != ns.TrackName || ps.GamePhase != ns.GamePhase {
		return true
	}
	if ps.NumVehicles != ns.NumVehicles {
		return true
	}
	if core.ShouldEmit(ps.SessionTime, ns.SessionTime, 0.01) {
		return true
	}
	return false
}

func (f *Filter) vehiclesChanged(prev, next *models.Telemetry) bool {
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
