package app

import (
	"context"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/vantare/overlays/v2/internal/telemetry/delta"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

// openLMUSource is swappable in tests.
var openLMUSource = service.OpenLMUSource

type App struct {
	Telemetry *service.Service
	sources   *TelemetrySourceManager
	lmuSource *service.LMUSource
	deltaMode *atomic.Value
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

// New builds the app and a telemetry service with live-first source management.
func New(useLiveLMU bool) *App {
	var lmuSrc *service.LMUSource
	deltaModeValue := &atomic.Value{}
	deltaModeValue.Store(delta.ModeSelf)

	manager := NewTelemetrySourceManager(TelemetrySourceManagerConfig{
		UseLive: useLiveLMU,
		OpenLive: func() (service.Source, error) {
			s, err := openLMUSource()
			if err != nil {
				log.Printf("warning: live LMU source unavailable: %v (telemetry remains disconnected)", err)
				return nil, err
			}
			lmuSrc = s
			log.Printf("live LMU source initialized")
			enriched := wrapLMUSourceWithREST(s)
			if mode, ok := deltaModeValue.Load().(delta.ReferenceMode); ok {
				enriched.SetDeltaMode(mode)
			}
			return enriched, nil
		},
	})

	svc := service.New(service.Config{
		ReadHz: 60,
		EmitHz: 30,
		Source: manager,
	})

	return &App{Telemetry: svc, sources: manager, lmuSource: lmuSrc, deltaMode: deltaModeValue}
}

func (a *App) StartTelemetry(ctx context.Context) {
	if a.Telemetry == nil {
		return
	}
	runCtx, cancel := context.WithCancel(ctx)
	a.cancel = cancel
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		_ = a.Telemetry.Run(runCtx)
	}()
}

func (a *App) StopTelemetry() {
	if a.cancel != nil {
		a.cancel()
	}
	a.wg.Wait()
	if a.sources != nil {
		a.sources.Close()
	}
}

// EnsureLiveTelemetry tries to reconnect to live telemetry if not already active.
func (a *App) EnsureLiveTelemetry() error {
	if a == nil || a.sources == nil {
		return nil
	}
	return a.sources.EnsureLive()
}

func (a *App) SetDeltaMode(mode delta.ReferenceMode) {
	if mode == "" {
		mode = delta.ModeSelf
	}
	if a == nil {
		return
	}
	if a.deltaMode != nil {
		a.deltaMode.Store(mode)
	}
	if enriched, ok := a.TelemetrySource().(*EnrichedLMUSource); ok {
		enriched.SetDeltaMode(mode)
	}
}

// LMUSource returns the live source when -live was used (for tests).
func (a *App) LMUSource() *service.LMUSource {
	return a.lmuSource
}

func (a *App) TelemetrySource() service.Source {
	if a == nil || a.sources == nil {
		return nil
	}
	return a.sources.Source()
}

// SourceInfo returns metadata about the active telemetry source.
func (a *App) SourceInfo() service.SourceInfo {
	if a == nil || a.sources == nil {
		return service.SourceInfo{Kind: service.SimulatorUnknown, Name: "No source", Live: false, Available: false}
	}
	return a.sources.Info()
}

// FrontendDistFS locates the built Vite output (CWD, then next to executable).
func FrontendDistFS() (fs.FS, error) {
	candidates := []string{
		"frontend/dist",
		"vantare-v2/frontend/dist",
	}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(dir, "frontend", "dist"),
			filepath.Join(dir, "..", "frontend", "dist"),
		)
	}
	for _, dir := range candidates {
		if info, err := os.Stat(filepath.Join(dir, "index.html")); err == nil && !info.IsDir() {
			return os.DirFS(dir), nil
		}
	}
	return nil, os.ErrNotExist
}
