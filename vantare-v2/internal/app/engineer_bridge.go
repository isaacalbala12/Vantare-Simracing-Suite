package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// EngineerBridge binds Wails events to the main EngineerService.
type EngineerBridge struct {
	wailsApp *application.App
	emitter  EventEmitter
	service  *service.EngineerService
	settings *SettingsService
	mu       sync.Mutex
	// settingsMu serialises each mutate-read-persist cycle: Wails event
	// callbacks may run concurrently, and without it a slower callback could
	// persist a status captured before another callback's mutation landed.
	settingsMu sync.Mutex
	unsubs     []func()
}

// SetSettingsService enables persistence of accepted Engineer UI changes.
// It must be installed before Start.
func (b *EngineerBridge) SetSettingsService(settings *SettingsService) {
	b.settings = settings
}

// NewEngineerBridge creates a new instance of EngineerBridge.
func NewEngineerBridge(wailsApp *application.App, emitter EventEmitter, svc *service.EngineerService) *EngineerBridge {
	return &EngineerBridge{
		wailsApp: wailsApp,
		emitter:  emitter,
		service:  svc,
	}
}

// Start registers the event listeners on the Wails event bus.
func (b *EngineerBridge) Start() {
	var unsubs []func()

	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:diagnostics:get", func(event *application.CustomEvent) {
		b.emitter.Emit("engineer:diagnostics", b.service.Diagnostics())
	}))
	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:command", func(event *application.CustomEvent) {
		b.handleCommand(event.Data)
	}))
	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:audio-test", func(event *application.CustomEvent) {
		var request struct {
			RequestID string `json:"requestId"`
			Kind      string `json:"kind"`
		}
		raw, err := json.Marshal(event.Data)
		if err != nil || json.Unmarshal(raw, &request) != nil || request.RequestID == "" || len(request.RequestID) > 80 {
			return
		}
		go func() {
			result := b.service.TestAudio(context.Background(), request.Kind)
			b.emitter.Emit("engineer:audio-test:result", struct {
				RequestID string                  `json:"requestId"`
				Result    service.AudioTestResult `json:"result"`
			}{request.RequestID, result})
		}()
	}))
	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:status:get", func(event *application.CustomEvent) {
		b.emitter.Emit("engineer:status", b.service.Status())
	}))
	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:stream:get", func(event *application.CustomEvent) {
		b.emitter.Emit("engineer:stream", b.service.StreamSnapshot())
	}))

	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:enabled:set", func(event *application.CustomEvent) {
		enabled, err := parseBoolData(event.Data, "enabled")
		if err != nil {
			log.Printf("EngineerBridge: error parsing enabled data: %v", err)
			return
		}
		b.mutateAndPersist("enabled", func() error { return b.service.SetEnabled(enabled) })
	}))

	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:spotter:set", func(event *application.CustomEvent) {
		enabled, err := parseBoolData(event.Data, "spotterEnabled")
		if err != nil {
			// Fallback in case the frontend sends the key "enabled" or direct value
			enabled, err = parseBoolData(event.Data, "enabled")
			if err != nil {
				log.Printf("EngineerBridge: error parsing spotter enabled data: %v", err)
				return
			}
		}
		b.mutateAndPersist("spotter enabled", func() error { return b.service.SetSpotterEnabled(enabled) })
	}))

	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:sensitivity:set", func(event *application.CustomEvent) {
		sensitivity, err := parseStringData(event.Data, "sensitivity")
		if err != nil {
			log.Printf("EngineerBridge: error parsing sensitivity data: %v", err)
			return
		}
		b.mutateAndPersist("sensitivity", func() error { return b.service.SetSensitivity(sensitivity) })
	}))

	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:output:set", func(event *application.CustomEvent) {
		category, err := parseStringData(event.Data, "category")
		if err != nil {
			log.Printf("EngineerBridge: error parsing output category: %v", err)
			return
		}
		mode, err := parseStringData(event.Data, "mode")
		if err != nil {
			log.Printf("EngineerBridge: error parsing output mode: %v", err)
			return
		}
		b.mutateAndPersist("output mode", func() error { return b.service.SetOutputMode(category, mode) })
	}))

	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:subtitles:set", func(event *application.CustomEvent) {
		enabled, err := parseBoolData(event.Data, "enabled")
		if err != nil {
			log.Printf("EngineerBridge: error parsing subtitles data: %v", err)
			return
		}
		b.mutateAndPersist("subtitles", func() error {
			b.service.SetSubtitlesEnabled(enabled)
			return nil
		})
	}))

	b.mu.Lock()
	b.unsubs = unsubs
	b.mu.Unlock()
}

