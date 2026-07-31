//go:build !windows

package diagnostics

import (
	"os"
	"path/filepath"
)

func diagnosticPathComponentLinked(info os.FileInfo) bool {
	return info == nil || info.Mode()&os.ModeSymlink != 0
}

func sameDiagnosticPath(left, right string) bool {
	return filepath.Clean(left) == filepath.Clean(right)
}
