package app

import (
	"os"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/pkg/config"
)

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
	})
}
