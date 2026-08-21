package main

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/engineer/commands"
	"github.com/vantare/overlays/v2/internal/engineer/ptt"
	"github.com/vantare/overlays/v2/internal/engineer/voiceinput"
)

var errEngineerVoiceBindingConflict = errors.New("engineer voice-input PTT binding conflicts with configured hotkeys")

type engineerVoiceInputDependencies struct {
	readerFactory func() ptt.Reader
	hostFactory   func() voiceinput.Host
	queryPort     commands.QueryPort
	publisher     voiceinput.TurnPublisher
	lifecycle     voiceinput.LifecycleProvider
}

type engineerVoiceInputLane struct {
	runtime *voiceinput.Runtime
	gate    *engineerVoiceAvailabilityGate
	binding ptt.Binding

	mu                  sync.Mutex
	settingsAssignments []ptt.Assignment
	profileAssignments  map[string]ptt.Assignment
	conflicted          bool
	conflictErrors      uint64
}

type engineerVoiceAvailabilityGate struct {
	mu        sync.RWMutex
	available bool
}

func (gate *engineerVoiceAvailabilityGate) setAvailable(available bool) {
	gate.mu.Lock()
	gate.available = available
	gate.mu.Unlock()
}

func (gate *engineerVoiceAvailabilityGate) isAvailable() bool {
	gate.mu.RLock()
	defer gate.mu.RUnlock()
	return gate.available
}

type engineerVoiceGatedReader struct {
	gate   *engineerVoiceAvailabilityGate
	reader ptt.Reader
}

func (reader *engineerVoiceGatedReader) Read(ctx context.Context, binding ptt.Binding) (ptt.DeviceSample, error) {
	if !reader.gate.isAvailable() {
		return ptt.DeviceSample{}, nil
	}
	return reader.reader.Read(ctx, binding)
}

type engineerVoiceGatedHost struct {
	gate *engineerVoiceAvailabilityGate
	host voiceinput.Host
}

func (host *engineerVoiceGatedHost) Start(ctx context.Context) error { return host.host.Start(ctx) }
func (host *engineerVoiceGatedHost) Begin(ctx context.Context, capture voiceinput.Capture) error {
	if !host.gate.isAvailable() {
		return voiceinput.ErrHostUnavailable
	}
	return host.host.Begin(ctx, capture)
}
func (host *engineerVoiceGatedHost) Finish(ctx context.Context, capture voiceinput.Capture) ([]byte, error) {
	if !host.gate.isAvailable() {
		return nil, voiceinput.ErrHostUnavailable
	}
	return host.host.Finish(ctx, capture)
}
func (host *engineerVoiceGatedHost) Cancel(ctx context.Context, capture voiceinput.Capture) error {
	return host.host.Cancel(ctx, capture)
}
func (host *engineerVoiceGatedHost) Stop(ctx context.Context) error { return host.host.Stop(ctx) }
func (host *engineerVoiceGatedHost) WakeEvents() <-chan string      { return host.host.WakeEvents() }

func composeEngineerVoiceInput(enabled bool, settings *app.AppSettings, locale commands.Locale, dependencies engineerVoiceInputDependencies) (*engineerVoiceInputLane, error) {
	if !enabled {
		return nil, nil
	}
	binding := ptt.Binding{DeviceKind: ptt.DeviceKeyboard, DeviceID: "keyboard-0", Control: "f24", Scope: ptt.ScopeGlobal}
	assignments := engineerPTTAssignments(settings)
	if err := validateEngineerVoiceBinding(binding, assignments); err != nil {
		return nil, err
	}
	if dependencies.readerFactory == nil || dependencies.hostFactory == nil {
		return nil, errors.New("engineer voice-input factories are required")
	}
	gate := &engineerVoiceAvailabilityGate{available: true}
	runtime, err := voiceinput.New(voiceinput.Config{
		Enabled: true, Locale: locale, Binding: binding,
		Reader: &engineerVoiceGatedReader{gate: gate, reader: dependencies.readerFactory()},
		Host:   &engineerVoiceGatedHost{gate: gate, host: dependencies.hostFactory()}, QueryPort: dependencies.queryPort,
		Publisher: dependencies.publisher, Lifecycle: dependencies.lifecycle,
		MaxWindow: voiceinput.DefaultMaxWindow,
	})
	if err != nil {
		return nil, err
	}
	return &engineerVoiceInputLane{
		runtime: runtime, gate: gate, binding: binding,
		settingsAssignments: assignments, profileAssignments: make(map[string]ptt.Assignment),
	}, nil
}

