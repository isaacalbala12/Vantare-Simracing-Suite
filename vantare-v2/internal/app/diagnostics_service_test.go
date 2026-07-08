package app

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/pkg/config"
)

func TestDiagnosticsRedaction(t *testing.T) {
	origUserProfile := os.Getenv("USERPROFILE")
	origAppData := os.Getenv("APPDATA")
	origHome := os.Getenv("HOME")

	os.Setenv("USERPROFILE", "C:\\Users\\TestUser")
	os.Setenv("APPDATA", "C:\\Users\\TestUser\\AppData\\Roaming")
	os.Setenv("HOME", "/home/testuser")

	defer func() {
		os.Setenv("USERPROFILE", origUserProfile)
		os.Setenv("APPDATA", origAppData)
		os.Setenv("HOME", origHome)
	}()

	t.Run("NoExecutablePath", func(t *testing.T) {
		sSvc := NewSettingsService("configs/app-settings.json", nil)
		sSvc.settings = &AppSettings{
			LauncherApps: map[string]LauncherAppEntry{
				"acc": {
					ID:             "acc",
					DisplayName:    "Assetto Corsa Competizione",
					Category:       AppCategorySimulator,
					LaunchMethod:   "executable",
					ExecutablePath: "C:\\Users\\TestUser\\steam\\acc.exe",
				},
			},
		}
		svc := NewDiagnosticsService("v1.0.0", "C:\\some-path", nil, sSvc, nil)
		diag, err := svc.GetDiagnostics()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if diag.AppSettings == nil || diag.AppSettings.LauncherApps == nil {
			t.Fatal("expected launcher apps in diagnostics")
		}
		la := diag.AppSettings.LauncherApps["acc"]
		if la.ExecutablePath == "C:\\Users\\TestUser\\steam\\acc.exe" {
			t.Errorf("ExecutablePath should be redacted, got %q", la.ExecutablePath)
		}
		if la.ExecutablePath == "" {
			t.Errorf("ExecutablePath should not be empty, got %q", la.ExecutablePath)
		}
		if la.ID != "acc" {
			t.Errorf("expected ID acc, got %q", la.ID)
		}
		if la.DisplayName != "Assetto Corsa Competizione" {
			t.Errorf("expected DisplayName, got %q", la.DisplayName)
		}
	})

	t.Run("NoLocalPathsInJSON", func(t *testing.T) {
		sSvc := NewSettingsService("configs/app-settings.json", nil)
		sSvc.settings = &AppSettings{
			LauncherApps: map[string]LauncherAppEntry{
				"acc": {
					ID:             "acc",
					DisplayName:    "Assetto Corsa Competizione",
					Category:       AppCategorySimulator,
					LaunchMethod:   "executable",
					ExecutablePath: "C:\\Users\\TestUser\\steam\\acc.exe",
				},
			},
		}
		svc := NewDiagnosticsService("v1.0.0", "C:\\Users\\TestUser\\AppData\\Roaming\\Vantare", nil, sSvc, nil)
		diag, err := svc.GetDiagnostics()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		data, err := json.Marshal(diag)
		if err != nil {
			t.Fatalf("marshal error: %v", err)
		}
		body := string(data)
		if strings.Contains(body, "C:\\Users\\TestUser") {
			t.Errorf("JSON output should not contain raw user path, got: %s", body)
		}
	})

	t.Run("PreservesUsefulFields", func(t *testing.T) {
		svc := NewDiagnosticsService("v1.2.3", "C:\\some-path", nil, nil, nil)
		diag, err := svc.GetDiagnostics()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if diag.AppVersion != "v1.2.3" {
			t.Errorf("expected AppVersion v1.2.3, got %q", diag.AppVersion)
		}
		if diag.OS == "" {
			t.Error("expected non-empty OS")
		}
		if diag.Arch == "" {
			t.Error("expected non-empty Arch")
		}
		if diag.GoVersion == "" {
			t.Error("expected non-empty GoVersion")
		}
		if diag.NumCPU <= 0 {
			t.Errorf("expected NumCPU > 0, got %d", diag.NumCPU)
		}
		if diag.Timestamp == "" {
			t.Error("expected non-empty Timestamp")
		}
	})

	t.Run("NoSensitiveStrings", func(t *testing.T) {
		sSvc := NewSettingsService("configs/app-settings.json", nil)
		sSvc.settings = &AppSettings{
			LauncherApps: map[string]LauncherAppEntry{
				"test": {
					ID:             "test",
					DisplayName:    "Test App",
					Category:       AppCategoryUtility,
					LaunchMethod:   "executable",
					ExecutablePath: "C:\\Users\\TestUser\\test.exe",
				},
			},
		}
		svc := NewDiagnosticsService("v1.0.0", "C:\\some-path", nil, sSvc, nil)
		diag, err := svc.GetDiagnostics()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		data, err := json.Marshal(diag)
		if err != nil {
			t.Fatalf("marshal error: %v", err)
		}
		body := string(data)
		for _, sensitive := range []string{"access_token", "refresh_token", "jwt", "secret", "webhook"} {
			if strings.Contains(body, sensitive) {
				t.Errorf("JSON output should not contain %q", sensitive)
			}
		}
	})
}

