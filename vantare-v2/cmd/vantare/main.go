package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/vantare/overlays/v2/configs"
	"github.com/vantare/overlays/v2/frontend"
	"github.com/vantare/overlays/v2/internal/app"
	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/license"
	"github.com/vantare/overlays/v2/internal/ops"
	"github.com/vantare/overlays/v2/internal/server"
	"github.com/vantare/overlays/v2/internal/telemetry/delta"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
	"github.com/vantare/overlays/v2/internal/updater"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// version is the current application version.
var version = "v0.1.0.1"

// reorderArgs moves flag arguments to the front of os.Args so flag.Parse() can
// see them even when the user types `vantare serve -live -profile foo.json`.
// The first non-flag positional argument (e.g. "serve") is left in place.
func reorderArgs() {
	args := os.Args
	flags := make([]string, 0, len(args))
	positional := make([]string, 0, len(args))
	positional = append(positional, args[0])
	sawFlag := false
	for _, a := range args[1:] {
		if strings.HasPrefix(a, "-") {
			flags = append(flags, a)
			sawFlag = true
		} else if !sawFlag {
			positional = append(positional, a)
		} else {
			flags = append(flags, a)
		}
	}
	os.Args = append(positional, flags...)
}

func configsDir() string {
	// 1. Check if there is a configs folder next to the executable (portable mode)
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		configsPath := filepath.Join(dir, "configs")
		if info, err := os.Stat(configsPath); err == nil && info.IsDir() {
			if abs, err := filepath.Abs(configsPath); err == nil {
				return abs
			}
		}
	}

	// 2. Check if there is a configs folder in CWD (development mode)
	candidates := []string{
		"configs",
		"vantare-v2/configs",
	}
	for _, dir := range candidates {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			if abs, err := filepath.Abs(dir); err == nil {
				return abs
			}
		}
	}

	// 3. Installed mode: use user's standard config directory (AppData/Roaming/Vantare/configs)
	// This is always writeable without administrator privileges.
	configDir, err := os.UserConfigDir()
	if err == nil {
		vantareConfigPath := filepath.Join(configDir, "Vantare", "configs")
		if err := os.MkdirAll(vantareConfigPath, 0755); err == nil {
			files := []string{"custom-hfg.json", "example-edit.json", "example-racing.json", "example-streaming.json"}
			for _, f := range files {
				content, err := configs.ConfigsFS.ReadFile(f)
				if err == nil {
					dest := filepath.Join(vantareConfigPath, f)
					if _, err := os.Stat(dest); os.IsNotExist(err) {
						_ = os.WriteFile(dest, content, 0644)
					}
				}
			}
			if abs, err := filepath.Abs(vantareConfigPath); err == nil {
				return abs
			}
		}
	}

	return ""
}

type wailsEmitter struct {
	wailsApp *application.App
}

func (w *wailsEmitter) Emit(name string, data any) {
	w.wailsApp.Event.Emit(name, data)
}

// installerURL returns the direct download URL for the Windows installer asset.
func installerURL(release updater.Release) string {
	if asset := updater.FindInstaller(release); asset != nil {
		return asset.DownloadURL
	}
	return release.HTMLURL
}

