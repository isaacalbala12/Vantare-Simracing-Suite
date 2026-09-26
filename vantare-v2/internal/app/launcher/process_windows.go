//go:build windows

package launcher

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"

	"golang.org/x/sys/windows"
)

func processInfo(pid int) (windows.Handle, ProcessInfo, error) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return 0, ProcessInfo{}, err
	}
	path := make([]uint16, 32768)
	size := uint32(len(path))
	if err := windows.QueryFullProcessImageName(handle, 0, &path[0], &size); err != nil {
		windows.CloseHandle(handle)
		return 0, ProcessInfo{}, err
	}
	var exitCode uint32
	if err := windows.GetExitCodeProcess(handle, &exitCode); err != nil {
		windows.CloseHandle(handle)
		return 0, ProcessInfo{}, err
	}
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		windows.CloseHandle(handle)
		return 0, ProcessInfo{}, err
	}
	executable := windows.UTF16ToString(path[:size])
	creationTime := uint64(created.HighDateTime)<<32 | uint64(created.LowDateTime)
	return handle, ProcessInfo{PID: pid, ExecutablePath: executable, ProcessName: filepath.Base(executable), CreationTime: creationTime, Alive: exitCode == 259}, nil
}

func (systemProcessInspector) Find(ctx context.Context, expected ProcessIdentity) (ProcessInfo, bool) {
	if ctx.Err() != nil || expected.PID <= 0 {
		return ProcessInfo{}, false
	}
	handle, info, err := processInfo(expected.PID)
	if err != nil {
		return ProcessInfo{}, false
	}
	defer windows.CloseHandle(handle)
	return info, info.Alive
}

func terminateVerifiedProcess(ctx context.Context, identity ProcessIdentity) error {
	if identity.ExecutablePath == "" || identity.CreationTime == 0 {
		return fmt.Errorf("launcher: executable path and creation time required to close process")
	}
	handle, info, err := processInfo(identity.PID)
	if err != nil {
		return fmt.Errorf("launcher: inspect process: %w", err)
	}
	defer windows.CloseHandle(handle)
	if !ProcessIsReady(identity, info) {
		return fmt.Errorf("launcher: process identity no longer matches")
	}
	// The open handle keeps this PID bound to the inspected process until taskkill returns.
	// Do not use /T: child processes were not individually launched by Vantare.
	if err := exec.CommandContext(ctx, "taskkill", "/PID", strconv.Itoa(identity.PID)).Run(); err != nil {
		return fmt.Errorf("launcher: close process: %w", err)
	}
	return nil
}
