package launcher

import (
	"errors"
	"os"
	"os/exec"
)

// Errores públicos para que callers reaccionen sin parsear mensajes.
var (
	ErrInvalidConfig     = errors.New("launcher: invalid configuration")
	ErrExecutableMissing = errors.New("launcher: executable path does not exist")
	ErrUnsupported       = errors.New("launcher: not supported on this platform")
	ErrAppNotFound       = errors.New("launcher: app not found")
	ErrProfileNotFound   = errors.New("launcher: profile not found")
	ErrProfileDuplicate  = errors.New("launcher: profile id already exists")
	ErrProfileInProgress = errors.New("launcher: profile already in progress")
	ErrLauncherStopping  = errors.New("launcher: service is stopping")
	ErrDecisionNotFound  = errors.New("launcher: decision not found")
	ErrInvalidDecision   = errors.New("launcher: invalid decision")
	ErrInvalidStep       = errors.New("launcher: invalid step")
)

// execLauncher imita os/exec.Command para tests inyectables.
type execLauncher func(name string, args ...string) *exec.Cmd

// defaultExecLauncher es el launcher de producción. Tests lo swapean vía NewService.
var defaultExecLauncher execLauncher = exec.Command

// Emitter es el sink mínimo de eventos. El *wailsEmitter de main.go lo satisface.
type Emitter interface {
	Emit(name string, data any)
}

// fileExists comprueba si un path existe (no sigue symlinks rotos).
func fileExists(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// KnownLaunchMethods lista los métodos de lanzamiento aceptados.
var KnownLaunchMethods = map[string]struct{}{
	"steam-uri":  {},
	"executable": {},
}
