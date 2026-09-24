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
	"errors"
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

// defaultChainCleanupDelay keeps a finished chain visible in snapshots for a
// short window (so the UI can show the outcome) and then drops it, so
// ActiveChains never grows without bound across a session.
const defaultChainCleanupDelay = 30 * time.Second

// Service is the launcher orchestrator. It owns the ChainRunner and delegates
// every other operation to the package-level helpers in apps.go / profiles.go
// / discovery.go. It is safe to use from multiple goroutines because the only
// shared mutable state is wrapped by ChainRunner (its own mutex) and every
// LauncherSettingsBackend is the slice of SettingsService the launcher needs.
type Service struct {
	settings              LauncherSettingsBackend
	emit                  Emitter
	chain                 *ChainRunner
	launchMu              sync.Mutex
	revision              atomic.Uint64
	activeMu              sync.Mutex
	active                map[string]LauncherActiveChain
	owned                 map[int]ownedProcess
	retryStepIndices      map[string][]int
	chainCleanupDelay     time.Duration
	chainCleanupTimers    map[string]*time.Timer
	discoveryMu           sync.RWMutex
	discovery             LauncherDiscovery
	discoveryProgressMu   sync.Mutex
	lastDiscoveryProgress int
	discoveryRunMu        sync.Mutex
	discover              func() map[string]app.LauncherAppEntry
}

type ownedProcess struct {
	appID     string
	profileID string
	identity  ProcessIdentity
}

type serviceEmitter struct {
	service    *Service
	downstream Emitter
}

func (e serviceEmitter) Emit(name string, data any) {
	if name == "launcher:chain:step" {
		if progress, ok := data.(ChainProgress); ok {
			e.service.activeMu.Lock()
			indices := e.service.retryStepIndices[progress.ProfileID]
			if progress.StepIndex >= 0 && progress.StepIndex < len(indices) {
				progress.StepIndex = indices[progress.StepIndex]
			}
			e.service.activeMu.Unlock()
			data = progress
		}
	}
	e.service.recordChainEvent(name, data)
	e.downstream.Emit(name, data)
	if name == "launcher:chain:step" || name == "launcher:chain:done" || name == "launcher:chain:error" {
		e.downstream.Emit("launcher:snapshot", e.service.Snapshot())
	}
	if name == "launcher:chain:done" {
		e.service.activeMu.Lock()
		if progress, ok := data.(ChainProgress); ok {
			delete(e.service.retryStepIndices, progress.ProfileID)
		}
		e.service.activeMu.Unlock()
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
		settings:           settings,
		emit:               emit,
		active:             make(map[string]LauncherActiveChain),
		owned:              make(map[int]ownedProcess),
		retryStepIndices:   make(map[string][]int),
		discovery:          LauncherDiscovery{},
		chainCleanupDelay:  defaultChainCleanupDelay,
		chainCleanupTimers: make(map[string]*time.Timer),
		discover:           Discover,
	}
	s.chain = NewChainRunner(s.settings, serviceEmitter{service: s, downstream: emit}, execFn)
	return s
}

// EnableRunningProcessDetection connects Windows process discovery to profile
// execution. It is called before the production service starts any chain.
func (s *Service) EnableRunningProcessDetection() {
	s.chain.findRunning = FindRunningByExecutable
	s.chain.ownedProcess = s.OwnedProcessIdentity
	s.chain.closeOwned = func(ctx context.Context, appID string, identity ProcessIdentity) error {
		if err := CloseProcess(ctx, DefaultProcessInspector(), identity); err != nil {
			return err
		}
		s.ForgetStartedProcess(appID, identity.PID)
		return nil
	}
}

// SetDiscoverFunc overrides the discovery source used by DiscoverApps. A nil
// value restores the default (Discover). It exists only to let handlers stay
// deterministic in tests without touching the Windows registry or disk.
func (s *Service) SetDiscoverFunc(fn func() map[string]app.LauncherAppEntry) {
	if fn == nil {
		fn = Discover
	}
	s.discover = fn
}

