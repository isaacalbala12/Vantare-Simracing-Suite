package lmu

// ExtendedData representa los campos decodificados del buffer rF2Extended
// de memoria compartida de LMU.
//
// Contiene datos que NO estan en el buffer de telemetria principal:
//   - mLastHistoryMessage: mensajes de penalizacion/estado/combustible
//   - mFuelMult: multiplicador de combustible (configuracion de sesion)
//   - mCurrentPitSpeedLimit: velocidad maxima en pits (m/s)
//   - OilPressureWarning: placeholder para futura advertencia de presion
type ExtendedData struct {
	// FuelMult es el multiplicador de combustible (0x-7x).
	// Mientras >0, el consumo de combustible esta activo.
	// Fuente: rF2PhysicsOptions.mFuelMult (overall offset 37, byte).
	FuelMult byte

	// TicksLastHistoryMsg es el timestamp (ticks) de la ultima actualizacion
	// del mensaje de historial. CC lo usa para detectar mensajes nuevos.
	// Fuente: mTicksLastHistoryMessageUpdated (offset 9580, Int64).
	TicksLastHistoryMsg int64

	// LastHistoryMessage es el ultimo mensaje de historial recibido del plugin
	// de LMU (MAX_STATUS_MSG_LEN = 128 bytes ASCII). Incluye mensajes de
	// penalizacion ("Stop/Go Penalty: Cut Track"), advertencias, estado de
	// combustible, etc.
	// Fuente: mLastHistoryMessage (offset 9588, byte[128]).
	LastHistoryMessage string

	// PitSpeedLimit es el limite de velocidad en pits en m/s.
	// Solo es valido si DirectMemoryAccessEnabled != 0 (no verificado aqui,
	// el llamante debe comprobarlo).
	// Fuente: mCurrentPitSpeedLimit (offset 9716, float32).
	PitSpeedLimit float32

	// OilPressureWarning es un placeholder. Actualmente NO hay datos reales
	// de presion de aceite en el buffer Extended de LMU.
	// Ver OilPressureWarningOffset en extended_offsets.go.
	OilPressureWarning bool
}
