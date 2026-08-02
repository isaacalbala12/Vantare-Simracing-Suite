//go:build !windows

package app

import "os"

func diagnosticsPathComponentLinked(info os.FileInfo) bool {
	return info == nil || info.Mode()&os.ModeSymlink != 0
}
