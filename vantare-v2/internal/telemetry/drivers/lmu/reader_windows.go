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

type windowsAPI struct {
	open    func(*uint16) (uintptr, error)
	mapView func(uintptr) (uintptr, error)
	unmap   func(uintptr) (uintptr, error)
	close   func(uintptr) (uintptr, error)
}

func systemWindowsAPI() windowsAPI {
	return windowsAPI{
		open: func(name *uint16) (uintptr, error) {
			result, _, err := openFileMappingW.Call(fileMapRead, 0, uintptr(unsafe.Pointer(name)))
			return result, err
		},
		mapView: func(handle uintptr) (uintptr, error) {
			result, _, err := mapViewOfFile.Call(handle, fileMapRead, 0, 0, ObjectOutSize)
			return result, err
		},
		unmap: func(address uintptr) (uintptr, error) {
			result, _, err := unmapViewOfFile.Call(address)
			return result, err
		},
		close: func(handle uintptr) (uintptr, error) {
			result, _, err := closeWindowsHandle.Call(handle)
			return result, err
		},
	}
}

type windowsReader struct {
	mu     sync.Mutex
	handle syscall.Handle
	addr   uintptr
	data   []byte
	closed bool
	api    windowsAPI
}

func openSharedMemory() (memoryReader, error) {
	return openSharedMemoryWithAPI(systemWindowsAPI(), mappedBytes)
}

func openSharedMemoryWithAPI(api windowsAPI, view func(uintptr) []byte) (memoryReader, error) {
	name, err := syscall.UTF16PtrFromString(MemoryName)
	if err != nil {
		return nil, fmt.Errorf("encode mapping name: %w", err)
	}
	handle, callErr := api.open(name)
	if handle == 0 {
		return nil, fmt.Errorf("%w: %v", ErrMappingUnavailable, callErr)
	}
	addr, callErr := api.mapView(handle)
	if addr == 0 {
		closed, closeErr := api.close(handle)
		if closed == 0 {
			return nil, errors.Join(fmt.Errorf("map %s: %w", MemoryName, callErr), fmt.Errorf("close handle: %w", closeErr))
		}
		return nil, fmt.Errorf("map %s: %w", MemoryName, callErr)
	}
	return &windowsReader{handle: syscall.Handle(handle), addr: addr, data: view(addr), api: api}, nil
}

func mappedBytes(address uintptr) []byte {
	return unsafe.Slice((*byte)(unsafe.Pointer(address)), ObjectOutSize)
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
		if result, callErr := reader.api.unmap(reader.addr); result == 0 {
			closeErr = errors.Join(closeErr, fmt.Errorf("unmap %s: %w", MemoryName, callErr))
		}
		reader.addr = 0
	}
	if reader.handle != 0 {
		if result, callErr := reader.api.close(uintptr(reader.handle)); result == 0 {
			closeErr = errors.Join(closeErr, fmt.Errorf("close %s handle: %w", MemoryName, callErr))
		}
		reader.handle = 0
	}
	reader.data = nil
	return closeErr
}
