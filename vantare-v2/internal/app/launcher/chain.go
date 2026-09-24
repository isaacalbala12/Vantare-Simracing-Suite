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
	backend             ProfilesBackend // reads apps + profiles; used for telemetry writes
	exec                execLauncher    // injectable for tests
	emit                Emitter
	findRunning         func(context.Context, string) ([]ProcessInfo, error)
	ownedProcess        func(string, int) (ProcessIdentity, bool)
	closeOwned          func(context.Context, string, ProcessIdentity) error
	steamReadyTimeout   time.Duration
	processPollInterval time.Duration
	mu                  sync.Mutex
	active              map[string]*activeChain // profileID -> running chain
	nextDecision        uint64
	pendingDecisions    map[string]pendingDecision
}

type activeChain struct {
	cancelled bool
	cancel    context.CancelFunc
}

// NewChainRunner builds a ChainRunner. execFn defaults to defaultExecLauncher
// when nil.
func NewChainRunner(backend ProfilesBackend, emit Emitter, execFn execLauncher) *ChainRunner {
	if execFn == nil {
		execFn = defaultExecLauncher
	}
	return &ChainRunner{
		backend:             backend,
		exec:                execFn,
		emit:                emit,
		active:              map[string]*activeChain{},
		pendingDecisions:    map[string]pendingDecision{},
		steamReadyTimeout:   2 * time.Minute,
		processPollInterval: 500 * time.Millisecond,
	}
}

// ChainProgress is the payload emitted on chain progress events.
type ChainProgress struct {
	ProfileID    string `json:"profileId"`
	StepIndex    int    `json:"stepIndex"`
	AppID        string `json:"appId"`
	Status       string `json:"status"`               // "pending" | "launching" | "done" | "failed"
	Success      bool   `json:"success"`              // only meaningful for chain:done
	StartedAt    int64  `json:"startedAt,omitempty"`  // epoch ms
	FinishedAt   int64  `json:"finishedAt,omitempty"` // epoch ms
	Pid          int    `json:"pid,omitempty"`
	ProcessPath  string `json:"processPath,omitempty"`
	CreationTime uint64 `json:"creationTime,omitempty"`
	Message      string `json:"message,omitempty"`
	DelaySeconds int    `json:"delaySeconds,omitempty"`
}

// chainStepResult carries the outcome of a single step.
type chainStepResult struct {
	success  bool
	exitCode int
	pid      int
	path     string
	created  uint64
	message  string
}

// livenessResult carries the outcome of the liveness probe.
type livenessResult struct {
	exitCode int
	timedOut bool
	cmdErr   error
}

// StartChain creates a derived context and runs RunChain on a goroutine.
// It rejects a second call for the same profileID without changing the
// running chain's progress.
// When the chain finishes it records telemetry: RecordProfileAttempt always,
// RecordProfileSuccess only when the chain succeeds.
func (r *ChainRunner) StartChain(parent context.Context, profile app.LaunchProfile) error {
	r.mu.Lock()
	if _, exists := r.active[profile.ID]; exists {
		r.mu.Unlock()
		return ErrProfileInProgress
	}
	ctx, cancel := context.WithCancel(parent)
	chain := &activeChain{cancel: cancel}
	r.active[profile.ID] = chain
	r.mu.Unlock()

	go func() {
		defer func() {
			r.mu.Lock()
			delete(r.active, profile.ID)
			r.mu.Unlock()
			cancel()
		}()
		r.RunChain(ctx, profile)
	}()
	return nil
}

// CancelChain cancels the active chain for a profile. Returns true if a chain
// was cancelled.
func (r *ChainRunner) CancelChain(profileID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if chain, ok := r.active[profileID]; ok && !chain.cancelled {
		chain.cancelled = true
		chain.cancel()
		return true
	}
	return false
}

// CancelAll cancels every active chain. Used by the Wails shutdown hook.
func (r *ChainRunner) CancelAll() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, chain := range r.active {
		chain.cancelled = true
		chain.cancel()
	}
}

