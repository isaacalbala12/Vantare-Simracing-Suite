package config

import (
	"bytes"
	"encoding/json"
	"fmt"
)

const ProfileSchemaVersionV4 = 4

type ProfilePerformanceModeV4 string

const (
	ProfilePerformanceInherit ProfilePerformanceModeV4 = "inherit"
	ProfilePerformanceLevel   ProfilePerformanceModeV4 = "level"
	ProfilePerformanceCustom  ProfilePerformanceModeV4 = "custom"
)

type ProfilePerformanceEffectsV4 string

const (
	ProfileEffectsFull   ProfilePerformanceEffectsV4 = "full"
	ProfileEffectsNoBlur ProfilePerformanceEffectsV4 = "noBlur"
	ProfileEffectsFlat   ProfilePerformanceEffectsV4 = "flat"
)

// ProfileWidgetRateV4 is the profile wire value number | "dirty".
type ProfileWidgetRateV4 struct {
	Hertz int
	Dirty bool
}

func (rate ProfileWidgetRateV4) MarshalJSON() ([]byte, error) {
	if rate.Dirty && rate.Hertz == 0 {
		return json.Marshal("dirty")
	}
	if rate.Hertz > 0 && !rate.Dirty {
		return json.Marshal(rate.Hertz)
	}
	return nil, fmt.Errorf("invalid profile widget rate: hz=%d dirty=%t", rate.Hertz, rate.Dirty)
}

func (rate *ProfileWidgetRateV4) UnmarshalJSON(data []byte) error {
	if bytes.Equal(bytes.TrimSpace(data), []byte(`"dirty"`)) {
		rate.Hertz = 0
		rate.Dirty = true
		return nil
	}
	var hertz int
	if err := json.Unmarshal(data, &hertz); err != nil {
		return fmt.Errorf("profile widget rate must be a positive integer or dirty: %w", err)
	}
	if hertz < 1 || hertz > 240 {
		return fmt.Errorf("profile widget rate must be between 1 and 240")
	}
	rate.Hertz = hertz
	rate.Dirty = false
	return nil
}

type ProfilePerformanceOverrideV4 struct {
	Hz *ProfileWidgetRateV4 `json:"hz,omitempty"`
	// Effects is reserved for the dedicated Endurance noBlur/flat variants issue.
	// C2 preserves the field but does not offer it as a per-widget control.
	Effects *ProfilePerformanceEffectsV4 `json:"effects,omitempty"`
}

type ProfilePerformanceV4 struct {
	Mode      ProfilePerformanceModeV4                `json:"mode"`
	Level     int                                     `json:"level,omitempty"`
	Overrides map[string]ProfilePerformanceOverrideV4 `json:"overrides,omitempty"`
}

type ProfileDocumentV4 struct {
	SchemaVersion         int                            `json:"schemaVersion"`
	ID                    string                         `json:"id"`
	Name                  string                         `json:"name"`
	DisplayMode           DisplayMode                    `json:"displayMode"`
	MonitorIndex          int                            `json:"monitorIndex"`
	LayoutViewport        *LayoutViewportV3              `json:"layoutViewport,omitempty"`
	Layouts               map[LayoutType]SessionLayoutV4 `json:"layouts"`
	DefaultVisualSystemID *DesignSystemID                `json:"defaultVisualSystemId,omitempty"`
	Source                *ProfileSourceMeta             `json:"source,omitempty"`
	Performance           *ProfilePerformanceV4          `json:"performance,omitempty"`
}

type SessionLayoutV4 struct {
	Type             LayoutType          `json:"type"`
	Widgets          []WidgetInstanceV4  `json:"widgets"`
	PreservedWidgets []PreservedWidgetV3 `json:"preservedWidgets,omitempty"`
}

type WidgetInstanceV4 struct {
	ID       string           `json:"id"`
	Type     WidgetTypeV3     `json:"type"`
	Name     string           `json:"name,omitempty"`
	Layout   WidgetLayoutV3   `json:"layout"`
	Behavior WidgetBehaviorV4 `json:"behavior"`
	Content  map[string]any   `json:"content"`
	Visual   WidgetVisualV3   `json:"visual"`
}

// WidgetBehaviorV4 deliberately has no updateHz. Cadence belongs to policy.
type WidgetBehaviorV4 struct {
	Enabled     bool                `json:"enabled"`
	VisibleWhen *WidgetVisibilityV3 `json:"visibleWhen,omitempty"`
}

type ProfileMigrationNoticeV4 struct {
	Path       string       `json:"path"`
	WidgetID   string       `json:"widgetId"`
	WidgetType WidgetTypeV3 `json:"widgetType"`
	UpdateHz   int          `json:"updateHz"`
	Message    string       `json:"message"`
}

type LoadedProfileV4 struct {
	Document         *ProfileDocumentV4
	Revision         string
	MigratedFrom     int
	MigrationNotices []ProfileMigrationNoticeV4
}

