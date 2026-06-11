package normalizer

import (
	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/pkg/models"
)

type Normalizer struct{}

func New() *Normalizer {
	return &Normalizer{}
}

func disconnected() *models.Telemetry {
	return &models.Telemetry{Connected: false}
}

func (n *Normalizer) FromBuffer(buf []byte) *models.Telemetry {
	if len(buf) < lmu.ObjectOutSize {
		return disconnected()
	}
	parsed := lmu.Parse(buf, lmu.ParseFull)
	if parsed == nil {
		return disconnected()
	}
	parsed.Connected = true
	n.stabilize(parsed)
	return parsed
}

func (n *Normalizer) stabilize(t *models.Telemetry) {
	if t.Session != nil && t.Session.TrackName != "" {
		t.Session.TrackName = trimNull(t.Session.TrackName)
	}
	if t.Session != nil && t.Session.PlayerName != "" {
		t.Session.PlayerName = trimNull(t.Session.PlayerName)
	}
	if t.Player != nil {
		t.Player.VehicleName = trimNull(t.Player.VehicleName)
		t.Player.TrackName = trimNull(t.Player.TrackName)
	}
	for i := range t.Vehicles {
		t.Vehicles[i].DriverName = trimNull(t.Vehicles[i].DriverName)
		t.Vehicles[i].VehicleClass = trimNull(t.Vehicles[i].VehicleClass)
	}
	if t.Session != nil {
		max := int(t.Session.NumVehicles)
		if max >= 0 && max < len(t.Vehicles) {
			t.Vehicles = t.Vehicles[:max]
		}
	}
}

func trimNull(s string) string {
	for i, r := range s {
		if r == 0 {
			return s[:i]
		}
	}
	return s
}
