package simulator

import (
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

const baseTimestampMS int64 = 1623800000000

type Scenario string

const (
	ScenarioLeftBasic  Scenario = "left_basic"
	ScenarioRightBasic Scenario = "right_basic"
	ScenarioThreeWide  Scenario = "three_wide"
	ScenarioAllClear   Scenario = "all_clear"
)

// Build returns a deterministic sequence of telemetry frames for the given Scenario.
func Build(s Scenario) []telemetry.Frame {
	var frames []telemetry.Frame

	identityOrientation := telemetry.Orientation{
		Row0: telemetry.Vec3{X: 1, Y: 0, Z: 0},
		Row1: telemetry.Vec3{X: 0, Y: 1, Z: 0},
		Row2: telemetry.Vec3{X: 0, Y: 0, Z: 1},
	}

	playerTelemetry := &telemetry.PlayerTelemetry{
		Position:      telemetry.Vec3{X: 0, Y: 0, Z: 0},
		LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
		Orientation:   identityOrientation,
	}

	switch s {
	case ScenarioLeftBasic:
		// 4 frames
		// Z positions for left opponent:
		// Frame 0: no overlap (e.g. -10m)
		// Frame 1: overlap (e.g. 0m)
		// Frame 2: still overlap (e.g. 0m)
		// Frame 3: no overlap (e.g. 10m)
		zCoords := []float64{-10.0, 0.0, 0.0, 10.0}
		for i, z := range zCoords {
			playerScoring := telemetry.VehicleScoring{
				ID:            0,
				DriverName:    "Player",
				IsPlayer:      true,
				Position:      telemetry.Vec3{X: 0, Y: 0, Z: 0},
				LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
				Orientation:   identityOrientation,
			}
			leftOpponent := telemetry.VehicleScoring{
				ID:            1,
				DriverName:    "Opponent Left",
				IsPlayer:      false,
				Position:      telemetry.Vec3{X: 2.8, Y: 0, Z: z},
				LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
				Orientation:   identityOrientation,
			}
			vehicles := []telemetry.VehicleScoring{playerScoring}
			if z == 0.0 {
				vehicles = append(vehicles, leftOpponent)
			}
			frames = append(frames, telemetry.Frame{
				Connected:        true,
				PlayerHasVehicle: true,
				Player:           playerTelemetry,
				Session: &telemetry.SessionInfo{
					TrackName:   "Monza",
					TrackLength: 5793.0,
					NumVehicles: int32(len(vehicles)),
				},
				Vehicles:        vehicles,
				TimestampUnixMS: baseTimestampMS + int64(i)*1000,
			})
		}

	case ScenarioRightBasic:
		// Mirror of left_basic with right opponent at -2.8 X.
		zCoords := []float64{-10.0, 0.0, 0.0, 10.0}
		for i, z := range zCoords {
			playerScoring := telemetry.VehicleScoring{
				ID:            0,
				DriverName:    "Player",
				IsPlayer:      true,
				Position:      telemetry.Vec3{X: 0, Y: 0, Z: 0},
				LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
				Orientation:   identityOrientation,
			}
			rightOpponent := telemetry.VehicleScoring{
				ID:            2,
				DriverName:    "Opponent Right",
				IsPlayer:      false,
				Position:      telemetry.Vec3{X: -2.8, Y: 0, Z: z},
				LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
				Orientation:   identityOrientation,
			}
			vehicles := []telemetry.VehicleScoring{playerScoring}
			if z == 0.0 {
				vehicles = append(vehicles, rightOpponent)
			}
			frames = append(frames, telemetry.Frame{
				Connected:        true,
				PlayerHasVehicle: true,
				Player:           playerTelemetry,
				Session: &telemetry.SessionInfo{
					TrackName:   "Monza",
					TrackLength: 5793.0,
					NumVehicles: int32(len(vehicles)),
				},
				Vehicles:        vehicles,
				TimestampUnixMS: baseTimestampMS + int64(i)*1000,
			})
		}

	case ScenarioThreeWide:
		// Opponents at both -2.8 and +2.8 X overlapping.
		zCoordsLeft := []float64{-10.0, 0.0, 0.0, 10.0}
		zCoordsRight := []float64{10.0, 0.0, 0.0, -10.0}
		for i := 0; i < 4; i++ {
			playerScoring := telemetry.VehicleScoring{
				ID:            0,
				DriverName:    "Player",
				IsPlayer:      true,
				Position:      telemetry.Vec3{X: 0, Y: 0, Z: 0},
				LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
				Orientation:   identityOrientation,
			}
			leftOpponent := telemetry.VehicleScoring{
				ID:            1,
				DriverName:    "Opponent Left",
				IsPlayer:      false,
				Position:      telemetry.Vec3{X: 2.8, Y: 0, Z: zCoordsLeft[i]},
				LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
				Orientation:   identityOrientation,
			}
			rightOpponent := telemetry.VehicleScoring{
				ID:            2,
				DriverName:    "Opponent Right",
				IsPlayer:      false,
				Position:      telemetry.Vec3{X: -2.8, Y: 0, Z: zCoordsRight[i]},
				LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
				Orientation:   identityOrientation,
			}
			vehicles := []telemetry.VehicleScoring{playerScoring}
			if zCoordsLeft[i] == 0.0 {
				vehicles = append(vehicles, leftOpponent)
			}
			if zCoordsRight[i] == 0.0 {
				vehicles = append(vehicles, rightOpponent)
			}
			frames = append(frames, telemetry.Frame{
				Connected:        true,
				PlayerHasVehicle: true,
				Player:           playerTelemetry,
				Session: &telemetry.SessionInfo{
					TrackName:   "Monza",
					TrackLength: 5793.0,
					NumVehicles: int32(len(vehicles)),
				},
				Vehicles:        vehicles,
				TimestampUnixMS: baseTimestampMS + int64(i)*1000,
			})
		}

	case ScenarioAllClear:
		// 4 frames where no opponent is in overlap.
		// Frame 0: player only
		// Frame 1: opponent far right (X=-25, outside 20m track zone)
		// Frame 2: opponent far left (X=25, outside 20m track zone)
		// Frame 3: player only
		for i := 0; i < 4; i++ {
			playerScoring := telemetry.VehicleScoring{
				ID:            0,
				DriverName:    "Player",
				IsPlayer:      true,
				Position:      telemetry.Vec3{X: 0, Y: 0, Z: 0},
				LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
				Orientation:   identityOrientation,
			}
			vehicles := []telemetry.VehicleScoring{playerScoring}

			if i == 1 {
				vehicles = append(vehicles, telemetry.VehicleScoring{
					ID:            1,
					DriverName:    "Opponent Far Right",
					IsPlayer:      false,
					Position:      telemetry.Vec3{X: -25, Y: 0, Z: 0},
					LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
					Orientation:   identityOrientation,
				})
			} else if i == 2 {
				vehicles = append(vehicles, telemetry.VehicleScoring{
					ID:            2,
					DriverName:    "Opponent Far Left",
					IsPlayer:      false,
					Position:      telemetry.Vec3{X: 25, Y: 0, Z: 0},
					LocalVelocity: telemetry.Vec3{X: 0, Y: 0, Z: 20},
					Orientation:   identityOrientation,
				})
			}

			frames = append(frames, telemetry.Frame{
				Connected:        true,
				PlayerHasVehicle: true,
				Player:           playerTelemetry,
				Session: &telemetry.SessionInfo{
					TrackName:   "Monza",
					TrackLength: 5793.0,
					NumVehicles: int32(len(vehicles)),
				},
				Vehicles:        vehicles,
				TimestampUnixMS: baseTimestampMS + int64(i)*1000,
			})
		}
	}

	return frames
}
