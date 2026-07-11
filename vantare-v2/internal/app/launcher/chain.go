package launcher

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

// ChainRunner executes a launch profile as a sequence of steps with
// configurable delays between them. It is cancelable via context.Context,
// tracks wall-clock timing per step, runs a liveness probe on each
// executable, and records telemetry (RecordProfileAttempt always,
// RecordProfileSuccess only on full success).
type ChainRunner struct {
	backend ProfilesBackend // reads apps + profiles; used for telemetry writes
	exec    execLauncher    // injectable for tests
	emit    Emitter
	mu      sync.Mutex
	active  map[string]context.CancelFunc // profileID -> cancel func
}

// NewChainRunner builds a ChainRunner. execFn defaults to defaultExecLauncher
// when nil.
func NewChainRunner(backend ProfilesBackend, emit Emitter, execFn execLauncher) *ChainRunner {
	if execFn == nil {
		execFn = defaultExecLauncher
	}
	return &ChainRunner{
		backend: backend,
		exec:    execFn,
		emit:    emit,
		active:  map[string]context.CancelFunc{},
	}
}

// ChainProgress is the payload emitted on chain progress events.
type ChainProgress struct {
	ProfileID  string `json:"profileId"`
	StepIndex  int    `json:"stepIndex"`
	AppID      string `json:"appId"`
	Status     string `json:"status"`               // "pending" | "launching" | "done" | "failed"
	Success    bool   `json:"success"`              // only meaningful for chain:done
	StartedAt  int64  `json:"startedAt,omitempty"`  // epoch ms
	FinishedAt int64  `json:"finishedAt,omitempty"` // epoch ms
	Pid        int    `json:"pid,omitempty"`
	Message    string `json:"message,omitempty"`
}

// chainStepResult carries the outcome of a single step.
type chainStepResult struct {
	success  bool
	exitCode int
	pid      int
}

// livenessResult carries the outcome of the liveness probe.
type livenessResult struct {
	exitCode int
	timedOut bool
	cmdErr   error
}

// StartChain creates a derived context and runs RunChain on a goroutine.
// It rejects a second call for the same profileID by emitting
// launcher:chain:error with message "perfil ya en curso".
// When the chain finishes it records telemetry: RecordProfileAttempt always,
// RecordProfileSuccess only when the chain succeeds.
func (r *ChainRunner) StartChain(parent context.Context, profile app.LaunchProfile) {
	r.mu.Lock()
	if _, exists := r.active[profile.ID]; exists {
		r.mu.Unlock()
		r.emit.Emit("launcher:chain:error", ChainProgress{
			ProfileID: profile.ID,
			Status:    "failed",
			Message:   "perfil ya en curso",
		})
		return
	}
	ctx, cancel := context.WithCancel(parent)
	r.active[profile.ID] = cancel
	r.mu.Unlock()

	go func() {
		defer func() {
			r.mu.Lock()
			delete(r.active, profile.ID)
			r.mu.Unlock()
		}()
		r.RunChain(ctx, profile)
	}()
}

// CancelChain cancels the active chain for a profile. Returns true if a chain
// was cancelled.
func (r *ChainRunner) CancelChain(profileID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if cancel, ok := r.active[profileID]; ok {
		cancel()
		delete(r.active, profileID)
		return true
	}
	return false
}

// CancelAll cancels every active chain. Used by the Wails shutdown hook.
func (r *ChainRunner) CancelAll() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, cancel := range r.active {
		cancel()
	}
	r.active = map[string]context.CancelFunc{}
}

// RunChain executes the profile synchronously and emits progress events.
// It records telemetry at the end (RecordProfileAttempt always,
// RecordProfileSuccess only on full success) and emits chain:done.
func (r *ChainRunner) RunChain(ctx context.Context, profile app.LaunchProfile) {
	chainStart := time.Now()
	success := r.runChained(ctx, profile)
	durationMs := time.Since(chainStart).Milliseconds()

	if err := RecordProfileAttempt(r.backend, profile.ID); err != nil {
		log.Printf("launcher: telemetry: %v", err)
	}
	if success {
		if err := RecordProfileSuccess(r.backend, profile.ID, durationMs); err != nil {
			log.Printf("launcher: telemetry: %v", err)
		}
	}

	r.emit.Emit("launcher:chain:done", ChainProgress{
		ProfileID: profile.ID,
		Status:    "done",
		Success:   success,
	})
}