func main() {
	// Set WebView2 user data folder to version-specific path to prevent cache issues across releases
	if appData := os.Getenv("LOCALAPPDATA"); appData != "" {
		udf := filepath.Join(appData, "Vantare", "webview_v0.3.10.0")
		_ = os.Setenv("WEBVIEW2_USER_DATA_FOLDER", udf)
	}

	live := flag.Bool("live", true, "use LMU shared memory (use -live=false for mock telemetry)")
	profilePath := flag.String("profile", "configs/example-racing.json", "profile JSON path")
	edit := flag.Bool("edit", false, "force edit mode (overrides profile displayMode)")
	httpAddr := flag.String("http", "127.0.0.1:39261", "HTTP/SSE address for OBS Browser Source")
	flag.Parse()

	if *edit {
		log.Printf("warning: -edit is deprecated in Hub Preview flow; start Hub and use Preview instead")
	}

	distFS := frontend.DistFS()

	vapp := app.New(*live)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	wailsApp := application.New(application.Options{
		Name: "Vantare Overlays",
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(distFS),
		},
	})

	emitter := &wailsEmitter{wailsApp: wailsApp}
	var cleanup sync.Once
	var bridge *app.TelemetryBridge
	var opsBridge *app.OpsBridge
	var httpSrv *server.Server
	var overlayController *app.OverlayController
	var rtSampler *ops.RuntimeSampler
	var overlayRunning atomic.Bool
	var hkMgr *app.HotkeyManager
	var engBridge *app.EngineerBridge
	cleanupApp := func() {
		cleanup.Do(func() {
			if overlayController != nil {
				overlayController.Stop()
			}
			if httpSrv != nil {
				if err := httpSrv.Stop(); err != nil {
					log.Printf("HTTP server shutdown error: %v", err)
				}
			}
			if opsBridge != nil {
				opsBridge.Stop()
			}
			if bridge != nil {
				bridge.Stop()
			}
			if hkMgr != nil {
				hkMgr.Stop()
			}
			if engBridge != nil {
				engBridge.Stop()
			}
			vapp.StopTelemetry()
		})
	}
	wailsApp.OnShutdown(cleanupApp)
	defer cleanupApp()
	// Get and verify configs directory first
	cfgDir := configsDir()
	if cfgDir == "" {
		log.Printf("warning: configs directory not found — hub profile CRUD disabled")
	}

	// Resolve the profile path relative to the config directory if it's relative
	resolvedProfilePath := *profilePath
	if !filepath.IsAbs(resolvedProfilePath) {
		cleanPath := strings.TrimPrefix(resolvedProfilePath, "configs/")
		cleanPath = strings.TrimPrefix(cleanPath, "configs\\")
		resolvedProfilePath = filepath.Join(cfgDir, cleanPath)
	}

	// Load profile into memory for Hub / Preview.
	profileSvc := app.NewProfileService(resolvedProfilePath, nil, emitter)
	if err := profileSvc.Load(); err != nil {
		log.Printf("warning: could not load profile %s: %v (using defaults)", resolvedProfilePath, err)
		// Create a default profile
		profileSvc.SetProfile(&config.ProfileConfig{
			ID:           "default-fallback",
			Name:         "Fallback Racing",
			DisplayMode:  config.ModeRacing,
			MonitorIndex: 0,
			Widgets: []config.WidgetConfig{
				{ID: "delta", Type: "delta", Enabled: true, UpdateHz: 30, Position: config.Rect{X: 760, Y: 40, W: 400, H: 48}},
				{ID: "relative", Type: "relative", Enabled: true, UpdateHz: 15, Position: config.Rect{X: 40, Y: 600, W: 320, H: 280}},
				{ID: "standings", Type: "standings", Enabled: true, UpdateHz: 15, Position: config.Rect{X: 1560, Y: 40, W: 340, H: 420}},
			},
		})
	}
	// Overlay controller owns the desktop overlay window lifecycle.
	// The stopOverlay closure runs when the Wails window closes externally
	// (e.g. Alt+F4). It must sync overlayRunning and reset the profile to
	// racing mode so the next open is not accidentally editable. The guard
	// on overlayRunning avoids redundant work when Stop() was already called
	// from the normal stop paths (which clear the flag themselves).
	overlayController = app.NewOverlayController(&wailsOverlayFactory{
		app: wailsApp,
		stopOverlay: func() {
			overlayController.Stop()
			if overlayRunning.Load() {
				resetOverlayDisplayMode(overlayController, profileSvc, emitter)
				overlayRunning.Store(false)
			}
		},
	})

	// Create hub window only (normal framed window).
	hubW := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "Vantare Hub",
		Width:          1280,
		Height:         800,
		Frameless:      false,
		BackgroundType: application.BackgroundTypeSolid,
		URL:            "/#/hub",
		MinWidth:       900,
		MinHeight:      600,
	})
	hubW.Show()

	requestQuit := func(_ *application.WindowEvent) {
		go wailsApp.Quit()
	}
	hubW.RegisterHook(events.Common.WindowClosing, requestQuit)

	// Register profile service with Wails (frontend can call methods)
	wailsApp.RegisterService(application.NewService(profileSvc))

	// Create hub service for profile CRUD using the resolved directory
	hubSvc := app.NewHubService(cfgDir, profileSvc, emitter, overlayController)
	wailsApp.RegisterService(application.NewService(hubSvc))

	// License service for online entitlement validation (Release 02 Mini-Plan B).
	licenseCachePath := filepath.Join(cfgDir, "license-cache.json")
	supabaseURL := os.Getenv("VANTARE_SUPABASE_URL")
	if supabaseURL == "" {
		supabaseURL = os.Getenv("SUPABASE_URL")
	}
	supabaseAnonKey := os.Getenv("VANTARE_SUPABASE_ANON_KEY")
	if supabaseAnonKey == "" {
		supabaseAnonKey = os.Getenv("SUPABASE_ANON_KEY")
	}
	licenseSvc := license.NewService(license.Config{
		SupabaseURL:     supabaseURL,
		SupabaseAnonKey: supabaseAnonKey,
		GracePeriod:     24 * time.Hour,
		CachePath:       licenseCachePath,
	}, emitter, license.MachineFingerprint)
	licenseSvc.WithCache(license.NewLicenseCache(licenseCachePath))
	if supabaseURL != "" && supabaseAnonKey != "" {
		licenseSvc.WithClient(license.NewStdlibSupabaseClient(supabaseURL, supabaseAnonKey))
	} else {
		log.Printf("license: supabase env vars missing, running in offline-grace mode")
	}
	if err := licenseSvc.LoadCache(); err != nil {
		log.Printf("warning: could not load license cache: %v", err)
	}
	wailsApp.RegisterService(application.NewService(licenseSvc))

	// Forward UI license validation requests to the Go service. The frontend
	// fires Events.Emit("license:validate", { sessionToken }) and we answer
	// by running Validate and re-emitting license:changed.
	wailsApp.Event.On("license:validate", func(event *application.CustomEvent) {
		var payload struct {
			SessionToken string `json:"sessionToken"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		res, verr := licenseSvc.Validate(context.Background(), payload.SessionToken)
		if verr != nil {
			log.Printf("license:validate error: %v", verr)
			emitter.Emit("license:error", map[string]any{"message": verr.Error()})
			return
		}
		licenseSvc.EmitChanged(res)
	})

	wailsApp.Event.On("license:reset-device", func(event *application.CustomEvent) {
		var payload struct {
			SessionToken string `json:"sessionToken"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		if payload.SessionToken == "" {
			log.Printf("license:reset-device error: empty session token")
			emitter.Emit("license:error", map[string]any{"message": "token de sesión requerido"})
			return
		}
		err := licenseSvc.ResetDevice(context.Background(), payload.SessionToken)
		if err != nil {
			log.Printf("license:reset-device error: %v", err)
			emitter.Emit("license:error", map[string]any{"message": err.Error()})
			return
		}
	})

	// Preset service for widget presets (WidgetStudio only)
	presetSvc := app.NewPresetService(cfgDir, emitter)
	if err := presetSvc.Load(); err != nil {
		log.Printf("warning: could not load presets: %v (using empty)", err)
	}
	wailsApp.RegisterService(application.NewService(presetSvc))
	presetSvc.RegisterHandlers(wailsApp)

	// Updater service
	settingsPath := filepath.Join(cfgDir, "updater-settings.json")
	updaterSvc, err := app.NewUpdaterService(version, settingsPath, emitter)
	if err != nil {
		log.Printf("updater service init error: %v", err)
	} else {
		wailsApp.RegisterService(application.NewService(updaterSvc))
	}

	// Create and start EngineerService (core & simulator/replay)
	engSvc := engineerservice.NewEngineerService(emitter)
	engSvc.Start(ctx)
	defer engSvc.Stop()

	// Register Wails bridge for Engineer events and commands
	engBridge = app.NewEngineerBridge(wailsApp, emitter, engSvc)
	engBridge.Start()

	// App settings service (delta mode, hotkeys, cpu sampling toggle)
	appSettingsPath := filepath.Join(cfgDir, "app-settings.json")
	settingsSvc := app.NewSettingsService(appSettingsPath, emitter)
	if err := settingsSvc.Load(); err != nil {
		log.Printf("warning: could not load settings: %v (using defaults)", err)
	}

	// Wire settings service into hub service for active profile persistence.
	hubSvc.SetSettingsService(settingsSvc)

	// Load active profile from settings if present.
	if activeID := settingsSvc.Settings().ActiveOverlayProfileID; activeID != "" {
		if path, err := hubSvc.ResolveProfilePath(activeID); err == nil {
			if err := profileSvc.LoadActiveProfile(path); err != nil {
				log.Printf("warning: could not load active profile %s: %v", activeID, err)
			}
		} else {
			log.Printf("warning: active profile %s not found: %v", activeID, err)
		}
	}

	mode := delta.ReferenceMode(settingsSvc.Settings().DeltaMode)
	if mode == "" {
		mode = delta.ModeSelf
	}
	vapp.SetDeltaMode(mode)

	// Diagnostics service
	diagSvc := app.NewDiagnosticsService(version, cfgDir, profileSvc, settingsSvc, vapp)
	wailsApp.RegisterService(application.NewService(diagSvc))

	// Set profiles directory for profile cycling
	profileSvc.SetProfilesDir(cfgDir)

	// Hotkey manager
	hkMgr = app.NewHotkeyManager()

	// Register default hotkey actions
	hkMgr.Register("toggleOverlay", settingsSvc.Settings().Hotkeys["toggleOverlay"], func() {
		if overlayController == nil {
			return
		}
		status := overlayController.Status()
		if status.Running {
			overlayController.Stop()
			resetOverlayDisplayMode(overlayController, profileSvc, emitter)
			overlayRunning.Store(false)
		} else {
			// Start with current profile
			profile := profileSvc.Profile()
			if profile != nil {
				if _, err := overlayController.Start(profile); err != nil {
					log.Printf("hotkey toggle overlay error: %v", err)
					return
				}
				overlayRunning.Store(true)
				// Always open in racing mode; edit mode is entered explicitly via
				// the toggle-edit-mode hotkey.
				resetOverlayDisplayMode(overlayController, profileSvc, emitter)
			}
		}
	})

	hkMgr.Register("nextProfile", settingsSvc.Settings().Hotkeys["nextProfile"], func() {
		if !overlayRunning.Load() {
			return
		}
		if err := profileSvc.NextProfile(); err != nil {
			log.Printf("hotkey next profile error: %v", err)
		}
	})

	hkMgr.Register("prevProfile", settingsSvc.Settings().Hotkeys["prevProfile"], func() {
		if !overlayRunning.Load() {
			return
		}
		if err := profileSvc.PreviousProfile(); err != nil {
			log.Printf("hotkey prev profile error: %v", err)
		}
	})

	hkMgr.Register("toggleEditMode", settingsSvc.Settings().Hotkeys["toggleEditMode"], func() {
		handleToggleEditMode(overlayController, profileSvc, hubSvc, &overlayRunning, emitter)
	})

	// Silent update check on startup (after a short delay so the UI is ready).
	if updaterSvc != nil {
		go func() {
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
			info, err := updaterSvc.CheckUpdatesCtx(ctx)
			if err != nil {
				log.Printf("startup update check error: %v", err)
				return
			}
			if ctx.Err() != nil {
				return
			}
			if info.HasUpdate && info.LatestRelease.TagName != "" {
				emitter.Emit("updater:notify", map[string]any{
					"tag":         info.LatestRelease.TagName,
					"name":        info.LatestRelease.Name,
					"prerelease":  info.LatestRelease.Prerelease,
					"downloadURL": installerURL(info.LatestRelease),
				})
			}
		}()
	}

	// Version info broadcast for UI.
	emitter.Emit("app:version", map[string]any{"version": version})

	wailsApp.Event.On("app:version:get", func(event *application.CustomEvent) {
		emitter.Emit("app:version", map[string]any{"version": version})
	})

	wailsApp.Event.On("telemetry:source-status:get", func(event *application.CustomEvent) {
		emitter.Emit("telemetry:source-status", vapp.SourceInfo())
	})

	if updaterSvc != nil {
		emitUpdaterError := func(message string) {
			emitter.Emit("updater:error", map[string]any{"message": message})
		}

		wailsApp.Event.On("updater:settings:get", func(event *application.CustomEvent) {
			settings, err := updaterSvc.GetSettings()
			if err != nil {
				log.Printf("updater:settings:get error: %v", err)
				emitUpdaterError(err.Error())
				return
			}
			emitter.Emit("updater:settings", map[string]any{"settings": settings})
		})

		wailsApp.Event.On("updater:settings:save", func(event *application.CustomEvent) {
			var settings updater.Settings
			if event.Data != nil {
				if raw, err := json.Marshal(event.Data); err == nil {
					json.Unmarshal(raw, &settings)
				}
			}
			if err := updaterSvc.SaveSettings(&settings); err != nil {
				log.Printf("updater:settings:save error: %v", err)
				emitUpdaterError(err.Error())
				return
			}
			emitter.Emit("updater:settings-saved", map[string]any{"ok": true})
		})

		wailsApp.Event.On("updater:check", func(event *application.CustomEvent) {
			info, err := updaterSvc.CheckUpdatesManual()
			if err != nil {
				log.Printf("updater:check error: %v", err)
				emitUpdaterError(err.Error())
				return
			}
			emitter.Emit("updater:available", map[string]any{"info": info})
		})

		wailsApp.Event.On("updater:install", func(event *application.CustomEvent) {
			log.Printf("updater:install rejected: legacy handler is disabled; use updater:install:verified")
			emitUpdaterError("legacy updater:install is disabled; use updater:install:verified")
		})

		wailsApp.Event.On("updater:ignore", func(event *application.CustomEvent) {
			var data struct {
				Version string `json:"version"`
			}
			if event.Data != nil {
				if raw, err := json.Marshal(event.Data); err == nil {
					json.Unmarshal(raw, &data)
				}
			}
			if err := updaterSvc.IgnoreVersion(data.Version); err != nil {
				emitUpdaterError(err.Error())
				return
			}
			emitter.Emit("updater:ignored", map[string]any{"version": data.Version})
		})

		wailsApp.Event.On("updater:install:verified", func(event *application.CustomEvent) {
			var release updater.Release
			if event.Data != nil {
				if raw, err := json.Marshal(event.Data); err == nil {
					json.Unmarshal(raw, &release)
				}
			}
			if release.TagName == "" {
				emitUpdaterError("release is required")
				return
			}
			emitter.Emit("updater:progress", map[string]any{"percent": 0})
			go func() {
				if err := updaterSvc.InstallVerifiedVersionCtx(ctx, release); err != nil {
					if ctx.Err() != nil {
						log.Printf("updater:install:verified aborted: %v", ctx.Err())
						return
					}
					log.Printf("updater:install:verified error: %v", err)
					emitUpdaterError(err.Error())
					return
				}
				emitter.Emit("updater:installed", map[string]any{"ok": true})
			}()
		})
	}

	// App settings event handlers
	emitSettingsError := func(message string) {
		emitter.Emit("settings:error", map[string]any{"message": message})
	}

	// Keep a helper to rebuild hotkey registrations when settings change.
	rebuildHotkeys := func() {
		hkMgr.UpdateFromSettings(settingsSvc.Settings(), buildHotkeyActionMap(overlayController, profileSvc, hubSvc, &overlayRunning, emitter))
	}

	wailsApp.Event.On("settings:get", func(event *application.CustomEvent) {
		emitter.Emit("settings", settingsSvc.Settings())
	})

	wailsApp.Event.On("diagnostics:get", func(event *application.CustomEvent) {
		diag, err := diagSvc.GetDiagnostics()
		if err != nil {
			log.Printf("diagnostics:get error: %v", err)
			emitter.Emit("diagnostics:error", map[string]any{"message": err.Error()})
			return
		}
		emitter.Emit("diagnostics", diag)
	})

	wailsApp.Event.On("settings:save", func(event *application.CustomEvent) {
		var s app.AppSettings
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				json.Unmarshal(raw, &s)
			}
		}
		if err := settingsSvc.Save(&s); err != nil {
			log.Printf("settings:save error: %v", err)
			emitSettingsError(err.Error())
			return
		}
		// Apply CPU sampling toggle if runtime sampler exists
		if rtSampler != nil {
			rtSampler.SetCPUEnabled(s.CpuSampling)
		}
		mode := delta.ReferenceMode(s.DeltaMode)
		if mode == "" {
			mode = delta.ModeSelf
		}
		vapp.SetDeltaMode(mode)
		// Rebuild hotkeys with new combos
		rebuildHotkeys()
		emitter.Emit("settings-saved", map[string]any{"ok": true})
	})

	emitHubError := func(message string) {
		emitter.Emit("hub:error", map[string]any{"message": message})
	}

	// Hub event handlers
	wailsApp.Event.On("hub:list", func(event *application.CustomEvent) {
		profiles, err := hubSvc.ListProfiles()
		if err != nil {
			log.Printf("hub:list error: %v", err)
			emitHubError(err.Error())
			return
		}
		emitter.Emit("hub:profiles", map[string]any{
			"profiles": profiles,
		})
	})

	wailsApp.Event.On("hub:save-own-copy", func(event *application.CustomEvent) {
		var data struct {
			Profile config.ProfileConfig `json:"profile"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &data)
			}
		}
		if err := hubSvc.SaveProfileAsOwnCopy(&data.Profile); err != nil {
			log.Printf("hub:save-own-copy error: %v", err)
			emitHubError(err.Error())
			return
		}
		emitter.Emit("hub:profile-created", map[string]any{"ok": true})
	})

	wailsApp.Event.On("hub:create", func(event *application.CustomEvent) {
		var data struct {
			Name string `json:"name"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				json.Unmarshal(raw, &data)
			}
		}
		if err := hubSvc.CreateProfile(data.Name); err != nil {
			log.Printf("hub:create error: %v", err)
			emitHubError(err.Error())
			return
		}
		emitter.Emit("hub:profile-created", map[string]any{"ok": true})
	})

	wailsApp.Event.On("hub:delete", func(event *application.CustomEvent) {
		var data struct {
			ID   string `json:"id"`
			File string `json:"file"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				json.Unmarshal(raw, &data)
			}
		}
		target := data.File
		if target == "" {
			target = data.ID
		}
		if err := hubSvc.DeleteProfile(target); err != nil {
			log.Printf("hub:delete error: %v", err)
			emitHubError(err.Error())
			return
		}
		emitter.Emit("hub:profile-deleted", map[string]any{"ok": true})
	})

	wailsApp.Event.On("hub:activate", func(event *application.CustomEvent) {
		target := readProfileTarget(event)
		if err := hubSvc.ActivateProfile(target); err != nil {
			log.Printf("hub:activate error: %v", err)
			emitHubError(err.Error())
			return
		}
		profileSvc.EmitLoaded()
		emitter.Emit("hub:profile-activated", map[string]any{"ok": true})
	})

	wailsApp.Event.On("hub:set-active", func(event *application.CustomEvent) {
		target := readProfileTarget(event)
		// Stop overlay if running (no hot-swap).
		if overlayRunning.Load() {
			hubSvc.StopOverlay()
			resetOverlayDisplayMode(overlayController, profileSvc, emitter)
			overlayRunning.Store(false)
		}
		if err := hubSvc.SetActiveProfile(target); err != nil {
			log.Printf("hub:set-active error: %v", err)
			emitHubError(err.Error())
			return
		}
	})

	wailsApp.Event.On("overlay:start", func(event *application.CustomEvent) {
		target := readProfileTarget(event)
		if err := vapp.EnsureLiveTelemetry(); err != nil {
			log.Printf("overlay:start live telemetry unavailable, using fallback: %v", err)
		}
		emitter.Emit("telemetry:source-status", vapp.SourceInfo())

		status, err := hubSvc.StartOverlay(target)
		if err != nil {
			log.Printf("overlay:start error: %v", err)
			emitHubError(err.Error())
			// StartOverlay closes the previous window before attempting to
			// create a new one; on failure there may be no window left, so
			// sync overlayRunning with the returned status to avoid a
			// dangling true flag.
			if !status.Running {
				overlayRunning.Store(false)
			}
			return
		}
		overlayRunning.Store(status.Running)
		// Always open the desktop overlay in racing mode. Edit mode is entered
		// explicitly via the toggle-edit-mode hotkey.
		resetOverlayDisplayMode(overlayController, profileSvc, emitter)
	})

	wailsApp.Event.On("overlay:stop", func(event *application.CustomEvent) {
		hubSvc.StopOverlay()
		resetOverlayDisplayMode(overlayController, profileSvc, emitter)
		overlayRunning.Store(false)
	})

	wailsApp.Event.On("overlay:start-active", func(event *application.CustomEvent) {
		if err := vapp.EnsureLiveTelemetry(); err != nil {
			log.Printf("overlay:start-active live telemetry unavailable, using fallback: %v", err)
		}
		emitter.Emit("telemetry:source-status", vapp.SourceInfo())

		status, err := hubSvc.StartActiveOverlay()
		if err != nil {
			log.Printf("overlay:start-active error: %v", err)
			emitHubError(err.Error())
			if !status.Running {
				overlayRunning.Store(false)
			}
			return
		}
		overlayRunning.Store(status.Running)
		resetOverlayDisplayMode(overlayController, profileSvc, emitter)
	})

	wailsApp.Event.On("overlay:toggle-edit-mode", func(event *application.CustomEvent) {
		handleToggleEditMode(overlayController, profileSvc, hubSvc, &overlayRunning, emitter)
	})

	wailsApp.Event.On("profile:set-mode", func(event *application.CustomEvent) {
		var data struct {
			Mode config.DisplayMode `json:"mode"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				json.Unmarshal(raw, &data)
			}
		}
		switch data.Mode {
		case config.ModeRacing, config.ModeEdit, config.ModeStreaming:
			if err := profileSvc.SetDisplayMode(data.Mode); err != nil {
				log.Printf("profile:set-mode error: %v", err)
				return
			}
			profileSvc.EmitLoaded()
		default:
			log.Printf("profile:set-mode invalid mode: %q", data.Mode)
		}
	})

	wailsApp.Event.On("profile:request", func(event *application.CustomEvent) {
		profileSvc.EmitLoaded()
	})

	log.Printf("telemetry source: kind=%s name=%s live=%v available=%v", vapp.SourceInfo().Kind, vapp.SourceInfo().Name, vapp.SourceInfo().Live, vapp.SourceInfo().Available)

	// Start telemetry
	bridge = app.NewTelemetryBridge(vapp.Telemetry, emitter)
	vapp.StartTelemetry(ctx)
	bridge.Start()
	sourceInfo := service.InfoForSource(vapp.TelemetrySource())
	rtSampler = ops.NewRuntimeSampler(sourceInfo)
	opsBridge = app.NewOpsBridge(rtSampler, emitter, ops.DefaultInterval)
	opsBridge.Start()

	// Start global hotkey manager
	if err := hkMgr.Start(); err != nil {
		log.Printf("warning: hotkey manager start error: %v", err)
	} else {
		log.Printf("global hotkeys active (%d registered)", len(settingsSvc.Settings().Hotkeys))
	}

	// --- OBS / SSE HTTP server ---
	httpSrv = server.New(server.ServerConfig{
		Addr:        *httpAddr,
		DistFS:      distFS,
		CfgDir:      cfgDir,
		Svc:         vapp.Telemetry,
		EngineerSvc: engSvc,
	})
	httpSrv.Start()
	log.Printf("OBS overlay: http://%s/overlay?profile=%s", *httpAddr, filepath.Base(*profilePath))

	// Listen for layout:save events from frontend (Preview editor or edit mode drag-save)
	wailsApp.Event.On("layout:save", func(event *application.CustomEvent) {
		type layoutSaveData struct {
			Widgets  []config.WidgetConfig        `json:"widgets"`
			Variants []config.WidgetVariantConfig `json:"variants"`
		}
		var data layoutSaveData
		switch v := event.Data.(type) {
		case map[string]any:
			// Extract widgets from map
			if widgetsRaw, ok := v["widgets"]; ok {
				if widgetsJSON, err := json.Marshal(widgetsRaw); err == nil {
					json.Unmarshal(widgetsJSON, &data.Widgets)
				}
			}
			// Extract variants only when present; nil means "keep existing variants".
			if variantsRaw, ok := v["variants"]; ok {
				if variantsJSON, err := json.Marshal(variantsRaw); err == nil {
					json.Unmarshal(variantsJSON, &data.Variants)
				}
			}
		}
		if len(data.Widgets) > 0 {
			if err := profileSvc.SaveProfileState(data.Widgets, data.Variants); err != nil {
				log.Printf("layout save error: %v", err)
				emitHubError(err.Error())
			}
		}
	})

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}