func (s *Service) recordChainEvent(name string, data any) {
	progress, ok := data.(ChainProgress)
	if !ok {
		return
	}
	var started *ownedProcess
	if name == "launcher:chain:step" && progress.Status == "done" && progress.Pid > 0 && progress.CreationTime != 0 {
		if entry, exists := s.settings.GetLauncherApps()[progress.AppID]; exists && entry.LaunchMethod == "executable" &&
			entry.ExecutablePath != "" && NormalizeExecutablePath(entry.ExecutablePath) == NormalizeExecutablePath(progress.ProcessPath) {
			started = &ownedProcess{appID: progress.AppID, profileID: progress.ProfileID, identity: ProcessIdentity{
				PID: progress.Pid, ExecutablePath: progress.ProcessPath, CreationTime: progress.CreationTime,
			}}
		}
	}
	terminal := false
	s.activeMu.Lock()
	if started != nil {
		s.owned[progress.Pid] = *started
	}
	chain := s.active[progress.ProfileID]
	if name == "launcher:chain:step" && (chain.Status == "done" || chain.Status == "failed") {
		if _, retry := s.retryStepIndices[progress.ProfileID]; !retry {
			chain = LauncherActiveChain{}
		}
	}
	if chain.ProfileID == "" {
		chain = LauncherActiveChain{ProfileID: progress.ProfileID, Status: "running", StartedAt: time.UnixMilli(progress.StartedAt)}
	}
	switch name {
	case "launcher:chain:done":
		terminal = true
		if progress.Status == "stopped" || chain.Status == "stopped" {
			chain.Status = "stopped"
		} else if progress.Success {
			chain.Status = "done"
		} else {
			chain.Status = "failed"
		}
	case "launcher:chain:error":
		terminal = true
		chain.Status = "failed"
	default:
		if chain.Status != "stopped" {
			chain.Status = "running"
		}
		for len(chain.Steps) <= progress.StepIndex {
			chain.Steps = append(chain.Steps, LauncherActiveStep{})
		}
		chain.Steps[progress.StepIndex] = LauncherActiveStep{AppID: progress.AppID, Status: progress.Status, PID: progress.Pid, Message: progress.Message}
	}
	s.active[progress.ProfileID] = chain
	s.activeMu.Unlock()
	if terminal {
		s.scheduleChainCleanup(progress.ProfileID)
	}
}

// scheduleChainCleanup drops a terminal chain from snapshots after
// chainCleanupDelay. A new chain for the same profile cancels the pending
// timer, and the status guard means a timer that fires during a relaunch
// leaves the running chain untouched.
func (s *Service) scheduleChainCleanup(profileID string) {
	s.activeMu.Lock()
	if timer, ok := s.chainCleanupTimers[profileID]; ok {
		timer.Stop()
		delete(s.chainCleanupTimers, profileID)
	}
	s.chainCleanupTimers[profileID] = time.AfterFunc(s.chainCleanupDelay, func() {
		s.activeMu.Lock()
		chain, ok := s.active[profileID]
		if !ok || !isTerminalChainStatus(chain.Status) {
			s.activeMu.Unlock()
			return
		}
		delete(s.active, profileID)
		delete(s.chainCleanupTimers, profileID)
		s.activeMu.Unlock()
		s.emit.Emit("launcher:snapshot", s.Snapshot())
	})
	s.activeMu.Unlock()
}

func isTerminalChainStatus(status string) bool {
	switch status {
	case "done", "failed", "stopped", "error":
		return true
	}
	return false
}

// Settings returns the backend the orchestrator was constructed with. Handlers
// use it to read the live app set when building a snapshot without
// coupling to the concrete *app.SettingsService type.
func (s *Service) Settings() LauncherSettingsBackend { return s.settings }

// OwnedProcessIdentity returns a verified executable that this service launched
// and successfully probed during the current session. Snapshot cleanup does
// not erase this authority; close/restart must still recheck the live process.
func (s *Service) OwnedProcessIdentity(appID string, pid int) (ProcessIdentity, bool) {
	if pid <= 0 {
		return ProcessIdentity{}, false
	}
	s.activeMu.Lock()
	defer s.activeMu.Unlock()
	owned, ok := s.owned[pid]
	if !ok || owned.appID != appID {
		return ProcessIdentity{}, false
	}
	return owned.identity, true
}

// RememberStartedProcess records a confirmed process created by an explicit
// restart. A changed app path or incomplete identity cannot grant close rights.
func (s *Service) RememberStartedProcess(appID string, identity ProcessIdentity) bool {
	if identity.PID <= 0 || identity.CreationTime == 0 || identity.ExecutablePath == "" {
		return false
	}
	entry, ok := s.settings.GetLauncherApps()[appID]
	if !ok || entry.LaunchMethod != "executable" || NormalizeExecutablePath(entry.ExecutablePath) != NormalizeExecutablePath(identity.ExecutablePath) {
		return false
	}
	s.activeMu.Lock()
	s.owned[identity.PID] = ownedProcess{appID: appID, identity: identity}
	s.activeMu.Unlock()
	return true
}

