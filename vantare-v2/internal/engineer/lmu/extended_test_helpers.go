// Package lmu — helpers exportados para testing cross-package.
//
// Estas funciones construyen buffers sinteticos del Extended de LMU para
// usar en tests de monitores (penalties, engine, etc.).
//
// Solo deben usarse en tests (_test.go). Se mantienen en un archivo regular
// (no _test.go) porque Go no permite acceder a funciones definidas en
// _test.go desde otros paquetes.
package lmu

import (
	"encoding/binary"
	"math"
)

// NewSyntheticExtendedBuffer construye un buffer de ExtendedMemorySize bytes
// con datos conocidos para el struct rF2Extended. Disenado para tests.
//
// Valores por defecto:
//   - FuelMult = 3
//   - TicksLastHistoryMsg = 1234567890
//   - LastHistoryMessage = "Stop/Go Penalty: Cut Track"
//   - PitSpeedLimit = 22.22 m/s
//   - OilPressureWarning = false
func NewSyntheticExtendedBuffer() []byte {
	buf := make([]byte, ExtendedMemorySize)

	buf[mFuelMultOffset] = 3

	binary.LittleEndian.PutUint64(buf[mTicksLastHistoryMessageUpdatedOffset:], 1234567890)

	msg := "Stop/Go Penalty: Cut Track"
	copy(buf[mLastHistoryMessageOffset:], msg)
	buf[mLastHistoryMessageOffset+len(msg)] = 0

	binary.LittleEndian.PutUint32(buf[mCurrentPitSpeedLimitOffset:], math.Float32bits(22.22))

	buf[OilPressureWarningOffset] = 0

	return buf
}

// NewExtendedReaderFromBuffer crea un ExtendedReader con un buffer
// prefabricado. Solo para uso en tests.
func NewExtendedReaderFromBuffer(buf []byte) *ExtendedReader {
	return &ExtendedReader{data: buf}
}
