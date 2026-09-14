//go:build !windows

package sensor

import (
	"os"
	"syscall"
)

func processIsAlive(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return process.Signal(syscall.Signal(0)) == nil
}
