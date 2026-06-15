package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/vantare/overlays/v2/configs"
	"github.com/vantare/overlays/v2/frontend"
	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/ops"
	"github.com/vantare/overlays/v2/internal/server"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
	"github.com/vantare/overlays/v2/internal/updater"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// version is the current application version.
var version = "v0.1.6-prealpha"

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
		udf := filepath.Join(appData, "Vantare", "webview_v0.1.1")
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
	overlayController = app.NewOverlayController(&wailsOverlayFactory{app: wailsApp, stopOverlay: func() { overlayController.Stop() }})

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
	// Updater service
	settingsPath := filepath.Join(cfgDir, "updater-settings.json")
	updaterSvc := app.NewUpdaterService(version, settingsPath, emitter)
	wailsApp.RegisterService(application.NewService(updaterSvc))

	// Silent update check on startup (after a short delay so the UI is ready).
	go func() {
		time.Sleep(5 * time.Second)
		info, err := updaterSvc.CheckUpdates()
		if err != nil {
			log.Printf("startup update check error: %v", err)
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

	// Version info broadcast for UI.
	emitter.Emit("app:version", map[string]any{"version": version})

	wailsApp.Event.On("app:version:get", func(event *application.CustomEvent) {
		emitter.Emit("app:version", map[string]any{"version": version})
	})

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
		info, err := updaterSvc.CheckUpdates()
		if err != nil {
			log.Printf("updater:check error: %v", err)
			emitUpdaterError(err.Error())
			return
		}
		emitter.Emit("updater:available", map[string]any{"info": info})
	})

	wailsApp.Event.On("updater:install", func(event *application.CustomEvent) {
		var data struct {
			Tag         string `json:"tag"`
			DownloadURL string `json:"downloadURL"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				json.Unmarshal(raw, &data)
			}
		}
		if data.Tag == "" || data.DownloadURL == "" {
			emitUpdaterError("tag and downloadURL are required")
			return
		}
		emitter.Emit("updater:progress", map[string]any{"percent": 0})
		go func() {
			if err := updaterSvc.InstallVersion(data.Tag, data.DownloadURL); err != nil {
				log.Printf("updater:install error: %v", err)
				emitUpdaterError(err.Error())
				return
			}
			emitter.Emit("updater:installed", map[string]any{"ok": true})
		}()
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
			if err := updaterSvc.InstallVerifiedVersion(release); err != nil {
				log.Printf("updater:install:verified error: %v", err)
				emitUpdaterError(err.Error())
				return
			}
			emitter.Emit("updater:installed", map[string]any{"ok": true})
		}()
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

	wailsApp.Event.On("overlay:start", func(event *application.CustomEvent) {
		target := readProfileTarget(event)
		_, err := hubSvc.StartOverlay(target)
		if err != nil {
			log.Printf("overlay:start error: %v", err)
			emitHubError(err.Error())
			return
		}
	})

	wailsApp.Event.On("overlay:stop", func(event *application.CustomEvent) {
		hubSvc.StopOverlay()
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

	// Start low-frequency ops metrics bridge
	sourceInfo := service.InfoForSource(vapp.TelemetrySource())
	opsBridge = app.NewOpsBridge(ops.NewRuntimeSampler(sourceInfo), emitter, ops.DefaultInterval)
	opsBridge.Start()

	// --- OBS / SSE HTTP server ---
	httpSrv = server.New(server.ServerConfig{
		Addr:   *httpAddr,
		DistFS: distFS,
		CfgDir: cfgDir,
		Svc:    vapp.Telemetry,
	})
	httpSrv.Start()
	log.Printf("OBS overlay: http://%s/overlay?profile=%s", *httpAddr, filepath.Base(*profilePath))

	// Listen for layout:save events from frontend (Preview editor or edit mode drag-save)
	wailsApp.Event.On("layout:save", func(event *application.CustomEvent) {
		type layoutSaveData struct {
			Widgets []config.WidgetConfig `json:"widgets"`
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
		}
		if len(data.Widgets) > 0 {
			if err := profileSvc.SaveLayout(data.Widgets); err != nil {
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
	w *application.WebviewWindow
}

func (o *wailsOverlayWindow) Close() {
	o.w.Close()
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
	handle.SetIgnoreMouseEvents(true)
	handle.SetResizable(false)
	handle.Fullscreen()
	handle.SetIgnoreMouseEvents(true)
	return &wailsOverlayWindow{w: w}, nil
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
