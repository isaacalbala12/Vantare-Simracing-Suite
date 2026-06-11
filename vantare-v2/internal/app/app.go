package app

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

// openLMUSource is swappable in tests.
var openLMUSource = service.OpenLMUSource

type App struct {
	Telemetry *service.Service
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
			src = s
		}
	}
	if src == nil {
		buf := lmu.BuildSyntheticBuffer()
		src = service.FuncSource(func() []byte { return buf })
	}

	svc := service.New(service.Config{
		ReadHz: 60,
		EmitHz: 30,
		Source: src,
	})

	return &App{Telemetry: svc, lmuSource: lmuSrc}
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
	if a.lmuSource != nil {
		_ = a.lmuSource.Close()
		a.lmuSource = nil
	}
}

// LMUSource returns the live source when -live was used (for tests).
func (a *App) LMUSource() *service.LMUSource {
	return a.lmuSource
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
