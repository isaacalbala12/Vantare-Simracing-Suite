package launcher

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

// ChainRunner executes a launch profile as a sequence of steps with
// configurable delays between them. It is cancelable via context.Context.
type ChainRunner struct {
	apps   func() map[string]app.LauncherAppEntry // reads the current apps
	exec   execLauncher                           // injectable for tests
	emit   Emitter
	mu     sync.Mutex
	active map[string]context.CancelFunc // profileID -> cancel func
}

// NewChainRunner builds a ChainRunner. execFn defaults to defaultExecLauncher
// when nil.
func NewChainRunner(appsFn func() map[string]app.LauncherAppEntry, emit Emitter, execFn execLauncher) *ChainRunner {
	if execFn == nil {
		execFn = defaultExecLauncher
	}
	return &ChainRunner{
		apps:   appsFn,
		exec:   execFn,
		emit:   emit,
		active: map[string]context.CancelFunc{},
	}
}

// ChainProgress is the payload emitted on progress events.
type ChainProgress struct {
	ProfileID string `json:"profileId"`
	StepIndex int    `json:"stepIndex"`
	AppID     string `json:"appId"`
	Status    string `json:"status"` // "waiting", "starting", "started", "error", "done"
	Message   string `json:"message,omitempty"`
}

// RunChain executes the profile. It is blocking: it waits for the delays and
// process starts. The caller (a handler in main.go) must invoke it on a
// goroutine. If a step fails, it emits launcher:chain:error and returns the
// error. The apps map is snapshotted once at the start so that concurrent
// mutations (e.g. an app removed during a long delay) cannot cause a data race.
func (r *ChainRunner) RunChain(ctx context.Context, profile app.LaunchProfile) error {
	apps := make(map[string]app.LauncherAppEntry, len(r.apps()))
	for k, v := range r.apps() {
		apps[k] = v
	}

	for i, step := range profile.Steps {
		if err := ctx.Err(); err != nil {
			return err
		}

		entry, ok := apps[step.AppID]
		if !ok {
			r.emit.Emit("launcher:chain:error", ChainProgress{
				ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
				Status: "error", Message: fmt.Sprintf("app %q not found", step.AppID),
			})
			return fmt.Errorf("launcher: app %q not found", step.AppID)
		}

		// Delay before the step (skip for the first step even if its delay > 0).
		if step.Delay > 0 && i > 0 {
			r.emit.Emit("launcher:chain:step", ChainProgress{
				ProfileID: profile.ID, StepIndex: i, AppID: step.AppID, Status: "waiting",
			})
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(step.Delay) * time.Second):
			}
		}

		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID, Status: "starting",
		})

		if err := r.launchApp(entry); err != nil {
			r.emit.Emit("launcher:chain:error", ChainProgress{
				ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
				Status: "error", Message: err.Error(),
			})
			return fmt.Errorf("launcher: step %d (%s): %w", i, step.AppID, err)
		}

		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID, Status: "started",
		})
	}

	r.emit.Emit("launcher:chain:done", ChainProgress{
		ProfileID: profile.ID, Status: "done",
	})
	return nil
}

// launchApp launches an app according to its LaunchMethod. It does not wait for
// the app to exit. It does NOT receive ctx: the spawned process is not
// cancelable from here; the chain's context only governs the inter-step delays.
func (r *ChainRunner) launchApp(entry app.LauncherAppEntry) error {
	if runtime.GOOS != "windows" {
		return ErrUnsupported
	}
	var cmd *exec.Cmd
	switch entry.LaunchMethod {
	case "steam-uri":
		uri := fmt.Sprintf("steam://run/%d", entry.SteamAppID)
		cmd = r.exec("rundll32.exe", "url.dll,FileProtocolHandler", uri)
	case "executable":
		if !fileExists(entry.ExecutablePath) {
			return fmt.Errorf("%w: %s", ErrExecutableMissing, entry.ExecutablePath)
		}
		cmd = r.exec(entry.ExecutablePath)
	default:
		return fmt.Errorf("%w: launchMethod %q", ErrInvalidConfig, entry.LaunchMethod)
	}
	if cmd == nil {
		return fmt.Errorf("%w: exec returned nil", ErrInvalidConfig)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start failed: %w", err)
	}
	go func(c *exec.Cmd) { _ = c.Wait() }(cmd) // detach
	return nil
}

// StartChain creates a context derived from parent and runs RunChain on a
// goroutine. It registers the cancel func so CancelChain can stop it.
func (r *ChainRunner) StartChain(parent context.Context, profile app.LaunchProfile) {
	ctx, cancel := context.WithCancel(parent)
	r.mu.Lock()
	r.active[profile.ID] = cancel
	r.mu.Unlock()
	go func() {
		defer func() {
			r.mu.Lock()
			delete(r.active, profile.ID)
			r.mu.Unlock()
		}()
		_ = r.RunChain(ctx, profile)
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
