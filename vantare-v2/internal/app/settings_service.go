package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/pkg/config"
)

// ErrSettingsPathEmpty is returned when Save is called without a file path.
var ErrSettingsPathEmpty = errors.New("settings: path is empty")

// ErrSettingsNotLoaded is returned when an operation requires loaded settings.
var ErrSettingsNotLoaded = errors.New("settings: not loaded")

// ErrAppNotFound is returned when an app ID is not found in LauncherApps.
var ErrAppNotFound = errors.New("settings: app not found")

// saveBackoffs defines the backoff durations for retries.
var saveBackoffs = []time.Duration{0, 100 * time.Millisecond, 500 * time.Millisecond, 1 * time.Second}

// NotificationSettings records what the user has turned off, not what they have
// turned on.
//
// Stated as opt-outs, the zero value is the shipping default: in-app alerts on,
// desktop notifications off because they need the platform's permission first.
// A settings file written before this field existed therefore loads with the
// right behaviour, and no migration is needed.
type NotificationSettings struct {
	// UpdatesMuted hides the banner shown when a new version is available.
	UpdatesMuted bool `json:"updatesMuted,omitempty"`
	// LauncherMuted hides the toast a launch chain shows when it finishes.
	LauncherMuted bool `json:"launcherMuted,omitempty"`
	// SystemEnabled raises a Windows toast when a launch finishes while the
	// window is minimised. Off by default: it needs the platform's permission,
	// which only the user can grant.
	SystemEnabled bool `json:"systemEnabled,omitempty"`
}

// WidgetOverride conserva el formato de Personalizado sin activar todavía su
// UI. Hz es JSON porque el contrato admite un número o la cadena "dirty".
type WidgetOverride struct {
	Hz      json.RawMessage `json:"hz,omitempty"`
	Effects string          `json:"effects,omitempty"`
}

// PerformanceSettings guarda el defecto global.
type PerformanceSettings struct {
	Mode      string                    `json:"mode"`
	Level     int                       `json:"level"`
	Overrides map[string]WidgetOverride `json:"overrides,omitempty"`
}

// ResolvePerformancePolicy combina el defecto de la app con la preferencia
// del perfil v4. Un perfil sin performance equivale exactamente a inherit.
func ResolvePerformancePolicy(settings PerformanceSettings, profile *config.ProfileDocumentV4) performancepolicy.Policy {
	requested := performancepolicy.Policy{
		Mode:  performancepolicy.Mode(settings.Mode),
		Level: performancepolicy.Level(settings.Level),
	}
	if requested.Mode == performancepolicy.ModeCustom {
		requested.WidgetHz = performancepolicy.WidgetHzFor(requested.Level)
		for widget, override := range settings.Overrides {
			if rate, ok := performanceRateFromJSON(override.Hz); ok {
				requested.WidgetHz[widget] = rate
			}
		}
	}
	appPolicy := performancepolicy.Resolve(requested, nil)
	if profile == nil || profile.Performance == nil || profile.Performance.Mode == config.ProfilePerformanceInherit {
		return appPolicy
	}
	preference := profile.Performance

	profileLevel := performancepolicy.Level(preference.Level)
	if profileLevel < performancepolicy.LevelMaximum || profileLevel > performancepolicy.LevelMinimum {
		profileLevel = performancepolicy.LevelBalanced
	}
	profilePolicy := performancepolicy.Policy{Mode: performancepolicy.ModeLevel, Level: profileLevel}
	if preference.Mode == config.ProfilePerformanceCustom {
		profilePolicy.Mode = performancepolicy.ModeCustom
		profilePolicy.WidgetHz = performancepolicy.WidgetHzFor(profileLevel)
		profilePolicy.WidgetEffects = map[string]performancepolicy.Effects{}
		for widgetID, override := range preference.Overrides {
			if override.Hz != nil {
				if override.Hz.Dirty {
					profilePolicy.WidgetHz[widgetID] = performancepolicy.Dirty()
				} else if override.Hz.Hertz > 0 {
					profilePolicy.WidgetHz[widgetID] = performancepolicy.Hertz(override.Hz.Hertz)
				}
			}
			if override.Effects != nil {
				profilePolicy.WidgetEffects[widgetID] = performancepolicy.Effects(*override.Effects)
			}
		}
	}
	resolved := performancepolicy.Resolve(profilePolicy, nil)
	if requested.Mode != performancepolicy.ModeAuto {
		return resolved
	}

	// D4: el automático (fijo en 3 hasta F3) puede degradar lo pedido por el
	// perfil, pero nunca elevar su calidad. En la escala 1..5 eso es max().
	if appPolicy.Level > resolved.Level {
		degraded := performancepolicy.Policy{Mode: profilePolicy.Mode, Level: appPolicy.Level}
		if profilePolicy.Mode == performancepolicy.ModeCustom {
			degraded.WidgetHz = performancepolicy.WidgetHzFor(appPolicy.Level)
			degraded.WidgetEffects = profilePolicy.WidgetEffects
			widgetTypes := profileWidgetTypes(profile)
			for widgetID, rate := range profilePolicy.WidgetHz {
				widgetType, ok := widgetTypes[widgetID]
				if !ok {
					continue
				}
				base := degraded.WidgetHz[widgetType]
				degraded.WidgetHz[widgetID] = slowerWidgetRate(base, rate)
			}
		}
		resolved = performancepolicy.Resolve(degraded, nil)
	}
	resolved.Mode = performancepolicy.ModeAuto
	resolved.Reason = performancepolicy.ReasonUnavailable
	return resolved
}

