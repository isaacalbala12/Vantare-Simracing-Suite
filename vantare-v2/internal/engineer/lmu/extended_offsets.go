// Package lmu — offsets para el buffer de memoria compartida Extended de LMU.
//
// El struct rF2Extended se define en CrewChief RF2Data.cs (linea ~986) con
// LayoutKind.Sequential, CharSet=Ansi, Pack=4.
//
// Los offsets se calcularon siguiendo el layout manual (Pack=4 en C#):
//   - uint/float/int: alineacion 4
//   - Int64: alineacion 4 (Pack limita a 4)
//   - byte/byte[]: alineacion 1
//   - struct anidados: heredan Pack=4
//
// Documentacion viva: si el plugin de LMU cambia el struct, reflejar aqui.
package lmu

const (
	// ExtendedMemoryName es el nombre del archivo mapeado en memoria compartida
	// de Windows para el buffer Extended de LMU (rF2Extended).
	// Fuente: rFactor2Constants.MM_EXTENDED_FILE_NAME en RF2Data.cs:39.
	ExtendedMemoryName = "$rFactor2SMMP_Extended$"

	// ExtendedMemorySize es el tamaño del mapeo. El struct rF2Extended real
	// es ~10152 bytes, pero el buffer se asigna como 32768 (potencia de 2).
	ExtendedMemorySize = 32768
)

// Offsets de campos del struct rF2Extended (Pack=4).
//
// Layout del struct (offset y tamaño):
//
//	mVersionUpdateBegin          uint32   [0-3]
//	mVersionUpdateEnd            uint32   [4-7]
//	mVersion                     byte[12] [8-19]
//	is64bit                      byte     [20]
//	padding                               [21-23]
//	mPhysics (rF2PhysicsOptions) 40 bytes [24-63]
//
// Dentro de rF2PhysicsOptions (40 bytes, Pack=4):
//
//	byte fields: [0-23], floats: [24-39]
const (
	// mFuelMult dentro de mPhysics en overall offset 24+13 = 37.
	// Fuente: RF2Data.cs linea 558 — fuel multiplier (0x-7x).
	mFuelMultOffset = 37
)

// Offsets del sistema de mensajes de historial (history messages).
// CC los usa para detectar penalizaciones, advertencias, mensajes de
// estado desde el plugin de LMU.
//
//	mTicksStatusMessageUpdated     Int64      [9444-9451]
//	mStatusMessage                 byte[128]  [9452-9579]
//	mTicksLastHistoryMessageUpdated Int64     [9580-9587]
//	mLastHistoryMessage             byte[128] [9588-9715]
const (
	mTicksLastHistoryMessageUpdatedOffset = 9580 // Int64
	// LastHistoryMessageOffset es el offset de mLastHistoryMessage
	// (byte[128]) dentro del buffer Extended.
	// Exportado para tests y monitores que necesitan leer el mensaje.
	LastHistoryMessageOffset  = 9588 // byte[128]
	mLastHistoryMessageOffset = LastHistoryMessageOffset
	// MAX_STATUS_MSG_LEN — del struct rF2Extended (CC RF2Data.cs:49, 1024).
	LastHistoryMessageLength = 128
)

// mCurrentPitSpeedLimit — float32 al offset 9716 segun el layout de rF2Extended.
// CC lo usa para informar el limitador de velocidad en pits (RF2GameStateMapper.cs:868).
const (
	mCurrentPitSpeedLimitOffset = 9716 // float32
)

// OilPressureWarningOffset — placeholder para una futura senal de advertencia
// de presion de aceite.
//
// ADVERTENCIA: El struct rF2Extended NO tiene un campo mOilPressureWarning.
// CC no rellena EngineOilPressureWarning desde rF2 (no hay datos en el plugin).
// El offset 46 corresponde a mPhysics.mUnused1 (un byte de relleno sin uso en
// rF2PhysicsOptions). Esto NO es datos reales de presion de aceite.
//
// Cuando el plugin de LMU anada este campo, actualizar este offset y la logica
// de lectura en extended_reader.go.
//
//	Posibles ubicaciones futuras:
//	  - mPhysics (relleno unused1/unused2): offsets 46-47
//	  - mInRealtimeFC: offset 8256 (byte, indica si estamos en tiempo real)
//	  - Campo nuevo al final del struct (>10152)
const (
	OilPressureWarningOffset = 46 // byte — PLACEHOLDER, NO VERIFICADO
)