// runChained executes every step of the profile sequentially. It returns true
// only when ALL steps succeed. Steps that fail are tracked but the chain
// continues with the remaining steps. The caller gets a summary at the end.
func (r *ChainRunner) runChained(ctx context.Context, profile app.LaunchProfile) bool {
	apps := make(map[string]app.LauncherAppEntry)
	src := r.backend.GetLauncherApps()
	for k, v := range src {
		apps[k] = v
	}

	allSucceeded := true
	policy := app.NormalizeLaunchPolicy(profile.Policy)
	for i, step := range profile.Steps {
		if ctx.Err() != nil {
			return false
		}

		entry, ok := apps[step.AppID]
		if !ok {
			now := time.Now()
			r.emit.Emit("launcher:chain:step", ChainProgress{
				ProfileID:  profile.ID,
				StepIndex:  i,
				AppID:      step.AppID,
				Status:     "failed",
				StartedAt:  now.UnixMilli(),
				FinishedAt: now.UnixMilli(),
				Message:    fmt.Sprintf("app %q not found", step.AppID),
			})
			allSucceeded = false
			continue // continue to next step, don't stop
		}

		// Emit pending before the delay.
		now := time.Now()
		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
			Status: "pending", StartedAt: now.UnixMilli(),
		})

		// Delay before the step (skip for the first step even if its delay > 0).
		if step.Delay > 0 && i > 0 {
			select {
			case <-ctx.Done():
				return false
			case <-time.After(time.Duration(step.Delay) * time.Second):
			}
		}

		if ctx.Err() != nil {
			return false
		}

		// Launch the app.
		startedAt := time.Now()
		result := chainStepResult{}
		attempts := RetryAttempts(policy.Retry, policy.MaxRetries)
		for attempt := 0; ; attempt++ {
			result = r.launchAndProbe(ctx, entry, i, step, profile, startedAt)
			if result.success || attempt >= attempts || ctx.Err() != nil {
				break
			}
		}

		finishedAt := time.Now()
		stepStatus := "done"
		msg := ""
		if !result.success {
			stepStatus = "failed"
			if result.exitCode != 0 {
				msg = fmt.Sprintf("el proceso terminó con código %d", result.exitCode)
			}
			allSucceeded = false
			if !ContinueAfterFailure(policy.Failure, false) {
				return false
			}
		}

		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID:  profile.ID,
			StepIndex:  i,
			AppID:      step.AppID,
			Status:     stepStatus,
			StartedAt:  startedAt.UnixMilli(),
			FinishedAt: finishedAt.UnixMilli(),
			Pid:        result.pid,
			Message:    msg,
		})
	}

	return allSucceeded
}