// TransferStartedProcess keeps a profile's ownership when its app is
// explicitly restarted. The old PID loses authority even if observation of
// the replacement fails.
func (s *Service) TransferStartedProcess(appID string, oldPID int, replacement ProcessIdentity) bool {
	entry, ok := s.settings.GetLauncherApps()[appID]
	valid := ok && entry.LaunchMethod == "executable" && replacement.PID > 0 && replacement.CreationTime != 0 &&
		replacement.ExecutablePath != "" && NormalizeExecutablePath(entry.ExecutablePath) == NormalizeExecutablePath(replacement.ExecutablePath)
	s.activeMu.Lock()
	defer s.activeMu.Unlock()
	previous, owned := s.owned[oldPID]
	if !owned || previous.appID != appID {
		return false
	}
	delete(s.owned, oldPID)
	if !valid {
		return false
	}
	s.owned[replacement.PID] = ownedProcess{appID: appID, profileID: previous.profileID, identity: replacement}
	return true
}

// ForgetStartedProcess revokes process control after a successful close/restart.
func (s *Service) ForgetStartedProcess(appID string, pid int) {
	s.activeMu.Lock()
	defer s.activeMu.Unlock()
	if owned, ok := s.owned[pid]; ok && owned.appID == appID {
		delete(s.owned, pid)
	}
}

// OwnsStartedProcess reports only identities observed during this session.
func (s *Service) OwnsStartedProcess(appID string, pid int) bool {
	_, ok := s.OwnedProcessIdentity(appID, pid)
	return ok
}

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
	s.discoveryProgressMu.Lock()
	s.lastDiscoveryProgress = 0
	s.discoveryProgressMu.Unlock()
	s.discoveryMu.Lock()
	s.discovery = LauncherDiscovery{Scanning: true}
	s.discoveryMu.Unlock()
}

var ErrDiscoveryInProgress = errors.New("launcher discovery already in progress")

func (s *Service) emitDiscoveryProgress(progress int, phase LauncherDiscoveryPhase, scanning bool, err error) {
	s.discoveryProgressMu.Lock()
	defer s.discoveryProgressMu.Unlock()
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}
	if progress < s.lastDiscoveryProgress {
		progress = s.lastDiscoveryProgress
	} else {
		s.lastDiscoveryProgress = progress
	}
	var message *string
	if err != nil {
		value := err.Error()
		message = &value
	}
	s.emit.Emit("launcher:discovery:progress", LauncherDiscoveryProgress{Scanning: scanning, Progress: progress, Phase: phase, Error: message})
}