// wailsWindowHandle adapts *application.WebviewWindow to window.WindowHandle.
type wailsWindowHandle struct {
	w *application.WebviewWindow
}

func (h *wailsWindowHandle) SetBounds(bounds window.WailsRect) {
	h.w.SetBounds(application.Rect{
		X:      bounds.X,
		Y:      bounds.Y,
		Width:  bounds.Width,
		Height: bounds.Height,
	})
	h.ensureTransparent()
}

func (h *wailsWindowHandle) SetSize(width, height int) {
	h.w.SetSize(width, height)
	h.ensureTransparent()
}

func (h *wailsWindowHandle) SetPosition(x, y int) {
	h.w.SetPosition(x, y)
}

func (h *wailsWindowHandle) SetIgnoreMouseEvents(ignore bool) {
	h.w.SetIgnoreMouseEvents(ignore)
	h.ensureTransparent()
}

func (h *wailsWindowHandle) SetResizable(b bool) {
	h.w.SetResizable(b)
}

func (h *wailsWindowHandle) Fullscreen() {
	h.w.Fullscreen()
}

func (h *wailsWindowHandle) UnFullscreen() {
	h.w.UnFullscreen()
	h.ensureTransparent()
}

func (h *wailsWindowHandle) ensureTransparent() {
	h.w.SetBackgroundColour(application.NewRGBA(0, 0, 0, 0))
	h.w.ExecJS(`(() => {
  const transparent = "transparent";
  document.documentElement.classList.add("desktop-overlay", "desktop-overlay-boot");
  document.documentElement.style.background = transparent;
  document.documentElement.style.backgroundColor = transparent;
  document.body?.classList.add("desktop-overlay");
  if (document.body) {
    document.body.style.background = transparent;
    document.body.style.backgroundColor = transparent;
  }
  const root = document.getElementById("root");
  if (root) {
    root.style.background = transparent;
    root.style.backgroundColor = transparent;
  }
})()`)
}

