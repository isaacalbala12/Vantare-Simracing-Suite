package config

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
)

// DisplayMode controls the overlay window behavior.
type DisplayMode string

const (
	ModeRacing    DisplayMode = "racing"    // fullscreen, click-through
	ModeEdit      DisplayMode = "edit"      // fullscreen, draggable widgets
	ModeStreaming DisplayMode = "streaming" // load-only in F4; no window in F6
)

// Rect defines a widget's position and size in profile coordinates.
type Rect struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// WidgetConfig describes one overlay widget.
type WidgetConfig struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"` // delta | relative | standings
	VariantID string         `json:"variantId,omitempty"`
	Enabled   bool           `json:"enabled"`
	UpdateHz  int            `json:"updateHz,omitempty"`
	Position  Rect           `json:"position"`
	Props     map[string]any `json:"props,omitempty"`
}

const ProfileSchemaVersionV2 = 2

// LayoutType identifies a profile layout by session/use case.
type LayoutType string

const (
	LayoutGeneral    LayoutType = "general"
	LayoutPractice   LayoutType = "practice"
	LayoutQualifying LayoutType = "qualifying"
	LayoutRace       LayoutType = "race"
	LayoutEndurance  LayoutType = "endurance"
)

// ProfileLayout stores positioned widget instances for one layout.
type ProfileLayout struct {
	Type    LayoutType     `json:"type"`
	Widgets []WidgetConfig `json:"widgets"`
}

// ProfileSourceMeta records where a profile came from when copied from a recommended preset.
type ProfileSourceMeta struct {
	Kind      string `json:"kind,omitempty"`
	ProfileID string `json:"profileId,omitempty"`
	Name      string `json:"name,omitempty"`
}

// WidgetVariantConfig stores reusable internal widget configuration.
type WidgetVariantConfig struct {
	ID           string              `json:"id"`
	WidgetType   string              `json:"widgetType"`
	TemplateID   string              `json:"templateId,omitempty"`
	ThemeID      string              `json:"themeId,omitempty"`
	Name         string              `json:"name,omitempty"`
	Slots        []SlotConfig        `json:"slots,omitempty"`
	Columns      []ColumnConfig      `json:"columns,omitempty"`
	ColumnGroups []ColumnGroupConfig `json:"columnGroups,omitempty"`
	Filters      map[string]any      `json:"filters,omitempty"`
	Formats      map[string]any      `json:"formats,omitempty"`
	Props        map[string]any      `json:"props,omitempty"`
}

// SlotConfig defines a configurable slot within a widget region.
type SlotConfig struct {
	ID       string         `json:"id"`
	MetricID string         `json:"metricId"`
	Enabled  bool           `json:"enabled"`
	Format   map[string]any `json:"format,omitempty"`
	Style    map[string]any `json:"style,omitempty"`
}

// ColumnConfig defines a column in repeatable widget rows.
type ColumnConfig struct {
	ID       string         `json:"id"`
	MetricID string         `json:"metricId"`
	Enabled  bool           `json:"enabled"`
	Width    int            `json:"width,omitempty"`
	Format   map[string]any `json:"format,omitempty"`
	Style    map[string]any `json:"style,omitempty"`
}

// ColumnGroupConfig groups optional columns.
type ColumnGroupConfig struct {
	ID      string         `json:"id"`
	Enabled bool           `json:"enabled"`
	Columns []ColumnConfig `json:"columns,omitempty"`
}

// ProfileConfig is the top-level JSON schema for a layout profile.
type ProfileConfig struct {
	SchemaVersion int                          `json:"schemaVersion,omitempty"`
	ID            string                       `json:"id,omitempty"`
	Name          string                       `json:"name,omitempty"`
	DisplayMode   DisplayMode                  `json:"displayMode"`
	MonitorIndex  int                          `json:"monitorIndex"` // reserved: multi-monitor placement (F9); primary monitor for now
	Widgets       []WidgetConfig               `json:"widgets"`
	Layouts       map[LayoutType]ProfileLayout `json:"layouts,omitempty"`
	Variants      []WidgetVariantConfig        `json:"variants,omitempty"`
	Source        *ProfileSourceMeta           `json:"source,omitempty"`
}

// LoadFile reads a profile JSON from disk.
func LoadFile(path string) (*ProfileConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read profile %s: %w", path, err)
	}
	var p ProfileConfig
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("parse profile %s: %w", path, err)
	}
	return &p, nil
}

// SaveFile writes the profile to disk as pretty JSON, creating parent
// directories if they do not exist.
func SaveFile(path string, p *ProfileConfig) error {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal profile: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("create profile directory %s: %w", filepath.Dir(path), err)
	}
	if err := atomicWriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("write profile %s: %w", path, err)
	}
	return nil
}

