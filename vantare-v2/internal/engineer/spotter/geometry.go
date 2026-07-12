package spotter

import (
	"sort"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// MinSpotterSpeedMPS es la velocidad mínima del jugador (m/s) para que el
// spotter opere. Por debajo de este umbral Classify devuelve nil (silencia el
// spotter en parado/pit lane lento/boxes).
//
// Paridad CC: NoisyCartesianCoordinateSpotter.cs:56 — `minSpeedForSpotterToOperate = UserSettings.GetUserSettings().getFloat("min_speed_for_spotter")`
// y uso en línea 297: `playerVelocityData[0] > minSpeedForSpotterToOperate`
// donde playerVelocityData[0] es currentPlayerSpeed (magnitud, m/s, ver RF2Spotter.cs:155-156).
//
// El default exacto del user setting CC NO está en el repo fuente (no hay JSON
// de defaults); 10.0 m/s es decisión Vantare alineada con la intención del gate
// (silenciar parado/coche lento).
const MinSpotterSpeedMPS = 10.0

// FCYGamePhase es el valor de engineer.SessionInfo.GamePhase que indica
// Full Course Yellow / Safety Car. Igual a rF2GamePhase.FullCourseYellow=6
// en CC RF2Data.cs:68. Cuando frame.Session.GamePhase==FCYGamePhase, el
// spotter queda en silencio (gate en ClassifyWithActiveSides).
const FCYGamePhase uint8 = 6

func isZeroVec(v telemetry.Vec3) bool {
	return v.X == 0 && v.Y == 0 && v.Z == 0
}

type tempZone struct {
	zone    Zone
	lateral float64
}

func existingOverlap(aligned AlignedOpponent, active ActiveSides) bool {
	if aligned.X > 0 {
		return active.Left
	}
	if aligned.X < 0 {
		return active.Right
	}
	return false
}

func overlapConfigForSensitivity(s Sensitivity) OverlapConfig {
	cfg := DefaultOverlapConfig()
	switch s {
	case SensitivityConservative:
		cfg.CarWidthM = 1.6
		cfg.CarLengthM = 4.8
	case SensitivityAggressive:
		cfg.CarWidthM = 2.0
		cfg.CarLengthM = 4.2
	case SensitivityNormal:
		fallthrough
	default:
		cfg.CarWidthM = 1.8
		cfg.CarLengthM = 4.5
	}
	return cfg
}

// GridSide detects which side of the grid the player is on during the
// Formation phase. Returns "left", "right", or "" (not in formation or
// centered). Paridad CC: Spotter.cs:67-94 — usa getGridSideInternal con
// threshold ±2m, solo durante Formation phase (GamePhase==3).
func GridSide(frame *telemetry.Frame) string {
	if frame == nil || frame.Session == nil || frame.Session.GamePhase != FormationGamePhase {
		return ""
	}
	player := telemetry.FindPlayerVehicle(frame)
	if player == nil {
		return ""
	}
	if player.PathLateral > 2.0 {
		return "right"
	}
	if player.PathLateral < -2.0 {
		return "left"
	}
	return ""
}

// Classify determines lateral overlap zones around the player vehicle using CrewChief geometry.
func Classify(frame *telemetry.Frame, sensitivity Sensitivity) []Zone {
	return ClassifyWithActiveSides(frame, sensitivity, ActiveSides{})
}

func ClassifyWithActiveSides(frame *telemetry.Frame, sensitivity Sensitivity, active ActiveSides) []Zone {
	if frame == nil {
		return nil
	}

	var player *telemetry.VehicleScoring
	for i := range frame.Vehicles {
		if frame.Vehicles[i].IsPlayer {
			player = &frame.Vehicles[i]
			break
		}
	}

	// Fallback to match by player ID if available.
	if player == nil && frame.Player != nil {
		for i := range frame.Vehicles {
			if frame.Vehicles[i].ID == frame.Player.ID {
				player = &frame.Vehicles[i]
				break
			}
		}
	}

	// Fallback to first vehicle if exactly one vehicle exists.
	if player == nil && len(frame.Vehicles) == 1 {
		player = &frame.Vehicles[0]
	}
	if player == nil {
		return nil
	}
	if player.InPits {
		return nil
	}

	// FCY pause gate: silenciar el spotter cuando la sesión está bajo
	// Full Course Yellow / Safety Car. GamePhase==6 según CC rF2GamePhase
	// (RF2Data.cs:68). Paridad: el spotter CC queda en pause durante FCY
	// (Spotter.cs:42-55 + CrewChief.cs:144-145 minTimeToWaitToTurnSpotterOffInFCY=10s).
	// Aquí el gate es instantáneo: la pausa detallada con 10-30s random es
	// follow-up de G1.4 (FlagsMonitor completo).
	if frame.Session != nil && frame.Session.GamePhase == FCYGamePhase {
		return nil
	}

	// Speed gate: silenciar spotter si el jugador va demasiado lento.
	// Paridad CC: NoisyCartesianCoordinateSpotter.cs:297 (playerVelocityData[0] > minSpeedForSpotterToOperate).
	// Si frame.Player es nil no aplicamos el gate (player viene de VehicleScoring fallback sin Speed).
	if frame.Player != nil && frame.Player.Speed < MinSpotterSpeedMPS {
		return nil
	}

	// Grid side detection (CC: Spotter.cs:67-94, solo durante Formation phase).
	// La funcion GridSide() esta disponible para monitores externos.

	playerPos := player.Position
	playerYaw := YawFromRF2Orientation(player.Orientation)

	// Handle player telemetry fallbacks. Prefer frame.Player for position/orientation if it exists and Row2 is not zero.
	if frame.Player != nil {
		if !isZeroVec(frame.Player.Orientation.Row2) {
			playerYaw = YawFromRF2Orientation(frame.Player.Orientation)
		}
		if !isZeroVec(frame.Player.Position) {
			playerPos = frame.Player.Position
		}
	}

	// Default/absolute fallback if still zero.
	if isZeroVec(playerPos) && frame.Player != nil {
		playerPos = frame.Player.Position
	}

	cfg := overlapConfigForSensitivity(sensitivity)
	var results []tempZone

	for i := range frame.Vehicles {
		opp := &frame.Vehicles[i]
		if opp.ID == player.ID || opp.IsPlayer {
			continue
		}
		if opp.InPits {
			continue
		}
		if opp.LapDistance < 0 {
			continue
		}

		aligned := AlignOpponentXZ(playerYaw, playerPos, opp.Position)
		overlap := ClassifyAlignedOverlap(aligned, existingOverlap(aligned, active), cfg)
		if overlap.InOverlap {
			results = append(results, tempZone{
				zone: Zone{
					Side:      overlap.Side,
					VehicleID: opp.ID,
					LateralM:  overlap.LateralM,
					ForwardM:  overlap.ForwardM,
				},
				lateral: aligned.X,
			})
		}
	}

	// Collapse stacked opponents on the same side.
	// Paridad CC: NoisyCartesianCoordinateSpotter.cs:414-434 — cuando hay 2+
	// oponentes en el MISMO lado y su separación lateral (aligned.X) es <
	// carWidth, están "line astern" (apilados, no side-by-side). Colapsamos
	// a 1 zona, quedándonos con el más cercano al jugador (menor ForwardM).
	zonesBySide := make(map[Side][]tempZone)
	for _, tz := range results {
		zonesBySide[tz.zone.Side] = append(zonesBySide[tz.zone.Side], tz)
	}
	var collapsed []tempZone
	for _, zones := range zonesBySide {
		if len(zones) >= 2 {
			minLat, maxLat := zones[0].lateral, zones[0].lateral
			for _, z := range zones[1:] {
				if z.lateral < minLat {
					minLat = z.lateral
				}
				if z.lateral > maxLat {
					maxLat = z.lateral
				}
			}
			if maxLat-minLat < cfg.CarWidthM {
				// Colapsar: mantener solo el más cercano (menor ForwardM).
				closest := zones[0]
				for _, z := range zones[1:] {
					if z.zone.ForwardM < closest.zone.ForwardM {
						closest = z
					}
				}
				collapsed = append(collapsed, closest)
			} else {
				collapsed = append(collapsed, zones...)
			}
		} else {
			collapsed = append(collapsed, zones...)
		}
	}
	results = collapsed

	// Sort deterministically: by lateral (signed projection), then vehicle ID.
	sort.Slice(results, func(i, j int) bool {
		if results[i].lateral != results[j].lateral {
			return results[i].lateral < results[j].lateral
		}
		return results[i].zone.VehicleID < results[j].zone.VehicleID
	})

	zones := make([]Zone, len(results))
	for i := range results {
		zones[i] = results[i].zone
	}

	return zones
}
