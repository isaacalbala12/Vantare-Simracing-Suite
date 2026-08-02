//go:build !windows

package telemetryanalysis

import "os"

func securePrivateDirectory(path string) error { return os.Chmod(path, 0o700) }
