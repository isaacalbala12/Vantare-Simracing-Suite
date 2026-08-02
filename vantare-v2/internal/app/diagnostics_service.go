package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/pkg/config"
)

const (
	DiagnosticsSchemaVersion = 1
	MaxDiagnosticsBytes      = 256 * 1024
)

var (
	ErrDiagnosticsTooLarge       = errors.New("diagnostics report exceeds the size limit")
	ErrInvalidDiagnosticsRequest = errors.New("invalid diagnostics request")
)

// DiagnosticsReport is deliberately built from a closed allowlist. It must
// never be populated by copying settings, profiles or log records wholesale.
type DiagnosticsReport struct {
	SchemaVersion  int                    `json:"schemaVersion"`
	GeneratedAtUTC time.Time              `json:"generatedAtUtc"`
	Application    DiagnosticsApplication `json:"application"`
	Telemetry      DiagnosticsTelemetry   `json:"telemetry"`
	Settings       *DiagnosticsSettings   `json:"settings,omitempty"`
	ActiveProfile  *DiagnosticsProfile    `json:"activeProfile,omitempty"`
	Launcher       *DiagnosticsLauncher   `json:"launcher,omitempty"`
}

type DiagnosticsApplication struct {
	Version   string `json:"version"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	GoVersion string `json:"goVersion"`
	NumCPU    int    `json:"numCpu"`
}

type DiagnosticsTelemetry struct {
	Source    string `json:"source"`
	Live      bool   `json:"live"`
	Available bool   `json:"available"`
}

type DiagnosticsSettings struct {
	SchemaVersion              int    `json:"schemaVersion"`
	DeltaMode                  string `json:"deltaMode"`
	CPUSampling                bool   `json:"cpuSampling"`
	HotkeyCount                int    `json:"hotkeyCount"`
	OverlayProfileConfigured   bool   `json:"overlayProfileConfigured"`
	BetaWelcomeCompleted       bool   `json:"betaWelcomeCompleted"`
	LauncherTriggerEnabled     bool   `json:"launcherTriggerEnabled"`
	LauncherOnboardingComplete bool   `json:"launcherOnboardingComplete"`
}

type DiagnosticsProfile struct {
	Present     bool     `json:"present"`
	DisplayMode string   `json:"displayMode"`
	WidgetCount int      `json:"widgetCount"`
	WidgetTypes []string `json:"widgetTypes"`
}

type DiagnosticsLauncher struct {
	AppCount     int                `json:"appCount"`
	ProfileCount int                `json:"profileCount"`
	FavoriteApps int                `json:"favoriteApps"`
	DetectedApps int                `json:"detectedApps"`
	Categories   []DiagnosticsCount `json:"categories"`
	Methods      []DiagnosticsCount `json:"methods"`
}

type DiagnosticsCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// PreparedDiagnostics is the immutable payload shown, copied and downloaded by
// the client. Payload is the exact UTF-8 JSON covered by SHA256 and ByteSize.
type PreparedDiagnostics struct {
	SchemaVersion  int       `json:"schemaVersion"`
	GeneratedAtUTC time.Time `json:"generatedAtUtc"`
	Payload        string    `json:"payload"`
	SHA256         string    `json:"sha256"`
	ByteSize       int       `json:"byteSize"`
}

type DiagnosticsRequest struct {
	RequestID string `json:"requestId"`
}

type DiagnosticsResponse struct {
	RequestID string              `json:"requestId"`
	Prepared  PreparedDiagnostics `json:"prepared"`
}

type DiagnosticsService struct {
	version      string
	profileSvc   *ProfileService
	settingsSvc  *SettingsService
	sourceStatus func() driver.SourceStatus
	now          func() time.Time
}

func NewDiagnosticsService(
	version string,
	_ string,
	pSvc *ProfileService,
	sSvc *SettingsService,
	sourceStatus func() driver.SourceStatus,
) *DiagnosticsService {
	return &DiagnosticsService{
		version:      version,
		profileSvc:   pSvc,
		settingsSvc:  sSvc,
		sourceStatus: sourceStatus,
		now:          time.Now,
	}
}

func (s *DiagnosticsService) GetDiagnostics() (*DiagnosticsReport, error) {
	now := s.now().Round(0).UTC()
	report := &DiagnosticsReport{
		SchemaVersion:  DiagnosticsSchemaVersion,
		GeneratedAtUTC: now,
		Application: DiagnosticsApplication{
			Version:   closedVersion(s.version),
			OS:        runtime.GOOS,
			Arch:      runtime.GOARCH,
			GoVersion: runtime.Version(),
			NumCPU:    runtime.NumCPU(),
		},
		Telemetry: DiagnosticsTelemetry{Source: string(driver.UnknownSourceStatus().Kind)},
	}
	if s.sourceStatus != nil {
		info := s.sourceStatus()
		report.Telemetry = DiagnosticsTelemetry{
			Source:    closedTelemetrySource(info.Kind),
			Live:      info.Live,
			Available: info.Available,
		}
	}
	if s.settingsSvc != nil {
		settings := s.settingsSvc.Snapshot()
		report.Settings = diagnosticsSettings(settings)
		report.Launcher = diagnosticsLauncher(settings)
	}
	if s.profileSvc != nil {
		report.ActiveProfile = diagnosticsProfile(s.profileSvc.GetProfile())
	}
	return report, nil
}

func (s *DiagnosticsService) PrepareDiagnosticsRequest(
	request DiagnosticsRequest,
) (DiagnosticsResponse, error) {
	if !safeRequestID(request.RequestID) {
		return DiagnosticsResponse{}, ErrInvalidDiagnosticsRequest
	}
	prepared, err := s.PrepareDiagnostics()
	if err != nil {
		return DiagnosticsResponse{}, err
	}
	return DiagnosticsResponse{RequestID: request.RequestID, Prepared: prepared}, nil
}

func (s *DiagnosticsService) PrepareDiagnostics() (PreparedDiagnostics, error) {
	report, err := s.GetDiagnostics()
	if err != nil {
		return PreparedDiagnostics{}, err
	}
	payload, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return PreparedDiagnostics{}, err
	}
	if len(payload) > MaxDiagnosticsBytes {
		return PreparedDiagnostics{}, ErrDiagnosticsTooLarge
	}
	sum := sha256.Sum256(payload)
	return PreparedDiagnostics{
		SchemaVersion:  DiagnosticsSchemaVersion,
		GeneratedAtUTC: report.GeneratedAtUTC,
		Payload:        string(payload),
		SHA256:         hex.EncodeToString(sum[:]),
		ByteSize:       len(payload),
	}, nil
}

func diagnosticsSettings(settings *AppSettings) *DiagnosticsSettings {
	if settings == nil {
		return nil
	}
	return &DiagnosticsSettings{
		SchemaVersion:              settings.SchemaVersion,
		DeltaMode:                  closedDeltaMode(settings.DeltaMode),
		CPUSampling:                settings.CpuSampling,
		HotkeyCount:                len(settings.Hotkeys),
		OverlayProfileConfigured:   settings.ActiveOverlayProfileID != "",
		BetaWelcomeCompleted:       settings.BetaWelcomeCompleted,
		LauncherTriggerEnabled:     settings.LauncherLMUTriggerEnabled,
		LauncherOnboardingComplete: settings.LauncherOnboardingCompleted,
	}
}

func diagnosticsProfile(profile *config.ProfileConfig) *DiagnosticsProfile {
	if profile == nil {
		return nil
	}
	seen := make(map[string]struct{})
	for _, widget := range profile.Widgets {
		if widgetType := closedWidgetType(widget.Type); widgetType != "" {
			seen[widgetType] = struct{}{}
		}
	}
	types := make([]string, 0, len(seen))
	for widgetType := range seen {
		types = append(types, widgetType)
	}
	sort.Strings(types)
	return &DiagnosticsProfile{
		Present:     true,
		DisplayMode: closedDisplayMode(profile.DisplayMode),
		WidgetCount: len(profile.Widgets),
		WidgetTypes: types,
	}
}

func diagnosticsLauncher(settings *AppSettings) *DiagnosticsLauncher {
	if settings == nil {
		return nil
	}
	categoryCounts := make(map[string]int)
	methodCounts := make(map[string]int)
	result := &DiagnosticsLauncher{
		AppCount:     len(settings.LauncherApps),
		ProfileCount: len(settings.LauncherProfiles),
	}
	for _, app := range settings.LauncherApps {
		if category := closedLauncherCategory(app.Category); category != "" {
			categoryCounts[category]++
		}
		if method := closedLaunchMethod(app.LaunchMethod); method != "" {
			methodCounts[method]++
		}
		if app.IsFavorite {
			result.FavoriteApps++
		}
		if app.Detected || app.Availability.Found {
			result.DetectedApps++
		}
	}
	result.Categories = sortedCounts(categoryCounts)
	result.Methods = sortedCounts(methodCounts)
	return result
}

func sortedCounts(values map[string]int) []DiagnosticsCount {
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)
	result := make([]DiagnosticsCount, 0, len(names))
	for _, name := range names {
		result = append(result, DiagnosticsCount{Name: name, Count: values[name]})
	}
	return result
}

func closedTelemetrySource(kind driver.ID) string {
	switch kind {
	case "lmu", "iracing", "ac":
		return string(kind)
	default:
		return string(driver.UnknownSourceStatus().Kind)
	}
}

func closedDeltaMode(value string) string {
	switch value {
	case "self", "session", "best", "leader":
		return value
	default:
		return "unknown"
	}
}

func closedDisplayMode(value config.DisplayMode) string {
	switch value {
	case config.ModeRacing, config.ModeEdit, config.ModeStreaming:
		return string(value)
	default:
		return "unknown"
	}
}

func closedLauncherCategory(value LauncherAppCategory) string {
	switch value {
	case AppCategorySimulator, AppCategoryStreaming, AppCategoryAudio,
		AppCategoryTelemetry, AppCategoryUtility:
		return string(value)
	default:
		return ""
	}
}

func closedLaunchMethod(value string) string {
	switch value {
	case "executable", "steam-uri", "uri", "internal":
		return value
	default:
		return ""
	}
}

func closedWidgetType(value string) string {
	switch value {
	case "delta", "standings", "relative", "pedals", "broadcast-tower",
		"fuel-strategy", "pedals-telemetry", "pedals-telemetry-compact",
		"racing-flags", "delta-trace", "race-schedule", "head-to-head",
		"delta-advanced", "input-telemetry", "multiclass-relative",
		"track-weather", "car-damage-visual", "car-damage-numbers":
		return value
	default:
		return ""
	}
}

func closedVersion(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 32 {
		return "unknown"
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '.' || character == '-' || character == '+' {
			continue
		}
		return "unknown"
	}
	return value
}

func safeRequestID(value string) bool {
	if len(value) < 8 || len(value) > 64 {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '-' || character == '_' {
			continue
		}
		return false
	}
	return true
}
