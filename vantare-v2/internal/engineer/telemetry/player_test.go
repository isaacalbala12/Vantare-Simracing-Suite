package telemetry

import "testing"

func mkVehicle(id int32, isPlayer bool) VehicleScoring {
	return VehicleScoring{ID: id, IsPlayer: isPlayer, LapDistance: 100}
}

func TestFindPlayerVehicle_ByIsPlayer(t *testing.T) {
	f := &Frame{
		Player: &PlayerTelemetry{ID: 1},
		Vehicles: []VehicleScoring{
			mkVehicle(1, true),
			mkVehicle(2, false),
		},
	}
	p := FindPlayerVehicle(f)
	if p == nil || p.ID != 1 {
		t.Errorf("expected player ID=1, got %+v", p)
	}
}

func TestFindPlayerVehicle_ByIDMatch(t *testing.T) {
	f := &Frame{
		Player: &PlayerTelemetry{ID: 7},
		Vehicles: []VehicleScoring{
			mkVehicle(1, false),
			mkVehicle(7, false), // no IsPlayer, but ID matches frame.Player.ID
		},
	}
	p := FindPlayerVehicle(f)
	if p == nil || p.ID != 7 {
		t.Errorf("expected player ID=7, got %+v", p)
	}
}

func TestFindPlayerVehicle_SingleVehicle(t *testing.T) {
	f := &Frame{
		Player: &PlayerTelemetry{ID: 42},
		Vehicles: []VehicleScoring{
			mkVehicle(99, false), // not player, not ID match
		},
	}
	p := FindPlayerVehicle(f)
	if p == nil || p.ID != 99 {
		t.Errorf("expected single vehicle ID=99, got %+v", p)
	}
}

func TestFindPlayerVehicle_MultipleNoMatch(t *testing.T) {
	f := &Frame{
		Player: &PlayerTelemetry{ID: 5},
		Vehicles: []VehicleScoring{
			mkVehicle(1, false),
			mkVehicle(2, false),
		},
	}
	p := FindPlayerVehicle(f)
	if p != nil {
		t.Errorf("expected nil, got %+v", p)
	}
}

func TestFindPlayerVehicle_NilFrame(t *testing.T) {
	if p := FindPlayerVehicle(nil); p != nil {
		t.Errorf("expected nil, got %+v", p)
	}
}

func TestFindPlayerVehicle_NilVehicles(t *testing.T) {
	f := &Frame{Player: &PlayerTelemetry{ID: 1}}
	if p := FindPlayerVehicle(f); p != nil {
		t.Errorf("expected nil, got %+v", p)
	}
}