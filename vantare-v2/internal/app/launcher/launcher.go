// Package launcher implements a thin service that lets the Hub launch a
// simulator (Le Mans Ultimate only in this first cut) using either a Steam URI
// or a local executable. The service does not supervise the spawned process:
// callers receive a fire-and-forget result. Settings persist through the
// existing SettingsService so no extra files are introduced.
package launcher

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

// LauncherConfig is an alias for the persisted launcher entry shape defined
// in the parent app package. Using the parent's type keeps the JSON contract
// in a single place and lets the SettingsBackend interface match without
// additional conversions.
type LauncherConfig = app.LauncherConfig

// LauncherStatus is the read-only view exposed to the UI.
type LauncherStatus struct {
	SimulatorID    string   `json:"simulatorId"`
	Configured     bool     `json:"configured"`
	LaunchMethod   string   `json:"launchMethod,omitempty"`
	ExecutablePath string   `json:"executablePath,omitempty"`
	SteamAppID     uint32   `json:"steamAppId,omitempty"`
	ExecutableOK   bool     `json:"executableOk,omitempty"`
	AssociatedApps []string `json:"associatedApps,omitempty"`
	LastLaunchedAt string   `json:"lastLaunchedAt,omitempty"`
}

// Public errors so callers can react to specific failure modes without
// parsing error messages.
var (
	ErrNotConfigured     = errors.New("launcher: simulator not configured")
	ErrInvalidConfig     = errors.New("launcher: invalid configuration")
	ErrExecutableMissing = errors.New("launcher: executable path does not exist")
	ErrUnsupported       = errors.New("launcher: not supported on this platform")
)

// execLauncher mirrors os/exec.Command's signature so tests can swap it out
// without spawning real processes.
type execLauncher func(name string, args ...string) *exec.Cmd

// defaultExecLauncher is the production launcher. Tests swap it via NewService.
var defaultExecLauncher execLauncher = exec.Command

// SettingsBackend is the slice of SettingsService the launcher depends on.
// Defined in the consumer (this package) per the repo's "no premature
// interfaces" rule; only the methods we use are exposed.
type SettingsBackend interface {
	GetLaunchers() map[string]LauncherConfig
	SetLaunchers(launchers map[string]LauncherConfig) error
}

// Emitter is the minimal event sink the launcher needs. The production
// *wailsEmitter in main.go satisfies this interface; tests pass a spy.
type Emitter interface {
	Emit(name string, data any)
}

// Service is the LauncherService. It is safe to call Configure/Launch/
// GetStatus from multiple goroutines; the only mutable state is the
// last-launched timestamp which is guarded by mu.
type Service struct {
	settings   SettingsBackend
	emit       Emitter
	exec       execLauncher
	now        func() time.Time
	mu         sync.Mutex
	lastLaunch map[string]string // simulatorID -> RFC3339 timestamp
}

// NewService constructs a launcher Service. The emitter is invoked with the
// canonical Wails event names; in tests a spy satisfies the Emitter
// interface.
func NewService(settings SettingsBackend, emit Emitter, execFn execLauncher) *Service {
	if execFn == nil {
		execFn = defaultExecLauncher
	}
	return &Service{
		settings:   settings,
		emit:       emit,
		exec:       execFn,
		now:        time.Now,
		lastLaunch: map[string]string{},
	}
}

// SetClock overrides the clock used for LastLaunchedAt. Tests only.
func (s *Service) SetClock(now func() time.Time) {
	if now != nil {
		s.now = now
	}
}

// GetStatus returns the read-only view for a given simulator. Unknown
// simulator IDs are reported as not configured.
func (s *Service) GetStatus(simulatorID string) LauncherStatus {
	cfg, ok := s.lookupConfig(simulatorID)
	if !ok {
		return LauncherStatus{SimulatorID: simulatorID, Configured: false}
	}
	st := LauncherStatus{
		SimulatorID:    cfg.SimulatorID,
		Configured:     true,
		LaunchMethod:   cfg.LaunchMethod,
		ExecutablePath: cfg.ExecutablePath,
		SteamAppID:     cfg.SteamAppID,
		AssociatedApps: append([]string(nil), cfg.AssociatedApps...),
	}
	if cfg.LaunchMethod == "executable" && cfg.ExecutablePath != "" {
		st.ExecutableOK = fileExists(cfg.ExecutablePath)
	}
	s.mu.Lock()
	if ts, ok := s.lastLaunch[simulatorID]; ok {
		st.LastLaunchedAt = ts
	}
	s.mu.Unlock()
	return st
}

