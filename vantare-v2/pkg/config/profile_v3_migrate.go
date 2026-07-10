package config

import (
	"encoding/json"
	"fmt"
)

var legacyLayoutOrder = []LayoutType{
	LayoutGeneral,
	LayoutPractice,
	LayoutQualifying,
	LayoutRace,
	LayoutEndurance,
}

var coreWidgetTypes = map[string]WidgetTypeV3{
	"delta":     WidgetTypeDelta,
	"standings": WidgetTypeStandings,
	"relative":  WidgetTypeRelative,
	"pedals":    WidgetTypePedals,
}

var crystalLegacyStyles = map[string]bool{
	"glassmorphism-pro": true,
	"vantare-crystal":   true,
}

var transientPropKeys = map[string]bool{
	"__previewFillHost":   true,
	"__engineerTransport": true,
	"mockSessionScenario": true,
	"telemetryMode":       true,
}

var relativeFilterKeys = map[string]bool{
	"rangeAhead":    true,
	"rangeBehind":   true,
	"classScope":    true,
	"includePlayer": true,
	"rowHeightMode": true,
}

var visualPropKeys = map[string]bool{
	"throttleColor": true,
	"brakeColor":    true,
	"clutchColor":   true,
	"maxRows":       true,
}

type profileSchemaEnvelope struct {
	SchemaVersion int `json:"schemaVersion"`
}

// MigrateProfileJSONToV3 converts legacy profile JSON into a normalized V3 document.
func MigrateProfileJSONToV3(data []byte) (*ProfileDocumentV3, int, error) {
	var envelope profileSchemaEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, 0, fmt.Errorf("parse profile envelope: %w", err)
	}
	from := envelope.SchemaVersion
	if from == ProfileSchemaVersionV3 {
		var doc ProfileDocumentV3
		if err := json.Unmarshal(data, &doc); err != nil {
			return nil, 0, fmt.Errorf("parse profile v3: %w", err)
		}
		normalized := NormalizeProfileDocumentV3(&doc)
		if err := ValidateProfileDocumentV3(normalized); err != nil {
			return nil, 0, err
		}
		return normalized, ProfileSchemaVersionV3, nil
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, 0, fmt.Errorf("parse legacy profile: %w", err)
	}

	doc, err := migrateLegacyProfileRaw(raw, from)
	if err != nil {
		return nil, 0, err
	}
	normalized := NormalizeProfileDocumentV3(doc)
	if err := ValidateProfileDocumentV3(normalized); err != nil {
		return nil, 0, err
	}
	return normalized, from, nil
}

func migrateLegacyProfileRaw(raw map[string]any, from int) (*ProfileDocumentV3, error) {
	id, _ := raw["id"].(string)
	name, _ := raw["name"].(string)
	if id == "" {
		return nil, fmt.Errorf("legacy profile id is required")
	}
	if name == "" {
		return nil, fmt.Errorf("legacy profile name is required")
	}

	displayMode := ModeEdit
	if value, ok := raw["displayMode"].(string); ok && value != "" {
		displayMode = DisplayMode(value)
	}
	monitorIndex := 0
	if value, ok := asInt(raw["monitorIndex"]); ok {
		monitorIndex = value
	}

	variantsByID := indexVariants(raw["variants"])
	layouts := map[LayoutType]SessionLayoutV3{}

	switch {
	case from == ProfileSchemaVersionV2:
		layoutMaps, err := asMapMap(raw["layouts"])
		if err != nil {
			return nil, err
		}
		if len(layoutMaps) == 0 {
			widgets, err := asMapSlice(raw["widgets"])
			if err != nil {
				return nil, err
			}
			layouts[LayoutGeneral] = migrateLegacySessionLayout(LayoutGeneral, widgets, variantsByID)
		} else {
			for _, layoutType := range legacyLayoutOrder {
				layoutRaw, ok := layoutMaps[string(layoutType)]
				if !ok {
					continue
				}
				widgets, err := asMapSlice(layoutRaw["widgets"])
				if err != nil {
					return nil, fmt.Errorf("layouts.%s.widgets: %w", layoutType, err)
				}
				layouts[layoutType] = migrateLegacySessionLayout(layoutType, widgets, variantsByID)
			}
		}
	default:
		widgets, err := asMapSlice(raw["widgets"])
		if err != nil {
			return nil, err
		}
		layouts[LayoutGeneral] = migrateLegacySessionLayout(LayoutGeneral, widgets, variantsByID)
	}

	if _, ok := layouts[LayoutGeneral]; !ok {
		return nil, fmt.Errorf("legacy profile is missing general layout")
	}

	doc := &ProfileDocumentV3{
		SchemaVersion: ProfileSchemaVersionV3,
		ID:            id,
		Name:          name,
		DisplayMode:   displayMode,
		MonitorIndex:  monitorIndex,
		Layouts:       layouts,
	}
	if sourceRaw, ok := raw["source"].(map[string]any); ok && len(sourceRaw) > 0 {
		doc.Source = migrateProfileSource(sourceRaw)
	}
	return doc, nil
}

