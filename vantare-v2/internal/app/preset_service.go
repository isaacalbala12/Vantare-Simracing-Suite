package app

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// WidgetPreset is an atomic, reusable widget-internal configuration.
// It never stores position, size, enabled, or runtime state.
type WidgetPreset struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	WidgetType string         `json:"widgetType"`
	Appearance map[string]any `json:"appearance,omitempty"`
	Variant    *PresetVariant `json:"variant,omitempty"`
	Props      map[string]any `json:"props,omitempty"`
	CreatedAt  string         `json:"createdAt"`
	UpdatedAt  string         `json:"updatedAt"`
}

// PresetVariant is a snapshot of a widget variant usable by presets.
type PresetVariant struct {
	TemplateID   string           `json:"templateId,omitempty"`
	ThemeID      string           `json:"themeId,omitempty"`
	Name         string           `json:"name,omitempty"`
	Columns      []map[string]any `json:"columns,omitempty"`
	ColumnGroups []map[string]any `json:"columnGroups,omitempty"`
	Filters      map[string]any   `json:"filters,omitempty"`
	Formats      map[string]any   `json:"formats,omitempty"`
	Slots        []map[string]any `json:"slots,omitempty"`
}

type presetFile struct {
	Version int            `json:"version"`
	Presets []WidgetPreset `json:"presets"`
}

// PresetService persists widget presets to widget-presets.json in cfgDir.
type PresetService struct {
	path    string
	presets []WidgetPreset
	emitter EventEmitter
}

// NewPresetService creates a preset service backed by cfgDir/widget-presets.json.
func NewPresetService(cfgDir string, emitter EventEmitter) *PresetService {
	return &PresetService{
		path:    filepath.Join(cfgDir, "widget-presets.json"),
		emitter: emitter,
	}
}

// Load reads presets from disk. Missing file = empty list, no error.
func (s *PresetService) Load() error {
	s.presets = nil

	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("reading presets: %w", err)
	}

	var file presetFile
	if err := json.Unmarshal(data, &file); err != nil {
		return fmt.Errorf("parsing presets: %w", err)
	}

	s.presets = file.Presets
	return nil
}

// List returns all presets in memory.
func (s *PresetService) List() []WidgetPreset {
	if s.presets == nil {
		return []WidgetPreset{}
	}
	return s.presets
}

// ListByType returns presets filtered by widgetType.
func (s *PresetService) ListByType(widgetType string) []WidgetPreset {
	var result []WidgetPreset
	for _, p := range s.List() {
		if p.WidgetType == widgetType {
			result = append(result, p)
		}
	}
	if result == nil {
		return []WidgetPreset{}
	}
	return result
}

// Save validates, inserts or replaces a preset, and persists to disk.
func (s *PresetService) Save(preset *WidgetPreset) error {
	if preset == nil {
		return fmt.Errorf("preset cannot be nil")
	}
	if strings.TrimSpace(preset.Name) == "" {
		return fmt.Errorf("preset name is required")
	}
	if strings.TrimSpace(preset.WidgetType) == "" {
		return fmt.Errorf("preset widgetType is required")
	}

	if preset.ID == "" {
		id, err := generateUUID()
		if err != nil {
			return fmt.Errorf("generating preset id: %w", err)
		}
		preset.ID = id
	} else if !isValidPresetID(preset.ID) {
		return fmt.Errorf("invalid preset id: %q", preset.ID)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	preset.UpdatedAt = now

	idx := -1
	for i, p := range s.presets {
		if p.ID == preset.ID {
			idx = i
			break
		}
	}
	if idx >= 0 {
		preset.CreatedAt = s.presets[idx].CreatedAt
		s.presets[idx] = *preset
	} else {
		preset.CreatedAt = now
		s.presets = append(s.presets, *preset)
	}

	return s.persist()
}

// Delete removes a preset by id and persists to disk.
func (s *PresetService) Delete(id string) error {
	if !isValidPresetID(id) {
		return fmt.Errorf("invalid preset id: %q", id)
	}
	idx := -1
	for i, p := range s.presets {
		if p.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return fmt.Errorf("preset not found: %q", id)
	}
	s.presets = append(s.presets[:idx], s.presets[idx+1:]...)
	return s.persist()
}

// Rename updates a preset's name and persists to disk.
func (s *PresetService) Rename(id string, name string) error {
	if !isValidPresetID(id) {
		return fmt.Errorf("invalid preset id: %q", id)
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("name is required")
	}
	for i, p := range s.presets {
		if p.ID == id {
			s.presets[i].Name = name
			s.presets[i].UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			return s.persist()
		}
	}
	return fmt.Errorf("preset not found: %q", id)
}

func (s *PresetService) persist() error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("creating presets dir: %w", err)
	}
	file := presetFile{Version: 1, Presets: s.presets}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding presets: %w", err)
	}
	if err := os.WriteFile(s.path, data, 0644); err != nil {
		return fmt.Errorf("writing presets: %w", err)
	}
	if s.emitter != nil {
		s.emitter.Emit("presets:changed", nil)
	}
	return nil
}

