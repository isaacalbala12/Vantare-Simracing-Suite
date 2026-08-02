package reportdraft

import (
	"fmt"
	"os"
	"path/filepath"
)

func writeAtomic(path string, data []byte) (bool, error) {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".testing-center-report-*.tmp")
	if err != nil {
		return false, fmt.Errorf("create temporary report draft: %w", err)
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		if !committed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return false, fmt.Errorf("protect temporary report draft: %w", err)
	}
	if _, err := temporary.Write(data); err != nil {
		return false, fmt.Errorf("write temporary report draft: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return false, fmt.Errorf("sync temporary report draft: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return false, fmt.Errorf("close temporary report draft: %w", err)
	}
	if err := replaceAtomic(temporaryPath, path); err != nil {
		return false, fmt.Errorf("replace report draft: %w", err)
	}
	committed = true
	if err := syncDirectory(directory); err != nil {
		return true, fmt.Errorf("sync report draft directory: %w", err)
	}
	return true, nil
}
