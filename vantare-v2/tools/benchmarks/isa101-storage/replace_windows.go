//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

func replaceFile(source, destination string) error {
	sourcePath, err := syscall.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	destinationPath, err := syscall.UTF16PtrFromString(destination)
	if err != nil {
		return err
	}
	moveFileEx := syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW")
	const moveFileReplaceExisting = 0x1
	const moveFileWriteThrough = 0x8
	result, _, callErr := moveFileEx.Call(
		uintptr(unsafe.Pointer(sourcePath)),
		uintptr(unsafe.Pointer(destinationPath)),
		moveFileReplaceExisting|moveFileWriteThrough,
	)
	if result == 0 {
		return fmt.Errorf("MoveFileExW: %w", callErr)
	}
	return nil
}