// atomicWriteFile writes data to path atomically: write to a temp file in the
// same directory, then rename. This prevents partial writes if the process
// crashes mid-write. The temp file is cleaned up on error.
func atomicWriteFile(path string, data []byte, perm os.FileMode) error {
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

// ConvertProfileToV2 returns a v2 copy without mutating the input profile.
func ConvertProfileToV2(p *ProfileConfig) *ProfileConfig {
	if p == nil {
		return nil
	}
	next := *p
	next.SchemaVersion = ProfileSchemaVersionV2
	next.Widgets = copyWidgetsWithDefaultVariants(next.Widgets)
	next.Layouts = CopyProfileLayouts(next.Layouts)
	if next.Layouts == nil {
		next.Layouts = map[LayoutType]ProfileLayout{}
	}
	if _, ok := next.Layouts[LayoutGeneral]; !ok {
		next.Layouts[LayoutGeneral] = ProfileLayout{
			Type:    LayoutGeneral,
			Widgets: copyWidgetConfigs(next.Widgets),
		}
	}
	if len(next.Variants) > 0 {
		next.Variants = copyWidgetVariants(next.Variants)
	} else {
		next.Variants = buildDefaultVariants(next.Widgets)
	}
	if next.Source != nil {
		source := *next.Source
		next.Source = &source
	}
	return &next
}

// SetGeneralLayoutWidgets updates the compatibility widgets mirror and the v2 general layout.
func SetGeneralLayoutWidgets(p *ProfileConfig, widgets []WidgetConfig) {
	if p == nil {
		return
	}
	copied := copyWidgetConfigs(widgets)
	p.Widgets = copyWidgetConfigs(copied)
	if p.SchemaVersion != ProfileSchemaVersionV2 {
		return
	}
	if p.Layouts == nil {
		p.Layouts = map[LayoutType]ProfileLayout{}
	}
	p.Layouts[LayoutGeneral] = ProfileLayout{
		Type:    LayoutGeneral,
		Widgets: copied,
	}
}

// CopyProfileVariants returns a deep-enough copy for rollback around SaveFile.
func CopyProfileVariants(variants []WidgetVariantConfig) []WidgetVariantConfig {
	return copyWidgetVariants(variants)
}

// CopyProfileLayouts returns a deep-enough copy for rollback around SaveFile.
func CopyProfileLayouts(layouts map[LayoutType]ProfileLayout) map[LayoutType]ProfileLayout {
	if layouts == nil {
		return nil
	}
	copied := make(map[LayoutType]ProfileLayout, len(layouts))
	for key, layout := range layouts {
		copied[key] = ProfileLayout{
			Type:    layout.Type,
			Widgets: copyWidgetConfigs(layout.Widgets),
		}
	}
	return copied
}

func copyWidgetsWithDefaultVariants(widgets []WidgetConfig) []WidgetConfig {
	copied := copyWidgetConfigs(widgets)
	for i := range copied {
		if copied[i].VariantID == "" {
			copied[i].VariantID = defaultVariantID(copied[i])
		}
	}
	return copied
}

func copyWidgetConfigs(widgets []WidgetConfig) []WidgetConfig {
	if widgets == nil {
		return nil
	}
	copied := make([]WidgetConfig, len(widgets))
	for i, widget := range widgets {
		copied[i] = widget
		copied[i].Props = copyMap(widget.Props)
	}
	return copied
}

func copyWidgetVariants(variants []WidgetVariantConfig) []WidgetVariantConfig {
	if variants == nil {
		return nil
	}
	copied := make([]WidgetVariantConfig, len(variants))
	for i, variant := range variants {
		copied[i] = variant
		copied[i].Slots = copySlotConfigs(variant.Slots)
		copied[i].Columns = copyColumnConfigs(variant.Columns)
		copied[i].ColumnGroups = copyColumnGroupConfigs(variant.ColumnGroups)
		copied[i].Filters = copyMap(variant.Filters)
		copied[i].Formats = copyMap(variant.Formats)
		copied[i].Props = copyMap(variant.Props)
	}
	return copied
}

func copySlotConfigs(slots []SlotConfig) []SlotConfig {
	if slots == nil {
		return nil
	}
	copied := make([]SlotConfig, len(slots))
	for i, slot := range slots {
		copied[i] = slot
		copied[i].Format = copyMap(slot.Format)
		copied[i].Style = copyMap(slot.Style)
	}
	return copied
}

func copyColumnConfigs(columns []ColumnConfig) []ColumnConfig {
	if columns == nil {
		return nil
	}
	copied := make([]ColumnConfig, len(columns))
	for i, column := range columns {
		copied[i] = column
		copied[i].Format = copyMap(column.Format)
		copied[i].Style = copyMap(column.Style)
	}
	return copied
}

func copyColumnGroupConfigs(groups []ColumnGroupConfig) []ColumnGroupConfig {
	if groups == nil {
		return nil
	}
	copied := make([]ColumnGroupConfig, len(groups))
	for i, group := range groups {
		copied[i] = group
		copied[i].Columns = copyColumnConfigs(group.Columns)
	}
	return copied
}

func copyMap(values map[string]any) map[string]any {
	if values == nil {
		return nil
	}
	copied := make(map[string]any, len(values))
	for key, value := range values {
		copied[key] = copyAny(value)
	}
	return copied
}

func copyAny(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return copyMap(typed)
	case []any:
		copied := make([]any, len(typed))
		for i, item := range typed {
			copied[i] = copyAny(item)
		}
		return copied
	default:
		return value
	}
}