// DiscoverApps detects installed apps, merges them with the persisted set
// (preserving manual apps) and persists the result. It is named DiscoverApps
// rather than Discover to avoid a name collision with the package-level
// Discover() helper in discovery.go. The caller emits the canonical snapshot.
func (s *Service) DiscoverApps() ([]app.LauncherAppEntry, error) {
	if !s.discoveryRunMu.TryLock() {
		return nil, ErrDiscoveryInProgress
	}
	defer s.discoveryRunMu.Unlock()
	s.BeginDiscovery()
	s.emitDiscoveryProgress(0, DiscoveryStarting, true, nil)
	// Drop the cached shortcut index so a rescan sees apps installed since the
	// last scan instead of replaying the first scan's view of the disk.
	resetShortcutIndex()
	discoverFn := s.discover
	if discoverFn == nil {
		discoverFn = Discover
	}
	detected := discoverFn()
	s.emitDiscoveryProgress(15, DiscoveryDiscovering, true, nil)
	merged := MergeAppsWithDiscovered(s.settings.GetLauncherApps(), detected)
	s.emitDiscoveryProgress(55, DiscoveryMerging, true, nil)
	if err := s.settings.SetLauncherApps(merged); err != nil {
		message := err.Error()
		s.discoveryMu.Lock()
		s.discovery = LauncherDiscovery{Error: &message}
		s.discoveryMu.Unlock()
		s.emitDiscoveryProgress(55, DiscoveryError, false, err)
		return nil, err
	}
	// Convert map to slice for the legacy return value.
	appsList := make([]app.LauncherAppEntry, 0, len(merged))
	for _, v := range merged {
		appsList = append(appsList, v)
	}
	// Enrich each app entry with the icon data URI so the frontend displays it
	// immediately, without a separate round-trip event. Extraction runs in
	// parallel: each icon resolves COM work on its own locked thread, and the
	// shortcut resolves serialize on lnkMu, so a bounded worker pool is safe.
	s.emitDiscoveryProgress(75, DiscoveryResolvingIcons, true, nil)
	const iconWorkers = 4
	var (
		wg        sync.WaitGroup
		completed atomic.Int32
	)
	for i, a := range appsList {
		wg.Add(1)
		go func(i int, a app.LauncherAppEntry) {
			defer wg.Done()
			appsList[i].IconURL = GetAppIconForAppBase64(a.ID, a.ExecutablePath)
			// Report per app: icon extraction is the longest phase, and a
			// single emit at 75% left the bar parked there for its whole
			// duration. The completed counter keeps progress monotonic even
			// though apps finish out of order.
			s.emitDiscoveryProgress(75+(25*int(completed.Add(1)))/len(appsList), DiscoveryResolvingIcons, true, nil)
		}(i, a)
		if (i+1)%iconWorkers == 0 {
			wg.Wait()
		}
	}
	wg.Wait()
	// Persist the resolved icons and the shortcut index once, after the whole
	// phase, so the next process session skips the COM pipeline entirely.
	FlushIconDiskCache()
	now := time.Now()
	s.discoveryMu.Lock()
	s.discovery = LauncherDiscovery{LastScanAt: &now}
	s.discoveryMu.Unlock()
	s.emitDiscoveryProgress(100, DiscoveryComplete, false, nil)
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

// AddCustomApp delegates to apps.go. It returns the derived entry so the
// caller can name it in an event without re-deriving the ID.
func (s *Service) AddCustomApp(displayName, executablePath string) (app.LauncherAppEntry, error) {
	return AddCustomApp(s.settings, displayName, executablePath)
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
	s.launchMu.Lock()
	defer s.launchMu.Unlock()
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
	if len(profile.Steps) == 0 {
		return fmt.Errorf("%w: profile has no steps", ErrInvalidConfig)
	}
	copy := *profile
	copy.Steps = append([]app.LaunchStep(nil), profile.Steps...)
	copy.Policy = app.NormalizeLaunchPolicy(profile.Policy)
	s.activeMu.Lock()
	previous, hadPrevious := s.retryStepIndices[profileID]
	delete(s.retryStepIndices, profileID)
	s.activeMu.Unlock()
	if err := s.chain.StartChain(ctx, copy); err != nil {
		s.activeMu.Lock()
		if hadPrevious {
			s.retryStepIndices[profileID] = previous
		}
		s.activeMu.Unlock()
		return err
	}
	return nil
}

// RetryFailedProfile retries failed and unattempted steps from the most recent
// failed chain. Completed steps are never launched a second time by this action.
func (s *Service) RetryFailedProfile(ctx context.Context, profileID string) error {
	s.launchMu.Lock()
	defer s.launchMu.Unlock()
	var profile *app.LaunchProfile
	for _, candidate := range s.settings.GetLauncherProfiles() {
		if candidate.ID == profileID {
			copy := candidate
			profile = &copy
			break
		}
	}
	if profile == nil {
		return fmt.Errorf("%w: %s", ErrProfileNotFound, profileID)
	}
	s.activeMu.Lock()
	completed, ok := s.active[profileID]
	completed.Steps = append([]LauncherActiveStep(nil), completed.Steps...)
	s.activeMu.Unlock()
	if !ok {
		return fmt.Errorf("%w: no recent chain for retry", ErrInvalidConfig)
	}
	retry, indices, err := retryProfile(*profile, completed)
	if err != nil {
		return err
	}
	s.activeMu.Lock()
	previous, hadPrevious := s.retryStepIndices[profileID]
	s.retryStepIndices[profileID] = indices
	s.activeMu.Unlock()
	if err := s.chain.StartChain(ctx, retry); err != nil {
		s.activeMu.Lock()
		if hadPrevious {
			s.retryStepIndices[profileID] = previous
		} else {
			delete(s.retryStepIndices, profileID)
		}
		s.activeMu.Unlock()
		return err
	}
	return nil
}

func (s *Service) ResolveDecision(id, action string, remember bool) (DecisionRequest, bool, error) {
	remembered := false
	request, err := s.chain.resolveDecisionWith(id, action, func(request DecisionRequest) error {
		if !remember || (request.Kind != "failure" && request.Kind != "alreadyRunning" && request.Kind != "cancel") || action == "cancel" {
			return nil
		}
		for _, profile := range s.settings.GetLauncherProfiles() {
			if profile.ID != request.ProfileID {
				continue
			}
			profile.Policy = app.NormalizeLaunchPolicy(profile.Policy)
			if request.Kind == "failure" {
				if action == "continue" {
					profile.Policy.Failure = app.FailureContinue
				} else {
					profile.Policy.Failure = app.FailureStop
				}
			} else if request.Kind == "cancel" {
				if action == "close-started" {
					profile.Policy.Cancel = app.CancelCloseStarted
				} else {
					profile.Policy.Cancel = app.CancelLeave
				}
			} else if action == "reuse" {
				profile.Policy.AlreadyRunning = app.AlreadyRunningReuse
			} else {
				profile.Policy.AlreadyRunning = app.AlreadyRunningRestart
			}
			if err := s.SaveProfile(profile); err != nil {
				return err
			}
			remembered = true
			return nil
		}
		return fmt.Errorf("%w: %s", ErrProfileNotFound, request.ProfileID)
	})
	return request, remembered, err
}

func retryProfile(profile app.LaunchProfile, completed LauncherActiveChain) (app.LaunchProfile, []int, error) {
	if completed.ProfileID != profile.ID || completed.Status != "failed" {
		return app.LaunchProfile{}, nil, fmt.Errorf("%w: retry requires a failed chain", ErrInvalidConfig)
	}
	retry := profile
	retry.Steps = nil
	retry.Policy = app.NormalizeLaunchPolicy(profile.Policy)
	indices := make([]int, 0, len(profile.Steps))
	for i, step := range profile.Steps {
		if i < len(completed.Steps) && completed.Steps[i].AppID == step.AppID && completed.Steps[i].Status == "done" {
			continue
		}
		if len(retry.Steps) == 0 && i > 0 {
			retry.Policy.FirstStepDelay = step.Delay
		}
		retry.Steps = append(retry.Steps, step)
		indices = append(indices, i)
	}
	if len(retry.Steps) == 0 {
		return app.LaunchProfile{}, nil, fmt.Errorf("%w: no pending steps to retry", ErrInvalidConfig)
	}
	return retry, indices, nil
}

// CancelChain cancels the active launch chain for a profile, if any.
func (s *Service) CancelChain(profileID string) bool {
	done, cancelled := s.chain.CancelChainAndWait(profileID)
	if cancelled {
		// Windows process creation times are FILETIME ticks (100 ns since 1601).
		// This boundary prevents an answer to an old cancel prompt from closing
		// a new run of the same profile.
		cutoff := uint64(time.Now().UnixNano()/100) + 116444736000000000
		policy := app.DefaultLaunchPolicy()
		for _, profile := range s.settings.GetLauncherProfiles() {
			if profile.ID == profileID {
				policy = app.NormalizeLaunchPolicy(profile.Policy)
				break
			}
		}
		s.activeMu.Lock()
		if chain, ok := s.active[profileID]; ok {
			chain.Status = "stopped"
			s.active[profileID] = chain
		}
		s.activeMu.Unlock()
		s.scheduleChainCleanup(profileID)
		s.emit.Emit("launcher:snapshot", s.Snapshot())
		go func() {
			<-done
			s.applyCancelPolicy(profileID, policy.Cancel, cutoff)
		}()
	}
	return cancelled
}

func (s *Service) ownedForProfile(profileID string) []ownedProcess {
	s.activeMu.Lock()
	defer s.activeMu.Unlock()
	processes := make([]ownedProcess, 0)
	for _, owned := range s.owned {
		if owned.profileID == profileID {
			processes = append(processes, owned)
		}
	}
	return processes
}

func (s *Service) applyCancelPolicy(profileID string, policy app.CancelPolicy, cutoff uint64) {
	processes := make([]ownedProcess, 0)
	for _, owned := range s.ownedForProfile(profileID) {
		if owned.identity.CreationTime < cutoff {
			processes = append(processes, owned)
		}
	}
	if s.chain.closeOwned == nil || len(processes) == 0 || policy == app.CancelLeave {
		return
	}
	if policy == app.CancelAsk {
		action := s.chain.requestDecision(context.Background(), profileID, "", "cancel", "¿Cerrar las aplicaciones iniciadas por este perfil?", []string{"leave", "close-started"})
		if action != "close-started" {
			return
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	for _, owned := range processes {
		if err := s.chain.closeOwned(ctx, owned.appID, owned.identity); err != nil {
			s.emit.Emit("launcher:error", map[string]any{"message": fmt.Sprintf("No se pudo cerrar %s: %v", owned.appID, err)})
		}
	}
}

// CancelAll cancels every active launch chain. Used by the Wails shutdown hook
// to ensure no orphaned processes are left behind when the Hub closes.
func (s *Service) CancelAll() {
	s.chain.CancelAll()
}
