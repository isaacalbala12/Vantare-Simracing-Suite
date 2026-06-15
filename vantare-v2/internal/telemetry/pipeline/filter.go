package pipeline

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/core"
	"github.com/vantare/overlays/v2/pkg/models"
)

type Filter struct {
	last           *models.Telemetry
	sessionEpoch   uint64
	lastSessionKey string
}

func NewFilter() *Filter {
	return &Filter{}
}

func (f *Filter) ShouldPublish(next *models.Telemetry) (*models.Telemetry, bool) {
	if next == nil {
		return nil, false
	}
	f.annotateSession(next)
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
	if core.ShouldEmit(pp.Clutch, np.Clutch, 0.01) {
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
	if prev.SessionEpoch != next.SessionEpoch || prev.SessionState != next.SessionState {
		return true
	}
	ps, ns := prev.Session, next.Session
	if (ps == nil) != (ns == nil) {
		return true
	}
	if ps == nil {
		return false
	}
	if ps.TrackName != ns.TrackName || ps.SessionType != ns.SessionType ||
		ps.SessionName != ns.SessionName || ps.GamePhase != ns.GamePhase ||
		ps.PlayerName != ns.PlayerName || ps.YellowFlagState != ns.YellowFlagState {
		return true
	}
	if ps.NumVehicles != ns.NumVehicles {
		return true
	}
	if core.ShouldEmit(ps.SessionTime, ns.SessionTime, 0.01) ||
		core.ShouldEmit(ps.TimeRemainingInGamePhase, ns.TimeRemainingInGamePhase, 0.1) ||
		core.ShouldEmit(ps.AmbientTemp, ns.AmbientTemp, 0.1) ||
		core.ShouldEmit(ps.TrackTemp, ns.TrackTemp, 0.1) {
		return true
	}
	return sectorFlagsChanged(ps, ns)
}

func (f *Filter) annotateSession(t *models.Telemetry) {
	state := sessionState(t)
	key := sessionKey(t, state)
	if f.sessionEpoch == 0 || key != f.lastSessionKey {
		f.sessionEpoch++
		f.lastSessionKey = key
	}
	t.SessionState = state
	t.SessionKey = key
	t.SessionEpoch = f.sessionEpoch
}

func sessionState(t *models.Telemetry) string {
	if t == nil || !t.Connected {
		return "offline"
	}
	if !t.PlayerHasVehicle {
		return "menu"
	}
	if t.Session != nil && t.Session.NumVehicles > 0 {
		return "session"
	}
	return "garage"
}

func sessionKey(t *models.Telemetry, state string) string {
	if t == nil {
		return "offline"
	}
	if t.Session == nil {
		return state
	}
	return fmt.Sprintf("%s|%s|%d|%s|%s|%d", state, t.Session.TrackName, t.Session.SessionType, t.Session.SessionName, t.Session.PlayerName, t.Session.NumVehicles)
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
		if old.DriverNumber != v.DriverNumber || old.TeamName != v.TeamName ||
			old.VehicleName != v.VehicleName || old.PitState != v.PitState ||
			old.Pitting != v.Pitting || old.InGarageStall != v.InGarageStall ||
			old.Sector != v.Sector || old.LapsBehindLeader != v.LapsBehindLeader ||
			old.LapsBehindClassLeader != v.LapsBehindClassLeader || old.LapsBehindNext != v.LapsBehindNext {
			return true
		}
		if core.ShouldEmit(old.TimeBehindNext, v.TimeBehindNext, 0.01) ||
			core.ShouldEmit(old.LapDistance, v.LapDistance, 1.0) ||
			core.ShouldEmit(old.TimeIntoLap, v.TimeIntoLap, 0.1) ||
			core.ShouldEmit(old.EstimatedLapTime, v.EstimatedLapTime, 0.1) {
			return true
		}
		if core.ShouldEmit(old.TimeBehindLeader, v.TimeBehindLeader, 0.01) {
			return true
		}
	}
	return false
}

func sectorFlagsChanged(prev, next *models.SessionInfo) bool {
	if prev == nil || next == nil {
		return prev != next
	}
	if len(prev.SectorFlags) != len(next.SectorFlags) {
		return true
	}
	for i := range prev.SectorFlags {
		if prev.SectorFlags[i] != next.SectorFlags[i] {
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
