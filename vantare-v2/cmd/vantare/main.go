package main

import (
	"context"
	"flag"
	"log"
	"os/signal"
	"syscall"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type wailsEmitter struct {
	wailsApp *application.App
}

func (w *wailsEmitter) Emit(name string, data any) {
	w.wailsApp.Event.Emit(name, data)
}

func main() {
	live := flag.Bool("live", false, "use LMU shared memory (fallback mock)")
	profilePath := flag.String("profile", "configs/example-racing.json", "profile JSON path")
	edit := flag.Bool("edit", false, "force edit mode (overrides profile displayMode)")
	flag.Parse()

	distFS, err := app.FrontendDistFS()
	if err != nil {
		log.Fatalf("frontend/dist not found (run: pnpm --dir frontend build): %v", err)
	}

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

	// Create initial window (will be resized by ApplyProfile)
	w := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "Vantare Overlay",
		Width:          400,
		Height:         120,
		Frameless:      true,
		BackgroundType: application.BackgroundTypeTransparent,
		AlwaysOnTop:    true,
		URL:            "/",
	})

	// Create window manager (pad=8 for safe margin)
	winsrc := &wailsWindowHandle{w: w}
	mgr := window.NewManager(winsrc, 8)

	// Create real window handle adapter
	_ = winsrc

	// Load profile
	profileSvc := app.NewProfileService(*profilePath, mgr, emitter)
	if err := profileSvc.Load(); err != nil {
		log.Printf("warning: could not load profile %s: %v (using defaults)", *profilePath, err)
		// Create a default profile
		profileSvc.SetProfile(&config.ProfileConfig{
			DisplayMode: config.ModeRacing,
			Widgets: []config.WidgetConfig{
				{ID: "delta", Type: "delta", Enabled: true, UpdateHz: 30, Position: config.Rect{X: 760, Y: 40, W: 400, H: 48}},
				{ID: "relative", Type: "relative", Enabled: true, UpdateHz: 15, Position: config.Rect{X: 40, Y: 600, W: 320, H: 280}},
				{ID: "standings", Type: "standings", Enabled: true, UpdateHz: 15, Position: config.Rect{X: 1560, Y: 40, W: 340, H: 420}},
			},
		})
	}

	// Override display mode if -edit flag is set
	if *edit {
		profileSvc.SetDisplayMode(config.ModeEdit)
	}

	// Register profile service with Wails (frontend can call methods)
	wailsApp.RegisterService(application.NewService(profileSvc))

	// Start telemetry
	bridge := app.NewTelemetryBridge(vapp.Telemetry, emitter)
	vapp.StartTelemetry(ctx)
	bridge.Start()
	defer vapp.StopTelemetry()
	defer bridge.Stop()

	// Apply profile to window (racing: shrink-wrap, edit: fullscreen)
	profileSvc.ApplyToWindow(false)

	// Emit profile:loaded event for frontend
	profileSvc.EmitLoaded()

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
}

func (h *wailsWindowHandle) SetSize(width, height int) {
	h.w.SetSize(width, height)
}

func (h *wailsWindowHandle) SetPosition(x, y int) {
	h.w.SetPosition(x, y)
}

func (h *wailsWindowHandle) SetIgnoreMouseEvents(ignore bool) {
	h.w.SetIgnoreMouseEvents(ignore)
}

func (h *wailsWindowHandle) SetResizable(b bool) {
	h.w.SetResizable(b)
}

func (h *wailsWindowHandle) Fullscreen() {
	h.w.Fullscreen()
}

func (h *wailsWindowHandle) UnFullscreen() {
	h.w.UnFullscreen()
}
