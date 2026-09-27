//go:build windows

package telemetryprocess

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestChildProcessHelper(t *testing.T) {
	if !slices.Contains(os.Args, "telemetry-child-hold") {
		return
	}
	marker := os.Args[len(os.Args)-1]
	state := "ready-empty-environment"
	if len(os.Environ()) != 0 {
		state = "unexpected-inherited-environment"
	}
	if err := os.WriteFile(marker, []byte(state), 0o600); err != nil {
		t.Fatal(err)
	}
	// The parent must terminate this process through the job. A bounded hold
	// prevents a leaked child from living indefinitely if the test fails.
	time.Sleep(30 * time.Second)
}

func childTestCommand(t *testing.T, marker string) (string, []string) {
	t.Helper()
	path, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return path, []string{"-test.run=^TestChildProcessHelper$", "--", "telemetry-child-hold", marker}
}

func TestJobClosesChildAndIsIdempotent(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "child-ready")
	path, arguments := childTestCommand(t, marker)
	child, err := startInJob(path, arguments...)
	if err != nil {
		t.Fatal(err)
	}
	process, err := windows.OpenProcess(windows.SYNCHRONIZE, false, child.pid)
	if err != nil {
		_ = child.close()
		t.Fatal(err)
	}
	defer windows.CloseHandle(process)
	deadline := time.After(2 * time.Second)
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		if content, err := os.ReadFile(marker); err == nil && len(content) > 0 {
			if string(content) != "ready-empty-environment" {
				_ = child.close()
				t.Fatalf("child environment is not isolated: %s", content)
			}
			break
		}
		select {
		case <-deadline:
			_ = child.close()
			t.Fatal("child did not start after ResumeThread")
		case <-ticker.C:
		}
	}
	if err := child.close(); err != nil {
		t.Fatal(err)
	}
	if err := child.close(); err != nil {
		t.Fatalf("second close: %v", err)
	}
	if result, err := windows.WaitForSingleObject(process, 0); err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("child remains alive after job close: result=%d error=%v", result, err)
	}
}

func TestFailedJobAssignmentKillsSuspendedChild(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "child-ready")
	path, arguments := childTestCommand(t, marker)
	assignmentFailed := errors.New("injected assignment failure")
	var process windows.Handle
	child, err := startInJobWithAssign(path, func(_, created windows.Handle) error {
		pid, pidErr := windows.GetProcessId(created)
		if pidErr != nil {
			return pidErr
		}
		process, pidErr = windows.OpenProcess(windows.SYNCHRONIZE, false, pid)
		if pidErr != nil {
			return pidErr
		}
		return assignmentFailed
	}, arguments...)
	if child != nil || !errors.Is(err, assignmentFailed) {
		t.Fatalf("start = (%v, %v), want assignment failure", child, err)
	}
	if process == 0 {
		t.Fatal("process handle not captured")
	}
	defer windows.CloseHandle(process)
	if result, err := windows.WaitForSingleObject(process, 0); err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("unassigned child remains alive: result=%d error=%v", result, err)
	}
	if _, err := os.Stat(marker); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("suspended child ran before assignment: %v", err)
	}
}
