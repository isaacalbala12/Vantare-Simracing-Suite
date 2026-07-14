//go:build windows

package lmu

import (
	"encoding/binary"
	"fmt"
	"math"
	"syscall"
	"unsafe"
)

// Windows constantes de memoria compartida.
const fileMapRead = 0x0004

var (
	modKernel32         = syscall.NewLazyDLL("kernel32.dll")
	procOpenFileMapping = modKernel32.NewProc("OpenFileMappingW")
	procMapViewOfFile   = modKernel32.NewProc("MapViewOfFile")
	procUnmapViewOfFile = modKernel32.NewProc("UnmapViewOfFile")
	procCloseHandle     = modKernel32.NewProc("CloseHandle")
)

// ExtendedReader abre y lee el buffer de memoria compartida Extended de LMU
// ($rFactor2SMMP_Extended$). Proporciona acceso a:
//   - mLastHistoryMessage[128] — mensajes de penalizacion/estado
//   - mFuelMult — multiplicador de combustible
//   - mCurrentPitSpeedLimit — limite de velocidad en pits
//
// Sigue el mismo patron que Reader en internal/telemetry/lmu/reader_windows.go.
type ExtendedReader struct {
	handle syscall.Handle
	addr   uintptr
	data   []byte
}

// NewExtendedReader crea un ExtendedReader sin abrir la memoria compartida.
// Llame a Open() antes de Read().
func NewExtendedReader() *ExtendedReader {
	return &ExtendedReader{}
}

// Open se conecta al buffer de memoria compartida Extended de LMU.
// LMU debe estar ejecutandose. Devuelve error si no se puede abrir o mapear.
func (r *ExtendedReader) Open() error {
	name, err := syscall.UTF16PtrFromString(ExtendedMemoryName)
	if err != nil {
		return fmt.Errorf("extended: utf16 name: %w", err)
	}

	h, _, callErr := procOpenFileMapping.Call(
		uintptr(fileMapRead),
		0,
		uintptr(unsafe.Pointer(name)),
	)
	if h == 0 {
		return fmt.Errorf("extended: OpenFileMappingW(%q): %v (is LMU running?)",
			ExtendedMemoryName, callErr)
	}
	r.handle = syscall.Handle(h)

	addr, _, callErr := procMapViewOfFile.Call(
		h,
		uintptr(fileMapRead),
		0,
		0,
		uintptr(ExtendedMemorySize),
	)
	if addr == 0 {
		_, _, _ = procCloseHandle.Call(h)
		r.handle = 0
		return fmt.Errorf("extended: MapViewOfFile(%q): %v", ExtendedMemoryName, callErr)
	}
	r.addr = addr
	r.data = unsafe.Slice((*byte)(unsafe.Pointer(addr)), ExtendedMemorySize)
	return nil
}

// Read decodifica el buffer compartido y devuelve los campos del struct
// rF2Extended que nos interesan.
//
// Devuelve ExtendedData con valores zero si el buffer no esta mapeado todavia
// (no panic). Reusa readByte y readString de parser.go (mismo paquete).
func (r *ExtendedReader) Read() (ExtendedData, error) {
	if r.data == nil {
		return ExtendedData{}, fmt.Errorf("extended: buffer not mapped, call Open() first")
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

// Bytes devuelve el slice del buffer mapeado. Util para depuracion.
func (r *ExtendedReader) Bytes() []byte {
	return r.data
}

// Close desmapea la memoria y cierra el handle.
func (r *ExtendedReader) Close() error {
	if r.addr != 0 {
		_, _, _ = procUnmapViewOfFile.Call(r.addr)
		r.addr = 0
	}
	if r.handle != 0 {
		_, _, _ = procCloseHandle.Call(uintptr(r.handle))
		r.handle = 0
	}
	r.data = nil
	return nil
}