// ResolveEffectivePerformancePolicy is the single composition boundary for
// native lifecycle consumers and TelemetryCore. Diagnostic builds force the
// complete policy, including the capability published to the overlay.
func ResolveEffectivePerformancePolicy(settings PerformanceSettings, profile *config.ProfileDocumentV4) performancepolicy.Policy {
	if override := diagnosticPerformanceLevel(); override != 0 {
		return performancepolicy.Resolve(performancepolicy.Policy{
			Mode:  performancepolicy.ModeLevel,
			Level: performancepolicy.Level(override),
		}, nil)
	}
	return ResolvePerformancePolicy(settings, profile)
}

func profileWidgetTypes(profile *config.ProfileDocumentV4) map[string]string {
	result := map[string]string{}
	if profile == nil {
		return result
	}
	for _, layout := range profile.Layouts {
		for _, widget := range layout.Widgets {
			result[widget.ID] = string(widget.Type)
		}
	}
	return result
}

func slowerWidgetRate(base, requested performancepolicy.WidgetRate) performancepolicy.WidgetRate {
	if base.Signal() == "dirty" || base.Signal() == "event" {
		return base
	}
	if requested.Signal() == "dirty" || requested.Signal() == "event" {
		return requested
	}
	if base.IsMonitor() {
		return requested
	}
	if requested.IsMonitor() {
		return base
	}
	baseHz, _ := base.Hertz()
	requestedHz, _ := requested.Hertz()
	if requestedHz < baseHz {
		return requested
	}
	return base
}

// ResolveAutomaticPerformancePolicy incorpora la decisión viva del sensor.
func ResolveAutomaticPerformancePolicy(level performancepolicy.Level, reason performancepolicy.Reason) performancepolicy.Policy {
	return performancepolicy.ResolveAuto(level, reason)
}

func performanceRateFromJSON(raw json.RawMessage) (performancepolicy.WidgetRate, bool) {
	if len(raw) == 0 {
		return performancepolicy.WidgetRate{}, false
	}
	var hz int
	if err := json.Unmarshal(raw, &hz); err == nil && hz > 0 {
		return performancepolicy.Hertz(hz), true
	}
	var signal string
	if err := json.Unmarshal(raw, &signal); err != nil {
		return performancepolicy.WidgetRate{}, false
	}
	switch signal {
	case "dirty":
		return performancepolicy.Dirty(), true
	case "event":
		return performancepolicy.Event(), true
	default:
		return performancepolicy.WidgetRate{}, false
	}
}

// AppSettings holds user-configurable global settings.
type AppSettings struct {
	SchemaVersion               int                         `json:"schemaVersion"`
	CpuSampling                 bool                        `json:"cpuSampling"`
	Performance                 PerformanceSettings         `json:"performance"`
	Notifications               NotificationSettings        `json:"notifications"`
	Hotkeys                     map[string]string           `json:"hotkeys"`
	ActiveOverlayProfileID      string                      `json:"activeOverlayProfileId,omitempty"`
	BetaWelcomeCompleted        bool                        `json:"betaWelcomeCompleted,omitempty"`
	BetaUserRole                string                      `json:"betaUserRole,omitempty"`
	LauncherApps                map[string]LauncherAppEntry `json:"launcherApps,omitempty"`
	LauncherProfiles            []LaunchProfile             `json:"launcherProfiles,omitempty"`
	LauncherLMUTriggerEnabled   bool                        `json:"launcherLmuTriggerEnabled,omitempty"`
	LauncherLMUTriggerProfileID string                      `json:"launcherLmuTriggerProfileId,omitempty"`
	LauncherOnboardingCompleted bool                        `json:"launcherOnboardingCompleted,omitempty"`
}