// mutateAndPersist runs a service mutation and persists the resulting
// settings atomically under settingsMu.
func (b *EngineerBridge) mutateAndPersist(name string, mutate func() error) string {
	b.settingsMu.Lock()
	defer b.settingsMu.Unlock()
	if err := mutate(); err != nil {
		log.Printf("EngineerBridge: error setting %s: %v", name, err)
		return "rejected"
	}
	if err := b.persistSettings(); err != nil {
		return "save_failed"
	}
	return "saved"
}

func (b *EngineerBridge) persistSettings() error {
	if b.settings == nil {
		return fmt.Errorf("engineer settings unavailable")
	}
	status := b.service.Status()
	outputModes := make(map[string]string, len(status.OutputModes))
	for family, mode := range status.OutputModes {
		outputModes[family] = string(mode)
	}
	if err := b.settings.SetEngineerSettings(&EngineerSettings{
		Enabled: status.Enabled, SpotterEnabled: status.SpotterEnabled,
		SubtitlesEnabled: b.service.SubtitlesPreference(), Sensitivity: status.Sensitivity,
		OutputModes: outputModes,
	}); err != nil {
		log.Printf("EngineerBridge: error persisting settings: %v", err)
		return err
	}
	if b.emitter != nil {
		b.emitter.Emit("settings", b.settings.Settings())
	}
	return nil
}

// Stop unregisters all event listeners.
// Must be called when the bridge is no longer needed to prevent callback leaks.
// Calling Start twice without Stop in between will panic (Wails Event.On panics on duplicate).
func (b *EngineerBridge) Stop() {
	b.mu.Lock()
	for _, unsub := range b.unsubs {
		unsub()
	}
	b.unsubs = nil
	b.mu.Unlock()
}

// Helpers for robust event data parsing
func parseBoolData(data any, key string) (bool, error) {
	if data == nil {
		return false, fmt.Errorf("data is nil")
	}

	// Direct boolean type assertion
	if val, ok := data.(bool); ok {
		return val, nil
	}

	// Direct pointer to boolean
	if val, ok := data.(*bool); ok {
		return *val, nil
	}

	// Map type assertion
	if m, ok := data.(map[string]any); ok {
		if val, exists := m[key]; exists {
			if b, ok := val.(bool); ok {
				return b, nil
			}
		}
	}

	// JSON marshal/unmarshal fallback
	raw, err := json.Marshal(data)
	if err == nil {
		var single bool
		if json.Unmarshal(raw, &single) == nil {
			return single, nil
		}
		var m map[string]any
		if json.Unmarshal(raw, &m) == nil {
			if val, exists := m[key]; exists {
				if b, ok := val.(bool); ok {
					return b, nil
				}
			}
		}
	}

	return false, fmt.Errorf("unable to parse bool from %v", data)
}

func parseStringData(data any, key string) (string, error) {
	if data == nil {
		return "", fmt.Errorf("data is nil")
	}

	// Direct string type assertion
	if val, ok := data.(string); ok {
		return val, nil
	}

	// Direct pointer to string
	if val, ok := data.(*string); ok {
		return *val, nil
	}

	// Map type assertion
	if m, ok := data.(map[string]any); ok {
		if val, exists := m[key]; exists {
			if s, ok := val.(string); ok {
				return s, nil
			}
		}
	}

	// JSON marshal/unmarshal fallback
	raw, err := json.Marshal(data)
	if err == nil {
		var single string
		if json.Unmarshal(raw, &single) == nil {
			return single, nil
		}
		var m map[string]any
		if json.Unmarshal(raw, &m) == nil {
			if val, exists := m[key]; exists {
				if s, ok := val.(string); ok {
					return s, nil
				}
			}
		}
	}

	return "", fmt.Errorf("unable to parse string from %v", data)
}