// wailsOverlayFactory creates a fresh Wails overlay window for each Start call.
type wailsOverlayFactory struct {
	app         *application.App
	stopOverlay func()
}

type wailsOverlayWindow struct {
	w      *application.WebviewWindow
	handle *wailsWindowHandle
	mgr    *window.Manager
}

func (o *wailsOverlayWindow) Close() {
	o.w.Close()
}

func (o *wailsOverlayWindow) ApplyProfileMode(profile *config.ProfileConfig) error {
	if o.mgr == nil || profile == nil {
		return fmt.Errorf("overlay window not ready for mode application")
	}
	o.mgr.ApplyProfile(profile, false)
	return nil
}

func (f *wailsOverlayFactory) NewOverlayWindow(profile *config.ProfileConfig, origin config.Rect, bounds config.Rect) (app.OverlayWindow, error) {
	w := f.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:             "Vantare Overlay",
		Width:             1920,
		Height:            1080,
		Frameless:         true,
		BackgroundType:    application.BackgroundTypeTransparent,
		BackgroundColour:  application.NewRGBA(0, 0, 0, 0),
		IgnoreMouseEvents: false,
		AlwaysOnTop:       true,
		URL:               "/",
	})

	// When the user (or Stop) closes the overlay window, we must stop treating
	// it as the current window so StartOverlay can create a fresh one next time.
	w.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		go func() {
			if stop := f.stopOverlay; stop != nil {
				stop()
			}
		}()
	})

	handle := &wailsWindowHandle{w: w}
	mgr := window.NewManager(handle, 0)
	// Apply the profile's display mode instead of hard-coding passthrough.
	// This guarantees ModeRacing starts click-through and ModeEdit starts interactive.
	mgr.ApplyProfile(profile, false)
	return &wailsOverlayWindow{w: w, handle: handle, mgr: mgr}, nil
}