// RegisterHandlers registers Wails event listeners for preset operations.
func (s *PresetService) RegisterHandlers(app *application.App) {
	app.Event.On("preset:list", func(event *application.CustomEvent) {
		s.handleList(event.Data)
	})

	app.Event.On("preset:save", func(event *application.CustomEvent) {
		s.handleSave(event.Data)
	})

	app.Event.On("preset:delete", func(event *application.CustomEvent) {
		s.handleDelete(event.Data)
	})

	app.Event.On("preset:rename", func(event *application.CustomEvent) {
		s.handleRename(event.Data)
	})
}

func (s *PresetService) handleList(data any) {
	widgetType, requestID := "", ""
	if data != nil {
		if m, ok := data.(map[string]any); ok {
			if wt, exists := m["widgetType"]; exists && wt != nil {
				if sVal, ok := wt.(string); ok {
					widgetType = sVal
				}
			}
			if rid, exists := m["requestId"]; exists && rid != nil {
				if sVal, ok := rid.(string); ok {
					requestID = sVal
				}
			}
		}
	}

	var presets []WidgetPreset
	if widgetType != "" {
		presets = s.ListByType(widgetType)
	} else {
		presets = s.List()
	}

	if s.emitter != nil {
		s.emitter.Emit("preset:list:response", map[string]any{
			"requestId": requestID,
			"presets":   presets,
		})
	}
}

func (s *PresetService) handleSave(data any) {
	if data == nil {
		s.emitError("preset:save:error", "", fmt.Errorf("missing save payload"))
		return
	}
	raw, err := json.Marshal(data)
	if err != nil {
		log.Printf("PresetService: error marshaling save data: %v", err)
		s.emitError("preset:save:error", "", err)
		return
	}

	var payload struct {
		Preset WidgetPreset `json:"preset"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		log.Printf("PresetService: error unmarshaling save payload: %v", err)
		s.emitError("preset:save:error", "", err)
		return
	}

	if err := s.Save(&payload.Preset); err != nil {
		log.Printf("PresetService: error saving preset: %v", err)
		s.emitError("preset:save:error", payload.Preset.ID, err)
		return
	}
}

func (s *PresetService) handleDelete(data any) {
	if data == nil {
		s.emitError("preset:delete:error", "", fmt.Errorf("missing delete payload"))
		return
	}
	raw, err := json.Marshal(data)
	if err != nil {
		log.Printf("PresetService: error marshaling delete data: %v", err)
		s.emitError("preset:delete:error", "", err)
		return
	}
	var payload struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		log.Printf("PresetService: error unmarshaling delete payload: %v", err)
		s.emitError("preset:delete:error", "", err)
		return
	}
	if err := s.Delete(payload.ID); err != nil {
		log.Printf("PresetService: error deleting preset: %v", err)
		s.emitError("preset:delete:error", payload.ID, err)
		return
	}
}

func (s *PresetService) handleRename(data any) {
	if data == nil {
		s.emitError("preset:rename:error", "", fmt.Errorf("missing rename payload"))
		return
	}
	raw, err := json.Marshal(data)
	if err != nil {
		log.Printf("PresetService: error marshaling rename data: %v", err)
		s.emitError("preset:rename:error", "", err)
		return
	}
	var payload struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		log.Printf("PresetService: error unmarshaling rename payload: %v", err)
		s.emitError("preset:rename:error", "", err)
		return
	}
	if err := s.Rename(payload.ID, payload.Name); err != nil {
		log.Printf("PresetService: error renaming preset: %v", err)
		s.emitError("preset:rename:error", payload.ID, err)
		return
	}
}

func (s *PresetService) emitError(eventName, id string, err error) {
	if s.emitter == nil || err == nil {
		return
	}
	s.emitter.Emit(eventName, map[string]any{
		"id":      id,
		"message": err.Error(),
	})
}

func isValidPresetID(id string) bool {
	if id == "" {
		return false
	}
	if strings.Contains(id, "..") || strings.ContainsAny(id, `/\ `) {
		return false
	}
	return true
}

func generateUUID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	// Formato UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x",
		bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16]), nil
}
