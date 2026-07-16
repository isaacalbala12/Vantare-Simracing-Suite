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

	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// legacyWidgetPreset is the on-disk shape of widget-presets.json (read-only migration).
type legacyWidgetPreset struct {
	ID         string               `json:"id"`
	Name       string               `json:"name"`
	WidgetType string               `json:"widgetType"`
	Appearance map[string]any       `json:"appearance,omitempty"`
	Variant    *legacyPresetVariant `json:"variant,omitempty"`
	Props      map[string]any       `json:"props,omitempty"`
	CreatedAt  string               `json:"createdAt"`
	UpdatedAt  string               `json:"updatedAt"`
}

type legacyPresetVariant struct {
	TemplateID   string           `json:"templateId,omitempty"`
	ThemeID      string           `json:"themeId,omitempty"`
	Name         string           `json:"name,omitempty"`
	Columns      []map[string]any `json:"columns,omitempty"`
	ColumnGroups []map[string]any `json:"columnGroups,omitempty"`
	Filters      map[string]any   `json:"filters,omitempty"`
	Formats      map[string]any   `json:"formats,omitempty"`
	Slots        []map[string]any `json:"slots,omitempty"`
}

type legacyPresetFile struct {
	Version int                  `json:"version"`
	Presets []legacyWidgetPreset `json:"presets"`
}

const (
	widgetDesignLibraryVersion = 1
	maxWidgetDesigns           = 500
	maxWidgetDesignIDLength    = 128
	maxWidgetDesignNameLength  = 160
	maxWidgetDesignPayload     = 256 * 1024
)

var supportedWidgetDesignTypes = map[string]bool{
	"delta":     true,
	"standings": true,
	"relative":  true,
	"pedals":    true,
}

var supportedWidgetDesignSystems = map[string]bool{
	string(config.DesignSystemVantareOriginal): true,
	string(config.DesignSystemVantareCrystal):  true,
}

// WidgetDesignV1 is the versioned user/official widget design wire shape.
type WidgetDesignV1 struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	WidgetType      string         `json:"widgetType"`
	SystemID        string         `json:"systemId"`
	SystemVersion   int            `json:"systemVersion"`
	ConfigVersion   int            `json:"configVersion"`
	Visual          map[string]any `json:"visual"`
	Content         map[string]any `json:"content,omitempty"`
	IncludesContent bool           `json:"includesContent"`
	Origin          string         `json:"origin"`
	RequiredFeature string         `json:"requiredFeature,omitempty"`
	CreatedAt       string         `json:"createdAt,omitempty"`
	UpdatedAt       string         `json:"updatedAt,omitempty"`
}

type widgetDesignFile struct {
	SchemaVersion int              `json:"schemaVersion"`
	Designs       []WidgetDesignV1 `json:"designs"`
}

// WidgetDesignService persists versioned widget designs to widget-designs.json.
type WidgetDesignService struct {
	cfgDir  string
	path    string
	designs []WidgetDesignV1
	emitter EventEmitter
}

// NewWidgetDesignService creates a design library service in cfgDir.
func NewWidgetDesignService(cfgDir string, emitter EventEmitter) *WidgetDesignService {
	return &WidgetDesignService{
		cfgDir:  cfgDir,
		path:    filepath.Join(cfgDir, "widget-designs.json"),
		emitter: emitter,
	}
}

// Load reads widget-designs.json or migrates legacy widget-presets.json in memory.
func (s *WidgetDesignService) Load() error {
	s.designs = nil
	if data, err := os.ReadFile(s.path); err == nil {
		var file widgetDesignFile
		if err := json.Unmarshal(data, &file); err != nil {
			return fmt.Errorf("parsing widget designs: %w", err)
		}
		s.designs = file.Designs
		return nil
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("reading widget designs: %w", err)
	}

	presetsPath := filepath.Join(s.cfgDir, "widget-presets.json")
	data, err := os.ReadFile(presetsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("reading legacy presets: %w", err)
	}
	var file legacyPresetFile
	if err := json.Unmarshal(data, &file); err != nil {
		return fmt.Errorf("parsing legacy presets: %w", err)
	}
	s.designs = migratePresetsToDesigns(file.Presets)
	return nil
}

