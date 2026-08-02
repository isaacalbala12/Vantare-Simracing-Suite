//go:build windows

package reportdraft

import (
	"os"
	"syscall"
)

const reportDraftFileAttributeReparsePoint = 0x400

func reportDraftPathLinked(info os.FileInfo) bool {
	if info == nil || info.Mode()&os.ModeSymlink != 0 {
		return true
	}
	data, ok := info.Sys().(*syscall.Win32FileAttributeData)
	return ok && data.FileAttributes&reportDraftFileAttributeReparsePoint != 0
}
