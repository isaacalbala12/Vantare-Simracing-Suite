//go:build !windows

package storage

import (
	"os/exec"
	"runtime"
)

func reveal(path string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", path).Run()
	}
	return exec.Command("xdg-open", path).Run()
}
