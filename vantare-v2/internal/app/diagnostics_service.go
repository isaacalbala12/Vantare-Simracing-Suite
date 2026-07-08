package app

import (
	"os"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/pkg/config"
)

// SanitizedLauncherApp is a redacted version of LauncherAppEntry.
type SanitizedLauncherApp struct {
	ID             string `json:"id"`
	DisplayName    string `json:"displayName"`
	Category       string `json:"category"`
	LaunchMethod   string `json:"launchMethod"`
	Detected       bool   `json:"detected"`
	ExecutablePath string `json:"executablePath,omitempty"` // redacted
	Args           string `json:"args,omitempty"`           // redacted
	IsFavorite     bool   `json:"isFavorite"`
}

// SanitizedLauncherProfile is a redacted version of LaunchProfile.
type SanitizedLauncherProfile struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Notes string `json:"notes,omitempty"` // paths redactados
	Steps int    `json:"steps"`
}

// SanitizedAppSettings is a redacted version of AppSettings safe for diagnostics.
type SanitizedAppSettings struct {
	DeltaMode              string                          `json:"deltaMode"`
	CpuSampling            bool                            `json:"cpuSampling"`
	Hotkeys                map[string]string               `json:"hotkeys"`
	ActiveOverlayProfileID string                          `json:"activeOverlayProfileId,omitempty"`
	BetaWelcomeCompleted   bool                            `json:"betaWelcomeCompleted,omitempty"`
	BetaUserRole           string                          `json:"betaUserRole,omitempty"`
	LauncherApps           map[string]SanitizedLauncherApp `json:"launcherApps,omitempty"`
	LauncherProfiles       []SanitizedLauncherProfile      `json:"launcherProfiles,omitempty"`
}

// SanitizedProfileSummary is a redacted summary of a profile safe for diagnostics.
type SanitizedProfileSummary struct {
	ID          string   `json:"id,omitempty"`
	Name        string   `json:"name,omitempty"`
	DisplayMode string   `json:"displayMode"`
	WidgetCount int      `json:"widgetCount"`
	WidgetTypes []string `json:"widgetTypes,omitempty"`
}

// DiagnosticsInfo holds sanitized system and application diagnostic data.
type DiagnosticsInfo struct {
	AppVersion      string                   `json:"appVersion"`
	OS              string                   `json:"os"`
	Arch            string                   `json:"arch"`
	GoVersion       string                   `json:"goVersion"`
	NumCPU          int                      `json:"numCpu"`
	ConfigsDir      string                   `json:"configsDir"`
	ActiveProfileID string                   `json:"activeProfileId"`
	TelemetrySource string                   `json:"telemetrySource"`
	TelemetryLive   bool                     `json:"telemetryLive"`
	AppSettings     *SanitizedAppSettings    `json:"appSettings"`
	ActiveProfile   *SanitizedProfileSummary `json:"activeProfile,omitempty"`
	Timestamp       string                   `json:"timestamp"`
}

// pathInTextRe matches Windows drive-letter paths like C:\something.
var pathInTextRe = regexp.MustCompile(`[A-Za-z]:\\[^"'\n]+`)

// redactPaths replaces Windows paths in free text with [redacted].
func redactPaths(s string) string {
	return pathInTextRe.ReplaceAllString(s, "[redacted]")
}

// SanitizeLauncherProfiles applies path redaction to the Notes field of each profile.
func (s *DiagnosticsService) SanitizeLauncherProfiles(profiles []SanitizedLauncherProfile) []SanitizedLauncherProfile {
	out := make([]SanitizedLauncherProfile, len(profiles))
	for i, p := range profiles {
		p.Notes = redactPaths(p.Notes)
		out[i] = p
	}
	return out
}

// SanitizeLauncherApps applies path redaction to Args and ExecutablePath of each app.
func (s *DiagnosticsService) SanitizeLauncherApps(apps []SanitizedLauncherApp) []SanitizedLauncherApp {
	out := make([]SanitizedLauncherApp, len(apps))
	for i, a := range apps {
		a.Args = redactPaths(a.Args)
		a.ExecutablePath = redactPaths(a.ExecutablePath)
		out[i] = a
	}
	return out
}

// DiagnosticsService collects system and application information for troubleshooting.
type DiagnosticsService struct {
	version     string
	cfgDir      string
	profileSvc  *ProfileService
	settingsSvc *SettingsService
	app         *App
}

// NewDiagnosticsService creates a new DiagnosticsService.
func NewDiagnosticsService(version string, cfgDir string, pSvc *ProfileService, sSvc *SettingsService, app *App) *DiagnosticsService {
	return &DiagnosticsService{
		version:     version,
		cfgDir:      cfgDir,
		profileSvc:  pSvc,
		settingsSvc: sSvc,
		app:         app,
	}
}