// LauncherAppCategory clasifica una app para la UI.
type LauncherAppCategory string

const (
	AppCategorySimulator LauncherAppCategory = "simulator"
	AppCategoryStreaming LauncherAppCategory = "streaming"
	AppCategoryAudio     LauncherAppCategory = "audio"
	AppCategoryTelemetry LauncherAppCategory = "telemetry"
	AppCategoryUtility   LauncherAppCategory = "utility"
)

// LauncherAvailability is the canonical availability contract for a
// launcher app. The flags are independent facts/derivations and are not a
// replacement for the legacy Detected field during migration.
type LauncherAvailability struct {
	Catalogued bool `json:"catalogued"`
	Found      bool `json:"found"`
	Installed  bool `json:"installed"`
	Launchable bool `json:"launchable"`
}

// LauncherAppEntry representa una app detectada o añadida manualmente.
type LauncherAppEntry struct {
	ID                 string               `json:"id"`
	DisplayName        string               `json:"displayName"`
	Abbreviation       string               `json:"abbreviation"`
	Category           LauncherAppCategory  `json:"category"`
	LaunchMethod       string               `json:"launchMethod"`
	SteamAppID         uint32               `json:"steamAppId,omitempty"`
	ExecutablePath     string               `json:"executablePath,omitempty"`
	Args               string               `json:"args,omitempty"`
	Availability       LauncherAvailability `json:"availability"`
	PathSource         string               `json:"pathSource,omitempty"`
	UserExecutablePath string               `json:"userExecutablePath,omitempty"`
	IconOverridePath   string               `json:"iconOverridePath,omitempty"`
	// Deprecated: use Availability instead. Kept for settings migration.
	Detected     bool   `json:"detected"`
	GradientFrom string `json:"gradientFrom"`
	GradientTo   string `json:"gradientTo"`
	IsFavorite   bool   `json:"isFavorite,omitempty"`
	IconURL      string `json:"iconUrl,omitempty"`
}

type AlreadyRunningPolicy string
type FailurePolicy string
type CancelPolicy string
type ExitPolicy string
type RetryPolicy string

const (
	AlreadyRunningAsk     AlreadyRunningPolicy = "ask"
	AlreadyRunningReuse   AlreadyRunningPolicy = "reuse"
	AlreadyRunningRestart AlreadyRunningPolicy = "restart"
	FailureAsk            FailurePolicy        = "ask"
	FailureStop           FailurePolicy        = "stop"
	FailureContinue       FailurePolicy        = "continue"
	CancelAsk             CancelPolicy         = "ask"
	CancelLeave           CancelPolicy         = "leave"
	CancelCloseStarted    CancelPolicy         = "close-started"
	ExitAsk               ExitPolicy           = "ask"
	ExitLeave             ExitPolicy           = "leave"
	ExitCloseStarted      ExitPolicy           = "close-started"
	RetryAsk              RetryPolicy          = "ask"
	RetryFailed           RetryPolicy          = "failed"
	RetryAll              RetryPolicy          = "all"
)

type LaunchPolicy struct {
	AlreadyRunning AlreadyRunningPolicy `json:"alreadyRunning"`
	Failure        FailurePolicy        `json:"failure"`
	Cancel         CancelPolicy         `json:"cancel"`
	Exit           ExitPolicy           `json:"exit"`
	Retry          RetryPolicy          `json:"retry"`
	MaxRetries     int                  `json:"maxRetries"`
	FirstStepDelay int                  `json:"firstStepDelay,omitempty"`
}

func DefaultLaunchPolicy() *LaunchPolicy {
	return &LaunchPolicy{AlreadyRunning: AlreadyRunningAsk, Failure: FailureAsk, Cancel: CancelAsk, Exit: ExitAsk, Retry: RetryAsk}
}