func TestReplaceAllIgnoreCase(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		old      string
		new      string
		expected string
	}{
		{
			name:     "Simple replacement",
			input:    "C:\\Users\\Isaac\\AppData",
			old:      "C:\\Users\\Isaac",
			new:      "<USERPROFILE>",
			expected: "<USERPROFILE>\\AppData",
		},
		{
			name:     "Case insensitive replacement 1",
			input:    "c:\\users\\isaac\\appdata",
			old:      "C:\\Users\\Isaac",
			new:      "<USERPROFILE>",
			expected: "<USERPROFILE>\\appdata",
		},
		{
			name:     "Case insensitive replacement 2",
			input:    "C:\\Users\\ISAAC\\AppData",
			old:      "c:\\users\\isaac",
			new:      "<USERPROFILE>",
			expected: "<USERPROFILE>\\AppData",
		},
		{
			name:     "Multiple occurrences",
			input:    "C:\\Users\\Isaac is active on C:\\Users\\Isaac",
			old:      "C:\\Users\\Isaac",
			new:      "<USERPROFILE>",
			expected: "<USERPROFILE> is active on <USERPROFILE>",
		},
		{
			name:     "Empty old string",
			input:    "C:\\Users\\Isaac",
			old:      "",
			new:      "<USERPROFILE>",
			expected: "C:\\Users\\Isaac",
		},
		{
			name:     "No match",
			input:    "C:\\Users\\Isaac",
			old:      "D:\\Users\\Isaac",
			new:      "<USERPROFILE>",
			expected: "C:\\Users\\Isaac",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := replaceAllIgnoreCase(tc.input, tc.old, tc.new)
			if result != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, result)
			}
		})
	}
}

