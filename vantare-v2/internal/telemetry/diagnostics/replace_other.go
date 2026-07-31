//go:build !windows

package diagnostics

import "os"

func replaceDiagnosticAtomic(source, destination string) error {
	return os.Rename(source, destination)
}

func syncDiagnosticDirectory(directory string) error {
	file, err := os.Open(directory)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}