// launchAndProbe starts the app and emits the "launching" event. For
// steam-uri it returns success immediately without probing. For executable
// it runs a liveness probe that waits up to 3s for the process to exit.
func (r *ChainRunner) launchAndProbe(ctx context.Context, entry app.LauncherAppEntry, i int, step app.LaunchStep, profile app.LaunchProfile, startedAt time.Time) chainStepResult {
	if runtime.GOOS != "windows" {
		return chainStepResult{success: false}
	}

	switch entry.LaunchMethod {
	case "steam-uri":
		uri := fmt.Sprintf("steam://run/%d", entry.SteamAppID)
		cmd := r.exec("rundll32.exe", "url.dll,FileProtocolHandler", uri)
		if cmd == nil {
			return chainStepResult{success: false}
		}
		if err := cmd.Start(); err != nil {
			return chainStepResult{success: false}
		}
		pid := 0
		if cmd.Process != nil {
			pid = cmd.Process.Pid
		}
		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
			Status: "launching", StartedAt: startedAt.UnixMilli(), Pid: pid,
		})
		go func(c *exec.Cmd) { _ = c.Wait() }(cmd) // detach
		return chainStepResult{success: true, pid: pid}

	case "executable":
		if !fileExists(entry.ExecutablePath) {
			return chainStepResult{success: false}
		}
		argsText := entry.Args
		if step.ArgsOverride != "" {
			argsText = step.ArgsOverride
		}
		args, err := parseWindowsArgs(argsText)
		if err != nil {
			return chainStepResult{success: false}
		}
		cmd := r.exec(entry.ExecutablePath, args...)
		if cmd == nil {
			return chainStepResult{success: false}
		}
		// Set working directory to the executable's folder so apps like OBS
		// can find their locale/config files relative to the exe.
		cmd.Dir = filepath.Dir(entry.ExecutablePath)
		if err := cmd.Start(); err != nil {
			return chainStepResult{success: false}
		}
		pid := 0
		if cmd.Process != nil {
			pid = cmd.Process.Pid
		}
		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
			Status: "launching", StartedAt: startedAt.UnixMilli(), Pid: pid,
		})

		// Liveness probe: wait up to 3s for the process to exit.
		res := livenessProbe(cmd, readinessGrace(entry.ID))
		if res.cmdErr != nil {
			return chainStepResult{success: false, pid: pid}
		}
		if !res.timedOut && res.exitCode != 0 {
			return chainStepResult{success: false, exitCode: res.exitCode, pid: pid}
		}
		return chainStepResult{success: true, pid: pid}

	default:
		return chainStepResult{success: false}
	}
}

// parseWindowsArgs tokenizes an argument string without invoking a shell. It
// follows the quoting rules used by Windows process command lines closely
// enough for launcher arguments: whitespace separates tokens outside quotes,
// quotes group text and backslashes before quotes are handled in pairs.
func parseWindowsArgs(raw string) ([]string, error) {
	if strings.IndexByte(raw, 0) >= 0 {
		return nil, fmt.Errorf("launcher: arguments contain NUL")
	}
	var args []string
	var current strings.Builder
	inQuotes := false
	tokenStarted := false
	backslashes := 0
	flushSlashes := func() {
		for i := 0; i < backslashes; i++ {
			current.WriteByte('\\')
		}
		backslashes = 0
	}
	flush := func() {
		flushSlashes()
		if tokenStarted {
			args = append(args, current.String())
			current.Reset()
			tokenStarted = false
		}
	}
	for i := 0; i < len(raw); i++ {
		switch raw[i] {
		case '\\':
			backslashes++
			tokenStarted = true
		case '"':
			tokenStarted = true
			if backslashes%2 == 0 {
				flushSlashes()
				inQuotes = !inQuotes
			} else {
				backslashes = (backslashes - 1) / 2
				flushSlashes()
				current.WriteByte('"')
			}
		case ' ', '\t':
			if inQuotes {
				flushSlashes()
				current.WriteByte(raw[i])
				tokenStarted = true
			} else {
				flush()
			}
		default:
			flushSlashes()
			current.WriteByte(raw[i])
			tokenStarted = true
		}
	}
	flushSlashes()
	if inQuotes {
		return nil, fmt.Errorf("launcher: unterminated quoted argument")
	}
	flush()
	return args, nil
}

// livenessProbe waits for a process to exit within the given timeout. If the
// process exits on its own the exit code is checked; if the timeout expires
// the process is assumed to be running normally (timedOut=true).
func livenessProbe(cmd *exec.Cmd, timeout time.Duration) livenessResult {
	done := make(chan livenessResult, 1)
	go func() {
		err := cmd.Wait()
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				done <- livenessResult{exitCode: exitErr.ExitCode()}
			} else {
				done <- livenessResult{cmdErr: err}
			}
			return
		}
		done <- livenessResult{exitCode: 0}
	}()

	select {
	case r := <-done:
		return r
	case <-time.After(timeout):
		return livenessResult{timedOut: true}
	}
}