func buildDefaultVariants(widgets []WidgetConfig) []WidgetVariantConfig {
	var variants []WidgetVariantConfig
	seen := map[string]bool{}
	for _, widget := range widgets {
		variantID := widget.VariantID
		if variantID == "" {
			variantID = defaultVariantID(widget)
		}
		if variantID == "" || seen[variantID] {
			continue
		}
		seen[variantID] = true
		variant := WidgetVariantConfig{
			ID:         variantID,
			WidgetType: widget.Type,
			TemplateID: defaultTemplateID(widget.Type),
			ThemeID:    defaultThemeID(widget),
			Name:       defaultVariantName(widget),
			Props:      copyMap(widget.Props),
		}
		switch widget.Type {
		case "standings":
			variant.Columns = defaultStandingsColumns()
		case "relative":
			variant.Filters = defaultRelativeFilters()
		}
		variants = append(variants, variant)
	}
	return variants
}

func defaultStandingsColumns() []ColumnConfig {
	return []ColumnConfig{
		{ID: "position", MetricID: "position", Enabled: true, Width: 48},
		{ID: "name", MetricID: "name", Enabled: true, Width: 160},
		{ID: "bestLap", MetricID: "bestLap", Enabled: true, Width: 88},
		{ID: "lastLap", MetricID: "lastLap", Enabled: true, Width: 88},
		{ID: "interval", MetricID: "interval", Enabled: true, Width: 72},
		{ID: "currentLap", MetricID: "currentLap", Enabled: true, Width: 72},
	}
}

func defaultRelativeFilters() map[string]any {
	return map[string]any{
		"rangeAhead":    3,
		"rangeBehind":   3,
		"classScope":    "all",
		"includePlayer": true,
		"rowHeightMode": "compact",
	}
}

func defaultVariantID(widget WidgetConfig) string {
	if widget.ID == "" {
		return ""
	}
	return "variant-" + widget.ID + "-default"
}

func defaultTemplateID(widgetType string) string {
	switch widgetType {
	case "relative":
		return "relative-vantare-default"
	case "standings":
		return "standings-vantare-default"
	case "pedals":
		return "pedals-vantare-default"
	default:
		if widgetType == "" {
			return ""
		}
		return widgetType + "-vantare-default"
	}
}

func defaultThemeID(widget WidgetConfig) string {
	if widget.Props != nil {
		if style, ok := widget.Props["style"].(string); ok && style != "" {
			return style
		}
	}
	return "vantare-racing"
}

func defaultVariantName(widget WidgetConfig) string {
	if widget.Type == "" {
		return "Widget Default"
	}
	return widget.Type + " Default"
}

// CompositeBounds returns the bounding box that encloses all enabled widgets
// with the given padding applied on each side.
// If no widgets are enabled, returns a minimum 200×80 rect.
func CompositeBounds(p *ProfileConfig, pad int) Rect {
	minX, minY := math.MaxInt, math.MaxInt
	maxX, maxY := math.MinInt, math.MinInt
	count := 0

	for _, w := range p.Widgets {
		if !w.Enabled {
			continue
		}
		count++
		if w.Position.X < minX {
			minX = w.Position.X
		}
		if w.Position.Y < minY {
			minY = w.Position.Y
		}
		ex := w.Position.X + w.Position.W
		ey := w.Position.Y + w.Position.H
		if ex > maxX {
			maxX = ex
		}
		if ey > maxY {
			maxY = ey
		}
	}

	if count == 0 {
		return Rect{X: 0, Y: 0, W: 200, H: 80}
	}

	return Rect{
		X: minX - pad,
		Y: minY - pad,
		W: (maxX - minX) + pad*2,
		H: (maxY - minY) + pad*2,
	}
}

// LayoutOrigin returns the virtual-desktop origin of the bounding box.
// Widgets at (x, y) become (x - origin.X, y - origin.Y) in window-local coords.
func LayoutOrigin(p *ProfileConfig, pad int) Rect {
	b := CompositeBounds(p, pad)
	return Rect{X: b.X, Y: b.Y, W: 0, H: 0}
}