func migrateProfileSource(source map[string]any) *ProfileSourceMeta {
	meta := &ProfileSourceMeta{}
	if kind, ok := source["kind"].(string); ok {
		meta.Kind = kind
	}
	if profileID, ok := source["profileId"].(string); ok {
		meta.ProfileID = profileID
	}
	if name, ok := source["name"].(string); ok {
		meta.Name = name
	}
	return meta
}

func migrateLegacySessionLayout(layoutType LayoutType, widgets []map[string]any, variantsByID map[string]map[string]any) SessionLayoutV3 {
	session := SessionLayoutV3{Type: layoutType}
	for index, widget := range widgets {
		widgetType, _ := widget["type"].(string)
		if _, ok := coreWidgetTypes[widgetType]; ok {
			session.Widgets = append(session.Widgets, migrateCoreWidget(widget, variantsByID, index))
			continue
		}
		id, _ := widget["id"].(string)
		session.PreservedWidgets = append(session.PreservedWidgets, PreservedWidgetV3{
			ID:     id,
			Type:   widgetType,
			Source: deepCopyMap(widget),
		})
	}
	return session
}

func migrateCoreWidget(widget map[string]any, variantsByID map[string]map[string]any, zIndex int) WidgetInstanceV3 {
	widgetType, _ := widget["type"].(string)
	variant := lookupVariant(widget, variantsByID)
	style := resolveLegacyStyle(widget, variant)
	systemID, legacyDesignID := resolveDesignSystem(style)

	content := buildWidgetContent(widget, variant)
	baseSettings := buildWidgetBaseSettings(widget, variant, legacyDesignID)

	instance := WidgetInstanceV3{
		ID:   stringFromAny(widget["id"]),
		Type: coreWidgetTypes[widgetType],
		Layout: WidgetLayoutV3{
			X:            intFromPosition(widget, "x"),
			Y:            intFromPosition(widget, "y"),
			W:            intFromPosition(widget, "w"),
			H:            intFromPosition(widget, "h"),
			ZIndex:       zIndex,
			AspectLocked: true,
		},
		Behavior: WidgetBehaviorV3{
			Enabled:  boolFromAny(widget["enabled"], true),
			UpdateHz: effectiveUpdateHz(widgetType, intFromAny(widget["updateHz"], 0)),
		},
		Content: content,
		Visual: WidgetVisualV3{
			SystemID:            systemID,
			SystemVersion:       1,
			ConfigVersion:       1,
			BaseSettings:        baseSettings,
			AppearanceOverrides: map[string]any{},
		},
	}
	if variant != nil {
		if name, ok := variant["name"].(string); ok && name != "" {
			instance.Name = name
		}
	}
	if visibleWhen := migrateVisibleWhen(widget["visibleWhen"]); visibleWhen != nil {
		instance.Behavior.VisibleWhen = visibleWhen
	}
	return instance
}

func buildWidgetContent(widget map[string]any, variant map[string]any) map[string]any {
	content := map[string]any{}
	if variant != nil {
		copyNamedContent(content, variant, "columns")
		copyNamedContent(content, variant, "filters")
		copyNamedContent(content, variant, "formats")
		copyNamedContent(content, variant, "slots")
		copyNamedContent(content, variant, "columnGroups")
	}
	if len(content) > 0 {
		return content
	}

	props := propsMap(widget, variant)
	if len(props) == 0 {
		return map[string]any{}
	}

	filters := map[string]any{}
	for key, value := range props {
		if relativeFilterKeys[key] {
			filters[key] = deepCopyAny(value)
		}
	}
	if len(filters) > 0 {
		content["filters"] = filters
	}
	for key, value := range props {
		if relativeFilterKeys[key] || visualPropKeys[key] || isTransientOrVisualPropKey(key) {
			continue
		}
		content[key] = deepCopyAny(value)
	}
	if len(content) == 0 {
		return map[string]any{}
	}
	return content
}

func buildWidgetBaseSettings(widget map[string]any, variant map[string]any, legacyDesignID string) map[string]any {
	settings := map[string]any{}
	props := propsMap(widget, variant)
	if appearance, ok := props["appearance"].(map[string]any); ok {
		for key, value := range appearance {
			settings[key] = deepCopyAny(value)
		}
	}
	for key, value := range props {
		if isTransientOrVisualPropKey(key) {
			continue
		}
		if relativeFilterKeys[key] {
			continue
		}
		if visualPropKeys[key] {
			settings[key] = deepCopyAny(value)
		}
	}
	if legacyDesignID != "" {
		settings["legacyDesignId"] = legacyDesignID
	}
	if len(settings) == 0 {
		return map[string]any{}
	}
	return settings
}

func copyNamedContent(content map[string]any, variant map[string]any, key string) {
	if value, ok := variant[key]; ok && value != nil {
		content[key] = deepCopyAny(value)
	}
}

func propsMap(widget map[string]any, variant map[string]any) map[string]any {
	merged := map[string]any{}
	if variant != nil {
		if props, ok := variant["props"].(map[string]any); ok {
			for key, value := range props {
				merged[key] = value
			}
		}
	}
	if props, ok := widget["props"].(map[string]any); ok {
		for key, value := range props {
			merged[key] = value
		}
	}
	return merged
}

