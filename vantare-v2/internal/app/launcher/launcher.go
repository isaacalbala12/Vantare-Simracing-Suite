// Package launcher is the orchestration service that ties together app
// discovery, the apps registry (detected + manual), the launch-profile CRUD,
// and the chain runner that launches a profile as a cancelable sequence of
// steps. It is a thin delegator: the real logic lives in discovery.go,
// apps.go, profiles.go and chain.go (Fases 1-4). This file only wires them
// and exposes a stable, test-friendly Service surface plus the Wails-style
// event names the frontend depends on.
package launcher

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

// LauncherSettingsBackend is the slice of SettingsService the launcher needs.
// Only the methods actually used are exposed; the production
// *app.SettingsService satisfies it, so no extra glue is required.
type LauncherSettingsBackend interface {
	GetLauncherApps() map[string]app.LauncherAppEntry
	SetLauncherApps(map[string]app.LauncherAppEntry) error
	GetLauncherProfiles() []app.LaunchProfile
	SetLauncherProfiles([]app.LaunchProfile) error
}

// Service is the launcher orchestrator. It owns the ChainRunner and delegates
// every other operation to the package-level helpers in apps.go / profiles.go
// / discovery.go. It is safe to use from multiple goroutines because the only
// shared mutable state is wrapped by ChainRunner (its own mutex) and every
// LauncherSettingsBackend is the slice of SettingsService the launcher needs.
type Service struct {
	settings    LauncherSettingsBackend
	emit        Emitter
	chain       *ChainRunner
	revision    atomic.Uint64
	activeMu    sync.Mutex
	active      map[string]LauncherActiveChain
	discoveryMu sync.RWMutex
	discovery   LauncherDiscovery
}

type serviceEmitter struct {
	service    *Service
	downstream Emitter
}

func (e serviceEmitter) Emit(name string, data any) {
	e.service.recordChainEvent(name, data)
	e.downstream.Emit(name, data)
	if name == "launcher:chain:step" || name == "launcher:chain:done" || name == "launcher:chain:error" {
		e.downstream.Emit("launcher:snapshot", e.service.Snapshot())
	}
}

// NewService builds the orchestrator. execFn defaults to defaultExecLauncher
// when nil. The ChainRunner it creates reads apps lazily from the settings
// backend so a discovery/add/remove performed after construction is reflected
// in the next launch.
func NewService(settings LauncherSettingsBackend, emit Emitter, execFn execLauncher) *Service {
	if execFn == nil {
		execFn = defaultExecLauncher
	}
	s := &Service{
		settings:  settings,
		emit:      emit,
		active:    make(map[string]LauncherActiveChain),
		discovery: LauncherDiscovery{},
	}
	s.chain = NewChainRunner(s.settings, serviceEmitter{service: s, downstream: emit}, execFn)
	return s
}

func (s *Service) recordChainEvent(name string, data any) {
	progress, ok := data.(ChainProgress)
	if !ok {
		return
	}
	s.activeMu.Lock()
	defer s.activeMu.Unlock()
	chain := s.active[progress.ProfileID]
	if chain.ProfileID == "" {
		chain = LauncherActiveChain{ProfileID: progress.ProfileID, Status: "running", StartedAt: time.UnixMilli(progress.StartedAt)}
	}
	if name == "launcher:chain:done" {
		if progress.Success {
			chain.Status = "done"
		} else {
			chain.Status = "failed"
		}
	} else if name == "launcher:chain:error" {
		chain.Status = "failed"
	} else {
		chain.Status = progress.Status
		for len(chain.Steps) <= progress.StepIndex {
			chain.Steps = append(chain.Steps, LauncherActiveStep{})
		}
		chain.Steps[progress.StepIndex] = LauncherActiveStep{AppID: progress.AppID, Status: progress.Status, PID: progress.Pid, Message: progress.Message}
	}
	s.active[progress.ProfileID] = chain
}

// Settings returns the backend the orchestrator was constructed with. Handlers
// use it to read the live app set when building a snapshot without
// coupling to the concrete *app.SettingsService type.
func (s *Service) Settings() LauncherSettingsBackend { return s.settings }

// Snapshot builds the complete launcher payload from the settings backend.
// It is the only aggregate construction point for the frontend migration.
func (s *Service) Snapshot() LauncherSnapshot {
	appsMap := s.settings.GetLauncherApps()
	apps := make([]app.LauncherAppEntry, 0, len(appsMap))
	for _, entry := range appsMap {
		apps = append(apps, entry)
	}
	sortApps(apps)
	apps = EnrichAppsWithIcons(apps)

	vantareProfiles := make([]app.LaunchProfile, 0)
	userProfiles := make([]app.LaunchProfile, 0)
	for _, profile := range s.settings.GetLauncherProfiles() {
		if isOfficialProfile(profile.ID) {
			vantareProfiles = append(vantareProfiles, profile)
		} else {
			userProfiles = append(userProfiles, profile)
		}
	}
	sortProfiles(vantareProfiles)
	sortProfiles(userProfiles)

	s.activeMu.Lock()
	activeChains := make([]LauncherActiveChain, 0, len(s.active))
	for _, chain := range s.active {
		chain.Steps = append([]LauncherActiveStep(nil), chain.Steps...)
		activeChains = append(activeChains, chain)
	}
	s.activeMu.Unlock()
	sort.SliceStable(activeChains, func(i, j int) bool { return activeChains[i].ProfileID < activeChains[j].ProfileID })

	s.discoveryMu.RLock()
	discovery := s.discovery
	s.discoveryMu.RUnlock()

	return LauncherSnapshot{
		Revision:        s.revision.Add(1),
		Apps:            apps,
		VantareProfiles: vantareProfiles,
		UserProfiles:    userProfiles,
		ActiveChains:    activeChains,
		Discovery:       discovery,
	}
}

