//go:build !windows

package sqlite

import "os"

func replaceAtomic(source, destination string) error {
	return os.Rename(source, destination)
}
