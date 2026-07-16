//go:build !windows

package lmu

import (
	"encoding/binary"
	"errors"
	"math"
)

// ExtendedReader proporciona acceso al buffer de memoria compartida Extended
// de LMU. En plataformas que no sean Windows, solo funciona con buffers
// prefabricados para testing (NewExtendedReaderFromBuffer).
//
// La definicion coincide con extended_reader.go para que las estructuras de
// datos sean identicas entre plataformas.
type ExtendedReader struct {
	handle uintptr // no usado en stub, mismo tamano que syscall.Handle
	addr   uintptr
	data   []byte
}

// NewExtendedReader crea un ExtendedReader. En plataformas no-Windows,
// Open() siempre fallara.
func NewExtendedReader() *ExtendedReader {
	return &ExtendedReader{}
}

// Open devuelve error en plataformas que no sean Windows.
func (r *ExtendedReader) Open() error {
	return errors.New("extended: shared memory only available on Windows")
}

// Read decodifica el buffer si fue asignado via NewExtendedReaderFromBuffer.
// Si el buffer es nil, devuelve error.
func (r *ExtendedReader) Read() (ExtendedData, error) {
	if r.data == nil {
		return ExtendedData{}, errors.New("extended: buffer not mapped")
	}
	buf := r.data

	fuelMult := readByte(buf, mFuelMultOffset)

	ticks := int64(0)
	if off := mTicksLastHistoryMessageUpdatedOffset; off+8 <= len(buf) {
		ticks = int64(binary.LittleEndian.Uint64(buf[off:]))
	}

	msg := readString(buf, mLastHistoryMessageOffset, LastHistoryMessageLength)

	limit := float32(0)
	if off := mCurrentPitSpeedLimitOffset; off+4 <= len(buf) {
		limit = math.Float32frombits(binary.LittleEndian.Uint32(buf[off:]))
	}

	oilWarn := false
	if off := OilPressureWarningOffset; off < len(buf) {
		oilWarn = buf[off] != 0
	}

	return ExtendedData{
		FuelMult:            fuelMult,
		TicksLastHistoryMsg: ticks,
		LastHistoryMessage:  msg,
		PitSpeedLimit:       limit,
		OilPressureWarning:  oilWarn,
	}, nil
}

// Bytes devuelve el slice del buffer si fue asignado.
func (r *ExtendedReader) Bytes() []byte {
	return r.data
}

// Close es no-op en plataformas que no sean Windows.
func (r *ExtendedReader) Close() error {
	r.data = nil
	return nil
}