func NormalizeLaunchPolicy(policy *LaunchPolicy) *LaunchPolicy {
	out := DefaultLaunchPolicy()
	if policy != nil {
		*out = *policy
	}
	if out.AlreadyRunning != AlreadyRunningReuse && out.AlreadyRunning != AlreadyRunningRestart {
		out.AlreadyRunning = AlreadyRunningAsk
	}
	if out.Failure != FailureStop && out.Failure != FailureContinue {
		out.Failure = FailureAsk
	}
	if out.Cancel != CancelLeave && out.Cancel != CancelCloseStarted {
		out.Cancel = CancelAsk
	}
	if out.Exit != ExitLeave && out.Exit != ExitCloseStarted {
		out.Exit = ExitAsk
	}
	if out.Retry != RetryFailed && out.Retry != RetryAll {
		out.Retry = RetryAsk
	}
	if out.MaxRetries < 0 {
		out.MaxRetries = 0
	}
	if out.MaxRetries > 3 {
		out.MaxRetries = 3
	}
	if out.FirstStepDelay < 0 {
		out.FirstStepDelay = 0
	}
	return out
}

// LaunchStep es un paso dentro de un perfil.
type LaunchStep struct {
	AppID        string `json:"appId"`
	Delay        int    `json:"delay"`
	ArgsOverride string `json:"argsOverride,omitempty"`
}

// LaunchProfile es un perfil de lanzamiento editable.
type LaunchProfile struct {
	ID                     string        `json:"id"`
	Name                   string        `json:"name"`
	Description            string        `json:"description,omitempty"`
	Steps                  []LaunchStep  `json:"steps"`
	IsFavorite             bool          `json:"isFavorite,omitempty"`
	Notes                  string        `json:"notes,omitempty"`
	LaunchCount            int           `json:"launchCount,omitempty"`
	LastLaunchedAt         *time.Time    `json:"lastLaunchedAt,omitempty"`
	AvgChainDurationMs     int64         `json:"avgChainDurationMs,omitempty"`
	LaunchOnWindowsStartup bool          `json:"launchOnWindowsStartup,omitempty"`
	Hotkey                 string        `json:"hotkey,omitempty"`
	Advanced               bool          `json:"advanced,omitempty"`
	Policy                 *LaunchPolicy `json:"policy,omitempty"`
}

// DefaultAppSettings returns settings with sensible defaults.
func DefaultAppSettings() *AppSettings {
	return &AppSettings{
		SchemaVersion: appSettingsSchemaVersion,
		CpuSampling:   true,
		// TODO(#924): pasar a nivel 3 cuando el gate 12.2 esté superado
		Performance: PerformanceSettings{Mode: "level", Level: 1},
		Hotkeys: map[string]string{
			"toggleOverlay":       "ctrl+shift+v",
			"toggleEditMode":      "ctrl+shift+e",
			"cycleDeltaReference": "ctrl+shift+d",
			"nextProfile":         "ctrl+shift+right",
			"prevProfile":         "ctrl+shift+left",
		},
		LauncherApps:     defaultLauncherApps(),
		LauncherProfiles: defaultLauncherProfiles(),
	}
}

func normalizeProfiles(profiles []LaunchProfile) []LaunchProfile {
	out := make([]LaunchProfile, len(profiles))
	for i, profile := range profiles {
		out[i] = profile
		out[i].Steps = append([]LaunchStep(nil), profile.Steps...)
		out[i].Policy = NormalizeLaunchPolicy(profile.Policy)
		out[i].LastLaunchedAt = cloneTime(profile.LastLaunchedAt)
	}
	return out
}

func cloneProfiles(profiles []LaunchProfile) []LaunchProfile {
	if profiles == nil {
		return nil
	}
	out := make([]LaunchProfile, len(profiles))
	for i, profile := range profiles {
		out[i] = profile
		out[i].Steps = append([]LaunchStep(nil), profile.Steps...)
		if profile.Policy != nil {
			policy := *profile.Policy
			out[i].Policy = &policy
		}
		out[i].LastLaunchedAt = cloneTime(profile.LastLaunchedAt)
	}
	return out
}

func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneAppSettings(settings *AppSettings) *AppSettings {
	if settings == nil {
		return nil
	}
	copy := *settings
	if settings.Hotkeys != nil {
		copy.Hotkeys = make(map[string]string, len(settings.Hotkeys))
		for name, value := range settings.Hotkeys {
			copy.Hotkeys[name] = value
		}
	}
	if settings.LauncherApps != nil {
		copy.LauncherApps = make(map[string]LauncherAppEntry, len(settings.LauncherApps))
		for id, entry := range settings.LauncherApps {
			copy.LauncherApps[id] = entry
		}
	}
	if settings.LauncherProfiles != nil {
		copy.LauncherProfiles = cloneProfiles(settings.LauncherProfiles)
	}
	copy.Performance.Overrides = cloneWidgetOverrides(settings.Performance.Overrides)
	return &copy
}

