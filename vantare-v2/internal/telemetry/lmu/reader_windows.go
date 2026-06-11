//go:build windows

package lmu

import (
	"fmt"
	"syscall"
	"unsafe"
)

const MemoryName = "LMU_Data"

const fileMapRead = 0x0004

var (
	modKernel32         = syscall.NewLazyDLL("kernel32.dll")
	procOpenFileMapping = modKernel32.NewProc("OpenFileMappingW")
	procMapViewOfFile   = modKernel32.NewProc("MapViewOfFile")
	procUnmapViewOfFile = modKernel32.NewProc("UnmapViewOfFile")
	procCloseHandle     = modKernel32.NewProc("CloseHandle")
)

// Reader provides zero-copy access to LMU_Data shared memory.
type Reader struct {
	handle syscall.Handle
	addr   uintptr
	data   []byte
}

// Open attaches to LMU shared memory. LMU must be running.
func Open() (*Reader, error) {
	name, err := syscall.UTF16PtrFromString(MemoryName)
	if err != nil {
		return nil, err
	}

	h, _, callErr := procOpenFileMapping.Call(
		uintptr(fileMapRead),
		0,
		uintptr(unsafe.Pointer(name)),
	)
	if h == 0 {
		return nil, fmt.Errorf("open LMU_Data: %v (is Le Mans Ultimate running?)", callErr)
	}
	handle := syscall.Handle(h)

	addr, _, callErr := procMapViewOfFile.Call(
		h,
		uintptr(fileMapRead),
		0,
		0,
		uintptr(ObjectOutSize),
	)
	if addr == 0 {
		_, _, _ = procCloseHandle.Call(h)
		return nil, fmt.Errorf("map LMU_Data: %v", callErr)
	}

	slice := unsafe.Slice((*byte)(unsafe.Pointer(addr)), ObjectOutSize)
	return &Reader{
		handle: handle,
		addr:   addr,
		data:   slice,
	}, nil
}

// Bytes returns the mapped buffer. Do not copy on the hot path.
func (r *Reader) Bytes() []byte {
	return r.data
}

// Close unmaps memory and closes the handle.
func (r *Reader) Close() error {
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
