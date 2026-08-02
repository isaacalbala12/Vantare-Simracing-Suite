package repository

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// cleanupOrphanedTemps runs only while the repository lease is held. It
// removes bounded, private crash remnants and never follows links or reparse
// points.
func cleanupOrphanedTemps(root string) error {
	entries, err := os.ReadDir(root)
	if err != nil {
		return fmt.Errorf("list strategy repository temporary files: %w", err)
	}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, temporaryFilePrefix) || !strings.HasSuffix(name, temporaryFileSuffix) {
			continue
		}
		path := filepath.Join(root, name)
		safe, err := isSafeOrphanRegular(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return fmt.Errorf("inspect strategy repository temporary file: %w", err)
		}
		if !safe {
			continue
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove strategy repository temporary file: %w", err)
		}
	}
	return nil
}
