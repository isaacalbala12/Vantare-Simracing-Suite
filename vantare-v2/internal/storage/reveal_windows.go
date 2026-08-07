//go:build windows

package storage

import "os/exec"

// reveal opens the folder in Explorer. explorer.exe returns a non-zero exit
// code even when it succeeds, so the error is deliberately dropped: reporting
// a failure that did not happen is worse than reporting nothing.
func reveal(path string) error {
	_ = exec.Command("explorer", path).Run()
	return nil
}
