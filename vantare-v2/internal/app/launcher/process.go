package launcher

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type ProcessIdentity struct {
	PID            int
	ExecutablePath string
	ProcessName    string
}

type ProcessInfo struct {
	PID            int
	ExecutablePath string
	ProcessName    string
	Alive          bool
}

type ProcessInspector interface {
	Find(context.Context, ProcessIdentity) (ProcessInfo, bool)
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
	if expected.PID != 0 && actual.PID != 0 && expected.PID == actual.PID {
		return true
	}
	if expected.ExecutablePath != "" && actual.ExecutablePath != "" {
		return NormalizeExecutablePath(expected.ExecutablePath) == NormalizeExecutablePath(actual.ExecutablePath)
	}
	if expected.ProcessName != "" && actual.ProcessName != "" {
		return strings.EqualFold(filepath.Base(expected.ProcessName), filepath.Base(actual.ProcessName))
	}
	return false
}

func ProcessIsReady(expected ProcessIdentity, actual ProcessInfo) bool {
	return actual.Alive && IdentityMatches(expected, ProcessIdentity{
		PID: actual.PID, ExecutablePath: actual.ExecutablePath, ProcessName: actual.ProcessName,
	})
}

type tasklistInspector struct{}

func (tasklistInspector) Find(ctx context.Context, expected ProcessIdentity) (ProcessInfo, bool) {
	if runtime.GOOS != "windows" || expected.PID == 0 {
		return ProcessInfo{}, false
	}
	cmd := exec.CommandContext(ctx, "tasklist", "/FI", "PID eq "+strconv.Itoa(expected.PID), "/FO", "CSV", "/NH")
	output, err := cmd.Output()
	if err != nil || !strings.Contains(string(output), strconv.Itoa(expected.PID)) {
		return ProcessInfo{}, false
	}
	return ProcessInfo{PID: expected.PID, ExecutablePath: expected.ExecutablePath, ProcessName: expected.ProcessName, Alive: true}, true
}

func DefaultProcessInspector() ProcessInspector { return tasklistInspector{} }

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