// List returns all loaded designs.
func (s *WidgetDesignService) List() []WidgetDesignV1 {
	if s.designs == nil {
		return []WidgetDesignV1{}
	}
	return append([]WidgetDesignV1(nil), s.designs...)
}

// ListByType returns designs filtered by widget type.
func (s *WidgetDesignService) ListByType(widgetType string) []WidgetDesignV1 {
	var result []WidgetDesignV1
	for _, design := range s.List() {
		if design.WidgetType == widgetType {
			result = append(result, design)
		}
	}
	if result == nil {
		return []WidgetDesignV1{}
	}
	return result
}

// Save validates, inserts or replaces a design, and persists atomically.
func (s *WidgetDesignService) Save(design *WidgetDesignV1) error {
	if design == nil {
		return fmt.Errorf("design cannot be nil")
	}
	if err := validateWidgetDesign(design); err != nil {
		return err
	}
	if design.ID == "" {
		id, err := generateUUID()
		if err != nil {
			return fmt.Errorf("generating design id: %w", err)
		}
		design.ID = id
	}

	now := time.Now().UTC().Format(time.RFC3339)
	design.UpdatedAt = now
	idx := -1
	for i, item := range s.designs {
		if item.ID == design.ID {
			idx = i
			break
		}
	}
	if idx >= 0 {
		design.CreatedAt = s.designs[idx].CreatedAt
		s.designs[idx] = *design
	} else {
		if len(s.designs) >= maxWidgetDesigns {
			return fmt.Errorf("design library exceeds maximum count")
		}
		design.CreatedAt = now
		s.designs = append(s.designs, *design)
	}
	if err := s.persist(); err != nil {
		return err
	}
	if s.emitter != nil {
		s.emitter.Emit("design:saved", map[string]any{"design": *design})
	}
	return nil
}

// Delete removes a design by id and persists to disk.
func (s *WidgetDesignService) Delete(id string) error {
	if !isValidDesignID(id) {
		return fmt.Errorf("invalid design id: %q", id)
	}
	idx := -1
	for i, design := range s.designs {
		if design.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return fmt.Errorf("design not found: %q", id)
	}
	s.designs = append(s.designs[:idx], s.designs[idx+1:]...)
	if err := s.persist(); err != nil {
		return err
	}
	if s.emitter != nil {
		s.emitter.Emit("design:deleted", map[string]any{"id": id})
	}
	return nil
}

// Rename updates a design name and persists to disk.
func (s *WidgetDesignService) Rename(id, name string) error {
	if !isValidDesignID(id) {
		return fmt.Errorf("invalid design id: %q", id)
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("name is required")
	}
	if len(name) > maxWidgetDesignNameLength {
		return fmt.Errorf("name exceeds maximum length")
	}
	for i, design := range s.designs {
		if design.ID == id {
			s.designs[i].Name = name
			s.designs[i].UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			if err := s.persist(); err != nil {
				return err
			}
			if s.emitter != nil {
				s.emitter.Emit("design:renamed", map[string]any{"id": id, "name": name})
			}
			return nil
		}
	}
	return fmt.Errorf("design not found: %q", id)
}

// RegisterHandlers registers Wails event listeners for design operations.
func (s *WidgetDesignService) RegisterHandlers(app *application.App) {
	app.Event.On("design:list", func(event *application.CustomEvent) {
		s.handleList(event.Data)
	})
	app.Event.On("design:save", func(event *application.CustomEvent) {
		s.handleSave(event.Data)
	})
	app.Event.On("design:delete", func(event *application.CustomEvent) {
		s.handleDelete(event.Data)
	})
	app.Event.On("design:rename", func(event *application.CustomEvent) {
		s.handleRename(event.Data)
	})
}

