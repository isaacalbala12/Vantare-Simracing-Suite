package config

const ProfileSchemaVersionV3 = 3

const StudioCanvasWidth = 1920
const StudioCanvasHeight = 1080
const StudioMinimumVisible = 32

type WidgetTypeV3 string

const (
	WidgetTypeDelta                  WidgetTypeV3 = "delta"
	WidgetTypeStandings              WidgetTypeV3 = "standings"
	WidgetTypeRelative               WidgetTypeV3 = "relative"
	WidgetTypePedals                 WidgetTypeV3 = "pedals"
	WidgetTypeBroadcastTower         WidgetTypeV3 = "broadcast-tower"
	WidgetTypeFuelStrategy           WidgetTypeV3 = "fuel-strategy"
	WidgetTypePedalsTelemetry        WidgetTypeV3 = "pedals-telemetry"
	WidgetTypePedalsTelemetryCompact WidgetTypeV3 = "pedals-telemetry-compact"
	WidgetTypeRacingFlags            WidgetTypeV3 = "racing-flags"
	WidgetTypeDeltaTrace             WidgetTypeV3 = "delta-trace"
	WidgetTypeRaceSchedule           WidgetTypeV3 = "race-schedule"
	WidgetTypeHeadToHead             WidgetTypeV3 = "head-to-head"
	WidgetTypeDeltaAdvanced          WidgetTypeV3 = "delta-advanced"
	WidgetTypeInputTelemetry         WidgetTypeV3 = "input-telemetry"
	WidgetTypeMulticlassRelative     WidgetTypeV3 = "multiclass-relative"
	WidgetTypeTrackWeather           WidgetTypeV3 = "track-weather"
	WidgetTypeCarDamageVisual        WidgetTypeV3 = "car-damage-visual"
	WidgetTypeCarDamageNumbers       WidgetTypeV3 = "car-damage-numbers"
)

type DesignSystemID string

const (
	DesignSystemVantareOriginal DesignSystemID = "vantare-original"
	DesignSystemVantareCrystal  DesignSystemID = "vantare-crystal"
)

type ProfileDocumentV3 struct {
	SchemaVersion         int                            `json:"schemaVersion"`
	ID                    string                         `json:"id"`
	Name                  string                         `json:"name"`
	DisplayMode           DisplayMode                    `json:"displayMode"`
	MonitorIndex          int                            `json:"monitorIndex"`
	Layouts               map[LayoutType]SessionLayoutV3 `json:"layouts"`
	DefaultVisualSystemID *DesignSystemID                `json:"defaultVisualSystemId,omitempty"`
	Source                *ProfileSourceMeta             `json:"source,omitempty"`
}

type SessionLayoutV3 struct {
	Type             LayoutType          `json:"type"`
	Widgets          []WidgetInstanceV3  `json:"widgets"`
	PreservedWidgets []PreservedWidgetV3 `json:"preservedWidgets,omitempty"`
}

type PreservedWidgetV3 struct {
	ID     string         `json:"id"`
	Type   string         `json:"type"`
	Source map[string]any `json:"source"`
}

type WidgetInstanceV3 struct {
	ID       string           `json:"id"`
	Type     WidgetTypeV3     `json:"type"`
	Name     string           `json:"name,omitempty"`
	Layout   WidgetLayoutV3   `json:"layout"`
	Behavior WidgetBehaviorV3 `json:"behavior"`
	Content  map[string]any   `json:"content"`
	Visual   WidgetVisualV3   `json:"visual"`
}

type WidgetLayoutV3 struct {
	X            int  `json:"x"`
	Y            int  `json:"y"`
	W            int  `json:"w"`
	H            int  `json:"h"`
	ZIndex       int  `json:"zIndex"`
	AspectLocked bool `json:"aspectLocked"`
}

type WidgetBehaviorV3 struct {
	Enabled     bool                `json:"enabled"`
	UpdateHz    int                 `json:"updateHz"`
	VisibleWhen *WidgetVisibilityV3 `json:"visibleWhen,omitempty"`
}

type WidgetVisibilityV3 struct {
	InPit        *bool    `json:"inPit,omitempty"`
	SessionTypes []string `json:"sessionTypes,omitempty"`
}

type WidgetVisualV3 struct {
	SystemID            DesignSystemID                             `json:"systemId"`
	SystemVersion       int                                        `json:"systemVersion"`
	ConfigVersion       int                                        `json:"configVersion"`
	BaseSettings        map[string]any                             `json:"baseSettings"`
	AppearanceOverrides map[string]any                             `json:"appearanceOverrides"`
	Provenance          *WidgetDesignProvenanceV3                  `json:"provenance,omitempty"`
	SystemMemories      map[DesignSystemID]WidgetVisualSelectionV3 `json:"systemMemories,omitempty"`
}

type WidgetVisualSelectionV3 struct {
	SystemVersion       int                       `json:"systemVersion"`
	ConfigVersion       int                       `json:"configVersion"`
	BaseSettings        map[string]any            `json:"baseSettings"`
	AppearanceOverrides map[string]any            `json:"appearanceOverrides"`
	Provenance          *WidgetDesignProvenanceV3 `json:"provenance,omitempty"`
}

type WidgetDesignProvenanceV3 struct {
	DesignID   string `json:"designId"`
	DesignName string `json:"designName"`
	Origin     string `json:"origin"`
	AppliedAt  string `json:"appliedAt"`
}

type LoadedProfileV3 struct {
	Document     *ProfileDocumentV3
	Revision     string
	MigratedFrom int
}
