//go:build windows

package app

import (
	"os"
	"syscall"
)

const fileAttributeReparsePoint = 0x400

func diagnosticsPathComponentLinked(info os.FileInfo) bool {
	if info == nil || info.Mode()&os.ModeSymlink != 0 {
		return true
	}
	data, ok := info.Sys().(*syscall.Win32FileAttributeData)
	return ok && data.FileAttributes&fileAttributeReparsePoint != 0
}
