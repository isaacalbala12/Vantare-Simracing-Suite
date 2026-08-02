//go:build !windows

package reportdraft

import "os"

func reportDraftPathLinked(info os.FileInfo) bool {
	return info == nil || info.Mode()&os.ModeSymlink != 0
}
