package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/pkg/config"
)

func TestDiagnosticsUsesCanonicalSourceStatus(t *testing.T) {
	status := driver.SourceStatus{
		Kind: "lmu", Name: "Le Mans Ultimate", Live: true, Available: true, State: "live",
	}
	service := NewDiagnosticsService("v1", "", nil, nil, func() driver.SourceStatus { return status })
	report, err := service.GetDiagnostics()
	if err != nil {
		t.Fatal(err)
	}
	if report.Telemetry.Source != "lmu" || !report.Telemetry.Live || !report.Telemetry.Available {
		t.Fatalf("telemetry diagnostics = %#v", report.Telemetry)
	}

	status.Kind = "private-driver"
	report, err = service.GetDiagnostics()
	if err != nil {
		t.Fatal(err)
	}
	if report.Telemetry.Source != "unknown" {
		t.Fatalf("unknown source crossed allowlist: %#v", report.Telemetry)
	}
}

func TestDiagnosticsAllowlistRejectsIdentityAndSecrets(t *testing.T) {
	const (
		name    = "Synthetic Driver"
		email   = "synthetic-driver@example.invalid"
		steamID = "synthetic-account-id"
		token   = "synthetic-secret-token"
		winPath = `C:\Users\SyntheticUser\AppData\Local\Vantare`
		uncPath = `\\synthetic.invalid\private\share`
		posix   = "/home/SyntheticUser/.config/vantare"
		url     = "https://user:password@example.invalid/private"
		hotkey  = "ctrl+secret"
	)
	settings := NewSettingsService("unused", nil, nil)
	settings.settings = &AppSettings{
		SchemaVersion:          1,
		Hotkeys:                map[string]string{name: hotkey},
		ActiveOverlayProfileID: steamID,
		BetaUserRole:           email,
		LauncherApps: map[string]LauncherAppEntry{
			token: {
				ID: token, DisplayName: name, Category: AppCategoryUtility,
				LaunchMethod: "executable", ExecutablePath: winPath,
				UserExecutablePath: uncPath, IconOverridePath: posix,
				Args: url, SteamAppID: 2399420, IsFavorite: true, Detected: true,
			},
		},
		LauncherProfiles: []LaunchProfile{{
			ID: steamID, Name: name, Description: email, Notes: token + winPath,
			Hotkey: hotkey, Steps: []LaunchStep{{AppID: token, ArgsOverride: url}},
		}},
	}
	profiles := NewProfileService("unused", nil, nil)
	profiles.SetProfile(&config.ProfileConfig{
		ID: steamID, Name: name, DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: email, Type: "delta"},
			{ID: token, Type: url},
		},
	})
	service := NewDiagnosticsService("v1.0.0", winPath, profiles, settings, nil)
	service.now = func() time.Time { return time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC) }

	prepared, err := service.PrepareDiagnostics()
	if err != nil {
		t.Fatalf("PrepareDiagnostics() error = %v", err)
	}
	for _, forbidden := range []string{
		name, email, steamID, token, winPath, uncPath, posix, url, hotkey,
		"activeOverlayProfileId", "betaUserRole", "executablePath", "args",
		"profileId", "displayName", "configsDir",
	} {
		if strings.Contains(prepared.Payload, forbidden) {
			t.Fatalf("diagnostic payload leaked %q:\n%s", forbidden, prepared.Payload)
		}
	}
	if strings.Contains(prepared.Payload, `"widgetTypes": [
    "https`) {
		t.Fatalf("unknown widget type crossed the allowlist: %s", prepared.Payload)
	}
}