func ConvertProfileV3ToV4(doc *ProfileDocumentV3) *ProfileDocumentV4 {
	if doc == nil {
		return nil
	}
	result := &ProfileDocumentV4{
		SchemaVersion: ProfileSchemaVersionV4,
		ID:            doc.ID, Name: doc.Name, DisplayMode: doc.DisplayMode, MonitorIndex: doc.MonitorIndex,
		LayoutViewport: doc.LayoutViewport, DefaultVisualSystemID: doc.DefaultVisualSystemID, Source: doc.Source,
		Layouts: make(map[LayoutType]SessionLayoutV4, len(doc.Layouts)),
	}
	for key, layout := range doc.Layouts {
		next := SessionLayoutV4{Type: layout.Type, PreservedWidgets: layout.PreservedWidgets}
		for _, widget := range layout.Widgets {
			next.Widgets = append(next.Widgets, WidgetInstanceV4{
				ID: widget.ID, Type: widget.Type, Name: widget.Name, Layout: widget.Layout,
				Behavior: WidgetBehaviorV4{Enabled: widget.Behavior.Enabled, VisibleWhen: widget.Behavior.VisibleWhen},
				Content:  widget.Content, Visual: widget.Visual,
			})
		}
		result.Layouts[key] = next
	}
	return result
}

// ConvertProfileV4ToV3 is an in-memory compatibility adapter for consumers
// that have not yet renamed their V3 domain types. It never writes updateHz.
func ConvertProfileV4ToV3(doc *ProfileDocumentV4) *ProfileDocumentV3 {
	if doc == nil {
		return nil
	}
	result := &ProfileDocumentV3{
		SchemaVersion: ProfileSchemaVersionV3,
		ID:            doc.ID, Name: doc.Name, DisplayMode: doc.DisplayMode, MonitorIndex: doc.MonitorIndex,
		LayoutViewport: doc.LayoutViewport, DefaultVisualSystemID: doc.DefaultVisualSystemID, Source: doc.Source,
		Layouts: make(map[LayoutType]SessionLayoutV3, len(doc.Layouts)),
	}
	for key, layout := range doc.Layouts {
		next := SessionLayoutV3{Type: layout.Type, PreservedWidgets: layout.PreservedWidgets}
		for _, widget := range layout.Widgets {
			next.Widgets = append(next.Widgets, WidgetInstanceV3{
				ID: widget.ID, Type: widget.Type, Name: widget.Name, Layout: widget.Layout,
				Behavior: WidgetBehaviorV3{Enabled: widget.Behavior.Enabled, UpdateHz: 1, VisibleWhen: widget.Behavior.VisibleWhen},
				Content:  widget.Content, Visual: widget.Visual,
			})
		}
		result.Layouts[key] = next
	}
	return NormalizeProfileDocumentV3(result)
}

func ValidateProfileDocumentV4(doc *ProfileDocumentV4) error {
	if doc == nil {
		return validationError("document", "profile is nil")
	}
	if doc.SchemaVersion != ProfileSchemaVersionV4 {
		return validationError("schemaVersion", "must be 4")
	}
	compat := ConvertProfileV4ToV3(doc)
	if err := ValidateProfileDocumentV3(compat); err != nil {
		return err
	}
	if doc.Performance == nil {
		return nil
	}
	switch doc.Performance.Mode {
	case ProfilePerformanceInherit:
		if doc.Performance.Level != 0 || len(doc.Performance.Overrides) != 0 {
			return validationError("performance", "inherit must not declare level or overrides")
		}
	case ProfilePerformanceLevel:
		if doc.Performance.Level < 1 || doc.Performance.Level > 5 {
			return validationError("performance.level", "must be between 1 and 5")
		}
		if len(doc.Performance.Overrides) != 0 {
			return validationError("performance.overrides", "level must not declare overrides")
		}
	case ProfilePerformanceCustom:
		if doc.Performance.Level < 1 || doc.Performance.Level > 5 {
			return validationError("performance.level", "must be between 1 and 5")
		}
		for widgetID, override := range doc.Performance.Overrides {
			if widgetID == "" {
				return validationError("performance.overrides", "widget id must not be empty")
			}
			if override.Hz == nil && override.Effects == nil {
				return validationError("performance.overrides."+widgetID, "must declare hz or effects")
			}
			if override.Effects != nil && *override.Effects != ProfileEffectsFull && *override.Effects != ProfileEffectsNoBlur && *override.Effects != ProfileEffectsFlat {
				return validationError("performance.overrides."+widgetID+".effects", "unsupported effects")
			}
		}
	default:
		return validationError("performance.mode", "must be inherit, level or custom")
	}
	return nil
}

func NormalizeProfileDocumentV4(doc *ProfileDocumentV4) *ProfileDocumentV4 {
	if doc == nil {
		return nil
	}
	next := *doc
	next.SchemaVersion = ProfileSchemaVersionV4
	if doc.LayoutViewport != nil {
		viewport := *doc.LayoutViewport
		next.LayoutViewport = &viewport
	}
	if doc.DefaultVisualSystemID != nil {
		value := *doc.DefaultVisualSystemID
		next.DefaultVisualSystemID = &value
	}
	if doc.Source != nil {
		value := *doc.Source
		next.Source = &value
	}
	if doc.Performance != nil {
		value := *doc.Performance
		if doc.Performance.Overrides != nil {
			value.Overrides = make(map[string]ProfilePerformanceOverrideV4, len(doc.Performance.Overrides))
			for key, override := range doc.Performance.Overrides {
				value.Overrides[key] = override
			}
		}
		next.Performance = &value
	}
	compat := NormalizeProfileDocumentV3(ConvertProfileV4ToV3(&next))
	normalized := ConvertProfileV3ToV4(compat)
	normalized.Performance = next.Performance
	return normalized
}
