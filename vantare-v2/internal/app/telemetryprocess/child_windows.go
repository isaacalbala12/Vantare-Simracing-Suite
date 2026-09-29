//go:build windows

package telemetryprocess

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const childShutdownTimeout = 2 * time.Second

// childProcess owns the job and process handles. Closing the job terminates
// the child even if the host dies without sending a Stop message.
type childProcess struct {
	job      windows.Handle
	process  windows.Handle
	pid      uint32
	once     sync.Once
	closeErr error
}

func startInJob(executable string, arguments ...string) (*childProcess, error) {
	return startInJobWithAssign(executable, windows.AssignProcessToJobObject, arguments...)
}

func startInJobWithAssign(executable string, assign func(windows.Handle, windows.Handle) error, arguments ...string) (*childProcess, error) {
	if !filepath.IsAbs(executable) || !strings.EqualFold(filepath.Ext(executable), ".exe") {
		return nil, errors.New("telemetry child requires an absolute executable path")
	}
	info, err := os.Stat(executable)
	if err != nil {
		return nil, fmt.Errorf("telemetry child executable unavailable: %w", err)
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("telemetry child executable is not a regular file")
	}
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, fmt.Errorf("create telemetry child job: %w", err)
	}
	defer func() {
		if job != 0 {
			_ = windows.CloseHandle(job)
		}
	}()
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		return nil, fmt.Errorf("set telemetry child job limit: %w", err)
	}
	path, err := windows.UTF16PtrFromString(executable)
	if err != nil {
		return nil, fmt.Errorf("encode telemetry child path: %w", err)
	}
	commandLine, err := windows.UTF16FromString(windows.ComposeCommandLine(append([]string{executable}, arguments...)))
	if err != nil {
		return nil, fmt.Errorf("encode telemetry child arguments: %w", err)
	}
	workingDirectory, err := windows.UTF16PtrFromString(filepath.Dir(executable))
	if err != nil {
		return nil, fmt.Errorf("encode telemetry child directory: %w", err)
	}
	// Keep credentials out of the child. Windows network initialization needs
	// SystemRoot even for LMU's numeric loopback address; no other host variable
	// is inherited. Resolve the system directory through Windows, not os.Getenv.
	systemDirectory, err := windows.GetSystemWindowsDirectory()
	if err != nil {
		return nil, fmt.Errorf("locate Windows system directory: %w", err)
	}
	environment, err := windows.UTF16FromString("SystemRoot=" + systemDirectory)
	if err != nil {
		return nil, fmt.Errorf("encode telemetry child environment: %w", err)
	}
	environment = append(environment, 0)
	startup := windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfo{}))}
	var created windows.ProcessInformation
	if err := windows.CreateProcess(path, &commandLine[0], nil, nil, false,
		windows.CREATE_SUSPENDED|windows.CREATE_NO_WINDOW|windows.CREATE_UNICODE_ENVIRONMENT,
		&environment[0], workingDirectory, &startup, &created); err != nil {
		return nil, fmt.Errorf("create suspended telemetry child: %w", err)
	}
	defer windows.CloseHandle(created.Thread)
	cleanupProcess := true
	defer func() {
		if cleanupProcess {
			_ = windows.TerminateProcess(created.Process, 1)
			_, _ = windows.WaitForSingleObject(created.Process, uint32(childShutdownTimeout.Milliseconds()))
			_ = windows.CloseHandle(created.Process)
		}
	}()
	if err := assign(job, created.Process); err != nil {
		return nil, fmt.Errorf("assign suspended telemetry child to job: %w", err)
	}
	previousSuspendCount, err := windows.ResumeThread(created.Thread)
	if err != nil {
		return nil, fmt.Errorf("resume telemetry child: %w", err)
	}
	if previousSuspendCount != 1 {
		return nil, fmt.Errorf("telemetry child suspend count before resume: %d", previousSuspendCount)
	}
	child := &childProcess{job: job, process: created.Process, pid: created.ProcessId}
	job = 0
	cleanupProcess = false
	return child, nil
}

func (child *childProcess) close() error {
	child.once.Do(func() {
		if err := windows.CloseHandle(child.job); err != nil {
			child.closeErr = fmt.Errorf("close telemetry child job: %w", err)
		}
		result, err := windows.WaitForSingleObject(child.process, uint32(childShutdownTimeout.Milliseconds()))
		if err != nil {
			child.closeErr = errors.Join(child.closeErr, fmt.Errorf("wait for telemetry child: %w", err))
		} else if result != windows.WAIT_OBJECT_0 {
			if terminateErr := windows.TerminateProcess(child.process, 1); terminateErr != nil {
				child.closeErr = errors.Join(child.closeErr, fmt.Errorf("terminate telemetry child: %w", terminateErr))
			}
			_, waitErr := windows.WaitForSingleObject(child.process, uint32(childShutdownTimeout.Milliseconds()))
			child.closeErr = errors.Join(child.closeErr, errors.New("telemetry child exceeded shutdown timeout"), waitErr)
		}
		if err := windows.CloseHandle(child.process); err != nil {
			child.closeErr = errors.Join(child.closeErr, fmt.Errorf("close telemetry child handle: %w", err))
		}
	})
	return child.closeErr
}
