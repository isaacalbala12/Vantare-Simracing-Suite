// Package lmu — offsets for the 4-wheel block within the LMU telemetry buffer.
//
// The wheel data mirrors the C# struct rF2Wheel (CrewChief RF2Data.cs:213-253)
// with [StructLayout(LayoutKind.Sequential, Pack = 4)]. With Pack=4, doubles
// are aligned to 4 bytes (not 8). The stride per wheel is 260 bytes.
//
// WheelArrayBaseOffset (152) se confirmo mediante captura LMU en vivo:
// rel+176 como double daba 417.5K (144.4C), correspondiente a mBrakeTemp
// (offset 24 dentro del struct). Los demas offsets siguen la estructura CC
// y se marcaran como PLACEHOLDER hasta verificacion con LMU.
//
// Temperature fields in the struct are stored in Kelvin. Use kelvinToCelsius()
// or subtract 273.15 to convert to Celsius.
package lmu

// Wheel offsets (within the telemetry block, stride 4 wheels).
// Each LMUWheel is 260 bytes (C# struct with Pack=4).
const (
	// WheelArrayBaseOffset = 152 (CONFIRMADO via live capture 2026-06-29).
	WheelArrayBaseOffset = 152
	WheelStride          = 260

	// Offsets within each wheel struct (Pack=4 alignment, C#).
	// Fields marked PLACEHOLDER siguen el layout de CC rF2Wheel pero
	// no se han verificado con captura LMU en vivo.

	// CONFIRMADO: rel+176 = 417.5K (144.4C) como double en capture wheel-final.
	WheelBrakeTemp = 24 // double, Kelvin -> Celsius

	// PLACEHOLDER — siguen el struct CC pero no verificados:
	WheelTempL     = 48 // double, Kelvin (inner) — PLACEHOLDER
	WheelTempC     = 56 // double, Kelvin (center) — PLACEHOLDER
	WheelTempR     = 64 // double, Kelvin (outer) — PLACEHOLDER
	WheelPressure  = 72 // double, kPa — PLACEHOLDER
	WheelWear      = 88 // double, 0.0-1.0 — PLACEHOLDER
	WheelGripFract = 80 // double — PLACEHOLDER

	// Byte fields (independientemente del struct, lecturas directas):
	WheelSurfaceType = 112 // byte, 0=dry, 1=wet, 2=grass, etc.
	WheelFlat        = 113 // byte — PLACEHOLDER
	WheelDetached    = 114 // byte — PLACEHOLDER
)

// WheelData contains decoded per-wheel telemetry values.
type WheelData struct {
	BrakeTemp   float64 // Celsius, CONFIRMADO
	TempLeft    float64 // Celsius — PLACEHOLDER (CC: inner)
	TempCenter  float64 // Celsius — PLACEHOLDER (CC: center)
	TempRight   float64 // Celsius — PLACEHOLDER (CC: outer)
	Pressure    float64 // kPa — PLACEHOLDER
	Wear        float64 // 0.0-1.0 — PLACEHOLDER
	GripFract   float64 // PLACEHOLDER
	SurfaceType uint8
	Flat        bool   // PLACEHOLDER
	Detached    bool   // PLACEHOLDER
}

func kelvinToCelsius(k float64) float64 {
	if k <= 0 || k < 200 {
		return 0
	}
	return k - 273.15
}
