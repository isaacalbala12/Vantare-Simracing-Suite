//go:build windows

package lmu

import (
	"errors"
	"fmt"
	"sync"
	"syscall"
	"unsafe"
)

const fileMapRead = 0x0004

var (
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	openFileMappingW   = kernel32.NewProc("OpenFileMappingW")
	mapViewOfFile      = kernel32.NewProc("MapViewOfFile")
	unmapViewOfFile    = kernel32.NewProc("UnmapViewOfFile")
	closeWindowsHandle = kernel32.NewProc("CloseHandle")
)

type windowsReader struct {
	mu     sync.Mutex
	handle syscall.Handle
	addr   uintptr
	data   []byte
	closed bool
}

func openSharedMemory() (memoryReader, error) {
	name, err := syscall.UTF16PtrFromString(MemoryName)
	if err != nil {
		return nil, fmt.Errorf("encode mapping name: %w", err)
	}
	handle, _, callErr := openFileMappingW.Call(fileMapRead, 0, uintptr(unsafe.Pointer(name)))
	if handle == 0 {
		return nil, fmt.Errorf("%w: %v", ErrMappingUnavailable, callErr)
	}
	addr, _, callErr := mapViewOfFile.Call(handle, fileMapRead, 0, 0, ObjectOutSize)
	if addr == 0 {
		_, _, closeErr := closeWindowsHandle.Call(handle)
		if closeErr != syscall.Errno(0) {
			return nil, errors.Join(fmt.Errorf("map %s: %v", MemoryName, callErr), fmt.Errorf("close handle: %v", closeErr))
		}
		return nil, fmt.Errorf("map %s: %v", MemoryName, callErr)
	}
	return &windowsReader{handle: syscall.Handle(handle), addr: addr, data: unsafe.Slice((*byte)(unsafe.Pointer(addr)), ObjectOutSize)}, nil
}

func (reader *windowsReader) Snapshot(destination []byte) error {
	reader.mu.Lock()
	defer reader.mu.Unlock()
	if reader.closed || len(reader.data) != ObjectOutSize {
		return ErrMappingRead
	}
	if len(destination) < ObjectOutSize {
		return ErrIncompatibleBuffer
	}
	copy(destination, reader.data)
	return nil
}

func (reader *windowsReader) Close() error {
	reader.mu.Lock()
	defer reader.mu.Unlock()
	if reader.closed {
		return nil
	}
	reader.closed = true
	var closeErr error
	if reader.addr != 0 {
		if result, _, callErr := unmapViewOfFile.Call(reader.addr); result == 0 {
			closeErr = errors.Join(closeErr, fmt.Errorf("unmap %s: %v", MemoryName, callErr))
		}
		reader.addr = 0
	}
	if reader.handle != 0 {
		if result, _, callErr := closeWindowsHandle.Call(uintptr(reader.handle)); result == 0 {
			closeErr = errors.Join(closeErr, fmt.Errorf("close %s handle: %v", MemoryName, callErr))
		}
		reader.handle = 0
	}
	reader.data = nil
	return closeErr
}