func resolveLegacyStyle(widget map[string]any, variant map[string]any) string {
	props := propsMap(widget, variant)
	if style, ok := props["style"].(string); ok && style != "" {
		return style
	}
	if variant != nil {
		if themeID, ok := variant["themeId"].(string); ok && themeID != "" {
			return themeID
		}
	}
	if style, ok := widget["style"].(string); ok && style != "" {
		return style
	}
	return ""
}

func resolveDesignSystem(style string) (DesignSystemID, string) {
	if crystalLegacyStyles[style] {
		return DesignSystemVantareCrystal, ""
	}
	if style == "" {
		return DesignSystemVantareOriginal, ""
	}
	return DesignSystemVantareOriginal, style
}

func migrateVisibleWhen(raw any) *WidgetVisibilityV3 {
	visibleRaw, ok := raw.(map[string]any)
	if !ok || len(visibleRaw) == 0 {
		return nil
	}
	visibility := &WidgetVisibilityV3{}
	if inPit, ok := visibleRaw["inPit"].(bool); ok {
		visibility.InPit = &inPit
	}
	sessionTypes := migrateSessionTypes(visibleRaw["sessionType"])
	if sessionTypes == nil {
		sessionTypes = migrateSessionTypes(visibleRaw["sessionTypes"])
	}
	if len(sessionTypes) > 0 {
		visibility.SessionTypes = sessionTypes
	}
	if visibility.InPit == nil && len(visibility.SessionTypes) == 0 {
		return nil
	}
	return visibility
}

func migrateSessionTypes(raw any) []string {
	items, ok := raw.([]any)
	if !ok || len(items) == 0 {
		return nil
	}
	sessionTypes := make([]string, 0, len(items))
	for _, item := range items {
		value, ok := item.(string)
		if !ok || value == "" {
			continue
		}
		if value == "qual" {
			value = "qualifying"
		}
		sessionTypes = append(sessionTypes, value)
	}
	if len(sessionTypes) == 0 {
		return nil
	}
	return sessionTypes
}

func effectiveUpdateHz(widgetType string, hz int) int {
	if hz > 0 {
		return hz
	}
	switch widgetType {
	case string(WidgetTypeDelta), string(WidgetTypePedals):
		return 30
	case string(WidgetTypeStandings), string(WidgetTypeRelative):
		return 15
	default:
		return 30
	}
}

func lookupVariant(widget map[string]any, variantsByID map[string]map[string]any) map[string]any {
	variantID, _ := widget["variantId"].(string)
	if variantID == "" {
		return nil
	}
	return variantsByID[variantID]
}

func indexVariants(raw any) map[string]map[string]any {
	indexed := map[string]map[string]any{}
	variants, err := asMapSlice(raw)
	if err != nil {
		return indexed
	}
	for _, variant := range variants {
		id, _ := variant["id"].(string)
		if id == "" {
			continue
		}
		indexed[id] = variant
	}
	return indexed
}

func intFromPosition(widget map[string]any, key string) int {
	position, ok := widget["position"].(map[string]any)
	if !ok {
		return 0
	}
	value, _ := asInt(position[key])
	return value
}

func stringFromAny(value any) string {
	typed, _ := value.(string)
	return typed
}

func boolFromAny(value any, defaultValue bool) bool {
	typed, ok := value.(bool)
	if !ok {
		return defaultValue
	}
	return typed
}

func intFromAny(value any, defaultValue int) int {
	typed, ok := asInt(value)
	if !ok {
		return defaultValue
	}
	return typed
}

func asInt(value any) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case float64:
		return int(typed), true
	default:
		return 0, false
	}
}

func asMapSlice(raw any) ([]map[string]any, error) {
	items, ok := raw.([]any)
	if !ok {
		if raw == nil {
			return nil, nil
		}
		return nil, fmt.Errorf("expected array")
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		widget, ok := item.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("expected widget object")
		}
		result = append(result, widget)
	}
	return result, nil
}

func asMapMap(raw any) (map[string]map[string]any, error) {
	layouts, ok := raw.(map[string]any)
	if !ok {
		if raw == nil {
			return nil, nil
		}
		return nil, fmt.Errorf("expected layouts object")
	}
	result := make(map[string]map[string]any, len(layouts))
	for key, value := range layouts {
		layout, ok := value.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("expected layout object for %s", key)
		}
		result[key] = layout
	}
	return result, nil
}

func deepCopyMap(values map[string]any) map[string]any {
	if values == nil {
		return nil
	}
	data, err := json.Marshal(values)
	if err != nil {
		return copyMap(values)
	}
	var copied map[string]any
	if err := json.Unmarshal(data, &copied); err != nil {
		return copyMap(values)
	}
	return copied
}

func isTransientOrVisualPropKey(key string) bool {
	if key == "appearance" || key == "style" {
		return true
	}
	return transientPropKeys[key]
}

func deepCopyAny(value any) any {
	data, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var copied any
	if err := json.Unmarshal(data, &copied); err != nil {
		return value
	}
	return copied
}