// readProfileTarget extracts id/file from a Wails custom event payload.
func readProfileTarget(event *application.CustomEvent) string {
	var data struct {
		ID   string `json:"id"`
		File string `json:"file"`
	}
	if event.Data != nil {
		if raw, err := json.Marshal(event.Data); err == nil {
			_ = json.Unmarshal(raw, &data)
		}
	}
	if data.File != "" {
		return data.File
	}
	return data.ID
}

// overlayStarter is the subset of HubService needed to start a desktop overlay.
type overlayStarter interface {
	StartActiveOverlay() (app.OverlayStatus, error)
}

// emitEditModeChanged notifies the frontend of the current edit mode.
func emitEditModeChanged(emitter app.EventEmitter, mode config.DisplayMode) {
	if emitter == nil {
		return
	}
	emitter.Emit("overlay:edit-mode-changed", map[string]any{"mode": string(mode)})
}

// applyDisplayModeToWindow applies the current profile's display mode to the
// running overlay window. ProfileService has no window manager in main, so the
// real window state is updated here.
func applyDisplayModeToWindow(overlayController *app.OverlayController, profile *config.ProfileConfig) error {
	if overlayController == nil || profile == nil {
		return fmt.Errorf("cannot apply mode: missing controller or profile")
	}
	win := overlayController.CurrentWindow()
	if win == nil {
		return fmt.Errorf("no overlay window to apply mode")
	}
	return win.ApplyProfileMode(profile)
}

