package telemetry

// FindPlayerVehicle returns a pointer to the player vehicle scoring
// within the frame, or nil if it cannot be determined.
//
// Resolution order:
//  1. The first vehicle with IsPlayer == true.
//  2. The vehicle whose ID matches frame.Player.ID.
//  3. If there is exactly one vehicle in the frame, that vehicle.
//
// All monitors in the engineer/ subpackage that need to know the
// player's current telemetry use this helper. Centralising avoids the
// triple-implementation drift that existed across flags, penalties,
// laps, push, pitstops, position and timings (six identical copies).
func FindPlayerVehicle(frame *Frame) *VehicleScoring {
	if frame == nil {
		return nil
	}
	for i := range frame.Vehicles {
		if frame.Vehicles[i].IsPlayer {
			return &frame.Vehicles[i]
		}
	}
	if frame.Player != nil {
		for i := range frame.Vehicles {
			if frame.Vehicles[i].ID == frame.Player.ID {
				return &frame.Vehicles[i]
			}
		}
	}
	if len(frame.Vehicles) == 1 {
		return &frame.Vehicles[0]
	}
	return nil
}