package app

import (
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/pkg/config"
)

// DiagnosticsInfo holds sanitized system and application diagnostic data.
type DiagnosticsInfo struct {
	AppVersion      string                `json:"appVersion"`
	OS              string                `json:"os"`
	Arch            string                `json:"arch"`
	GoVersion       string                `json:"goVersion"`
	NumCPU          int                   `json:"numCpu"`
	ConfigsDir      string                `json:"configsDir"`
	ActiveProfileID string                `json:"activeProfileId"`
	TelemetrySource string                `json:"telemetrySource"`
	TelemetryLive   bool                  `json:"telemetryLive"`
	AppSettings     *AppSettings          `json:"appSettings"`
	ActiveProfile   *config.ProfileConfig `json:"activeProfile,omitempty"`
	Timestamp       string                `json:"timestamp"`
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
		info.AppSettings = s.settingsSvc.Settings()
	}

	if s.profileSvc != nil && s.profileSvc.GetProfile() != nil {
		info.ActiveProfileID = s.profileSvc.GetProfile().ID
		info.ActiveProfile = s.profileSvc.GetProfile()
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