// handleToggleEditMode toggles edit mode on the running overlay. If the overlay
// is not running, it opens the active profile and enters edit mode immediately.
// The profile is always left in a well-defined mode (racing or edit) and the
// frontend is notified via overlay:edit-mode-changed.
func handleToggleEditMode(
	overlayController *app.OverlayController,
	profileSvc *app.ProfileService,
	starter overlayStarter,
	overlayRunning *atomic.Bool,
	emitter app.EventEmitter,
) {
	if overlayController == nil || profileSvc == nil {
		return
	}

	status := overlayController.Status()
	if !status.Running {
		if starter == nil {
			return
		}
		profile := profileSvc.Profile()
		if profile == nil {
			return
		}
		// Ensure a clean runtime start, then switch to edit mode.
		if profile.DisplayMode == config.ModeEdit {
			if err := profileSvc.SetDisplayMode(config.ModeRacing); err != nil {
				log.Printf("hotkey toggle edit mode reset error: %v", err)
				return
			}
		}
		newStatus, err := starter.StartActiveOverlay()
		if err != nil {
			log.Printf("hotkey toggle edit mode start overlay error: %v", err)
			// StartActiveOverlay stops the previous window before starting a
			// new one; on failure there may be no window left, so sync the
			// flag to avoid a dangling true value. Do not emit
			// overlay:edit-mode-changed on this error path.
			if !newStatus.Running {
				overlayRunning.Store(false)
			}
			return
		}
		if !newStatus.Running {
			// No desktop window (e.g. streaming profile); do not enter edit mode.
			return
		}
		overlayRunning.Store(newStatus.Running)
		if err := profileSvc.SetDisplayMode(config.ModeEdit); err != nil {
			log.Printf("hotkey toggle edit mode error: %v", err)
			return
		}
		if err := applyDisplayModeToWindow(overlayController, profileSvc.Profile()); err != nil {
			log.Printf("hotkey toggle edit mode apply window error: %v", err)
			return
		}
		profileSvc.EmitLoaded()
		emitEditModeChanged(emitter, config.ModeEdit)
		return
	}

	profile := profileSvc.Profile()
	if profile == nil {
		return
	}
	target := config.ModeEdit
	if profile.DisplayMode == config.ModeEdit {
		target = config.ModeRacing
	}
	if err := profileSvc.SetDisplayMode(target); err != nil {
		log.Printf("hotkey toggle edit mode error: %v", err)
		return
	}
	if err := applyDisplayModeToWindow(overlayController, profileSvc.Profile()); err != nil {
		log.Printf("hotkey toggle edit mode apply window error: %v", err)
		return
	}
	profileSvc.EmitLoaded()
	emitEditModeChanged(emitter, target)
}

