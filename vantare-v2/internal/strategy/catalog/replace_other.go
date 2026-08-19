//go:build !windows

package catalog

import "os"

func replaceAtomic(source, destination string) error { return os.Rename(source, destination) }