func TestDiagnosticsPreservesOnlyUsefulClosedFacts(t *testing.T) {
	settings := NewSettingsService("unused", nil, nil)
	settings.settings = &AppSettings{
		SchemaVersion: 1,
		CpuSampling:   true,
		Hotkeys:       map[string]string{"one": "secret", "two": "secret"},
		LauncherApps: map[string]LauncherAppEntry{
			"a": {Category: AppCategorySimulator, LaunchMethod: "steam-uri", Detected: true},
			"b": {Category: AppCategoryUtility, LaunchMethod: "executable", IsFavorite: true},
		},
		LauncherProfiles: []LaunchProfile{{ID: "private-profile"}},
	}
	profiles := NewProfileService("unused", nil, nil)
	profiles.SetProfile(&config.ProfileConfig{
		DisplayMode: config.ModeStreaming,
		Widgets: []config.WidgetConfig{
			{Type: "relative"}, {Type: "delta"}, {Type: "relative"}, {Type: "private-type"},
		},
	})
	service := NewDiagnosticsService("v1.2.3", "ignored", profiles, settings, nil)
	service.now = func() time.Time { return time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC) }
	report, err := service.GetDiagnostics()
	if err != nil {
		t.Fatalf("GetDiagnostics() error = %v", err)
	}
	if report.SchemaVersion != 1 || report.Application.Version != "v1.2.3" {
		t.Fatalf("report identity = %#v", report)
	}
	if report.GeneratedAtUTC.Location() != time.UTC {
		t.Fatalf("GeneratedAtUTC location = %v", report.GeneratedAtUTC.Location())
	}
	if report.Settings == nil || report.Settings.HotkeyCount != 2 || !report.Settings.CPUSampling {
		t.Fatalf("settings summary = %#v", report.Settings)
	}
	if report.ActiveProfile == nil || report.ActiveProfile.DisplayMode != "streaming" ||
		report.ActiveProfile.WidgetCount != 4 ||
		strings.Join(report.ActiveProfile.WidgetTypes, ",") != "delta,relative" {
		t.Fatalf("profile summary = %#v", report.ActiveProfile)
	}
	if report.Launcher == nil || report.Launcher.AppCount != 2 ||
		report.Launcher.ProfileCount != 1 || report.Launcher.DetectedApps != 1 ||
		report.Launcher.FavoriteApps != 1 {
		t.Fatalf("launcher summary = %#v", report.Launcher)
	}
}

func TestPreparedDiagnosticsPayloadHashAndBytesAreExact(t *testing.T) {
	service := NewDiagnosticsService("v1", "", nil, nil, nil)
	service.now = func() time.Time { return time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC) }
	first, err := service.PrepareDiagnostics()
	if err != nil {
		t.Fatalf("PrepareDiagnostics() error = %v", err)
	}
	second, err := service.PrepareDiagnostics()
	if err != nil {
		t.Fatalf("second PrepareDiagnostics() error = %v", err)
	}
	if first != second {
		t.Fatalf("same report was not deterministic:\nfirst=%#v\nsecond=%#v", first, second)
	}
	if first.ByteSize != len([]byte(first.Payload)) {
		t.Fatalf("ByteSize=%d want=%d", first.ByteSize, len([]byte(first.Payload)))
	}
	sum := sha256.Sum256([]byte(first.Payload))
	if first.SHA256 != hex.EncodeToString(sum[:]) {
		t.Fatalf("SHA256=%q want=%q", first.SHA256, hex.EncodeToString(sum[:]))
	}
	var report DiagnosticsReport
	if err := json.Unmarshal([]byte(first.Payload), &report); err != nil {
		t.Fatalf("payload JSON error = %v", err)
	}
	if report.GeneratedAtUTC != first.GeneratedAtUTC {
		t.Fatalf("payload time=%v wrapper time=%v", report.GeneratedAtUTC, first.GeneratedAtUTC)
	}
}

func TestPreparedDiagnosticsConcurrentRequestsRemainIndependent(t *testing.T) {
	service := NewDiagnosticsService("v1", "", nil, nil, nil)
	service.now = func() time.Time { return time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC) }
	const count = 32
	results := make(chan PreparedDiagnostics, count)
	errs := make(chan error, count)
	var group sync.WaitGroup
	for range count {
		group.Add(1)
		go func() {
			defer group.Done()
			result, err := service.PrepareDiagnostics()
			results <- result
			errs <- err
		}()
	}
	group.Wait()
	close(results)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("PrepareDiagnostics() error = %v", err)
		}
	}
	var expected PreparedDiagnostics
	for result := range results {
		if expected.Payload == "" {
			expected = result
			continue
		}
		if result != expected {
			t.Fatalf("concurrent result mismatch")
		}
	}
}

func TestPreparedDiagnosticsConcurrentWithProfileMutations(t *testing.T) {
	path := filepath.Join(t.TempDir(), "profile.json")
	initial := &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{{
			ID:       "delta",
			Type:     "delta",
			Enabled:  true,
			Position: config.Rect{W: 320, H: 80},
		}},
	}
	if err := config.SaveFile(path, initial); err != nil {
		t.Fatal(err)
	}
	profiles := NewProfileService(path, nil, nil)
	if err := profiles.Load(); err != nil {
		t.Fatal(err)
	}
	service := NewDiagnosticsService("v1", "", profiles, nil, nil)
	service.now = func() time.Time {
		return time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	}

	const iterations = 40
	errs := make(chan error, iterations*2)
	var group sync.WaitGroup
	group.Add(2)
	go func() {
		defer group.Done()
		for range iterations {
			_, err := service.PrepareDiagnostics()
			errs <- err
		}
	}()
	go func() {
		defer group.Done()
		for index := range iterations {
			mode := config.ModeRacing
			if index%2 == 0 {
				mode = config.ModeEdit
			}
			if err := profiles.SetDisplayMode(mode); err != nil {
				errs <- err
				continue
			}
			errs <- profiles.SaveProfileState([]config.WidgetConfig{{
				ID:       "delta",
				Type:     "delta",
				Enabled:  true,
				Position: config.Rect{X: index, W: 320, H: 80},
			}}, nil)
		}
	}()
	group.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent profile operation: %v", err)
		}
	}
}