// resetOverlayDisplayMode forces the active profile back to racing mode and
// applies it to the running window when one exists. It is called when the
// overlay is started/stopped so the next start always opens in runtime mode,
// even if the previous edit session left the profile in edit mode.
func resetOverlayDisplayMode(overlayController *app.OverlayController, profileSvc *app.ProfileService, emitter app.EventEmitter) {
	if profileSvc == nil {
		return
	}
	profile := profileSvc.Profile()
	if profile == nil {
		return
	}
	if profile.DisplayMode == config.ModeRacing {
		return
	}
	if err := profileSvc.SetDisplayMode(config.ModeRacing); err != nil {
		log.Printf("overlay stop reset display mode error: %v", err)
		return
	}
	if overlayController != nil && overlayController.CurrentWindow() != nil {
		if err := applyDisplayModeToWindow(overlayController, profileSvc.Profile()); err != nil {
			log.Printf("overlay reset display mode apply window error: %v", err)
		}
	}
	profileSvc.EmitLoaded()
	emitEditModeChanged(emitter, config.ModeRacing)
}

// buildHotkeyActionMap returns the action map used for hotkey registration and
// rebuild. Keeping this in a separate function makes it testable and guarantees
// that rebuildHotkeys includes every action (including toggleEditMode).
func buildHotkeyActionMap(
	overlayController *app.OverlayController,
	profileSvc *app.ProfileService,
	hubSvc *app.HubService,
	overlayRunning *atomic.Bool,
	emitter app.EventEmitter,
) map[string]func() {
	return map[string]func(){
		"toggleOverlay": func() {
			if overlayController == nil {
				return
			}
			status := overlayController.Status()
			if status.Running {
				overlayController.Stop()
				resetOverlayDisplayMode(overlayController, profileSvc, emitter)
				overlayRunning.Store(false)
			} else {
				profile := profileSvc.Profile()
				if profile != nil {
					if _, err := overlayController.Start(profile); err != nil {
						log.Printf("hotkey toggle overlay error: %v", err)
						return
					}
					overlayRunning.Store(true)
					// Always open in racing mode; edit mode is entered explicitly via
					// the toggle-edit-mode hotkey.
					resetOverlayDisplayMode(overlayController, profileSvc, emitter)
				}
			}
		},
		"nextProfile": func() {
			if !overlayRunning.Load() {
				return
			}
			if err := profileSvc.NextProfile(); err != nil {
				log.Printf("hotkey next profile error: %v", err)
			}
		},
		"prevProfile": func() {
			if !overlayRunning.Load() {
				return
			}
			if err := profileSvc.PreviousProfile(); err != nil {
				log.Printf("hotkey prev profile error: %v", err)
			}
		},
		"toggleEditMode": func() {
			handleToggleEditMode(overlayController, profileSvc, hubSvc, overlayRunning, emitter)
		},
	}
}