// GetDiagnostics compiles the system information securely and sanitizes personal paths.
func (s *DiagnosticsService) GetDiagnostics() (*DiagnosticsInfo, error) {
	info := &DiagnosticsInfo{
		AppVersion: s.version,
		OS:         runtime.GOOS,
		Arch:       runtime.GOARCH,
		GoVersion:  runtime.Version(),
		NumCPU:     runtime.NumCPU(),
		ConfigsDir: s.sanitizePath(s.cfgDir),
		Timestamp:  time.Now().Local().Format(time.RFC3339),
	}

	if s.settingsSvc != nil {
		info.AppSettings = s.sanitizeSettings(s.settingsSvc.Settings())
	}

	if s.profileSvc != nil && s.profileSvc.GetProfile() != nil {
		p := s.profileSvc.GetProfile()
		info.ActiveProfileID = p.ID
		info.ActiveProfile = s.sanitizeProfile(p)
	} else {
		info.ActiveProfileID = "unknown"
	}

	if s.app != nil {
		tInfo := s.app.SourceInfo()
		info.TelemetrySource = tInfo.Name
		info.TelemetryLive = tInfo.Live
	} else {
		info.TelemetrySource = "unknown"
		info.TelemetryLive = false
	}

	return info, nil
}

// sanitizeSettings redacts sensitive fields from AppSettings.
func (s *DiagnosticsService) sanitizeSettings(as *AppSettings) *SanitizedAppSettings {
	if as == nil {
		return nil
	}
	sanitized := &SanitizedAppSettings{
		DeltaMode:              as.DeltaMode,
		CpuSampling:            as.CpuSampling,
		Hotkeys:                as.Hotkeys,
		ActiveOverlayProfileID: as.ActiveOverlayProfileID,
		BetaWelcomeCompleted:   as.BetaWelcomeCompleted,
		BetaUserRole:           as.BetaUserRole,
	}
	if len(as.LauncherApps) > 0 {
		sanitized.LauncherApps = make(map[string]SanitizedLauncherApp, len(as.LauncherApps))
		for k, appEntry := range as.LauncherApps {
			redactedPath := "<redacted>"
			if appEntry.ExecutablePath != "" {
				redactedPath = s.sanitizePath(appEntry.ExecutablePath)
			}
			sanitized.LauncherApps[k] = SanitizedLauncherApp{
				ID:             appEntry.ID,
				DisplayName:    appEntry.DisplayName,
				Category:       string(appEntry.Category),
				LaunchMethod:   appEntry.LaunchMethod,
				Detected:       appEntry.Detected,
				ExecutablePath: redactedPath,
				Args:           redactPaths(appEntry.Args),
				IsFavorite:     appEntry.IsFavorite,
			}
		}
	}
	if len(as.LauncherProfiles) > 0 {
		sanitized.LauncherProfiles = make([]SanitizedLauncherProfile, len(as.LauncherProfiles))
		for i, p := range as.LauncherProfiles {
			sanitized.LauncherProfiles[i] = SanitizedLauncherProfile{
				ID:    p.ID,
				Name:  p.Name,
				Notes: redactPaths(p.Notes),
				Steps: len(p.Steps),
			}
		}
	}
	return sanitized
}

// sanitizeProfile redacts sensitive layout data from a profile.
func (s *DiagnosticsService) sanitizeProfile(p *config.ProfileConfig) *SanitizedProfileSummary {
	if p == nil {
		return nil
	}
	summary := &SanitizedProfileSummary{
		ID:          p.ID,
		Name:        p.Name,
		DisplayMode: string(p.DisplayMode),
		WidgetCount: len(p.Widgets),
	}
	if len(p.Widgets) > 0 {
		seen := make(map[string]struct{}, len(p.Widgets))
		for _, w := range p.Widgets {
			if w.Type != "" {
				if _, ok := seen[w.Type]; !ok {
					seen[w.Type] = struct{}{}
				}
			}
		}
		summary.WidgetTypes = make([]string, 0, len(seen))
		for t := range seen {
			summary.WidgetTypes = append(summary.WidgetTypes, t)
		}
		sort.Strings(summary.WidgetTypes)
	}
	return summary
}

// sanitizePath replaces user profile paths (e.g. C:\Users\name) with generic placeholders.
func (s *DiagnosticsService) sanitizePath(path string) string {
	if path == "" {
		return ""
	}

	// Order matters: replace longer/more specific paths first if possible.
	// We'll sanitise USERPROFILE, APPDATA, and HOME.
	if up := os.Getenv("USERPROFILE"); up != "" {
		path = replaceAllIgnoreCase(path, up, "<USERPROFILE>")
	}
	if ad := os.Getenv("APPDATA"); ad != "" {
		path = replaceAllIgnoreCase(path, ad, "<APPDATA>")
	}
	if home := os.Getenv("HOME"); home != "" {
		path = replaceAllIgnoreCase(path, home, "<HOME>")
	}

	return path
}

// replaceAllIgnoreCase does a case-insensitive replacement of old with new in s.
func replaceAllIgnoreCase(s, old, new string) string {
	if old == "" {
		return s
	}
	lowerS := strings.ToLower(s)
	lowerOld := strings.ToLower(old)

	var result strings.Builder
	lastIdx := 0
	for {
		idx := strings.Index(lowerS[lastIdx:], lowerOld)
		if idx == -1 {
			result.WriteString(s[lastIdx:])
			break
		}
		idx += lastIdx
		result.WriteString(s[lastIdx:idx])
		result.WriteString(new)
		lastIdx = idx + len(old)
	}
	return result.String()
}
