package config

import (
	"encoding/json"
	"fmt"
	"sort"
)

const (
	maxProfileIDLength   = 128
	maxProfileNameLength = 160
	maxWidgetIDLength    = 128
	maxWidgetsPerLayout  = 128
	maxPayloadBytes      = 256 * 1024
	minUpdateHz          = 1
	maxUpdateHz          = 240
)

type ProfileValidationError struct {
	Path    string
	Message string
}

func (e ProfileValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Path, e.Message)
}

func validationError(path, message string) error {
	return ProfileValidationError{Path: path, Message: message}
}

func ValidateProfileDocumentV3(p *ProfileDocumentV3) error {
	if p == nil {
		return validationError("document", "profile is nil")
	}
	if p.SchemaVersion != ProfileSchemaVersionV3 {
		return validationError("schemaVersion", "must be 3")
	}
	if p.ID == "" {
		return validationError("id", "must not be empty")
	}
	if len(p.ID) > maxProfileIDLength {
		return validationError("id", "exceeds maximum length")
	}
	if p.Name == "" {
		return validationError("name", "must not be empty")
	}
	if len(p.Name) > maxProfileNameLength {
		return validationError("name", "exceeds maximum length")
	}
	if p.Layouts == nil {
		return validationError("layouts.general", "missing required general layout")
	}
	general, ok := p.Layouts[LayoutGeneral]
	if !ok {
		return validationError("layouts.general", "missing required general layout")
	}
	for layoutKey, layout := range p.Layouts {
		prefix := "layouts." + string(layoutKey)
		if layout.Type != layoutKey {
			return validationError(prefix+".type", "layout key and type mismatch")
		}
		if err := validateSessionLayoutV3(prefix, layout); err != nil {
			return err
		}
	}
	_ = general
	return nil
}

func validateSessionLayoutV3(prefix string, layout SessionLayoutV3) error {
	total := len(layout.Widgets) + len(layout.PreservedWidgets)
	if total > maxWidgetsPerLayout {
		return validationError(prefix+".widgets", "exceeds maximum widget count")
	}

	seen := map[string]bool{}
	for i, widget := range layout.Widgets {
		path := fmt.Sprintf("%s.widgets[%d]", prefix, i)
		if seen[widget.ID] {
			return validationError(prefix+".widgets", "duplicate widget id")
		}
		seen[widget.ID] = true
		if err := validateWidgetInstanceV3(path, widget); err != nil {
			return err
		}
	}
	for i, preserved := range layout.PreservedWidgets {
		path := fmt.Sprintf("%s.preservedWidgets[%d]", prefix, i)
		if preserved.ID == "" {
			return validationError(path+".id", "must not be empty")
		}
		if len(preserved.ID) > maxWidgetIDLength {
			return validationError(path+".id", "exceeds maximum length")
		}
		if seen[preserved.ID] {
			return validationError(prefix+".preservedWidgets", "duplicate widget id")
		}
		seen[preserved.ID] = true
		if preserved.Type == "" {
			return validationError(path+".type", "must not be empty")
		}
		if err := validatePayloadSize(path+".source", preserved.Source); err != nil {
			return err
		}
	}
	return nil
}

func validateWidgetInstanceV3(path string, widget WidgetInstanceV3) error {
	if widget.ID == "" {
		return validationError(path+".id", "must not be empty")
	}
	if len(widget.ID) > maxWidgetIDLength {
		return validationError(path+".id", "exceeds maximum length")
	}
	if widget.Name != "" && len(widget.Name) > maxProfileNameLength {
		return validationError(path+".name", "exceeds maximum length")
	}
	if !isSupportedWidgetTypeV3(widget.Type) {
		return validationError(path+".type", "unsupported widget type")
	}
	if err := validateWidgetLayoutV3(path+".layout", widget.Layout); err != nil {
		return err
	}
	if err := validateWidgetBehaviorV3(path+".behavior", widget.Behavior); err != nil {
		return err
	}
	if err := validatePayloadSize(path+".content", widget.Content); err != nil {
		return err
	}
	if err := validateWidgetVisualV3(path+".visual", widget.Visual); err != nil {
		return err
	}
	return nil
}

func isSupportedWidgetTypeV3(widgetType WidgetTypeV3) bool {
	switch widgetType {
	case WidgetTypeDelta, WidgetTypeStandings, WidgetTypeRelative, WidgetTypePedals:
		return true
	default:
		return false
	}
}

func validateWidgetLayoutV3(path string, layout WidgetLayoutV3) error {
	if layout.W < 1 {
		return validationError(path+".w", "must be at least 1")
	}
	if layout.H < 1 {
		return validationError(path+".h", "must be at least 1")
	}
	recoverable := layout.X <= StudioCanvasWidth-StudioMinimumVisible &&
		layout.X+layout.W >= StudioMinimumVisible &&
		layout.Y <= StudioCanvasHeight-StudioMinimumVisible &&
		layout.Y+layout.H >= StudioMinimumVisible
	if !recoverable {
		return validationError(path, "must keep at least 32x32 recoverable pixels on canvas")
	}
	return nil
}

