//go:build windows

package voiceinput

import (
	"os/exec"

	"golang.org/x/sys/windows"
)

func prepareHiddenProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &windows.SysProcAttr{HideWindow: true}
}

func lowerProcessPriority(pid int) error {
	handle, err := windows.OpenProcess(windows.PROCESS_SET_INFORMATION, false, uint32(pid))
	if err != nil {
		return err
	}
	defer windows.CloseHandle(handle)
	return windows.SetPriorityClass(handle, windows.BELOW_NORMAL_PRIORITY_CLASS)
}
