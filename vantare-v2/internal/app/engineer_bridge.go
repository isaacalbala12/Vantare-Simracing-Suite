package app

import (
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
	mu       sync.Mutex
	unsubs   []func()
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

	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:status:get", func(event *application.CustomEvent) {
		b.emitter.Emit("engineer:status", b.service.Status())
	}))

	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:enabled:set", func(event *application.CustomEvent) {
		enabled, err := parseBoolData(event.Data, "enabled")
		if err != nil {
			log.Printf("EngineerBridge: error parsing enabled data: %v", err)
			return
		}
		if err := b.service.SetEnabled(enabled); err != nil {
			log.Printf("EngineerBridge: error setting enabled: %v", err)
		}
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
		if err := b.service.SetSpotterEnabled(enabled); err != nil {
			log.Printf("EngineerBridge: error setting spotter enabled: %v", err)
		}
	}))

	unsubs = append(unsubs, b.wailsApp.Event.On("engineer:sensitivity:set", func(event *application.CustomEvent) {
		sensitivity, err := parseStringData(event.Data, "sensitivity")
		if err != nil {
			log.Printf("EngineerBridge: error parsing sensitivity data: %v", err)
			return
		}
		if err := b.service.SetSensitivity(sensitivity); err != nil {
			log.Printf("EngineerBridge: error setting sensitivity: %v", err)
		}
	}))

	b.mu.Lock()
	b.unsubs = unsubs
	b.mu.Unlock()
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