// BeginDiscovery marks the start of a discovery pass so the UI can keep the
// first-run assistant closed until the resulting snapshot is complete.
func (s *Service) BeginDiscovery() {
	s.discoveryMu.Lock()
	s.discovery = LauncherDiscovery{Scanning: true}
	s.discoveryMu.Unlock()
}

// DiscoverApps detects installed apps, merges them with the persisted set
// (preserving manual apps) and persists the result. It is named DiscoverApps
// rather than Discover to avoid a name collision with the package-level
// Discover() helper in discovery.go. The caller emits the canonical snapshot.
func (s *Service) DiscoverApps() ([]app.LauncherAppEntry, error) {
	s.BeginDiscovery()
	detected := Discover()
	merged := MergeAppsWithDiscovered(s.settings.GetLauncherApps(), detected)
	if err := s.settings.SetLauncherApps(merged); err != nil {
		message := err.Error()
		s.discoveryMu.Lock()
		s.discovery = LauncherDiscovery{Error: &message}
		s.discoveryMu.Unlock()
		return nil, err
	}
	// Convert map to slice for the legacy return value.
	appsList := make([]app.LauncherAppEntry, 0, len(merged))
	for _, v := range merged {
		appsList = append(appsList, v)
	}
	// Enrich each app entry with the icon data URI so the frontend displays it
	// immediately, without a separate round-trip event.
	for i, a := range appsList {
		appsList[i].IconURL = GetAppIconForAppBase64(a.ID, a.ExecutablePath)
	}
	now := time.Now()
	s.discoveryMu.Lock()
	s.discovery = LauncherDiscovery{LastScanAt: &now}
	s.discoveryMu.Unlock()
	return appsList, nil
}

// EnrichAppsWithIcons sets each app entry's IconURL to a data URI extracted
// from its executable or desktop shortcut (.lnk). This lets the frontend
// display the icon immediately without a round-trip event.
func EnrichAppsWithIcons(apps []app.LauncherAppEntry) []app.LauncherAppEntry {
	for i, a := range apps {
		apps[i].IconURL = GetAppIconForAppBase64(a.ID, a.ExecutablePath)
	}
	return apps
}

// AddManualApp delegates to apps.go.
func (s *Service) AddManualApp(entry app.LauncherAppEntry) error {
	return AddManualApp(s.settings, entry)
}

// RemoveApp delegates to apps.go.
func (s *Service) RemoveApp(id string) error {
	return RemoveApp(s.settings, id)
}

// ListProfiles delegates to profiles.go.
func (s *Service) ListProfiles() []app.LaunchProfile {
	return ListProfiles(s.settings)
}

// SaveProfile delegates to profiles.go.
func (s *Service) SaveProfile(profile app.LaunchProfile) error {
	return SaveProfile(s.settings, profile)
}

// DeleteProfile delegates to profiles.go.
func (s *Service) DeleteProfile(id string) error {
	return DeleteProfile(s.settings, id)
}

// DuplicateProfile delegates to profiles.go. Use this to copy an existing
// profile into a new one with a new ID and display name; the steps are cloned
// so the copy can be edited independently.
func (s *Service) DuplicateProfile(id, newID, newName string) error {
	return DuplicateProfile(s.settings, id, newID, newName)
}

// LaunchProfile starts the launch chain for the given profile. It looks up the
// profile; per contract only chain progress events are emitted by the runner.
// Returns ErrProfileNotFound when there is no profile with the given ID. The
// chain runs on a goroutine (StartChain), so this call returns immediately.
func (s *Service) LaunchProfile(ctx context.Context, profileID string) error {
	profiles := s.settings.GetLauncherProfiles()
	var profile *app.LaunchProfile
	for i := range profiles {
		if profiles[i].ID == profileID {
			profile = &profiles[i]
			break
		}
	}
	if profile == nil {
		return fmt.Errorf("%w: %s", ErrProfileNotFound, profileID)
	}
	s.chain.StartChain(ctx, *profile)
	return nil
}

// CancelChain cancels the active launch chain for a profile, if any.
func (s *Service) CancelChain(profileID string) bool {
	cancelled := s.chain.CancelChain(profileID)
	if cancelled {
		s.activeMu.Lock()
		if chain, ok := s.active[profileID]; ok {
			chain.Status = "stopped"
			s.active[profileID] = chain
		}
		s.activeMu.Unlock()
		s.emit.Emit("launcher:snapshot", s.Snapshot())
	}
	return cancelled
}

// CancelAll cancels every active launch chain. Used by the Wails shutdown hook
// to ensure no orphaned processes are left behind when the Hub closes.
func (s *Service) CancelAll() {
	s.chain.CancelAll()
}
