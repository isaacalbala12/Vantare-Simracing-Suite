//go:build !windows

package reportdraft

import "os"

func replaceAtomic(source, destination string) error {
	return os.Rename(source, destination)
}

func syncDirectory(directory string) error {
	handle, err := os.Open(directory)
	if err != nil {
		return err
	}
	defer handle.Close()
	return handle.Sync()
}
