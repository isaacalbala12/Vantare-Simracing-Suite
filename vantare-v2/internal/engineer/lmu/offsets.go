package lmu

// Offsets de geometría adicionales para el spotter de Ingeniero.
// Estos offsets NO existen en internal/telemetry/lmu/offsets.go (parser público
// de widgets) y son los necesarios para decodificar Position/Orientation/LocalVelocity
// por vehículo desde el mismo buffer mmap de LMU.
//
// Fuente: docs/engineer-live-lmu-adapter-analysis.md (sección 4) y
// C:\Users\isaac\Desktop\Vantare-Ingeniero-Go\internal\sim\lmu\offsets.go.
// Compatibles con ObjectOutSize=324820, vehicleScoringStride=584,
// telemetryTelemStride=1888 del parser público de Overlays.

// Bloque vehicleTelemetry (slot del jugador, stride 1888).
const (
	vehicleTelemetryID          = 0
	vehicleTelemetryLocalVel    = 184
	vehicleTelemetryPosition    = 160 // Vec3 (24 bytes)
	vehicleTelemetryLocalAccel  = 208 // Vec3 (no usado por spotter)
	vehicleTelemetryOrientation = 232 // Orientation 3x3 (72 bytes)
)

// Bloque vehicleScoring (por oponente, stride 584).
const (
	vehicleScoringPathLateral = 112 // float64 (no bloqueante, futuro)
	vehicleScoringTrackEdge   = 120 // float64 (no bloqueante, futuro)
	vehicleScoringPosition    = 264 // Vec3 (24 bytes)
	vehicleScoringLocalVel    = 288 // Vec3 (24 bytes, no bloqueante)
	vehicleScoringLocalAccel  = 312 // Vec3 (no usado)
	vehicleScoringOrientation = 336 // Orientation 3x3 (72 bytes)
)

// Bloque scoringInfo.
const (
	scoringTrackLength     = 1720 // float64
	scoringSessionType     = 1696 // int32
	scoringSessionLaps     = 1704 // int32 — mMaxLaps, total race laps (0 = timed session)
	scoringCurrentET       = 1700 // float64 — session elapsed time
	scoringSessionTime     = 1708 // float64 — session total time (for timed sessions)
	scoringYellowFlagState = 1832 // byte — 0=none, 1=full course yellow, 2=yellow, 3= SC
)

// Additional vehicleScoring offsets beyond those defined for spotter geometry.
const (
	vehicleScoringTotalLaps        = 100 // int16
	vehicleScoringSector           = 102 // byte (0/1/2)
	vehicleScoringFinishStatus     = 103 // byte (0=none, 1=finished, 2=DNF, 3=DQ)
	vehicleScoringLastLapTime      = 168 // float64
	vehicleScoringPlace            = 199 // byte
	vehicleScoringTimeBehindNext   = 232 // float64
	vehicleScoringLapsBehindNext   = 240 // int32
	vehicleScoringTimeBehindLeader = 244 // float64
	vehicleScoringLapsBehindLeader = 252 // int32
	vehicleScoringPitState         = 457 // byte (0=none, 1=request, 2=entering, 3=stopped, 4=exiting)
	vehicleScoringEstimatedLapTime = 472 // float64
	vehicleScoringFuelFraction     = 578 // byte (0-100)
)

// Offsets de temperatura y desgaste identificados en 2ª captura driving
// (docs/lmu-capture/driving/driving-report.md, 200 muestras a 10 Hz).
// Todos son u8 (1 byte). Los offsets relativos son dentro del bloque
// vehicleTelemetry del jugador (base 128468, stride 1888).
//
// Mapeo propuesto (pendiente cross-reference con RF2Data.cs):
//
//	rel+175  = tyre temp FL  (subió 64 → 116, empezó frío)
//	rel+182  = tyre temp FR  (subió 97 → 115)
//	rel+191  = engine water temp (subió 94 → 153)
//	rel+239  = tyre temp RL  (subió 63 → 191)
//	rel+263  = tyre temp RR  (subió 109 → 191)
//	rel+278  = engine oil temp (subió 137 → 160)
//	rel+411  = brake temp FL (subió 105 → 179)
//	rel+443  = brake temp FR (subió 105 → 179)
//	rel+786  = tyre wear FL  (delta menor, 8 valores únicos)
//	rel+790  = tyre wear FR
//
// Los pares rel+239/+303 y rel+255/+319 muestran el mismo patrón porque
// el struct de LMU duplica campos por rueda en posiciones pares.
// Usamos los offsets impares (primer byte de cada campo).
//
// IMPORTANTE: brake temps se leen como u8 (1 byte). En LMU las
// temperaturas de freno reales pueden exceder 255°C (rango típico
// 200-900°C), lo que causa wrap-around silencioso. Para valores >255°C,
// el parser reportará el valor módulo 256 (ej. 400°C se reporta como
// 144°C). Esto es un trade-off conocido — el struct rF2/LMU almacena
// estos campos en 1 byte. Mitigación: el monitor dispara warning antes
// de los 250°C para alertar al usuario del wrap inminente.
const (
	tyreTempFLOffset   = 175 // u8, Celsius, tyre temp front-left
	tyreTempFROffset   = 182 // u8, Celsius, tyre temp front-right
	tyreTempRLOffset   = 239 // u8, Celsius, tyre temp rear-left
	tyreTempRROffset   = 263 // u8, Celsius, tyre temp rear-right
	engineWaterTempOff = 191 // u8, Celsius, engine coolant temperature
	engineOilTempOff   = 278 // u8, Celsius, engine oil temperature
	brakeTempFLOffset  = 411 // u8, Celsius (truncates at 255 — see note above)
	brakeTempFROffset  = 443 // u8, Celsius (truncates at 255)
	brakeTempRLOffset  = 427 // u8, Celsius (truncates at 255)
	brakeTempRROffset  = 459 // u8, Celsius (truncates at 255)
	tyreWearFLOffset   = 786 // u8, 0-100%, tyre wear front-left
	tyreWearFROffset   = 790 // u8, 0-100%, tyre wear front-right
	tyreWearRLOffset   = 794 // u8, 0-100%, tyre wear rear-left
	tyreWearRROffset   = 798 // u8, 0-100%, tyre wear rear-right
)