func (s *WidgetDesignService) handleList(data any) {
	widgetType, requestID := "", ""
	if data != nil {
		if payload, ok := data.(map[string]any); ok {
			if wt, exists := payload["widgetType"]; exists && wt != nil {
				if value, ok := wt.(string); ok {
					widgetType = value
				}
			}
			if rid, exists := payload["requestId"]; exists && rid != nil {
				if value, ok := rid.(string); ok {
					requestID = value
				}
			}
		}
	}
	var designs []WidgetDesignV1
	if widgetType != "" {
		designs = s.ListByType(widgetType)
	} else {
		designs = s.List()
	}
	if s.emitter != nil {
		s.emitter.Emit("design:list:response", map[string]any{
			"requestId": requestID,
			"designs":   designs,
		})
	}
}

func (s *WidgetDesignService) handleSave(data any) {
	if data == nil {
		s.emitDesignError("save", fmt.Errorf("missing save payload"))
		return
	}
	raw, err := json.Marshal(data)
	if err != nil {
		s.emitDesignError("save", err)
		return
	}
	var payload struct {
		Design WidgetDesignV1 `json:"design"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		s.emitDesignError("save", err)
		return
	}
	if err := s.Save(&payload.Design); err != nil {
		log.Printf("WidgetDesignService: save error: %v", err)
		s.emitDesignError("save", err)
	}
}

func (s *WidgetDesignService) handleDelete(data any) {
	if data == nil {
		s.emitDesignError("delete", fmt.Errorf("missing delete payload"))
		return
	}
	raw, err := json.Marshal(data)
	if err != nil {
		s.emitDesignError("delete", err)
		return
	}
	var payload struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		s.emitDesignError("delete", err)
		return
	}
	if err := s.Delete(payload.ID); err != nil {
		s.emitDesignError("delete", err)
	}
}

func (s *WidgetDesignService) handleRename(data any) {
	if data == nil {
		s.emitDesignError("rename", fmt.Errorf("missing rename payload"))
		return
	}
	raw, err := json.Marshal(data)
	if err != nil {
		s.emitDesignError("rename", err)
		return
	}
	var payload struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		s.emitDesignError("rename", err)
		return
	}
	if err := s.Rename(payload.ID, payload.Name); err != nil {
		s.emitDesignError("rename", err)
	}
}

func (s *WidgetDesignService) emitDesignError(operation string, err error) {
	if s.emitter == nil || err == nil {
		return
	}
	s.emitter.Emit("design:error", map[string]any{
		"operation": operation,
		"message":   err.Error(),
	})
}

func (s *WidgetDesignService) persist() error {
	if err := os.MkdirAll(s.cfgDir, 0755); err != nil {
		return fmt.Errorf("creating designs dir: %w", err)
	}
	file := widgetDesignFile{SchemaVersion: widgetDesignLibraryVersion, Designs: s.designs}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding designs: %w", err)
	}
	if err := atomicWriteDesignFile(s.path, data, 0644); err != nil {
		return fmt.Errorf("writing designs: %w", err)
	}
	return nil
}

func atomicWriteDesignFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	tmpPath := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			tmp.Close()
			_ = os.Remove(tmpPath)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		return fmt.Errorf("writing temp file: %w", err)
	}
	if err := tmp.Chmod(perm); err != nil {
		return fmt.Errorf("chmod temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("closing temp file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("renaming temp file: %w", err)
	}
	cleanup = false
	return nil
}

func validateWidgetDesign(design *WidgetDesignV1) error {
	if strings.TrimSpace(design.Name) == "" {
		return fmt.Errorf("design name is required")
	}
	if len(design.Name) > maxWidgetDesignNameLength {
		return fmt.Errorf("name exceeds maximum length")
	}
	if !supportedWidgetDesignTypes[design.WidgetType] {
		return fmt.Errorf("unsupported widget type: %q", design.WidgetType)
	}
	if !supportedWidgetDesignSystems[design.SystemID] {
		return fmt.Errorf("unsupported design system: %q", design.SystemID)
	}
	if design.SystemVersion < 1 || design.ConfigVersion < 1 {
		return fmt.Errorf("system/config version must be at least 1")
	}
	if design.Origin != "vantare" && design.Origin != "user" {
		return fmt.Errorf("unsupported origin: %q", design.Origin)
	}
	if design.RequiredFeature != "" &&
		design.RequiredFeature != "overlays.basic" &&
		design.RequiredFeature != "overlays.advanced" {
		return fmt.Errorf("unsupported requiredFeature: %q", design.RequiredFeature)
	}
	if design.ID != "" {
		if !isValidDesignID(design.ID) {
			return fmt.Errorf("invalid design id: %q", design.ID)
		}
		if len(design.ID) > maxWidgetDesignIDLength {
			return fmt.Errorf("id exceeds maximum length")
		}
	}
	if design.Visual == nil {
		design.Visual = map[string]any{}
	}
	if payloadSize(design.Visual) > maxWidgetDesignPayload {
		return fmt.Errorf("visual payload exceeds maximum size")
	}
	if design.Content != nil && payloadSize(design.Content) > maxWidgetDesignPayload {
		return fmt.Errorf("content payload exceeds maximum size")
	}
	return nil
}

func payloadSize(payload map[string]any) int {
	data, err := json.Marshal(payload)
	if err != nil {
		return maxWidgetDesignPayload + 1
	}
	return len(data)
}

func isValidDesignID(id string) bool {
	if id == "" {
		return false
	}
	if strings.Contains(id, "..") || strings.ContainsAny(id, `/\ `) {
		return false
	}
	return true
}

func migratePresetsToDesigns(presets []legacyWidgetPreset) []WidgetDesignV1 {
	designs := make([]WidgetDesignV1, 0, len(presets))
	for _, preset := range presets {
		designs = append(designs, migratePresetToDesign(preset))
	}
	return designs
}

func migratePresetToDesign(preset legacyWidgetPreset) WidgetDesignV1 {
	style := ""
	if preset.Variant != nil && preset.Variant.ThemeID != "" {
		style = preset.Variant.ThemeID
	}
	if style == "" && preset.Props != nil {
		if value, ok := preset.Props["style"].(string); ok {
			style = value
		}
	}
	systemID, legacyDesignID := resolveDesignSystemID(style)
	visual := map[string]any{}
	for key, value := range preset.Appearance {
		visual[key] = value
	}
	if preset.Props != nil {
		for key, value := range preset.Props {
			if key == "appearance" || key == "style" {
				continue
			}
			visual[key] = value
		}
	}
	if legacyDesignID != "" {
		visual["legacyDesignId"] = legacyDesignID
	}

	var content map[string]any
	includesContent := false
	if preset.Variant != nil {
		content = map[string]any{}
		if len(preset.Variant.Columns) > 0 {
			content["columns"] = preset.Variant.Columns
			includesContent = true
		}
		if len(preset.Variant.Slots) > 0 {
			content["slots"] = preset.Variant.Slots
			includesContent = true
		}
		if len(preset.Variant.ColumnGroups) > 0 {
			content["columnGroups"] = preset.Variant.ColumnGroups
			includesContent = true
		}
		if len(preset.Variant.Filters) > 0 {
			content["filters"] = preset.Variant.Filters
			includesContent = true
		}
		if len(preset.Variant.Formats) > 0 {
			content["formats"] = preset.Variant.Formats
			includesContent = true
		}
		if !includesContent {
			content = nil
		}
	}

	design := WidgetDesignV1{
		ID:              preset.ID,
		Name:            preset.Name,
		WidgetType:      preset.WidgetType,
		SystemID:        systemID,
		SystemVersion:   1,
		ConfigVersion:   1,
		Visual:          visual,
		IncludesContent: includesContent,
		Origin:          "user",
		CreatedAt:       preset.CreatedAt,
		UpdatedAt:       preset.UpdatedAt,
	}
	if includesContent {
		design.Content = content
	}
	return design
}

func resolveDesignSystemID(style string) (string, string) {
	switch style {
	case "glassmorphism-pro", "vantare-crystal":
		return string(config.DesignSystemVantareCrystal), ""
	default:
		if style == "" {
			return string(config.DesignSystemVantareOriginal), ""
		}
		return string(config.DesignSystemVantareOriginal), style
	}
}

func generateUUID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x",
		bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16]), nil
}
