package sqlite

import "path/filepath"

const leaseName = ".recording.lock"

type sessionLease interface {
	Close() error
}

func leasePath(sessionDir string) string {
	return filepath.Join(sessionDir, leaseName)
}
