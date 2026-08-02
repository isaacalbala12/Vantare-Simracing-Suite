//go:build windows

package duckdbadapter

import (
	"errors"
	"fmt"
	"os/exec"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

const helperProcessMemoryLimit = 384 * 1024 * 1024

var ErrVCRuntimeMissing = errors.New("Microsoft Visual C++ runtime is required for telemetry analysis")

type windowsIsolatedProcess struct {
	command   *exec.Cmd
	job       windows.Handle
	closeOnce sync.Once
	waitOnce  sync.Once
	waitErr   error
}

func startIsolated(command *exec.Cmd) (isolatedProcess, error) {
	if err := checkVCRuntime(); err != nil {
		return nil, err
	}
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, fmt.Errorf("create telemetry reader job: %w", err)
	}
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | windows.JOB_OBJECT_LIMIT_PROCESS_MEMORY
	limits.ProcessMemoryLimit = helperProcessMemoryLimit
	if _, err := windows.SetInformationJobObject(
		job,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&limits)),
		uint32(unsafe.Sizeof(limits)),
	); err != nil {
		windows.CloseHandle(job)
		return nil, fmt.Errorf("limit telemetry reader job: %w", err)
	}
	if err := command.Start(); err != nil {
		windows.CloseHandle(job)
		return nil, err
	}
	process, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(command.Process.Pid))
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		windows.CloseHandle(job)
		return nil, fmt.Errorf("open telemetry reader process: %w", err)
	}
	assignErr := windows.AssignProcessToJobObject(job, process)
	windows.CloseHandle(process)
	if assignErr != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		windows.CloseHandle(job)
		return nil, fmt.Errorf("isolate telemetry reader process: %w", assignErr)
	}
	return &windowsIsolatedProcess{command: command, job: job}, nil
}

func (process *windowsIsolatedProcess) Wait() error {
	process.waitOnce.Do(func() {
		process.waitErr = process.command.Wait()
		process.closeJob()
	})
	return process.waitErr
}

func (process *windowsIsolatedProcess) PID() int { return process.command.Process.Pid }

func (process *windowsIsolatedProcess) Terminate() {
	process.closeJob()
	if process.command.Process != nil {
		_ = process.command.Process.Kill()
	}
}

func (process *windowsIsolatedProcess) closeJob() {
	process.closeOnce.Do(func() { _ = windows.CloseHandle(process.job) })
}

func checkVCRuntime() error {
	handle, err := windows.LoadLibraryEx("vcruntime140.dll", 0, windows.LOAD_LIBRARY_SEARCH_SYSTEM32)
	if err != nil {
		return ErrVCRuntimeMissing
	}
	return windows.FreeLibrary(handle)
}
