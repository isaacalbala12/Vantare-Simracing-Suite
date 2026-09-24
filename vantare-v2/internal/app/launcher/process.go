package launcher

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type ProcessIdentity struct {
	PID            int
	ExecutablePath string
	ProcessName    string
	CreationTime   uint64
}

type ProcessInfo struct {
	PID            int
	ExecutablePath string
	ProcessName    string
	CreationTime   uint64
	Alive          bool
}

type ProcessInspector interface {
	Find(context.Context, ProcessIdentity) (ProcessInfo, bool)
}

func CloseProcess(ctx context.Context, inspector ProcessInspector, identity ProcessIdentity) error {
	if identity.PID <= 0 || identity.ExecutablePath == "" || identity.CreationTime == 0 {
		return fmt.Errorf("launcher: process identity requires PID, executable path and creation time")
	}
	info, ok := inspector.Find(ctx, identity)
	if !ok || !ProcessIsReady(identity, info) {
		return fmt.Errorf("launcher: process identity no longer matches")
	}
	return terminateVerifiedProcess(ctx, identity)
}

func RestartProcess(ctx context.Context, inspector ProcessInspector, identity ProcessIdentity, executable string, args []string) (ProcessIdentity, error) {
	if executable == "" || identity.ExecutablePath == "" || NormalizeExecutablePath(executable) != NormalizeExecutablePath(identity.ExecutablePath) {
		return ProcessIdentity{}, fmt.Errorf("launcher: restart requires the confirmed executable path")
	}
	if err := CloseProcess(ctx, inspector, identity); err != nil {
		return ProcessIdentity{}, err
	}
	cmd := exec.CommandContext(ctx, executable, args...)
	cmd.Dir = filepath.Dir(executable)
	if err := cmd.Start(); err != nil {
		return ProcessIdentity{}, fmt.Errorf("launcher: restart process: %w", err)
	}
	go func() { _ = cmd.Wait() }()
	if cmd.Process == nil {
		return ProcessIdentity{}, nil
	}
	newIdentity := ProcessIdentity{PID: cmd.Process.Pid, ExecutablePath: executable}
	info, ok := inspector.Find(ctx, newIdentity)
	if !ok || !ProcessIsReady(newIdentity, info) || info.CreationTime == 0 {
		return ProcessIdentity{}, nil
	}
	return ProcessIdentity{PID: info.PID, ExecutablePath: info.ExecutablePath, CreationTime: info.CreationTime}, nil
}

func NormalizeExecutablePath(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return ""
	}
	normalized := filepath.Clean(trimmed)
	if runtime.GOOS == "windows" {
		normalized = strings.ToLower(normalized)
	}
	return normalized
}

func IdentityMatches(expected, actual ProcessIdentity) bool {
	if expected.PID != 0 && expected.PID != actual.PID {
		return false
	}
	if expected.CreationTime != 0 && expected.CreationTime != actual.CreationTime {
		return false
	}
	if expected.ExecutablePath != "" {
		return actual.ExecutablePath != "" && NormalizeExecutablePath(expected.ExecutablePath) == NormalizeExecutablePath(actual.ExecutablePath)
	}
	if expected.ProcessName != "" && actual.ProcessName != "" {
		return strings.EqualFold(filepath.Base(expected.ProcessName), filepath.Base(actual.ProcessName))
	}
	return false
}

func ProcessIsReady(expected ProcessIdentity, actual ProcessInfo) bool {
	return actual.Alive && IdentityMatches(expected, ProcessIdentity{
		PID: actual.PID, ExecutablePath: actual.ExecutablePath, ProcessName: actual.ProcessName, CreationTime: actual.CreationTime,
	})
}

type systemProcessInspector struct{}

func DefaultProcessInspector() ProcessInspector { return systemProcessInspector{} }

func WaitForReady(ctx context.Context, inspector ProcessInspector, identity ProcessIdentity, grace time.Duration, poll time.Duration) error {
	if inspector == nil {
		return fmt.Errorf("launcher: process inspector is nil")
	}
	if grace < 0 {
		grace = 0
	}
	if poll <= 0 {
		poll = 25 * time.Millisecond
	}
	deadline := time.NewTimer(grace)
	defer deadline.Stop()
	ticker := time.NewTicker(poll)
	defer ticker.Stop()
	check := func() bool {
		info, ok := inspector.Find(ctx, identity)
		return ok && ProcessIsReady(identity, info)
	}
	if check() {
		return nil
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline.C:
			if check() {
				return nil
			}
			return fmt.Errorf("launcher: process not ready after %s", grace)
		case <-ticker.C:
			if check() {
				return nil
			}
		}
	}
}

func readinessGrace(appID string) time.Duration {
	if known, ok := KnownAppsByID[appID]; ok && known.ReadyGrace > 0 {
		return known.ReadyGrace
	}
	return 3 * time.Second
}
