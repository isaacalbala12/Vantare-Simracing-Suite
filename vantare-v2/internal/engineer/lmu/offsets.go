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

// Bloque scoringInfo (TrackLength).
const (
	scoringTrackLength = 1720 // float64
)
