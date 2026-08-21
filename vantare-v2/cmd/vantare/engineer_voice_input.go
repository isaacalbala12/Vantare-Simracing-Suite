package main

import (
	"errors"
	"fmt"
	"sort"
	"strings"

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

func composeEngineerVoiceInput(enabled bool, settings *app.AppSettings, locale commands.Locale, dependencies engineerVoiceInputDependencies) (*voiceinput.Runtime, error) {
	if !enabled {
		return nil, nil
	}
	binding := ptt.Binding{DeviceKind: ptt.DeviceKeyboard, DeviceID: "keyboard-0", Control: "f24", Scope: ptt.ScopeGlobal}
	conflicts, err := ptt.FindBindingConflicts(binding, engineerPTTAssignments(settings))
	if err != nil {
		return nil, fmt.Errorf("validate engineer voice-input PTT binding: %w", err)
	}
	if len(conflicts) != 0 {
		names := make([]string, len(conflicts))
		for index, conflict := range conflicts {
			names[index] = conflict.AssignmentName
		}
		return nil, fmt.Errorf("%w: %s", errEngineerVoiceBindingConflict, strings.Join(names, ", "))
	}
	if dependencies.readerFactory == nil || dependencies.hostFactory == nil {
		return nil, errors.New("engineer voice-input factories are required")
	}
	return voiceinput.New(voiceinput.Config{
		Enabled: true, Locale: locale, Binding: binding,
		Reader: dependencies.readerFactory(), Host: dependencies.hostFactory(), QueryPort: dependencies.queryPort,
		Publisher: dependencies.publisher, Lifecycle: dependencies.lifecycle,
		MaxWindow: voiceinput.DefaultMaxWindow,
	})
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