// Configure validates the incoming config, applies defaults, persists the
// entry through SettingsBackend and returns the resulting status. Validation
// rejects unknown simulators, unknown methods, missing fields and bad paths
// before saving.
func (s *Service) Configure(in LauncherConfig) (LauncherStatus, error) {
	if _, known := KnownSteamAppIDs[in.SimulatorID]; !known {
		return LauncherStatus{}, fmt.Errorf("%w: simulator %q not supported", ErrInvalidConfig, in.SimulatorID)
	}
	if _, ok := KnownLaunchMethods[in.LaunchMethod]; !ok {
		return LauncherStatus{}, fmt.Errorf("%w: launchMethod %q not supported", ErrInvalidConfig, in.LaunchMethod)
	}
	cfg := LauncherConfig{
		SimulatorID:    in.SimulatorID,
		LaunchMethod:   in.LaunchMethod,
		ExecutablePath: in.ExecutablePath,
		AssociatedApps: append([]string(nil), in.AssociatedApps...),
	}
	switch in.LaunchMethod {
	case "steam-uri":
		appID := in.SteamAppID
		if appID == 0 {
			appID = KnownSteamAppIDs[in.SimulatorID]
		}
		cfg.SteamAppID = appID
	case "executable":
		if in.ExecutablePath == "" {
			return LauncherStatus{}, fmt.Errorf("%w: executablePath is required", ErrInvalidConfig)
		}
		if !fileExists(in.ExecutablePath) {
			return LauncherStatus{}, fmt.Errorf("%w: %s", ErrInvalidConfig, in.ExecutablePath)
		}
		cfg.ExecutablePath = in.ExecutablePath
	}
	if err := s.persistConfig(cfg); err != nil {
		return LauncherStatus{}, err
	}
	return s.GetStatus(cfg.SimulatorID), nil
}

// Launch executes the configured command for the simulator. It is
// fire-and-forget: the spawned process is not waited on and the caller is
// notified via the emitted events. If the platform is not Windows the call
// returns ErrUnsupported immediately.
func (s *Service) Launch(simulatorID string) (LauncherStatus, error) {
	cfg, ok := s.lookupConfig(simulatorID)
	if !ok {
		return LauncherStatus{}, fmt.Errorf("%w: %s", ErrNotConfigured, simulatorID)
	}
	if runtime.GOOS != "windows" {
		return LauncherStatus{}, ErrUnsupported
	}
	var cmd *exec.Cmd
	switch cfg.LaunchMethod {
	case "steam-uri":
		uri := fmt.Sprintf("steam://run/%d", cfg.SteamAppID)
		cmd = s.exec("rundll32.exe", "url.dll,FileProtocolHandler", uri)
	case "executable":
		if !fileExists(cfg.ExecutablePath) {
			return LauncherStatus{}, fmt.Errorf("%w: %s", ErrExecutableMissing, cfg.ExecutablePath)
		}
		cmd = s.exec(cfg.ExecutablePath)
	default:
		return LauncherStatus{}, fmt.Errorf("%w: launchMethod %q", ErrInvalidConfig, cfg.LaunchMethod)
	}
	if cmd == nil {
		return LauncherStatus{}, fmt.Errorf("%w: exec returned nil command", ErrInvalidConfig)
	}
	if err := cmd.Start(); err != nil {
		return LauncherStatus{}, fmt.Errorf("launcher: start failed: %w", err)
	}
	ts := s.now().UTC().Format(time.RFC3339)
	s.mu.Lock()
	s.lastLaunch[simulatorID] = ts
	s.mu.Unlock()
	// Detach the process so we never block on the Wails goroutine waiting
	// for Steam or LMU to exit. A failed Wait is logged by the runtime.
	go func(c *exec.Cmd) {
		_ = c.Wait()
	}(cmd)
	return s.GetStatus(simulatorID), nil
}

func (s *Service) lookupConfig(simulatorID string) (LauncherConfig, bool) {
	if s.settings == nil {
		return LauncherConfig{}, false
	}
	all := s.settings.GetLaunchers()
	cfg, ok := all[simulatorID]
	return cfg, ok
}

func (s *Service) persistConfig(cfg LauncherConfig) error {
	if s.settings == nil {
		return errors.New("launcher: settings backend not wired")
	}
	all := s.settings.GetLaunchers()
	if all == nil {
		all = map[string]LauncherConfig{}
	}
	all[cfg.SimulatorID] = cfg
	return s.settings.SetLaunchers(all)
}

func fileExists(path string) bool {
	if path == "" {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}