func validateWidgetBehaviorV3(path string, behavior WidgetBehaviorV3) error {
	if behavior.UpdateHz < minUpdateHz || behavior.UpdateHz > maxUpdateHz {
		return validationError(path+".updateHz", "must be between 1 and 240")
	}
	return nil
}

func validateWidgetVisualV3(path string, visual WidgetVisualV3) error {
	if !isSupportedDesignSystemID(visual.SystemID) {
		return validationError(path+".systemId", "unsupported design system")
	}
	if visual.SystemVersion < 1 {
		return validationError(path+".systemVersion", "must be at least 1")
	}
	if visual.ConfigVersion < 1 {
		return validationError(path+".configVersion", "must be at least 1")
	}
	if err := validatePayloadSize(path+".baseSettings", visual.BaseSettings); err != nil {
		return err
	}
	if err := validatePayloadSize(path+".appearanceOverrides", visual.AppearanceOverrides); err != nil {
		return err
	}
	return nil
}

func isSupportedDesignSystemID(systemID DesignSystemID) bool {
	switch systemID {
	case DesignSystemVantareOriginal, DesignSystemVantareCrystal:
		return true
	default:
		return false
	}
}

func validatePayloadSize(path string, payload map[string]any) error {
	if payload == nil {
		return nil
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return validationError(path, "invalid JSON payload")
	}
	if len(data) > maxPayloadBytes {
		return validationError(path, "exceeds maximum payload size")
	}
	return nil
}

func NormalizeProfileDocumentV3(p *ProfileDocumentV3) *ProfileDocumentV3 {
	if p == nil {
		return nil
	}
	next := *p
	if p.Source != nil {
		source := *p.Source
		next.Source = &source
	}
	next.Layouts = make(map[LayoutType]SessionLayoutV3, len(p.Layouts))
	for key, layout := range p.Layouts {
		next.Layouts[key] = normalizeSessionLayoutV3(layout)
	}
	return &next
}

func normalizeSessionLayoutV3(layout SessionLayoutV3) SessionLayoutV3 {
	widgets := make([]WidgetInstanceV3, len(layout.Widgets))
	copy(widgets, layout.Widgets)
	sort.SliceStable(widgets, func(i, j int) bool {
		if widgets[i].Layout.ZIndex == widgets[j].Layout.ZIndex {
			return i < j
		}
		return widgets[i].Layout.ZIndex < widgets[j].Layout.ZIndex
	})
	for i := range widgets {
		widgets[i] = normalizeWidgetInstanceV3(widgets[i])
		widgets[i].Layout.ZIndex = i
	}

	preserved := make([]PreservedWidgetV3, len(layout.PreservedWidgets))
	for i, item := range layout.PreservedWidgets {
		preserved[i] = PreservedWidgetV3{
			ID:     item.ID,
			Type:   item.Type,
			Source: copyMap(item.Source),
		}
	}

	return SessionLayoutV3{
		Type:             layout.Type,
		Widgets:          widgets,
		PreservedWidgets: preserved,
	}
}

func copyMapOrEmpty(values map[string]any) map[string]any {
	copied := copyMap(values)
	if copied == nil {
		return map[string]any{}
	}
	return copied
}

func normalizeWidgetInstanceV3(widget WidgetInstanceV3) WidgetInstanceV3 {
	next := widget
	next.Layout = widget.Layout
	next.Behavior = widget.Behavior
	if widget.Behavior.VisibleWhen != nil {
		visible := *widget.Behavior.VisibleWhen
		if widget.Behavior.VisibleWhen.InPit != nil {
			inPit := *widget.Behavior.VisibleWhen.InPit
			visible.InPit = &inPit
		}
		if widget.Behavior.VisibleWhen.SessionTypes != nil {
			visible.SessionTypes = append([]string(nil), widget.Behavior.VisibleWhen.SessionTypes...)
		}
		next.Behavior.VisibleWhen = &visible
	}
	next.Content = copyMapOrEmpty(widget.Content)
	next.Visual = WidgetVisualV3{
		SystemID:            widget.Visual.SystemID,
		SystemVersion:       widget.Visual.SystemVersion,
		ConfigVersion:       widget.Visual.ConfigVersion,
		BaseSettings:        copyMapOrEmpty(widget.Visual.BaseSettings),
		AppearanceOverrides: copyMapOrEmpty(widget.Visual.AppearanceOverrides),
	}
	if widget.Visual.Provenance != nil {
		provenance := *widget.Visual.Provenance
		next.Visual.Provenance = &provenance
	}
	return next
}