// RunChain executes the profile synchronously and emits progress events.
// It records telemetry at the end (RecordProfileAttempt always,
// RecordProfileSuccess only on full success) and emits chain:done.
func (r *ChainRunner) RunChain(ctx context.Context, profile app.LaunchProfile) {
	chainStart := time.Now()
	success := r.runChained(ctx, profile)
	if ctx.Err() != nil {
		success = false
	}
	durationMs := time.Since(chainStart).Milliseconds()

	if err := RecordProfileAttempt(r.backend, profile.ID); err != nil {
		log.Printf("launcher: telemetry: %v", err)
	}
	if success {
		if err := RecordProfileSuccess(r.backend, profile.ID, durationMs); err != nil {
			log.Printf("launcher: telemetry: %v", err)
		}
	}

	status := "done"
	if ctx.Err() != nil {
		status = "stopped"
	}
	r.emit.Emit("launcher:chain:done", ChainProgress{
		ProfileID: profile.ID,
		Status:    status,
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
			if i == len(profile.Steps)-1 {
				return false
			}
			if !r.continueAfterFailure(ctx, profile, step.AppID, "app not found", policy.Failure) {
				return false
			}
			continue
		}

		// The first step has its own explicit delay; later steps use their step delay.
		delay := step.Delay
		if i == 0 {
			delay = policy.FirstStepDelay
		}
		// Emit pending before the delay so the UI can keep the planned wait alive.
		now := time.Now()
		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
			Status: "pending", StartedAt: now.UnixMilli(), DelaySeconds: delay,
		})
		if delay > 0 {
			select {
			case <-ctx.Done():
				return false
			case <-time.After(time.Duration(delay) * time.Second):
			}
		}

		if ctx.Err() != nil {
			return false
		}

		// Launch the app.
		startedAt := time.Now()
		result, handled, abort := r.resolveRunningStep(ctx, profile, entry)
		if abort {
			return false
		}
		if !handled {
			attempts := RetryAttempts(policy.Retry, policy.MaxRetries)
			for attempt := 0; ; attempt++ {
				result = r.launchAndProbe(ctx, entry, i, step, profile, startedAt)
				if result.success || attempt >= attempts || ctx.Err() != nil {
					break
				}
			}
		}

		finishedAt := time.Now()
		stepStatus := "done"
		msg := result.message
		if !result.success {
			stepStatus = "failed"
			if result.exitCode != 0 {
				msg = fmt.Sprintf("el proceso terminó con código %d", result.exitCode)
			}
			allSucceeded = false
		}

		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID:    profile.ID,
			StepIndex:    i,
			AppID:        step.AppID,
			Status:       stepStatus,
			StartedAt:    startedAt.UnixMilli(),
			FinishedAt:   finishedAt.UnixMilli(),
			Pid:          result.pid,
			ProcessPath:  result.path,
			CreationTime: result.created,
			Message:      msg,
		})
		if !result.success {
			if i == len(profile.Steps)-1 || !r.continueAfterFailure(ctx, profile, step.AppID, msg, policy.Failure) {
				return false
			}
		}
	}

	return allSucceeded
}

// launchAndProbe starts the app and emits the "launching" event. Steam URI
// launches wait for the observed game process; executable launches use a
// short liveness probe after process creation.
func (r *ChainRunner) launchAndProbe(ctx context.Context, entry app.LauncherAppEntry, i int, step app.LaunchStep, profile app.LaunchProfile, startedAt time.Time) chainStepResult {
	if runtime.GOOS != "windows" {
		return chainStepResult{success: false}
	}

	switch entry.LaunchMethod {
	case "steam-uri":
		if entry.ExecutablePath == "" || !fileExists(entry.ExecutablePath) || r.findRunning == nil {
			return chainStepResult{message: "no se encontró el ejecutable del juego para verificar Steam"}
		}
		uri := fmt.Sprintf("steam://run/%d", entry.SteamAppID)
		cmd := r.exec("rundll32.exe", "url.dll,FileProtocolHandler", uri)
		if cmd == nil {
			return chainStepResult{success: false}
		}
		if err := cmd.Start(); err != nil {
			return chainStepResult{success: false}
		}
		if cmd.Process != nil {
			if err := cmd.Process.Release(); err != nil {
				return chainStepResult{message: fmt.Sprintf("no se pudo liberar el enlace de Steam: %v", err)}
			}
		}
		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
			Status: "launching", StartedAt: startedAt.UnixMilli(),
			DelaySeconds: int(r.steamReadyTimeout.Seconds()),
		})
		info, err := r.waitForSteamReady(ctx, entry.ExecutablePath)
		if err != nil {
			return chainStepResult{message: err.Error()}
		}
		return chainStepResult{success: true, pid: info.PID}

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
		identity := ProcessIdentity{PID: pid, ExecutablePath: entry.ExecutablePath}
		info, observed := DefaultProcessInspector().Find(ctx, identity)
		if !observed || !ProcessIsReady(identity, info) {
			info = ProcessInfo{}
		}
		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
			Status: "launching", StartedAt: startedAt.UnixMilli(), Pid: pid,
			ProcessPath: info.ExecutablePath, CreationTime: info.CreationTime,
		})

		// Liveness probe: wait up to 3s for the process to exit.
		res := livenessProbe(cmd, readinessGrace(entry.ID))
		if res.cmdErr != nil {
			return chainStepResult{success: false, pid: pid}
		}
		if !res.timedOut && res.exitCode != 0 {
			return chainStepResult{success: false, exitCode: res.exitCode, pid: pid}
		}
		return chainStepResult{success: true, pid: pid, path: info.ExecutablePath, created: info.CreationTime}

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
