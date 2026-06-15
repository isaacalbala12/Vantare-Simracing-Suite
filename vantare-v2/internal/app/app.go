package app

import (
	"context"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

// openLMUSource is swappable in tests.
var openLMUSource = service.OpenLMUSource

type App struct {
	Telemetry *service.Service
	source    service.Source
	lmuSource *service.LMUSource
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

// New builds the app and a telemetry service (single LMU mmap open when live).
func New(useLiveLMU bool) *App {
	var src service.Source
	var lmuSrc *service.LMUSource

	if useLiveLMU {
		if s, err := openLMUSource(); err == nil {
			lmuSrc = s
			src = wrapLMUSourceWithREST(s)
			log.Printf("live LMU source opened")
		} else {
			log.Printf("warning: live LMU source unavailable: %v (falling back to mock)", err)
		}
	}
	if src == nil {
		src = createMockSource()
	}

	svc := service.New(service.Config{
		ReadHz: 60,
		EmitHz: 30,
		Source: src,
	})

	return &App{Telemetry: svc, source: src, lmuSource: lmuSrc}
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
	if closer, ok := a.source.(interface{ Close() error }); ok {
		_ = closer.Close()
	}
}

// LMUSource returns the live source when -live was used (for tests).
func (a *App) LMUSource() *service.LMUSource {
	return a.lmuSource
}

func (a *App) TelemetrySource() service.Source {
	if a == nil {
		return nil
	}
	return a.source
}

// SourceInfo returns metadata about the active telemetry source.
func (a *App) SourceInfo() service.SourceInfo {
	if a == nil {
		return service.SourceInfo{Kind: service.SimulatorUnknown, Name: "No source", Live: false, Available: false}
	}
	return service.InfoForSource(a.source)
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