func cloneWidgetOverrides(source map[string]WidgetOverride) map[string]WidgetOverride {
	if source == nil {
		return nil
	}
	result := make(map[string]WidgetOverride, len(source))
	for key, value := range source {
		value.Hz = append(json.RawMessage(nil), value.Hz...)
		result[key] = value
	}
	return result
}

// appSettingsSchemaVersion is the current shape of the persisted settings.
const appSettingsSchemaVersion = 4

// migrateSettings applies schema migrations in place.
//
//	v0 (no SchemaVersion) -> v1: set version and ensure launcher collections exist.
//	v1 -> v2: drop deltaMode. Nothing in Go, in cmd or in the frontend ever read
//	          it to change behaviour, so there is nothing to carry forward: the
//	          field leaves the struct and disappears on the next save. Unknown
//	          keys in an older file are ignored by the decoder, so a v1 file
//	          loads cleanly. cpuSampling stays -- it drives the runtime CPU
//	          sampler through SetCPUEnabled.
//	v2 -> v3: add the configurable Delta reference hotkey without replacing any
//	          user-defined combinations.
//	v3 -> v4: add the global performance default at parity level.
func (s *SettingsService) migrateSettings(settings *AppSettings) {
	if settings.SchemaVersion == 0 {
		settings.SchemaVersion = 1
		if settings.LauncherApps == nil {
			settings.LauncherApps = defaultLauncherApps()
		}
		if settings.LauncherProfiles == nil {
			settings.LauncherProfiles = defaultLauncherProfiles()
		}
	}
	if settings.SchemaVersion < 2 {
		settings.SchemaVersion = 2
	}
	if settings.SchemaVersion < 3 {
		if settings.Hotkeys == nil {
			settings.Hotkeys = map[string]string{}
		}
		if _, exists := settings.Hotkeys["cycleDeltaReference"]; !exists {
			settings.Hotkeys["cycleDeltaReference"] = "ctrl+shift+d"
		}
		settings.SchemaVersion = 3
	}
	if settings.SchemaVersion < 4 {
		if settings.Performance.Mode == "" {
			settings.Performance = PerformanceSettings{Mode: "level", Level: 1}
		}
		settings.SchemaVersion = 4
	}
}

func defaultLauncherApps() map[string]LauncherAppEntry {
	// LMU detectada por defecto (el discovery la sobreescribe si la encuentra)
	lmu := LauncherAppEntry{
		ID: "lmu", DisplayName: "Le Mans Ultimate", Abbreviation: "LMU",
		Category: AppCategorySimulator, LaunchMethod: "steam-uri",
		SteamAppID: 2399420, Detected: true,
		GradientFrom: "#ff3b3b", GradientTo: "#9a0606",
	}
	return map[string]LauncherAppEntry{"lmu": lmu}
}

func defaultLauncherProfiles() []LaunchProfile {
	return []LaunchProfile{
		{
			ID:   "creator",
			Name: "Creador de Contenido",
			Steps: []LaunchStep{
				{AppID: "lmu", Delay: 0},
				{AppID: "obs", Delay: 2},
				{AppID: "spotify", Delay: 2},
			},
		},
		{
			ID:   "pro",
			Name: "Pro",
			Steps: []LaunchStep{
				{AppID: "lmu", Delay: 0},
				{AppID: "crewchief", Delay: 2},
				{AppID: "spotify", Delay: 2},
				{AppID: "motec", Delay: 2},
			},
		},
	}
}

// SettingsService persists AppSettings to a JSON file and emits Wails events.
type SettingsService struct {
	mu sync.RWMutex
	// writeMu serialises the temp-file-then-rename dance. s.mu guards the
	// in-memory settings and is deliberately released during I/O, so without a
	// separate lock two savers could rename onto the same destination at once —
	// which Windows rejects outright while the other holds the file open.
	writeMu  sync.Mutex
	path     string
	settings *AppSettings
	emitter  EventEmitter
	logger   *slog.Logger
}

// NewSettingsService creates a settings service backed by the given JSON file.
// If logger is nil, slog.Default() is used.
func NewSettingsService(path string, emitter EventEmitter, logger *slog.Logger) *SettingsService {
	if logger == nil {
		logger = slog.Default()
	}
	return &SettingsService{
		path:    path,
		emitter: emitter,
		logger:  logger,
	}
}

// Settings returns a deep snapshot of the current settings. Mutations must be
// persisted explicitly through Save or the focused setter methods.
func (s *SettingsService) Settings() *AppSettings {
	return s.Snapshot()
}

