//go:build windows

package diagnostics

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

const diagnosticFileAttributeReparsePoint = 0x400

func diagnosticPathComponentLinked(info os.FileInfo) bool {
	if info == nil || info.Mode()&os.ModeSymlink != 0 {
		return true
	}
	data, ok := info.Sys().(*syscall.Win32FileAttributeData)
	return ok && data.FileAttributes&diagnosticFileAttributeReparsePoint != 0
}

func sameDiagnosticPath(left, right string) bool {
	if strings.EqualFold(filepath.Clean(left), filepath.Clean(right)) {
		return true
	}
	leftInfo, leftErr := os.Stat(left)
	rightInfo, rightErr := os.Stat(right)
	return leftErr == nil && rightErr == nil && os.SameFile(leftInfo, rightInfo)
}