func TestPreparedDiagnosticsIsolatedFromConcurrentSettingsSnapshotMutations(t *testing.T) {
	settings := NewSettingsService("unused", nil, nil)
	settings.settings = &AppSettings{
		SchemaVersion: 1,
		Hotkeys:       map[string]string{"toggleOverlay": "ctrl+shift+v"},
		LauncherApps: map[string]LauncherAppEntry{
			"lmu": {ID: "lmu", Category: AppCategorySimulator, LaunchMethod: "steam-uri"},
		},
		LauncherProfiles: []LaunchProfile{{
			ID: "race", Policy: &LaunchPolicy{MaxRetries: 1},
			Steps: []LaunchStep{{AppID: "lmu", Delay: 1}},
		}},
	}
	service := NewDiagnosticsService("v1", "", nil, settings, nil)
	service.now = func() time.Time {
		return time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	}

	leakedSettings := settings.Settings()
	leakedApps := settings.GetLauncherApps()
	leakedProfiles := settings.GetLauncherProfiles()
	const iterations = 2_000
	var group sync.WaitGroup
	group.Add(2)
	go func() {
		defer group.Done()
		for index := range iterations {
			leakedSettings.Hotkeys[strings.Repeat("x", index%32+1)] = "synthetic"
			leakedApps[strings.Repeat("a", index%32+1)] = LauncherAppEntry{ID: "synthetic"}
			leakedProfiles[0].Steps[0].Delay = index
		}
	}()
	go func() {
		defer group.Done()
		for range iterations {
			if _, err := service.PrepareDiagnostics(); err != nil {
				t.Errorf("PrepareDiagnostics() error = %v", err)
				return
			}
		}
	}()
	group.Wait()
}

func TestPreparedDiagnosticsRequestCorrelatesWithoutChangingPayload(t *testing.T) {
	service := NewDiagnosticsService("v1", "", nil, nil, nil)
	service.now = func() time.Time { return time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC) }
	first, err := service.PrepareDiagnosticsRequest(DiagnosticsRequest{RequestID: "diagreq-first"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.PrepareDiagnosticsRequest(DiagnosticsRequest{RequestID: "diagreq-second"})
	if err != nil {
		t.Fatal(err)
	}
	if first.RequestID != "diagreq-first" || second.RequestID != "diagreq-second" {
		t.Fatalf("responses crossed: %#v %#v", first, second)
	}
	if first.Prepared.Payload != second.Prepared.Payload ||
		first.Prepared.SHA256 != second.Prepared.SHA256 {
		t.Fatal("correlation changed the immutable payload")
	}
	for _, invalid := range []string{"", "short", "synthetic-driver@example.invalid", `C:\SyntheticUser\private`} {
		if _, err := service.PrepareDiagnosticsRequest(DiagnosticsRequest{RequestID: invalid}); !errors.Is(err, ErrInvalidDiagnosticsRequest) {
			t.Fatalf("request %q error = %v", invalid, err)
		}
	}
}

func TestDiagnosticsUnknownValuesAreClosed(t *testing.T) {
	settings := NewSettingsService("unused", nil, nil)
	settings.settings = &AppSettings{
		LauncherApps: map[string]LauncherAppEntry{
			"a": {Category: LauncherAppCategory("private-category"), LaunchMethod: "private-method"},
		},
	}
	profiles := NewProfileService("unused", nil, nil)
	profiles.SetProfile(&config.ProfileConfig{DisplayMode: config.DisplayMode("private-mode")})
	service := NewDiagnosticsService("v1", "", profiles, settings, nil)
	report, err := service.GetDiagnostics()
	if err != nil {
		t.Fatalf("GetDiagnostics() error = %v", err)
	}
	if report.ActiveProfile.DisplayMode != "unknown" {
		t.Fatalf("unknown values leaked: %#v", report)
	}
	if len(report.Launcher.Categories) != 0 || len(report.Launcher.Methods) != 0 {
		t.Fatalf("unknown launcher values leaked: %#v", report.Launcher)
	}
}
