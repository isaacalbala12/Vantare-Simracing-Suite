//go:build windows

package repository

import (
	"os"
	"syscall"

	"golang.org/x/sys/windows"
)

func isSafeOrphanRegular(path string) (bool, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return false, err
	}
	attributes, ok := info.Sys().(*syscall.Win32FileAttributeData)
	if !ok {
		return false, nil
	}
	if attributes.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		return false, nil
	}
	return info.Mode().IsRegular(), nil
}
