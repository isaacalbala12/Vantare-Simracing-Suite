//go:build !windows

package duckdbadapter

import "os"

func openLockedRead(path string) (*os.File, error) { return os.Open(path) }
