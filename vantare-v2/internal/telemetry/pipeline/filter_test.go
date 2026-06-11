package pipeline_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/pipeline"
	"github.com/vantare/overlays/v2/pkg/models"
)

func sampleTelemetry(speed float64) *models.Telemetry {
	return &models.Telemetry{
		Connected: true,
		Player: &models.PlayerTelemetry{
			Speed:     speed,
			Gear:      4,
			EngineRPM: 5000,
			Fuel:      50,
		},
		Session: &models.SessionInfo{TrackName: "Spa"},
	}
}

func TestFilterFirstEmit(t *testing.T) {
	f := pipeline.NewFilter()
	snap := sampleTelemetry(20)
	out, ok := f.ShouldPublish(snap)
	if !ok || out == nil {
		t.Fatal("first snapshot must publish")
	}
}

func TestFilterSuppressesRPMNoise(t *testing.T) {
	f := pipeline.NewFilter()
	_, _ = f.ShouldPublish(sampleTelemetry(20))

	quiet := sampleTelemetry(20.001)
	quiet.Player.EngineRPM = 5000 + 10 // below ThresholdRPM 50
	_, ok := f.ShouldPublish(quiet)
	if ok {
		t.Fatal("expected suppress for small RPM change")
	}
}

func TestFilterEmitsGearChange(t *testing.T) {
	f := pipeline.NewFilter()
	_, _ = f.ShouldPublish(sampleTelemetry(20))

	shift := sampleTelemetry(20)
	shift.Player.Gear = 5
	_, ok := f.ShouldPublish(shift)
	if !ok {
		t.Fatal("gear change must publish")
	}
}

func TestFilterEmitsConnectionChange(t *testing.T) {
	f := pipeline.NewFilter()
	_, _ = f.ShouldPublish(sampleTelemetry(20))

	disconnected := sampleTelemetry(20)
	disconnected.Connected = false
	_, ok := f.ShouldPublish(disconnected)
	if !ok {
		t.Fatal("connected flag change must publish")
	}
}

func TestFilterEmitsVehiclePlaceChange(t *testing.T) {
	f := pipeline.NewFilter()
	base := sampleTelemetry(20)
	base.Vehicles = []models.VehicleScoring{{ID: 1, Place: 2, DriverName: "A"}}
	_, _ = f.ShouldPublish(base)

	changed := sampleTelemetry(20)
	changed.Vehicles = []models.VehicleScoring{{ID: 1, Place: 1, DriverName: "A"}}
	_, ok := f.ShouldPublish(changed)
	if !ok {
		t.Fatal("vehicle place change must publish")
	}
}
