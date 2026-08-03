package repository

import (
	"fmt"
	"os"
	"path/filepath"
)

const (
	temporaryFilePrefix = ".strategy-repository-"
	temporaryFileSuffix = ".tmp"
)

type atomicWriteFunc func(path string, data []byte) (replaced bool, err error)

func writeAtomic(path string, data []byte) (bool, error) {
	return writeAtomicWithSync(path, data, syncDirectory)
}

func writeAtomicWithSync(path string, data []byte, syncParent func(string) error) (bool, error) {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, temporaryFilePrefix+"*"+temporaryFileSuffix)
	if err != nil {
		return false, fmt.Errorf("create temporary file: %w", err)
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
		return false, fmt.Errorf("protect temporary file: %w", err)
	}
	if _, err := temporary.Write(data); err != nil {
		return false, fmt.Errorf("write temporary file: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return false, fmt.Errorf("sync temporary file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return false, fmt.Errorf("close temporary file: %w", err)
	}
	if err := replaceAtomic(temporaryPath, path); err != nil {
		return false, fmt.Errorf("replace repository file: %w", err)
	}
	committed = true
	if err := syncParent(directory); err != nil {
		return true, fmt.Errorf("sync repository directory: %w", err)
	}
	return true, nil
}
