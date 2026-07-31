package diagnostics

import (
	"os"
	"path/filepath"
	"strings"
)

func validateDiagnosticDirectoryChain(path string, allowMissing bool) error {
	path = filepath.Clean(path)
	volume := filepath.VolumeName(path)
	remaining := strings.TrimLeft(strings.TrimPrefix(path, volume), `/\`)
	current := volume + string(os.PathSeparator)
	if volume == "" {
		current = string(os.PathSeparator)
	}
	for _, component := range strings.FieldsFunc(remaining, func(r rune) bool {
		return r == '/' || r == '\\'
	}) {
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) && allowMissing {
			continue
		}
		if err != nil || !info.IsDir() || diagnosticPathComponentLinked(info) {
			return ErrInvalidCapture
		}
	}
	return nil
}

func diagnosticPathIsCanonical(path string) bool {
	resolved, err := filepath.EvalSymlinks(path)
	return err == nil && sameDiagnosticPath(path, resolved)
}