// Snapshot returns a deep copy that can be inspected without holding the
// service lock. Callers may mutate the copy without touching live settings.
func (s *SettingsService) Snapshot() *AppSettings {
	s.mu.RLock()
	if s.settings != nil {
		result := cloneAppSettings(s.settings)
		s.mu.RUnlock()
		return result
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	return cloneAppSettings(s.settings)
}

// GetLauncherApps returns the current launcher apps map with a read lock.
func (s *SettingsService) GetLauncherApps() map[string]LauncherAppEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.settings == nil {
		return nil
	}
	result := make(map[string]LauncherAppEntry, len(s.settings.LauncherApps))
	for id, entry := range s.settings.LauncherApps {
		result[id] = entry
	}
	return result
}

// SetLauncherApps replaces the entire LauncherApps map and persists the change.
func (s *SettingsService) SetLauncherApps(apps map[string]LauncherAppEntry) error {
	s.mu.Lock()
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	s.settings.LauncherApps = make(map[string]LauncherAppEntry, len(apps))
	for k, v := range apps {
		s.settings.LauncherApps[k] = v
	}
	// Marshal under lock for data consistency, then persist without the lock.
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("marshal: %w", err)
	}
	settings := s.settings
	s.mu.Unlock()

	return s.saveWithRetry(settings, data, 0)
}

// GetLauncherProfiles returns the current launch profiles slice with a read lock.
func (s *SettingsService) GetLauncherProfiles() []LaunchProfile {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.settings == nil {
		return nil
	}
	return cloneProfiles(s.settings.LauncherProfiles)
}

// SetLauncherProfiles replaces the entire LaunchProfiles slice and persists the change.
func (s *SettingsService) SetLauncherProfiles(profiles []LaunchProfile) error {
	s.mu.Lock()
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	s.settings.LauncherProfiles = normalizeProfiles(profiles)
	// Marshal under lock for data consistency, then persist without the lock.
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("marshal: %w", err)
	}
	settings := s.settings
	s.mu.Unlock()

	return s.saveWithRetry(settings, data, 0)
}

// UpdateLauncherAppArgs updates the Args field of a launcher app entry and
// persists the change. It returns ErrAppNotFound if the app ID does not exist.
func (s *SettingsService) UpdateLauncherAppArgs(id, args string) error {
	s.mu.Lock()
	if s.settings == nil {
		s.mu.Unlock()
		return ErrSettingsNotLoaded
	}
	entry, ok := s.settings.LauncherApps[id]
	if !ok {
		s.mu.Unlock()
		return ErrAppNotFound
	}
	entry.Args = args
	s.settings.LauncherApps[id] = entry
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("marshal: %w", err)
	}
	settings := s.settings
	s.mu.Unlock()

	return s.saveWithRetry(settings, data, 0)
}

// SetLauncherAppFavorite updates the IsFavorite field of a launcher app entry
// and persists the change. Returns ErrAppNotFound if the app ID does not exist.
func (s *SettingsService) SetLauncherAppFavorite(id string, favorite bool) error {
	s.mu.Lock()
	if s.settings == nil {
		s.mu.Unlock()
		return ErrSettingsNotLoaded
	}
	entry, ok := s.settings.LauncherApps[id]
	if !ok {
		s.mu.Unlock()
		return ErrAppNotFound
	}
	entry.IsFavorite = favorite
	s.settings.LauncherApps[id] = entry
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("marshal: %w", err)
	}
	settings := s.settings
	s.mu.Unlock()
	return s.saveWithRetry(settings, data, 0)
}

// Load reads settings from disk with tolerance for corruption.
// Priority order: .failed sidecar → main file → .bak → defaults.
func (s *SettingsService) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked()
}

