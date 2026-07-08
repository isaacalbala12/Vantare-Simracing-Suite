package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
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
	"github.com/vantare/overlays/v2/internal/app/launcher"
	"github.com/vantare/overlays/v2/internal/calendar"
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
var version = "v0.1.0.4"

// supabaseURL and supabaseAnonKey are injected at build time via ldflags
// (-X main.supabaseURL=... -X main.supabaseAnonKey=...) so the release build
// can validate OAuth tokens without requiring end users to set environment
// variables. They are public values (the Supabase anon key is designed to be
// shipped in client apps). Runtime env vars VANTARE_SUPABASE_URL /
// VANTARE_SUPABASE_ANON_KEY still take precedence for development and
// overrides.
var (
	supabaseURL     = ""
	supabaseAnonKey = ""
)

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

func installerURL(release updater.Release) string {
	if asset := updater.FindInstaller(release); asset != nil {
		return asset.DownloadURL
	}
	return release.HTMLURL
}

// handleDiscoverApps runs discovery, persists the merged app set and emits the
// canonical launcher:apps:detected event. On error it falls back to
// launcher:error so the UI can surface a message.
func handleDiscoverApps(svc *launcher.Service, emitter app.EventEmitter) {
	if _, err := svc.DiscoverApps(); err != nil {
		log.Printf("launcher:discover error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
	}
}

// handleAddApp validates and persists a manually-added app, then emits
// launcher:apps:updated with the full app set so the UI refreshes.
func handleAddApp(entry app.LauncherAppEntry, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.AddManualApp(entry); err != nil {
		log.Printf("launcher:addApp error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:apps:updated", map[string]any{"apps": svc.Settings().GetLauncherApps()})
}

// handleRemoveApp deletes an app (refusing when a profile still uses it) and
// emits launcher:apps:updated with the remaining set.
func handleRemoveApp(id string, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.RemoveApp(id); err != nil {
		log.Printf("launcher:removeApp error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:apps:updated", map[string]any{"apps": svc.Settings().GetLauncherApps()})
}

// handleListProfiles emits launcher:profiles:updated with the current profiles.
func handleListProfiles(svc *launcher.Service, emitter app.EventEmitter) {
	profiles := svc.ListProfiles()
	emitter.Emit("launcher:profiles:updated", map[string]any{"profiles": profiles})
}

// handleSaveProfile validates and persists a profile, then re-emits the full
// profile list so the UI stays in sync.
func handleSaveProfile(profile app.LaunchProfile, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.SaveProfile(profile); err != nil {
		log.Printf("launcher:saveProfile error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:profiles:updated", map[string]any{"profiles": svc.ListProfiles()})
}

// handleDeleteProfile removes a profile by ID and re-emits the remaining list.
func handleDeleteProfile(id string, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.DeleteProfile(id); err != nil {
		log.Printf("launcher:deleteProfile error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:profiles:updated", map[string]any{"profiles": svc.ListProfiles()})
}

// handleDuplicateProfile copies an existing profile into a new one with the
// given newID and newName (both required). On success it re-emits the profile
// list so the UI refreshes with the new card.
func handleDuplicateProfile(id, newID, newName string, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.DuplicateProfile(id, newID, newName); err != nil {
		log.Printf("launcher:duplicateProfile error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:profiles:updated", map[string]any{"profiles": svc.ListProfiles()})
}

// handleLaunchProfile starts the launch chain for a profile. The chain runs on
// a goroutine; chain progress/error events are emitted by the ChainRunner. On
// lookup failure (unknown profile) it emits launcher:error.
func handleLaunchProfile(id string, svc *launcher.Service, emitter app.EventEmitter, parentCtx context.Context) {
	if err := svc.LaunchProfile(parentCtx, id); err != nil {
		log.Printf("launcher:launchProfile error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
}

// handleCancelProfile cancels the active launch chain for a profile, if any.
func handleCancelProfile(id string, svc *launcher.Service, emitter app.EventEmitter) {
	svc.CancelChain(id)
	_ = emitter
}

// handleAppPick opens a native file picker for an executable. Wails v3
// alpha.98-tui does not expose a file dialog API, so we emit a launcher:error
// noting the limitation and let the frontend's HTML file input take over.
//
// TODO(launcher): when Wails exposes a native file dialog, replace the fallback
// with application.NewFileDialog().SetTitle(...).AddFilter("exe","*.exe").BrowseFiles()
// and emit launcher:app:picked with the chosen path.
func handleAppPick(emitter app.EventEmitter) {
	emitter.Emit("launcher:error", map[string]any{
		"message": "file picker no disponible en esta versión de Wails; usa el selector del navegador",
	})
}

// handleRegistryList reads all installed apps from the Windows Registry using
// launcher.ListRegistryApps and emits them as launcher:registry:listed so the
// AddNonSteamGameModal can display the system-wide installed app list.
func handleRegistryList(emitter app.EventEmitter) {
	apps := launcher.ListRegistryApps()
	emitter.Emit("launcher:registry:listed", map[string]any{"apps": apps})
}

// handleAppUpdate updates the Args field of a launcher app entry identified by
// id. On success it emits launcher:apps:updated with the full app set so the
// UI refreshes. On error it emits launcher:error with the failure reason.
func handleAppUpdate(id, args string, settingsSvc *app.SettingsService, emitter app.EventEmitter) {
	if err := settingsSvc.UpdateLauncherAppArgs(id, args); err != nil {
		log.Printf("launcher:app:update error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:apps:updated", map[string]any{"apps": settingsSvc.GetLauncherApps()})
}

// handleChainError is invoked when the chain runner reports a step failure.
// It first verifies the profile still exists (race-safe: the user may have
// deleted it while the chain ran). When the profile is missing, it emits
// launcher:error and stops. Otherwise it asks the user via the native
// question dialog whether to retry the whole chain. On yes it re-issues
// LaunchProfile; on no it stays silent (the chain already terminated).
func handleChainError(profileID string, stepIndex int, message string, svc *launcher.Service, emitter app.EventEmitter, dialog launcherDialogShower) {
	profiles := svc.ListProfiles()
	found := false
	for _, p := range profiles {
		if p.ID == profileID {
			found = true
			break
		}
	}
	if !found {
		log.Printf("launcher:chain error for unknown profile %q (step %d): %s", profileID, stepIndex, message)
		emitter.Emit("launcher:error", map[string]any{
			"message":   message,
			"profileId": profileID,
			"stepIndex": stepIndex,
		})
		return
	}
	if !dialog.ShowRetry(profileID, message) {
		return
	}
	if err := svc.LaunchProfile(context.Background(), profileID); err != nil {
		log.Printf("launcher:chain retry error: %v", err)
		emitter.Emit("launcher:error", map[string]any{
			"message":   err.Error(),
			"profileId": profileID,
			"stepIndex": stepIndex,
		})
	}
}

// handleProfileRetryFailed re-launches a profile from scratch as a retry of
// the entire chain. The frontend emits this when the user clicks
// "Reintentar fallidos" in the native toast after a partial/failed chain.
func handleProfileRetryFailed(profileID string, svc *launcher.Service, emitter app.EventEmitter, parentCtx context.Context) {
	if err := svc.LaunchProfile(parentCtx, profileID); err != nil {
		log.Printf("launcher:profile:retry:failed error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
}

// handleProfileStatsSave manually records a successful profile launch with the
// given wall-clock duration. This is used when the frontend wants to persist
// telemetry data independently of the automatic chain-runner path.
func handleProfileStatsSave(profileID string, durationMs int64, settingsSvc *app.SettingsService, emitter app.EventEmitter) {
	if err := launcher.RecordProfileSuccess(settingsSvc, profileID, durationMs); err != nil {
		log.Printf("launcher:profile:stats:save error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:profile:stats:saved", map[string]any{"profileId": profileID})
}

// handleProfileHotkeySet registers or unregisters a global Windows hotkey for
// a profile. When combo is empty the existing hotkey (if any) is unregistered.
// On registration failure (reserved combo, Windows conflict, or syscall error)
// it emits launcher:profile:hotkey:error with the failure reason.
func handleProfileHotkeySet(profileID, combo string, profileHkMgr *launcher.HotkeyManager, emitter app.EventEmitter) {
	if combo == "" {
		profileHkMgr.Unregister(profileID)
		emitter.Emit("launcher:profile:hotkey:set", map[string]any{"profileId": profileID, "combo": ""})
		return
	}
	if err := profileHkMgr.Register(profileID, combo); err != nil {
		log.Printf("launcher:profile:hotkey:set error: %v", err)
		emitter.Emit("launcher:profile:hotkey:error", map[string]any{"profileId": profileID, "message": err.Error()})
		return
	}
	emitter.Emit("launcher:profile:hotkey:set", map[string]any{"profileId": profileID, "combo": combo})
}

// handleAutostartToggle registers or unregisters a Windows Run key entry for
// the given profile (Vantare.<profileID> => vantare.exe --launch=<profileID>).
func handleAutostartToggle(profileID string, enabled bool, emitter app.EventEmitter) {
	var err error
	if enabled {
		err = launcher.RegisterAutostart(profileID)
	} else {
		err = launcher.UnregisterAutostart(profileID)
	}
	if err != nil {
		log.Printf("launcher:autostart:toggle error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:autostart:toggled", map[string]any{"profileId": profileID, "enabled": enabled})
}

// handleAppFavorite toggles the IsFavorite flag for a launcher app entry and
// re-emits the full app set so the UI stays in sync.
func handleAppFavorite(id string, favorite bool, settingsSvc *app.SettingsService, emitter app.EventEmitter) {
	if err := settingsSvc.SetLauncherAppFavorite(id, favorite); err != nil {
		log.Printf("launcher:app:favorite error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:apps:updated", map[string]any{"apps": settingsSvc.GetLauncherApps()})
}

// handleLaunchFlag parses --launch=<profileID> from the command-line arguments.
// When the flag is present and valid it launches the profile immediately via
// the chain runner. This is the entry point for Windows autostart
// (HKCU\...\Run → vantare.exe --launch=<id>).
func handleLaunchFlag(args []string, settingsSvc *app.SettingsService, svc *launcher.Service, emitter app.EventEmitter) {
	id, ok := launcher.ParseLaunchFlag(args)
	if !ok {
		return
	}
	if err := svc.LaunchProfile(context.Background(), id); err != nil {
		log.Printf("launcher:launch-flag error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
}

// handleShutdownCancelChains cancels every active launch chain. This is the
// shutdown hook called by wails.OnShutdown so no orphaned processes are left
// behind when the Hub closes mid-chain.
func handleShutdownCancelChains(svc *launcher.Service) {
	svc.CancelAll()
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
	reorderArgs()
	flag.Parse()

	if err := server.ValidateAddr(*httpAddr); err != nil {
		log.Fatalf("http: %v", err)
	}

	if *edit {
		log.Printf("warning: -edit is deprecated in Hub Preview flow; start Hub and use Preview instead")
	}

	distFS := frontend.DistFS()

	vapp := app.New(*live)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	wailsApp := application.New(application.Options{
		Name: "Vantare Simracing Suite",
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
	var launcherSvc *launcher.Service
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
			// Cancel any active launch chains (launcherSvc is nil during
			// the defer path but valid in the Wails OnShutdown path).
			if launcherSvc != nil {
				launcherSvc.CancelAll()
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
	// Supabase config: runtime env vars take precedence over the values
	// embedded at build time via ldflags. This lets developers override
	// locally and lets the release build ship with the public anon key
	// baked in so testers never need to configure environment variables.
	supabaseURLResolved := os.Getenv("VANTARE_SUPABASE_URL")
	if supabaseURLResolved == "" {
		supabaseURLResolved = os.Getenv("SUPABASE_URL")
	}
	if supabaseURLResolved == "" {
		supabaseURLResolved = supabaseURL
	}
	supabaseAnonKeyResolved := os.Getenv("VANTARE_SUPABASE_ANON_KEY")
	if supabaseAnonKeyResolved == "" {
		supabaseAnonKeyResolved = os.Getenv("SUPABASE_ANON_KEY")
	}
	if supabaseAnonKeyResolved == "" {
		supabaseAnonKeyResolved = supabaseAnonKey
	}
	licenseSvc := license.NewService(license.Config{
		SupabaseURL:     supabaseURLResolved,
		SupabaseAnonKey: supabaseAnonKeyResolved,
		GracePeriod:     24 * time.Hour,
		CachePath:       licenseCachePath,
	}, emitter, license.MachineFingerprint)
	licenseSvc.WithCache(license.NewLicenseCache(licenseCachePath))
	if supabaseURLResolved != "" && supabaseAnonKeyResolved != "" {
		licenseSvc.WithClient(license.NewStdlibSupabaseClient(supabaseURLResolved, supabaseAnonKeyResolved))
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
			RefreshToken string `json:"refreshToken"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		// Validate already emits license:changed internally via EmitChanged,
		// so we must not emit again here to avoid duplicate events that can
		// race with the frontend state machine.
		res, verr := licenseSvc.Validate(context.Background(), payload.SessionToken)
		if verr != nil {
			log.Printf("license:validate error: %v", verr)
			emitter.Emit("license:error", map[string]any{"message": verr.Error()})
			return
		}
		if res != nil {
			log.Printf("license:validate result state=%s deviceOK=%v err=%v entitlements=%d",
				res.State, res.DeviceOK, res.Error != nil, len(res.Entitlements))
		}
		// Emit auth:session so the frontend can persist the Supabase session
		// in the WebView's localStorage. This survives app restarts.
		if payload.SessionToken != "" {
			emitter.Emit("auth:session", map[string]any{
				"access_token":  payload.SessionToken,
				"refresh_token": payload.RefreshToken,
			})
		}
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

	// --- OBS / SSE / Auth HTTP server (start early, before any login gate) ---
	httpSrv = server.New(server.ServerConfig{
		Addr:        *httpAddr,
		DistFS:      distFS,
		CfgDir:      cfgDir,
		Svc:         vapp.Telemetry,
		EngineerSvc: engSvc,
		Emitter:     emitter,
	})
	httpSrv.Start()
	log.Printf("OBS overlay: http://%s/overlay?profile=%s", *httpAddr, filepath.Base(*profilePath))

	// App settings service (delta mode, hotkeys, cpu sampling toggle)
	appSettingsPath := filepath.Join(cfgDir, "app-settings.json")
	settingsSvc := app.NewSettingsService(appSettingsPath, emitter, nil)
	if err := settingsSvc.Load(); err != nil {
		log.Printf("warning: could not load settings: %v (using defaults)", err)
	}

	// Calendar service for the local LMU race calendar (CALENDAR-02).
	// Data is persisted to cfgDir/calendar-lmu.json, not app-settings.json.
	calendarSvc := calendar.NewService(cfgDir, time.Now)
	if err := calendarSvc.Load(); err != nil {
		log.Printf("warning: could not load calendar: %v (using empty)", err)
	}

	// Apply bundled LMU seed (CALENDAR-04). Replaces old bundled events
	// with the latest seed while preserving non-bundled events and followed
	// IDs for events that still exist. A bad seed logs a warning and does
	// not block startup.
	if seed, err := calendar.LoadBundledSeed(); err != nil {
		log.Printf("warning: could not load bundled seed: %v (skipping)", err)
	} else if err := calendarSvc.ApplyBundledSeed(seed); err != nil {
		log.Printf("warning: could not apply bundled seed: %v (using existing calendar)", err)
	}

	// Apply official LMU weekly schedule (CALENDAR-05-C). Replaces old
	// bundled events with a bounded window of generated events, stores
	// official series definitions, generates UI-safe series previews, and
	// prunes invalid followed series IDs. A bad schedule logs a warning
	// and does not block startup.
	if err := calendarSvc.ApplyOfficialSchedule(time.Now()); err != nil {
		log.Printf("warning: could not apply official schedule: %v (using existing calendar)", err)
	}

	// Reminder loop (CALENDAR-02-C2-B): polls DueReminders every 30s and
	// emits calendar:reminder for each new (eventId, minutesLeft) pair.
	const calendarReminderInterval = 30 * time.Second
	{
		reminderTick := time.NewTicker(calendarReminderInterval)
		defer reminderTick.Stop()
		go calendar.StartReminderLoop(ctx, calendarSvc, reminderTick.C, time.Now, func(r calendar.Reminder) {
			emitter.Emit("calendar:reminder", map[string]any{
				"eventId":         r.EventID,
				"title":           r.Title,
				"track":           r.Track,
				"minutesLeft":     r.MinutesLeft,
				"startTime":       r.StartTime,
				"registrationUrl": r.RegistrationURL,
			})
		})
	}

	// Launcher service for the simulator cards on the Hub dashboard
	// (LAUNCHER-01). Only LMU is supported in this first cut. The service is
	// fire-and-forget: it spawns the configured command and forgets it. No
	// process supervision, no multi-sim, no Linux/Proton yet.
	launcherSvc = launcher.NewService(settingsSvc, emitter, exec.Command)

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
	profileHkMgr := launcher.NewHotkeyManager()

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
		if profiles, listErr := hubSvc.ListProfiles(); listErr != nil {
			log.Printf("hub:save-own-copy list error: %v", listErr)
		} else {
			emitter.Emit("hub:profiles", map[string]any{"profiles": profiles})
		}
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
		if profiles, listErr := hubSvc.ListProfiles(); listErr != nil {
			log.Printf("hub:create list error: %v", listErr)
		} else {
			emitter.Emit("hub:profiles", map[string]any{"profiles": profiles})
		}
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
		if profiles, listErr := hubSvc.ListProfiles(); listErr != nil {
			log.Printf("hub:delete list error: %v", listErr)
		} else {
			emitter.Emit("hub:profiles", map[string]any{"profiles": profiles})
		}
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

	// Launcher event handlers (Launcher Extendido, Fase 5). Each thin event
	// delegates to a package-level handler and surfaces the canonical events
	// from the new contract back to the frontend. App discovery, manual add,
	// removal, profile list/save/delete, launch and cancel all flow through
	// the orchestrator Service.

	wailsApp.Event.On("launcher:apps:discover", func(event *application.CustomEvent) {
		_ = event
		handleDiscoverApps(launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:app:add", func(event *application.CustomEvent) {
		var entry app.LauncherAppEntry
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &entry)
			}
		}
		handleAddApp(entry, launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:app:remove", func(event *application.CustomEvent) {
		var payload struct {
			ID string `json:"id"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleRemoveApp(payload.ID, launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:profiles:list", func(event *application.CustomEvent) {
		_ = event
		handleListProfiles(launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:profile:save", func(event *application.CustomEvent) {
		var profile app.LaunchProfile
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &profile)
			}
		}
		handleSaveProfile(profile, launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:profile:delete", func(event *application.CustomEvent) {
		var payload struct {
			ID string `json:"id"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleDeleteProfile(payload.ID, launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:profile:duplicate", func(event *application.CustomEvent) {
		var payload struct {
			ID      string `json:"id"`
			NewID   string `json:"newId"`
			NewName string `json:"newName"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleDuplicateProfile(payload.ID, payload.NewID, payload.NewName, launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:profile:launch", func(event *application.CustomEvent) {
		var payload struct {
			ID string `json:"id"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleLaunchProfile(payload.ID, launcherSvc, emitter, ctx)
	})

	wailsApp.Event.On("launcher:profile:cancel", func(event *application.CustomEvent) {
		var payload struct {
			ID string `json:"id"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleCancelProfile(payload.ID, launcherSvc, emitter)
	})

	// File picker for manual apps. Wails v3 alpha.98-tui has no native dialog
	// API, so this emits a fallback error and lets the frontend's HTML file
	// input drive the real selection (see handleAppPick).
	wailsApp.Event.On("launcher:app:pick", func(event *application.CustomEvent) {
		_ = event
		handleAppPick(emitter)
	})

	// Registry list handler for the AddNonSteamGameModal. Reads all installed
	// apps from the Windows Registry and emits launcher:registry:listed.
	wailsApp.Event.On("launcher:registry:list", func(event *application.CustomEvent) {
		_ = event
		handleRegistryList(emitter)
	})

	// App args update handler. The frontend emits launcher:app:update with
	// { id, args } when the user edits the args field in the app details panel.
	wailsApp.Event.On("launcher:app:update", func(event *application.CustomEvent) {
		var payload struct {
			ID   string `json:"id"`
			Args string `json:"args"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleAppUpdate(payload.ID, payload.Args, settingsSvc, emitter)
	})

	// Chain error -> native question dialog asking whether to retry.
	// The dialog is created lazily and only used here so headless test
	// runs and the OBS overlay mode (no wailsApp) don't pay the cost.
	chainDialog := newWailsLauncherDialog(wailsApp)
	wailsApp.Event.On("launcher:chain:error", func(event *application.CustomEvent) {
		var payload struct {
			ProfileID string `json:"profileId"`
			StepIndex int    `json:"stepIndex"`
			Message   string `json:"message"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleChainError(payload.ProfileID, payload.StepIndex, payload.Message, launcherSvc, emitter, chainDialog)
	})

	// Launcher extendido (Task 7.3): per-profile retry, stats save, hotkey
	// set, autostart toggle, app favorite toggle, and launch-flag handling.
	// Each thin event delegates to a package-level handler.

	wailsApp.Event.On("launcher:profile:retry:failed", func(event *application.CustomEvent) {
		var payload struct {
			ID string `json:"id"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleProfileRetryFailed(payload.ID, launcherSvc, emitter, ctx)
	})

	wailsApp.Event.On("launcher:profile:stats:save", func(event *application.CustomEvent) {
		var payload struct {
			ProfileID  string `json:"profileId"`
			DurationMs int64  `json:"durationMs"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleProfileStatsSave(payload.ProfileID, payload.DurationMs, settingsSvc, emitter)
	})

	wailsApp.Event.On("launcher:profile:hotkey:set", func(event *application.CustomEvent) {
		var payload struct {
			ProfileID string `json:"profileId"`
			Combo     string `json:"combo"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleProfileHotkeySet(payload.ProfileID, payload.Combo, profileHkMgr, emitter)
	})

	wailsApp.Event.On("launcher:autostart:toggle", func(event *application.CustomEvent) {
		var payload struct {
			ProfileID string `json:"profileId"`
			Enabled   bool   `json:"enabled"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleAutostartToggle(payload.ProfileID, payload.Enabled, emitter)
	})

	wailsApp.Event.On("launcher:app:favorite", func(event *application.CustomEvent) {
		var payload struct {
			ID       string `json:"id"`
			Favorite bool   `json:"favorite"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleAppFavorite(payload.ID, payload.Favorite, settingsSvc, emitter)
	})

	// Calendar event handlers (CALENDAR-02-A) and series follow/unfollow
	// handlers (CALENDAR-05-E1). Five thin events that delegate to the calendar
	// service and surface the canonical calendar document back to the frontend.
	// The service is synchronous: no goroutine, ticker, or reminder logic in
	// this phase.

	wailsApp.Event.On("calendar:get", func(event *application.CustomEvent) {
		app.HandleCalendarGet(calendarSvc, emitter)
	})

	wailsApp.Event.On("calendar:import", func(event *application.CustomEvent) {
		var payload struct {
			Text     string `json:"text"`
			Timezone string `json:"timezone"`
			Source   string `json:"source"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		app.HandleCalendarImport(payload.Text, payload.Timezone, payload.Source, calendarSvc, calendarSvc, emitter, log.Printf)
	})

	wailsApp.Event.On("calendar:clear", func(event *application.CustomEvent) {
		app.HandleCalendarClear(calendarSvc, calendarSvc, emitter, log.Printf)
	})

	wailsApp.Event.On("calendar:follow", func(event *application.CustomEvent) {
		var payload struct {
			EventID string `json:"eventId"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		app.HandleCalendarFollow(payload.EventID, calendarSvc, calendarSvc, emitter, log.Printf)
	})

	wailsApp.Event.On("calendar:unfollow", func(event *application.CustomEvent) {
		var payload struct {
			EventID string `json:"eventId"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		app.HandleCalendarUnfollow(payload.EventID, calendarSvc, calendarSvc, emitter, log.Printf)
	})

	// Calendar series follow/unfollow handlers (CALENDAR-05-E1).
	wailsApp.Event.On("calendar:series:follow", func(event *application.CustomEvent) {
		var payload struct {
			SeriesID string `json:"seriesId"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		app.HandleCalendarSeriesFollow(payload.SeriesID, calendarSvc, calendarSvc, emitter, log.Printf)
	})

	wailsApp.Event.On("calendar:series:unfollow", func(event *application.CustomEvent) {
		var payload struct {
			SeriesID string `json:"seriesId"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		app.HandleCalendarSeriesUnfollow(payload.SeriesID, calendarSvc, calendarSvc, emitter, log.Printf)
	})

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