func TestDiagnosticsService(t *testing.T) {
	// Setup env variables for testing path sanitisation
	origUserProfile := os.Getenv("USERPROFILE")
	origAppData := os.Getenv("APPDATA")
	origHome := os.Getenv("HOME")

	os.Setenv("USERPROFILE", "C:\\Users\\IsaacAlbala")
	os.Setenv("APPDATA", "C:\\Users\\IsaacAlbala\\AppData\\Roaming")
	os.Setenv("HOME", "/home/isaac")

	defer func() {
		os.Setenv("USERPROFILE", origUserProfile)
		os.Setenv("APPDATA", origAppData)
		os.Setenv("HOME", origHome)
	}()

	t.Run("Sanitize paths", func(t *testing.T) {
		svc := NewDiagnosticsService("v0.3.10.0", "C:\\Users\\IsaacAlbala\\AppData\\Roaming\\Vantare\\configs", nil, nil, nil)
		diag, err := svc.GetDiagnostics()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !strings.Contains(diag.ConfigsDir, "<APPDATA>") && !strings.Contains(diag.ConfigsDir, "<USERPROFILE>") {
			t.Errorf("expected config path to be sanitised, got %q", diag.ConfigsDir)
		}

		// Since APPDATA contains USERPROFILE, check that at least one replacement happened.
		if strings.Contains(diag.ConfigsDir, "IsaacAlbala") {
			t.Errorf("personal name should not be present in sanitised path, got %q", diag.ConfigsDir)
		}
	})

	t.Run("Does not panic on nil dependencies", func(t *testing.T) {
		svc := NewDiagnosticsService("v0.3.10.0", "C:\\some-path", nil, nil, nil)
		diag, err := svc.GetDiagnostics()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if diag.AppVersion != "v0.3.10.0" {
			t.Errorf("expected version %q, got %q", "v0.3.10.0", diag.AppVersion)
		}
		if diag.ActiveProfileID != "unknown" {
			t.Errorf("expected active profile ID %q, got %q", "unknown", diag.ActiveProfileID)
		}
		if diag.TelemetrySource != "unknown" {
			t.Errorf("expected telemetry source %q, got %q", "unknown", diag.TelemetrySource)
		}
		if diag.AppSettings != nil {
			t.Errorf("expected nil AppSettings, got %v", diag.AppSettings)
		}
		if diag.ActiveProfile != nil {
			t.Errorf("expected nil ActiveProfile, got %v", diag.ActiveProfile)
		}
	})

	t.Run("Fills active profile and settings when present", func(t *testing.T) {
		// Mock profile service
		pSvc := NewProfileService("configs/test.json", nil, nil)
		testProfile := &config.ProfileConfig{
			ID:   "test-profile-123",
			Name: "Test Profile",
			Widgets: []config.WidgetConfig{
				{ID: "w1", Type: "delta", Enabled: true},
				{ID: "w2", Type: "relative", Enabled: false},
			},
		}
		pSvc.SetProfile(testProfile)

		// Mock settings service
		sSvc := NewSettingsService("configs/app-settings.json", nil)
		sSvc.settings = &AppSettings{
			DeltaMode:   "session",
			CpuSampling: false,
		}

		svc := NewDiagnosticsService("v0.3.10.0", "C:\\some-path", pSvc, sSvc, nil)
		diag, err := svc.GetDiagnostics()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if diag.ActiveProfileID != "test-profile-123" {
			t.Errorf("expected active profile ID %q, got %q", "test-profile-123", diag.ActiveProfileID)
		}
		if diag.AppSettings.DeltaMode != "session" {
			t.Errorf("expected deltaMode %q, got %q", "session", diag.AppSettings.DeltaMode)
		}
		if diag.ActiveProfile.Name != "Test Profile" {
			t.Errorf("expected profile name %q, got %q", "Test Profile", diag.ActiveProfile.Name)
		}
		if diag.ActiveProfile.WidgetCount != 2 {
			t.Errorf("expected widgetCount 2, got %d", diag.ActiveProfile.WidgetCount)
		}
		if len(diag.ActiveProfile.WidgetTypes) != 2 {
			t.Errorf("expected 2 widget types, got %d", len(diag.ActiveProfile.WidgetTypes))
		}
	})
}

func TestSanitizeLauncherProfileRedactsNotes(t *testing.T) {
	s := NewDiagnosticsService("", "", nil, nil, nil)
	profiles := []SanitizedLauncherProfile{
		{ID: "p1", Name: "Creator", Steps: 3, Notes: "C:\\Users\\me\\file.exe with --flag"},
	}
	out := s.SanitizeLauncherProfiles(profiles)
	if !strings.Contains(out[0].Notes, "[redacted]") {
		t.Errorf("expected notes path to be redacted, got: %s", out[0].Notes)
	}
}

func TestSanitizeLauncherAppRedactsArgs(t *testing.T) {
	s := NewDiagnosticsService("", "", nil, nil, nil)
	apps := []SanitizedLauncherApp{
		{ID: "obs", DisplayName: "OBS", Category: "streaming", LaunchMethod: "executable",
			Detected: true, ExecutablePath: "C:\\Program Files\\OBS\\obs64.exe --profile x"},
	}
	out := s.SanitizeLauncherApps(apps)
	if strings.Contains(out[0].ExecutablePath, "OBS\\obs64.exe") {
		t.Errorf("expected exe path to be redacted, got: %s", out[0].ExecutablePath)
	}
}
