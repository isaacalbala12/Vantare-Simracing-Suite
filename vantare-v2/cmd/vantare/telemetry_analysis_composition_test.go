package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestResolveTelemetryAnalysisBackendConfigOwnsRuntimeStagingAndLMURoots(t *testing.T) {
	applicationDirectory := t.TempDir()
	executablePath := filepath.Join(applicationDirectory, "vantare.exe")
	if err := os.WriteFile(executablePath, []byte("synthetic executable"), 0o600); err != nil {
		t.Fatal(err)
	}
	cacheDirectory := t.TempDir()
	lmuInstall := filepath.Join(t.TempDir(), "Le Mans Ultimate")
	telemetryRoot := filepath.Join(lmuInstall, "UserData", "Telemetry")
	if err := os.MkdirAll(telemetryRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	lmuExecutable := filepath.Join(lmuInstall, "Le Mans Ultimate.exe")
	if err := os.WriteFile(lmuExecutable, []byte("synthetic LMU executable"), 0o600); err != nil {
		t.Fatal(err)
	}
	discovered := map[string]app.LauncherAppEntry{
		"lmu": {ID: "lmu", ExecutablePath: lmuExecutable, PathSource: "steam"},
	}

	cfg, err := resolveTelemetryAnalysisBackendConfig(executablePath, cacheDirectory, discovered)
	if err != nil {
		t.Fatalf("resolveTelemetryAnalysisBackendConfig() error = %v", err)
	}
	if cfg.ApplicationDirectory != applicationDirectory {
		t.Fatalf("application directory = %q", cfg.ApplicationDirectory)
	}
	wantStaging := filepath.Join(cacheDirectory, "Vantare", "telemetry-analysis", "staging")
	if cfg.StagingRoot != wantStaging {
		t.Fatalf("staging root = %q, want %q", cfg.StagingRoot, wantStaging)
	}
	if len(cfg.LMURoots) != 1 || cfg.LMURoots[0] != telemetryRoot {
		t.Fatalf("LMU roots = %v", cfg.LMURoots)
	}
	if cfg.StabilityWindow <= 0 || cfg.MaxCandidates <= 0 || cfg.MaxSourceBytes <= 0 || cfg.MaxPageRows <= 0 {
		t.Fatalf("limits were not configured: %#v", cfg)
	}
}

func TestResolveTelemetryAnalysisBackendConfigRejectsConsumerLikeOrUntrustedPaths(t *testing.T) {
	applicationDirectory := t.TempDir()
	executablePath := filepath.Join(applicationDirectory, "vantare.exe")
	if err := os.WriteFile(executablePath, []byte("synthetic executable"), 0o600); err != nil {
		t.Fatal(err)
	}
	cacheDirectory := t.TempDir()
	privateRoot := t.TempDir()
	privateExecutable := filepath.Join(privateRoot, "Le Mans Ultimate.exe")
	if err := os.WriteFile(privateExecutable, []byte("not steam authority"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(privateRoot, "UserData", "Telemetry"), 0o700); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name       string
		discovered map[string]app.LauncherAppEntry
	}{
		{name: "manual path", discovered: map[string]app.LauncherAppEntry{"lmu": {ID: "lmu", ExecutablePath: privateExecutable, PathSource: "manual"}}},
		{name: "registry path", discovered: map[string]app.LauncherAppEntry{"lmu": {ID: "lmu", ExecutablePath: privateExecutable, PathSource: "registry"}}},
		{name: "wrong app id", discovered: map[string]app.LauncherAppEntry{"other": {ID: "lmu", ExecutablePath: privateExecutable, PathSource: "steam"}}},
		{name: "missing executable authority", discovered: map[string]app.LauncherAppEntry{"lmu": {ID: "lmu", ExecutablePath: filepath.Join(privateRoot, "missing.exe"), PathSource: "steam"}}},
		{name: "wrong Steam folder", discovered: map[string]app.LauncherAppEntry{"lmu": {ID: "lmu", ExecutablePath: privateExecutable, PathSource: "steam"}}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			cfg, err := resolveTelemetryAnalysisBackendConfig(executablePath, cacheDirectory, test.discovered)
			if err != nil {
				t.Fatalf("resolve config error = %v", err)
			}
			if len(cfg.LMURoots) != 0 {
				t.Fatalf("untrusted roots = %v", cfg.LMURoots)
			}
		})
	}
}

func TestResolveTelemetryAnalysisBackendConfigRejectsInvalidBackendDirectories(t *testing.T) {
	validExecutable := filepath.Join(t.TempDir(), "vantare.exe")
	if err := os.WriteFile(validExecutable, []byte("synthetic executable"), 0o600); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name       string
		executable string
		cache      string
	}{
		{name: "relative executable", executable: "vantare.exe", cache: t.TempDir()},
		{name: "missing executable", executable: filepath.Join(t.TempDir(), "missing.exe"), cache: t.TempDir()},
		{name: "relative cache", executable: validExecutable, cache: "cache"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := resolveTelemetryAnalysisBackendConfig(test.executable, test.cache, nil); err == nil {
				t.Fatal("expected invalid backend directory error")
			}
		})
	}
}