// loadLocked performs the load with the mutex already held.
func (s *SettingsService) loadLocked() error {
	s.settings = DefaultAppSettings()
	s.migrateSettings(s.settings)
	if s.path == "" {
		return nil
	}

	// 1. Sidecar recovery: if a .failed file exists, check staleness and apply if valid.
	if sidecarData, err := os.ReadFile(s.path + ".failed"); err == nil {
		var sc AppSettings
		if err := json.Unmarshal(sidecarData, &sc); err == nil {
			mainStat, mainStatErr := os.Stat(s.path)
			sidecarStat, sidecarStatErr := os.Stat(s.path + ".failed")
			applySidecar := false
			if os.IsNotExist(mainStatErr) {
				// Main does not exist: apply sidecar.
				applySidecar = true
			} else if sidecarStatErr == nil && sidecarStat.ModTime().After(mainStat.ModTime()) {
				// Sidecar is newer than main: apply.
				applySidecar = true
			}
			if applySidecar {
				s.logger.Warn("settings recovered from sidecar", "path", s.path)
				s.applyLoaded(&sc)
				_ = os.Remove(s.path + ".failed")
				return s.persistSidecarApplied()
			}
			// Sidecar is stale (main is newer): remove it and continue with main.
			_ = os.Remove(s.path + ".failed")
			s.logger.Info("stale sidecar removed", "path", s.path)
		} else {
			// Unparseable sidecar: remove and continue.
			_ = os.Remove(s.path + ".failed")
		}
	}

	// 2. Try main file.
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // defaults already loaded
		}
		return fmt.Errorf("read: %w", err)
	}
	var loaded AppSettings
	if err := json.Unmarshal(data, &loaded); err != nil {
		// 3. Fallback to .bak.
		if bakData, bakErr := os.ReadFile(s.path + ".bak"); bakErr == nil {
			if err := json.Unmarshal(bakData, &loaded); err == nil {
				s.logger.Warn("settings main file corrupted, recovered from .bak", "path", s.path)
				s.applyLoaded(&loaded)
				return nil
			}
		}
		// 4. Everything failed, use defaults (already set).
		s.logger.Error("settings main and .bak both corrupted, using defaults — USER DATA LOST", "path", s.path)
		return nil
	}
	s.applyLoaded(&loaded)
	return nil
}

// applyLoaded merges the loaded settings, using defaults only for nil
// map/slice fields. It does NOT allocate default maps unless the loaded
// file lacks them, preserving SchemaVersion from the persisted data.
func (s *SettingsService) applyLoaded(loaded *AppSettings) {
	if loaded == nil {
		s.settings = DefaultAppSettings()
		s.migrateSettings(s.settings)
		return
	}
	// Every scalar field has to be named here, so a field added to AppSettings
	// and forgotten in this list is read from disk and then dropped on the
	// floor. TestApplyLoadedKeepsEveryPersistedField exists to catch that.
	merged := &AppSettings{
		SchemaVersion:               loaded.SchemaVersion,
		CpuSampling:                 loaded.CpuSampling,
		Performance:                 loaded.Performance,
		Notifications:               loaded.Notifications,
		ActiveOverlayProfileID:      loaded.ActiveOverlayProfileID,
		BetaWelcomeCompleted:        loaded.BetaWelcomeCompleted,
		BetaUserRole:                loaded.BetaUserRole,
		LauncherLMUTriggerEnabled:   loaded.LauncherLMUTriggerEnabled,
		LauncherLMUTriggerProfileID: loaded.LauncherLMUTriggerProfileID,
		LauncherOnboardingCompleted: loaded.LauncherOnboardingCompleted,
	}
	merged.Performance.Overrides = cloneWidgetOverrides(loaded.Performance.Overrides)
	if loaded.Hotkeys != nil {
		merged.Hotkeys = make(map[string]string, len(loaded.Hotkeys))
		for k, v := range loaded.Hotkeys {
			merged.Hotkeys[k] = v
		}
	} else {
		merged.Hotkeys = map[string]string{
			"toggleOverlay":       "ctrl+shift+v",
			"toggleEditMode":      "ctrl+shift+e",
			"cycleDeltaReference": "ctrl+shift+d",
			"nextProfile":         "ctrl+shift+right",
			"prevProfile":         "ctrl+shift+left",
		}
	}
	if loaded.LauncherApps != nil {
		merged.LauncherApps = make(map[string]LauncherAppEntry, len(loaded.LauncherApps))
		for k, v := range loaded.LauncherApps {
			merged.LauncherApps[k] = v
		}
	} else {
		merged.LauncherApps = defaultLauncherApps()
	}
	if loaded.LauncherProfiles != nil {
		merged.LauncherProfiles = normalizeProfiles(loaded.LauncherProfiles)
	} else {
		merged.LauncherProfiles = defaultLauncherProfiles()
	}
	s.migrateSettings(merged)
	if merged.Performance.Level < 1 || merged.Performance.Level > 5 {
		merged.Performance = PerformanceSettings{Mode: "level", Level: 1}
	}
	s.settings = merged
}

// EffectivePerformancePolicy resolves the same canonical policy published in
// capabilities.performance. Diagnostic builds may force a nominal level for
// reproducible lifecycle measurements without changing persisted settings.
func (s *SettingsService) EffectivePerformancePolicy(profile *config.ProfileDocumentV4) performancepolicy.Policy {
	return ResolveEffectivePerformancePolicy(s.Snapshot().Performance, profile)
}

