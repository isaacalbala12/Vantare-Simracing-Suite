//go:build windows

package lmu

import (
	"encoding/binary"
	"fmt"
	"math"
	"syscall"
	"unsafe"
)

// PitInfoData holds the decoded fields from the $rFactor2SMMP_PitInfo$ shared memory.
type PitInfoData struct {
	PitStopActive bool
	PitGroup      [24]byte
	PitLapDist    float64
}

// PitInfoReader opens and reads the LMU PitInfo shared memory buffer.
//
// Sigue el mismo patrón que ExtendedReader en extended_reader.go.
type PitInfoReader struct {
	handle syscall.Handle
	addr   uintptr
	data   []byte
}

// NewPitInfoReader creates a PitInfoReader. Call Open() before Read().
func NewPitInfoReader() *PitInfoReader {
	return &PitInfoReader{}
}

// Open attaches to the $rFactor2SMMP_PitInfo$ shared memory. LMU must be running.
func (r *PitInfoReader) Open() error {
	name, err := syscall.UTF16PtrFromString(PitInfoMemoryName)
	if err != nil {
		return fmt.Errorf("pitinfo: utf16 name: %w", err)
	}

	h, _, callErr := procOpenFileMapping.Call(
		uintptr(fileMapRead),
		0,
		uintptr(unsafe.Pointer(name)),
	)
	if h == 0 {
		return fmt.Errorf("pitinfo: OpenFileMappingW(%q): %v (is LMU running?)",
			PitInfoMemoryName, callErr)
	}
	r.handle = syscall.Handle(h)

	addr, _, callErr := procMapViewOfFile.Call(
		h,
		uintptr(fileMapRead),
		0,
		0,
		uintptr(PitInfoMemorySize),
	)
	if addr == 0 {
		_, _, _ = procCloseHandle.Call(h)
		r.handle = 0
		return fmt.Errorf("pitinfo: MapViewOfFile(%q): %v", PitInfoMemoryName, callErr)
	}
	r.addr = addr
	r.data = unsafe.Slice((*byte)(unsafe.Pointer(addr)), PitInfoMemorySize)
	return nil
}

// Read decodes the shared memory buffer into PitInfoData.
// Returns zero-valued PitInfoData if the buffer is not mapped.
func (r *PitInfoReader) Read() (PitInfoData, error) {
	if r.data == nil {
		return PitInfoData{}, fmt.Errorf("pitinfo: buffer not mapped, call Open() first")
	}
	buf := r.data

	// Validate version block — both begin/end should match (buffer is stable).
	begin := binary.LittleEndian.Uint32(buf[PitInfoVersionBegin:])
	end := binary.LittleEndian.Uint32(buf[PitInfoVersionEnd:])
	if begin == 0 || begin != end {
		return PitInfoData{}, fmt.Errorf("pitinfo: buffer unstable (vBegin=%d, vEnd=%d)", begin, end)
	}

	d := PitInfoData{}

	// mPitStopActive (byte at offset 340).
	if PitStopActiveOffset < len(buf) {
		d.PitStopActive = buf[PitStopActiveOffset] != 0
	}

	// mPitGroup (byte[24] at offset 341).
	if PitGroupOffset+24 <= len(buf) {
		copy(d.PitGroup[:], buf[PitGroupOffset:PitGroupOffset+24])
	}

	// mPitLapDist (float32 at offset 365).
	if PitLapDistOffset+4 <= len(buf) {
		bits := binary.LittleEndian.Uint32(buf[PitLapDistOffset:])
		d.PitLapDist = float64(math.Float32frombits(bits))
	}

	return d, nil
}

// Close unmaps memory and closes the handle.
func (r *PitInfoReader) Close() error {
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