func (lane *engineerVoiceInputLane) Start(ctx context.Context) error {
	return lane.runtime.Start(ctx)
}

func (lane *engineerVoiceInputLane) Stop(ctx context.Context) error {
	return lane.runtime.Stop(ctx)
}

func (lane *engineerVoiceInputLane) Health() voiceinput.Health {
	health := lane.runtime.Health()
	lane.mu.Lock()
	defer lane.mu.Unlock()
	if lane.conflicted {
		health.State = voiceinput.StateUnavailable
		health.Errors += lane.conflictErrors
	}
	return health
}

func (lane *engineerVoiceInputLane) revalidate(settings *app.AppSettings, profileID, combo string, profileChanged bool) error {
	if lane == nil {
		return nil
	}
	lane.mu.Lock()
	if settings != nil {
		lane.settingsAssignments = engineerPTTAssignments(settings)
	}
	if profileChanged {
		if binding, ok := keyboardBindingFromHotkey(combo); ok && strings.TrimSpace(combo) != "" {
			lane.profileAssignments[profileID] = ptt.Assignment{Name: "launcher-profile-live", Binding: binding}
		} else {
			delete(lane.profileAssignments, profileID)
		}
	}
	assignments := append([]ptt.Assignment(nil), lane.settingsAssignments...)
	profileIDs := make([]string, 0, len(lane.profileAssignments))
	for id := range lane.profileAssignments {
		profileIDs = append(profileIDs, id)
	}
	sort.Strings(profileIDs)
	for _, id := range profileIDs {
		assignments = append(assignments, lane.profileAssignments[id])
	}
	err := validateEngineerVoiceBinding(lane.binding, assignments)
	conflicted := err != nil
	if conflicted && !lane.conflicted {
		lane.conflictErrors++
	}
	lane.conflicted = conflicted
	lane.gate.setAvailable(!conflicted)
	lane.mu.Unlock()
	return err
}

func revalidateEngineerVoiceSettings(lane *engineerVoiceInputLane, settings *app.AppSettings) error {
	return lane.revalidate(settings, "", "", false)
}

func revalidateEngineerVoiceProfile(lane *engineerVoiceInputLane, settings *app.AppSettings, profileID, combo string) error {
	return lane.revalidate(settings, profileID, combo, true)
}

func validateEngineerVoiceBinding(binding ptt.Binding, assignments []ptt.Assignment) error {
	conflicts, err := ptt.FindBindingConflicts(binding, assignments)
	if err != nil {
		return fmt.Errorf("validate engineer voice-input PTT binding: %w", err)
	}
	if len(conflicts) == 0 {
		return nil
	}
	names := make([]string, len(conflicts))
	for index, conflict := range conflicts {
		names[index] = conflict.AssignmentName
	}
	return fmt.Errorf("%w: %s", errEngineerVoiceBindingConflict, strings.Join(names, ", "))
}

func engineerPTTAssignments(settings *app.AppSettings) []ptt.Assignment {
	if settings == nil {
		return nil
	}
	assignments := make([]ptt.Assignment, 0, len(settings.Hotkeys)+len(settings.LauncherProfiles))
	hotkeyNames := make([]string, 0, len(settings.Hotkeys))
	for name := range settings.Hotkeys {
		hotkeyNames = append(hotkeyNames, name)
	}
	sort.Strings(hotkeyNames)
	for index, name := range hotkeyNames {
		if binding, ok := keyboardBindingFromHotkey(settings.Hotkeys[name]); ok {
			assignments = append(assignments, ptt.Assignment{Name: fmt.Sprintf("app-hotkey-%d", index+1), Binding: binding})
		}
	}
	for index, profile := range settings.LauncherProfiles {
		if binding, ok := keyboardBindingFromHotkey(profile.Hotkey); ok {
			assignments = append(assignments, ptt.Assignment{Name: fmt.Sprintf("launcher-profile-hotkey-%d", index+1), Binding: binding})
		}
	}
	return assignments
}

func keyboardBindingFromHotkey(combo string) (ptt.Binding, bool) {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(combo)), "+")
	if len(parts) == 0 {
		return ptt.Binding{}, false
	}
	control := strings.TrimSpace(parts[len(parts)-1])
	binding, err := ptt.NormalizeBinding(ptt.Binding{DeviceKind: ptt.DeviceKeyboard, DeviceID: "keyboard-0", Control: control, Scope: ptt.ScopeGlobal})
	return binding, err == nil
}

func unavailableEngineerVoiceHealth() voiceinput.Health {
	return voiceinput.Health{Experimental: true, Enabled: true, State: voiceinput.StateUnavailable, Errors: 1}
}