// persistSidecarApplied writes the current settings to disk (via atomicWrite)
// after a sidecar was successfully applied. Called under the loadLocked lock.
func (s *SettingsService) persistSidecarApplied() error {
	if s.settings == nil {
		return nil
	}
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		return err
	}
	if dir := filepath.Dir(s.path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("mkdir: %w", err)
		}
	}
	if err := s.atomicWrite(data); err != nil {
		return fmt.Errorf("persist sidecar: %w", err)
	}
	return nil
}

// Save persists settings to disk atomically with retry+backoff and .bak rotation.
// It marshals the settings under the write lock for data consistency, then
// releases the lock before I/O and sleep so the mutex is never held during
// backoff delays.
func (s *SettingsService) Save(settings *AppSettings) error {
	if settings == nil {
		return fmt.Errorf("settings cannot be nil")
	}
	if s.path == "" {
		return ErrSettingsPathEmpty
	}
	snapshot := cloneAppSettings(settings)
	if snapshot.Performance.Mode == string(performancepolicy.ModeAuto) {
		snapshot.CpuSampling = true
	}
	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	// Directory is ensured at the top of saveWithRetry (idempotent).
	return s.saveWithRetry(snapshot, data, 0)
}

// saveWithRetry attempts to persist data atomically, retrying with backoff
// on failure. The caller must NOT hold s.mu — this function takes the lock
// only briefly to update s.settings after a successful write.
func (s *SettingsService) saveWithRetry(settings *AppSettings, data []byte, attempt int) error {
	if dir := filepath.Dir(s.path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("mkdir: %w", err)
		}
	}
	err := s.atomicWrite(data)
	if err == nil {
		_ = os.Remove(s.path + ".failed")
		s.mu.Lock()
		s.settings = cloneAppSettings(settings)
		s.mu.Unlock()
		return nil
	}
	if attempt+1 < len(saveBackoffs) {
		time.Sleep(saveBackoffs[attempt+1])
		return s.saveWithRetry(settings, data, attempt+1)
	}
	// Exhausted: write payload to sidecar file.
	_ = os.WriteFile(s.path+".failed", data, 0o644)
	return fmt.Errorf("save failed after retries: %w", err)
}

// atomicWrite performs a safe write: temp file → rename → .bak rotation.
// It serialises writers on s.writeMu but does NOT take s.mu; callers that need
// memory consistency (e.g. s.settings = settings) must do so separately.
func (s *SettingsService) atomicWrite(data []byte) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	bakPath := s.path + ".bak"

	// One temp file per write. A fixed ".tmp" name made concurrent savers fight
	// over the same path: on Windows the second writer cannot even open it while
	// the first holds a handle, and whoever renamed first left the other renaming
	// a file that no longer existed. os.CreateTemp gives each write its own name,
	// which is what widget_design_service already does.
	tmp, err := os.CreateTemp(filepath.Dir(s.path), filepath.Base(s.path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("write tmp: %w", err)
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("write tmp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("write tmp: %w", err)
	}
	if err := os.Chmod(tmpPath, 0o644); err != nil {
		s.logger.Warn("failed to chmod tmp, continuing", "err", err)
	}

	var oldData []byte
	if existing, err := os.ReadFile(s.path); err == nil {
		oldData = existing
	}

	if err := os.Rename(tmpPath, s.path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename tmp: %w", err)
	}

	// Rotate .bak with the old main content. Failure is non-fatal.
	if oldData != nil {
		if err := os.WriteFile(bakPath, oldData, 0o644); err != nil {
			s.logger.Warn("failed to write .bak, continuing", "err", err)
		}
	}

	return nil
}

// ValidateHotkeyCombo checks that a hotkey string has at least two parts (modifier+key).
func ValidateHotkeyCombo(combo string) error {
	if combo == "" {
		return fmt.Errorf("hotkey cannot be empty")
	}
	parts := strings.Split(strings.ToLower(combo), "+")
	if len(parts) < 2 {
		return fmt.Errorf("hotkey %q must have at least 2 keys (e.g. ctrl+shift+v)", combo)
	}
	// Validate modifiers
	mods := parts[:len(parts)-1]
	for _, m := range mods {
		switch m {
		case "ctrl", "alt", "shift", "win":
			// valid
		default:
			return fmt.Errorf("unknown modifier %q in hotkey %q", m, combo)
		}
	}
	// Key part must not be empty
	key := parts[len(parts)-1]
	if key == "" {
		return fmt.Errorf("missing key in hotkey %q", combo)
	}
	return nil
}
