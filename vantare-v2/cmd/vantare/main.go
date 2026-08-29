package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/vantare/overlays/v2/configs"
	"github.com/vantare/overlays/v2/frontend"
	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/app/launcher"
	performancesensor "github.com/vantare/overlays/v2/internal/app/performance/sensor"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/applog"
	"github.com/vantare/overlays/v2/internal/authsession"
	"github.com/vantare/overlays/v2/internal/calendar"
	"github.com/vantare/overlays/v2/internal/calendar/discordbot"
	engineeraudio "github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/commands"
	"github.com/vantare/overlays/v2/internal/engineer/ptt"
	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/engineer/voiceinput"
	"github.com/vantare/overlays/v2/internal/license"
	"github.com/vantare/overlays/v2/internal/notify"
	"github.com/vantare/overlays/v2/internal/ops"
	"github.com/vantare/overlays/v2/internal/server"
	"github.com/vantare/overlays/v2/internal/startup"
	"github.com/vantare/overlays/v2/internal/storage"
	strategyapplication "github.com/vantare/overlays/v2/internal/strategy/application"
	strategycatalog "github.com/vantare/overlays/v2/internal/strategy/catalog"
	strategycoldstart "github.com/vantare/overlays/v2/internal/strategy/coldstart"
	"github.com/vantare/overlays/v2/internal/strategy/curation"
	strategymanual "github.com/vantare/overlays/v2/internal/strategy/manual"
	strategyrepository "github.com/vantare/overlays/v2/internal/strategy/repository"
	strategysolver "github.com/vantare/overlays/v2/internal/strategy/solver"
	strategytyres "github.com/vantare/overlays/v2/internal/strategy/tyres"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/testingcenter/reportdraft"
	"github.com/vantare/overlays/v2/internal/tts"
	"github.com/vantare/overlays/v2/internal/updater"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

// version is the current application version.
var version = "v0.1.0.7"

// buildChannel is injected by release builds. Local and public builds fail
// closed as master so the internal Testing Center cannot appear accidentally.
var buildChannel = "master"

func engineerAudioConfigFor(service *engineerservice.EngineerService) (*engineeraudio.AudioConfig, error) {
	if service == nil {
		return nil, errors.New("engineer audio configuration requires a service")
	}
	return engineeraudio.DefaultAudioConfigForLocale(string(service.Locale()))
}

const (
	telemetrySourceStatusEvent        = "telemetry-core:source-status"
	telemetrySourceStatusRequestEvent = "telemetry-core:source-status:get"
)

// Public Supabase configuration and license verification keys are injected by
// the generated supabase_build.go source so values never become Task cache file
// names. They are public client configuration, not server-side secrets. Runtime
// VANTARE_* environment variables still take precedence for development.
var (
	supabaseURL       = ""
	supabaseAnonKey   = ""
	licensePublicKeys = ""
	// F6-a remains fail-closed: release tooling may inject a reviewed URL and
	// build admission token later; normal builds contain neither and cannot send.
	curationWorkerURL           = ""
	curationBuildAdmissionToken = ""
	// Empty by default: F5-e consumes the signed TEST fixture locally until
	// Isaac explicitly publishes and configures the first real catalog.
	strategyCatalogURL = ""
)

func protectedStoreTargets(channel, backendURL string) (clockTarget, authTarget string) {
	if channel != "nightly" && channel != "testers" {
		return "Vantare/LicenseClock", "Vantare/SupabaseAuth"
	}
	digest := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(backendURL))))
	scope := fmt.Sprintf("Vantare/%s/%x", channel, digest[:8])
	return scope + "/LicenseClock", scope + "/SupabaseAuth"
}

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

// telemetrySessionsRoot is the single composition authority for the current
// and future telemetry session writer. Installed builds keep session data in
// LocalAppData; portable and development builds keep it beside their root.
func telemetrySessionsRoot(cfgDir string) (string, error) {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config directory: %w", err)
	}
	localDataDir, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve local data directory: %w", err)
	}
	return resolveTelemetrySessionsRoot(cfgDir, userConfigDir, localDataDir)
}

func resolveTelemetrySessionsRoot(
	cfgDir string,
	userConfigDir string,
	localDataDir string,
) (string, error) {
	if cfgDir == "" || !filepath.IsAbs(cfgDir) {
		return "", fmt.Errorf("configs directory must be absolute")
	}
	cfgDir = filepath.Clean(cfgDir)
	installedConfigDir := filepath.Join(userConfigDir, "Vantare", "configs")
	if samePath(cfgDir, installedConfigDir) {
		if localDataDir == "" || !filepath.IsAbs(localDataDir) {
			return "", fmt.Errorf("local data directory must be absolute")
		}
		return filepath.Join(
			filepath.Clean(localDataDir),
			"Vantare",
			"telemetry",
			"sessions",
		), nil
	}
	return filepath.Join(
		filepath.Dir(cfgDir),
		"data",
		"telemetry",
		"sessions",
	), nil
}

func samePath(left, right string) bool {
	left = filepath.Clean(left)
	right = filepath.Clean(right)
	if runtime.GOOS == "windows" {
		return strings.EqualFold(left, right)
	}
	return left == right
}

func strategyRepositoryRoot(cfgDir string) (string, error) {
	if cfgDir == "" || !filepath.IsAbs(cfgDir) {
		return "", fmt.Errorf("configs directory must be absolute")
	}
	return filepath.Join(filepath.Dir(filepath.Clean(cfgDir)), "data", "strategy"), nil
}

// logsRoot places the application log the same way telemetry sessions are
// placed: an installed build writes under LocalAppData, a portable or
// development build writes beside its own root. Logs follow session data rather
// than the configs directory because they are disposable machine output, not
// something the user authored.
func logsRoot(cfgDir string) (string, error) {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config directory: %w", err)
	}
	localDataDir, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve local data directory: %w", err)
	}
	return resolveLogsRoot(cfgDir, userConfigDir, localDataDir)
}

func resolveLogsRoot(cfgDir string, userConfigDir string, localDataDir string) (string, error) {
	if cfgDir == "" || !filepath.IsAbs(cfgDir) {
		return "", fmt.Errorf("configs directory must be absolute")
	}
	cfgDir = filepath.Clean(cfgDir)
	installedConfigDir := filepath.Join(userConfigDir, "Vantare", "configs")
	if samePath(cfgDir, installedConfigDir) {
		if localDataDir == "" || !filepath.IsAbs(localDataDir) {
			return "", fmt.Errorf("local data directory must be absolute")
		}
		return filepath.Join(filepath.Clean(localDataDir), "Vantare", "logs"), nil
	}
	return filepath.Join(filepath.Dir(cfgDir), "data", "logs"), nil
}

func telemetryAnalysisBackendConfig() (app.TelemetryAnalysisConfig, error) {
	executablePath, err := os.Executable()
	if err != nil {
		return app.TelemetryAnalysisConfig{}, fmt.Errorf("resolve application executable: %w", err)
	}
	cacheDirectory, err := os.UserCacheDir()
	if err != nil {
		return app.TelemetryAnalysisConfig{}, fmt.Errorf("resolve application cache directory: %w", err)
	}
	return resolveTelemetryAnalysisBackendConfig(executablePath, cacheDirectory, launcher.Discover())
}

func resolveTelemetryAnalysisBackendConfig(
	executablePath string,
	cacheDirectory string,
	discoveredApps map[string]app.LauncherAppEntry,
) (app.TelemetryAnalysisConfig, error) {
	if !filepath.IsAbs(executablePath) || filepath.Clean(executablePath) != executablePath ||
		!filepath.IsAbs(cacheDirectory) || filepath.Clean(cacheDirectory) != cacheDirectory {
		return app.TelemetryAnalysisConfig{}, fmt.Errorf("Telemetry Analysis backend directories must be absolute")
	}
	executableInfo, err := os.Lstat(executablePath)
	if err != nil || !executableInfo.Mode().IsRegular() || executableInfo.Mode()&os.ModeSymlink != 0 {
		return app.TelemetryAnalysisConfig{}, fmt.Errorf("Telemetry Analysis application executable is unavailable")
	}
	cacheInfo, err := os.Lstat(cacheDirectory)
	if err != nil || !cacheInfo.IsDir() || cacheInfo.Mode()&os.ModeSymlink != 0 {
		return app.TelemetryAnalysisConfig{}, fmt.Errorf("Telemetry Analysis cache directory is unavailable")
	}
	return app.TelemetryAnalysisConfig{
		LMURoots:             resolveTelemetryAnalysisLMURoots(discoveredApps),
		ApplicationDirectory: filepath.Dir(executablePath),
		StagingRoot:          filepath.Join(cacheDirectory, "Vantare", "telemetry-analysis", "staging"),
		StabilityWindow:      5 * time.Second,
		MaxCandidates:        128,
		MaxSourceBytes:       2 << 30,
		MaxPageRows:          4096,
	}, nil
}

// resolveTelemetryAnalysisLMURoots accepts only LMU discovered inside a Steam
// library by the native launcher scanner. Persisted/manual paths and paths
// supplied by a consumer never become telemetry read authority.
func resolveTelemetryAnalysisLMURoots(discoveredApps map[string]app.LauncherAppEntry) []string {
	lmu, ok := discoveredApps["lmu"]
	if !ok || lmu.ID != "lmu" || lmu.PathSource != "steam" ||
		!filepath.IsAbs(lmu.ExecutablePath) || filepath.Clean(lmu.ExecutablePath) != lmu.ExecutablePath {
		return nil
	}
	executableName := filepath.Base(lmu.ExecutablePath)
	if !strings.EqualFold(executableName, "Le Mans Ultimate.exe") && !strings.EqualFold(executableName, "LMU.exe") {
		return nil
	}
	if !strings.EqualFold(filepath.Base(filepath.Dir(lmu.ExecutablePath)), "Le Mans Ultimate") {
		return nil
	}
	executableInfo, err := os.Lstat(lmu.ExecutablePath)
	if err != nil || !executableInfo.Mode().IsRegular() || executableInfo.Mode()&os.ModeSymlink != 0 {
		return nil
	}
	root := filepath.Join(filepath.Dir(lmu.ExecutablePath), "UserData", "Telemetry")
	rootInfo, err := os.Lstat(root)
	if err != nil || !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return nil
	}
	return []string{root}
}

type strategyCommandExecutor interface {
	Execute(context.Context, []byte) ([]byte, error)
}

func executeStrategyApplicationCommand(ctx context.Context, executor strategyCommandExecutor, data any) (any, map[string]any) {
	result, failure := app.ExecuteStrategyApplicationCommand(ctx, executor, data)
	if failure == nil {
		return result, nil
	}
	return nil, map[string]any{
		"commandId": failure.CommandID,
		"code":      string(failure.Code),
		"field":     failure.Field,
		"message":   failure.Message,
	}
}

func executeStrategyManualCommand(ctx context.Context, executor strategyCommandExecutor, data any) (any, map[string]any) {
	document, err := json.Marshal(data)
	if err != nil {
		return nil, map[string]any{"commandId": "invalid-command", "code": string(strategymanual.ErrorInvalidInput), "field": "", "message": "The manual Strategy request could not be completed."}
	}
	var header struct {
		CommandID string `json:"commandId"`
	}
	if err := json.Unmarshal(document, &header); err != nil {
		return nil, map[string]any{"commandId": "invalid-command", "code": string(strategymanual.ErrorInvalidInput), "field": "", "message": "The manual Strategy request could not be completed."}
	}
	if header.CommandID == "" {
		header.CommandID = "invalid-command"
	}
	encoded, err := executor.Execute(ctx, document)
	if err != nil {
		code := strategymanual.ErrorInvalidInput
		field := ""
		var calculationErr *strategymanual.CalculationError
		if errors.As(err, &calculationErr) {
			if _, known := publicStrategyManualMessage(calculationErr.Code); known {
				code = calculationErr.Code
				field = calculationErr.Field
			}
		}
		message, _ := publicStrategyManualMessage(code)
		return nil, map[string]any{"commandId": header.CommandID, "code": string(code), "field": field, "message": message}
	}
	var result any
	if err := json.Unmarshal(encoded, &result); err != nil {
		return nil, map[string]any{"commandId": header.CommandID, "code": string(strategymanual.ErrorInvalidInput), "field": "", "message": "The manual Strategy result was invalid."}
	}
	return result, nil
}

// executeStrategySolverCommand compares race strategies. Every assumption the
// solver applies travels back with the answer, so nothing is decided silently.
func executeStrategySolverCommand(ctx context.Context, executor strategyCommandExecutor, data any) (any, map[string]any) {
	invalid := func(commandID, message string) map[string]any {
		return map[string]any{"commandId": commandID, "code": string(strategysolver.ErrorInvalidInput), "field": "", "message": message}
	}
	document, err := json.Marshal(data)
	if err != nil {
		return nil, invalid("invalid-command", "The strategy comparison could not be completed.")
	}
	var header struct {
		CommandID string `json:"commandId"`
	}
	if err := json.Unmarshal(document, &header); err != nil {
		return nil, invalid("invalid-command", "The strategy comparison could not be completed.")
	}
	if header.CommandID == "" {
		header.CommandID = "invalid-command"
	}
	encoded, err := executor.Execute(ctx, document)
	if err != nil {
		code := strategysolver.ErrorInvalidInput
		field := ""
		var solveErr *strategysolver.SolveError
		if errors.As(err, &solveErr) {
			if _, known := publicStrategySolverMessage(solveErr.Code); known {
				code = solveErr.Code
				field = solveErr.Field
			}
		}
		message, _ := publicStrategySolverMessage(code)
		return nil, map[string]any{"commandId": header.CommandID, "code": string(code), "field": field, "message": message}
	}
	var result any
	if err := json.Unmarshal(encoded, &result); err != nil {
		return nil, invalid(header.CommandID, "The strategy comparison result was invalid.")
	}
	return result, nil
}

func publicStrategySolverMessage(code strategysolver.ErrorCode) (string, bool) {
	switch code {
	case strategysolver.ErrorInvalidInput:
		return "Review the highlighted race input.", true
	case strategysolver.ErrorInfeasible:
		return "No strategy finishes this race within the stated limits.", true
	case strategysolver.ErrorOverflow:
		return "The strategy comparison exceeds supported limits.", true
	default:
		return "The strategy comparison could not be completed.", false
	}
}

// executeStrategyTyresCommand validates a planned tyre set against the physical
// domain, which is the authority for which placements are legal.
func executeStrategyTyresCommand(ctx context.Context, executor strategyCommandExecutor, data any) (any, map[string]any) {
	invalid := func(commandID, message string) map[string]any {
		return map[string]any{"commandId": commandID, "code": string(strategytyres.ErrorInvalidTyre), "message": message}
	}
	document, err := json.Marshal(data)
	if err != nil {
		return nil, invalid("invalid-command", "The tyre validation request could not be completed.")
	}
	var header struct {
		CommandID string `json:"commandId"`
	}
	if err := json.Unmarshal(document, &header); err != nil {
		return nil, invalid("invalid-command", "The tyre validation request could not be completed.")
	}
	if header.CommandID == "" {
		header.CommandID = "invalid-command"
	}
	encoded, err := executor.Execute(ctx, document)
	if err != nil {
		code := strategytyres.ErrorInvalidTyre
		var inventoryErr *strategytyres.InventoryError
		if errors.As(err, &inventoryErr) {
			if _, known := publicStrategyTyresMessage(inventoryErr.Code); known {
				code = inventoryErr.Code
			}
		}
		message, _ := publicStrategyTyresMessage(code)
		return nil, map[string]any{"commandId": header.CommandID, "code": string(code), "message": message}
	}
	var result any
	if err := json.Unmarshal(encoded, &result); err != nil {
		return nil, invalid(header.CommandID, "The tyre validation result was invalid.")
	}
	return result, nil
}

func publicStrategyTyresMessage(code strategytyres.ErrorCode) (string, bool) {
	switch code {
	case strategytyres.ErrorCapacityExceeded:
		return "The plan uses more physical tyres than the event allows.", true
	case strategytyres.ErrorDuplicateTyre:
		return "Two physical tyres share the same identity.", true
	case strategytyres.ErrorInvalidCondition:
		return "A tyre condition is outside the supported range.", true
	default:
		return "The tyre inventory could not be validated.", false
	}
}

func publicStrategyManualMessage(code strategymanual.ErrorCode) (string, bool) {
	switch code {
	case strategymanual.ErrorInvalidInput:
		return "Review the highlighted manual Strategy input.", true
	case strategymanual.ErrorOverflow:
		return "The manual Strategy calculation exceeds supported limits.", true
	case strategymanual.ErrorInsufficientCapacity:
		return "The configured resource capacity is insufficient.", true
	default:
		return "The manual Strategy request could not be completed.", false
	}
}

// wailsNotifier adapts the Wails notifications service to notify.Backend. The
// browser Notification API is not wired up in WebView2, so this is the only
// route that can actually reach the desktop.
type wailsNotifier struct {
	service *notifications.NotificationService
}

func (n wailsNotifier) RequestAuthorization() (bool, error) {
	return n.service.RequestNotificationAuthorization()
}

func (n wailsNotifier) Authorized() (bool, error) {
	return n.service.CheckNotificationAuthorization()
}

func (n wailsNotifier) Send(title, body string) error {
	return n.service.SendNotification(notifications.NotificationOptions{
		ID:    fmt.Sprintf("vantare-%d", time.Now().UnixNano()),
		Title: title,
		Body:  body,
	})
}

// notifyingEmitter watches launch chains going past on their way to the
// frontend and raises a desktop notification when one finishes. It sits here,
// not in the launcher package, so that package keeps knowing nothing about
// notifications.
type notifyingEmitter struct {
	downstream app.EventEmitter
	notify     *notify.Service
	settings   *app.SettingsService
}

func (e notifyingEmitter) Emit(name string, data any) {
	e.downstream.Emit(name, data)
	if name != "launcher:chain:done" {
		return
	}
	progress, ok := data.(launcher.ChainProgress)
	if !ok {
		return
	}
	// Sent on its own goroutine: raising a toast is a platform call, and the
	// launch chain must not wait on it.
	go func() {
		if _, err := e.notify.LaunchFinished(
			launchProfileName(e.settings, progress.ProfileID),
			progress.Success,
		); err != nil {
			log.Printf("notification for %s failed: %v", progress.ProfileID, err)
		}
	}()
}

// launchProfileName prefers the name the user gave a profile, falling back to
// its id so a notification is never about "".
func launchProfileName(settings *app.SettingsService, profileID string) string {
	if settings != nil {
		for _, profile := range settings.Settings().LauncherProfiles {
			if profile.ID == profileID && strings.TrimSpace(profile.Name) != "" {
				return profile.Name
			}
		}
	}
	return profileID
}

type wailsEmitter struct {
	wailsApp *application.App
}

func (w *wailsEmitter) Emit(name string, data any) {
	w.wailsApp.Event.Emit(name, data)
}

type telemetryStatusReplayEvents interface {
	On(string, func(*application.CustomEvent)) func()
}

type overlayPullTarget interface {
	WatchClose(window string, callback func()) bool
}

const (
	overlayPullWindowNameHeader = "X-Wails-Window-Name"
	maxOverlayPullRequestBytes  = 1024
)

type overlayPullHTTPService struct {
	target    overlayPullTarget
	transport *telemetrytransport.OverlayPullTransport
	cleanup   sync.Once
}

type wailsOverlayPullTarget struct {
	app     *application.App
	mu      sync.Mutex
	watched map[string]struct{}
}

func newWailsOverlayPullTarget(wailsApp *application.App) *wailsOverlayPullTarget {
	return &wailsOverlayPullTarget{app: wailsApp, watched: make(map[string]struct{})}
}

func (target *wailsOverlayPullTarget) WatchClose(window string, callback func()) bool {
	if target == nil || target.app == nil || target.app.Window == nil || window == "" {
		return false
	}
	target.mu.Lock()
	if _, exists := target.watched[window]; exists {
		target.mu.Unlock()
		return true
	}
	resolved, ok := target.app.Window.GetByName(window)
	if !ok {
		target.mu.Unlock()
		return false
	}
	target.watched[window] = struct{}{}
	target.mu.Unlock()
	resolved.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		target.mu.Lock()
		delete(target.watched, window)
		target.mu.Unlock()
		if callback != nil {
			callback()
		}
	})
	return true
}

func newOverlayPullHTTPService(
	target overlayPullTarget,
	transport *telemetrytransport.OverlayPullTransport,
) *overlayPullHTTPService {
	return &overlayPullHTTPService{target: target, transport: transport}
}

// ServeHTTP exchanges pull acknowledgements and responses through Wails'
// internal asset server. The response belongs to the calling WebView, so
// telemetry never needs Event.Emit or ExecuteScript.
func (service *overlayPullHTTPService) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Cache-Control", "no-store")
	if request.Method != http.MethodPost {
		response.Header().Set("Allow", http.MethodPost)
		http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if service == nil || service.target == nil || service.transport == nil {
		http.Error(response, "overlay telemetry unavailable", http.StatusServiceUnavailable)
		return
	}
	sender := strings.TrimSpace(request.Header.Get(overlayPullWindowNameHeader))
	if sender == "" {
		http.Error(response, "missing Wails window", http.StatusBadRequest)
		return
	}
	pullRequest, ok := decodeOverlayPullHTTPRequest(response, request)
	if !ok {
		return
	}

	switch request.URL.Path {
	case "/pull":
		pullResponse, deliver, err := service.transport.Pull(sender, pullRequest)
		if err != nil {
			log.Printf("overlay telemetry pull error: %v", err)
			http.Error(response, "overlay telemetry unavailable", http.StatusServiceUnavailable)
			return
		}
		if !deliver {
			response.WriteHeader(http.StatusNoContent)
			return
		}
		if !service.target.WatchClose(sender, func() { service.transport.CloseSender(sender) }) {
			service.transport.Close(sender, pullRequest.SessionID)
			http.Error(response, "overlay window unavailable", http.StatusServiceUnavailable)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(response).Encode(pullResponse); err != nil {
			log.Printf("overlay telemetry response error: %v", err)
		}
	case "/close":
		service.transport.Close(sender, pullRequest.SessionID)
		response.WriteHeader(http.StatusNoContent)
	default:
		http.NotFound(response, request)
	}
}

func decodeOverlayPullHTTPRequest(
	response http.ResponseWriter,
	request *http.Request,
) (telemetrytransport.OverlayPullRequest, bool) {
	request.Body = http.MaxBytesReader(response, request.Body, maxOverlayPullRequestBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var pullRequest telemetrytransport.OverlayPullRequest
	if err := decoder.Decode(&pullRequest); err != nil ||
		pullRequest.SessionID == "" || len(pullRequest.SessionID) > 128 {
		http.Error(response, "invalid pull request", http.StatusBadRequest)
		return telemetrytransport.OverlayPullRequest{}, false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		http.Error(response, "invalid pull request", http.StatusBadRequest)
		return telemetrytransport.OverlayPullRequest{}, false
	}
	return pullRequest, true
}

func (service *overlayPullHTTPService) shutdown() {
	if service == nil || service.transport == nil {
		return
	}
	service.cleanup.Do(service.transport.CloseAll)
}

func registerTelemetryStatusReplayHandlers(
	events telemetryStatusReplayEvents,
	emitter telemetrytransport.EventEmitter,
	telemetryRuntime *app.TelemetryCoreRuntime,
) func() {
	if events == nil || emitter == nil || telemetryRuntime == nil {
		return func() {}
	}
	registrations := []struct {
		product telemetrytransport.ProductID
		hub     *telemetrytransport.Hub
	}{
		{product: telemetrytransport.ProductStrategy, hub: telemetryRuntime.StrategyHub()},
	}
	unsubscribes := make([]func(), 0, len(registrations))
	for _, registration := range registrations {
		if registration.hub == nil {
			continue
		}
		unsubscribe := events.On(
			telemetrytransport.StatusRequestEventName(registration.product),
			func(_ *application.CustomEvent) {
				if registration.hub == nil {
					return
				}
				replay, ok, err := registration.hub.ReplayStatus()
				if err != nil {
					log.Printf("%s telemetry status replay error: %v", registration.product, err)
					return
				}
				if !ok {
					return
				}
				emitter.Emit(
					telemetrytransport.EventName(replay.Product, replay.Kind),
					replay.Data,
				)
			},
		)
		unsubscribes = append(unsubscribes, unsubscribe)
	}
	var cleanup sync.Once
	return func() {
		cleanup.Do(func() {
			for _, unsubscribe := range unsubscribes {
				unsubscribe()
			}
		})
	}
}

func installerURL(release updater.Release) string {
	if asset := updater.FindInstaller(release); asset != nil {
		return asset.DownloadURL
	}
	return release.HTMLURL
}

// discoverApps is the injectable seam for the launcher discovery used by
// handleDiscoverApps. Production points at svc.DiscoverApps; tests replace it
// with a deterministic fake so the handler suite never touches the Windows
// registry, installed paths or icon extraction.
var discoverApps = func(svc *launcher.Service) ([]app.LauncherAppEntry, error) {
	return svc.DiscoverApps()
}

// handleDiscoverApps runs discovery, persists the merged app set and emits the
// canonical launcher snapshot. On error it falls back to
// launcher:error so the UI can surface a message.
func handleDiscoverApps(svc *launcher.Service, emitter app.EventEmitter) {
	if _, err := discoverApps(svc); err != nil {
		log.Printf("launcher:discover error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		handleLauncherSnapshot(svc, emitter)
		return
	}
	handleLauncherSnapshot(svc, emitter)
}

func emitLauncherSnapshot(svc *launcher.Service, emitter app.EventEmitter) {
	emitter.Emit("launcher:snapshot", svc.Snapshot())
}

func handleLauncherSnapshot(svc *launcher.Service, emitter app.EventEmitter) {
	emitLauncherSnapshot(svc, emitter)
}

// handleAddApp validates and persists a manually-added app, then emits a snapshot.
func handleAddApp(entry app.LauncherAppEntry, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.AddManualApp(entry); err != nil {
		log.Printf("launcher:addApp error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	handleLauncherSnapshot(svc, emitter)
}

// handleRemoveApp deletes an app (refusing when a profile still uses it) and
// emits a snapshot with the remaining set.
func handleRemoveApp(id string, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.RemoveApp(id); err != nil {
		log.Printf("launcher:removeApp error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	handleLauncherSnapshot(svc, emitter)
}

// handleListProfiles emits the current launcher snapshot.
func handleListProfiles(svc *launcher.Service, emitter app.EventEmitter) {
	handleLauncherSnapshot(svc, emitter)
}

// handleSaveProfile validates and persists a profile, then re-emits the full
// profile list so the UI stays in sync.
func handleSaveProfile(profile app.LaunchProfile, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.SaveProfile(profile); err != nil {
		log.Printf("launcher:saveProfile error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	handleLauncherSnapshot(svc, emitter)
}

// handleDeleteProfile removes a profile by ID and re-emits the remaining list.
func handleDeleteProfile(id string, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.DeleteProfile(id); err != nil {
		log.Printf("launcher:deleteProfile error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	handleLauncherSnapshot(svc, emitter)
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
	handleLauncherSnapshot(svc, emitter)
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
func handleCancelProfile(id string, svc *launcher.Service) {
	svc.CancelChain(id)
}

// handleAppPick opens the native "open file" dialog and reports the chosen
// executable as launcher:app:picked { path, suggestedName }. A cancelled
// dialog emits the same event with an empty path so the frontend can settle
// its pending state instead of waiting forever.
//
// suggestedName is the executable's base name without extension: it is only a
// starting point, the user renames it in the add form before anything is saved.
func handleAppPick(picker launcherFilePicker, emitter app.EventEmitter) {
	if picker == nil {
		emitter.Emit("launcher:error", map[string]any{
			"code":    "picker_unavailable",
			"message": "launcher: file picker unavailable",
		})
		return
	}
	path, err := picker.PickExecutable()
	if err != nil {
		log.Printf("launcher:app:pick error: %v", err)
		emitter.Emit("launcher:error", map[string]any{
			"code":    "picker_unavailable",
			"message": err.Error(),
		})
		return
	}
	emitter.Emit("launcher:app:picked", map[string]any{
		"path":          path,
		"suggestedName": suggestedAppName(path),
	})
}

// suggestedAppName turns C:\Apps\SimHub\SimHubWPF.exe into "SimHubWPF".
func suggestedAppName(path string) string {
	base := filepath.Base(strings.TrimSpace(path))
	if base == "." || base == string(filepath.Separator) {
		return ""
	}
	return strings.TrimSuffix(base, filepath.Ext(base))
}

// handleAddCustomApp persists a user-added executable. The ID, monogram and
// availability are derived in the launcher package so the frontend never
// invents catalog metadata; on success the canonical snapshot carries the new
// row back to the UI.
func handleAddCustomApp(displayName, executablePath string, svc *launcher.Service, emitter app.EventEmitter) {
	entry, err := svc.AddCustomApp(displayName, executablePath)
	if err != nil {
		log.Printf("launcher:app:addCustom error: %v", err)
		emitLauncherCommandError(emitter, err)
		return
	}
	emitter.Emit("launcher:app:added", map[string]any{"id": entry.ID, "displayName": entry.DisplayName})
	handleLauncherSnapshot(svc, emitter)
}

// handleRegistryList reads all installed apps from the Windows Registry using
// launcher.ListRegistryApps and emits them as launcher:registry:listed so the
// AddNonSteamGameModal can display the system-wide installed app list.
func handleRegistryList(emitter app.EventEmitter) {
	apps := launcher.ListRegistryApps()
	emitter.Emit("launcher:registry:listed", map[string]any{"apps": apps})
}

// handleAppUpdate updates the Args field of a launcher app entry identified by
// id. The caller emits the canonical snapshot after this succeeds.
func handleAppUpdate(id, args string, svc *launcher.Service, emitter app.EventEmitter) {
	apps := svc.Settings().GetLauncherApps()
	entry, ok := apps[id]
	if !ok {
		emitter.Emit("launcher:error", map[string]any{"message": fmt.Sprintf("launcher: app %q not found", id)})
		return
	}
	entry.Args = args
	apps[id] = entry
	if err := svc.Settings().SetLauncherApps(apps); err != nil {
		log.Printf("launcher:app:update error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	handleLauncherSnapshot(svc, emitter)
}

func emitLauncherCommandError(emitter app.EventEmitter, err error) {
	payload := map[string]any{"message": err.Error()}
	if appErr, ok := err.(*launcher.LauncherAppError); ok {
		payload["code"] = appErr.Code
		if appErr.AppID != "" {
			payload["appId"] = appErr.AppID
		}
	}
	emitter.Emit("launcher:error", payload)
}

func handleResolveLauncherDecision(decisionID, action string, remember bool, emitter app.EventEmitter) {
	if decisionID == "" || action == "" {
		emitter.Emit("launcher:error", map[string]any{"code": "invalid_decision", "message": "decision id and action are required"})
		return
	}
	emitter.Emit("launcher:decision:resolved", map[string]any{
		"decisionId": decisionID,
		"action":     action,
		"remember":   remember,
	})
}

func handleLauncherOnboardingComplete(settingsSvc *app.SettingsService, emitter app.EventEmitter) {
	settings := settingsSvc.Settings()
	settings.LauncherOnboardingCompleted = true
	if err := settingsSvc.Save(settings); err != nil {
		emitter.Emit("launcher:error", map[string]any{"code": "onboarding_save_failed", "message": err.Error()})
		return
	}
	emitter.Emit("launcher:onboarding:completed", map[string]any{"completed": true})
}

func launcherProcessIdentity(id string, pid int, svc *launcher.Service) (launcher.ProcessIdentity, error) {
	if pid <= 0 {
		return launcher.ProcessIdentity{}, fmt.Errorf("launcher: confirmed PID is required")
	}
	entry, ok := svc.Settings().GetLauncherApps()[id]
	if !ok {
		return launcher.ProcessIdentity{}, fmt.Errorf("launcher: app %q not found", id)
	}
	identity := launcher.ProcessIdentity{PID: pid, ExecutablePath: entry.ExecutablePath}
	if known, ok := launcher.KnownAppsByID[id]; ok && len(known.ProcessNames) > 0 {
		identity.ProcessName = known.ProcessNames[0]
	}
	return identity, nil
}

func handleCloseLauncherApp(id string, pid int, svc *launcher.Service, emitter app.EventEmitter, ctx context.Context) {
	identity, err := launcherProcessIdentity(id, pid, svc)
	if err == nil {
		err = launcher.CloseProcess(ctx, launcher.DefaultProcessInspector(), identity)
	}
	if err != nil {
		emitter.Emit("launcher:error", map[string]any{"code": "process_close_failed", "message": err.Error(), "appId": id})
		return
	}
	handleLauncherSnapshot(svc, emitter)
}

func handleRestartLauncherApp(id string, pid int, svc *launcher.Service, emitter app.EventEmitter, ctx context.Context) {
	identity, err := launcherProcessIdentity(id, pid, svc)
	entry, ok := svc.Settings().GetLauncherApps()[id]
	if err == nil && !ok {
		err = fmt.Errorf("launcher: app %q not found", id)
	}
	if err == nil {
		err = launcher.RestartProcess(ctx, launcher.DefaultProcessInspector(), identity, entry.ExecutablePath, nil)
	}
	if err != nil {
		emitter.Emit("launcher:error", map[string]any{"code": "process_restart_failed", "message": err.Error(), "appId": id})
		return
	}
	handleLauncherSnapshot(svc, emitter)
}

func handleSetAppPath(id, path string, svc *launcher.Service, emitter app.EventEmitter) {
	settings := svc.Settings()
	apps := settings.GetLauncherApps()
	entry, ok := apps[id]
	if !ok {
		emitLauncherCommandError(emitter, &launcher.LauncherAppError{
			Code: "app_not_found", Message: "launcher app was not found", AppID: id,
		})
		return
	}
	updated, err := launcher.ValidateExecutableOverride(entry, path)
	if err != nil {
		emitLauncherCommandError(emitter, err)
		return
	}
	apps[id] = updated
	if err := settings.SetLauncherApps(apps); err != nil {
		emitLauncherCommandError(emitter, err)
		return
	}
	handleLauncherSnapshot(svc, emitter)
}

func handlePreviewAppMerge(manualID string, svc *launcher.Service, emitter app.EventEmitter) {
	entry, ok := svc.Settings().GetLauncherApps()[manualID]
	if !ok {
		emitLauncherCommandError(emitter, &launcher.LauncherAppError{
			Code: "app_not_found", Message: "manual launcher app was not found", AppID: manualID,
		})
		return
	}
	candidateID, ok := launcher.FindMergeCandidate(entry, launcher.OfficialCatalog)
	if !ok {
		emitLauncherCommandError(emitter, &launcher.LauncherAppError{
			Code: "merge_candidate_not_found", Message: "no official merge candidate was found", AppID: manualID,
		})
		return
	}
	emitter.Emit("launcher:app:merge:preview", map[string]any{
		"manualId":         manualID,
		"mergeCandidateId": candidateID,
	})
}

func handleConfirmAppMerge(manualID, catalogID string, svc *launcher.Service, emitter app.EventEmitter) {
	settings := svc.Settings()
	apps := settings.GetLauncherApps()
	manual, manualOK := apps[manualID]
	catalog, catalogOK := apps[catalogID]
	if !catalogOK {
		catalog, catalogOK = launcher.OfficialAppEntry(catalogID)
	}
	if !manualOK || !catalogOK {
		missingID := manualID
		if manualOK {
			missingID = catalogID
		}
		emitLauncherCommandError(emitter, &launcher.LauncherAppError{
			Code: "app_not_found", Message: "manual or catalog launcher app was not found", AppID: missingID,
		})
		return
	}
	merged, profiles, err := launcher.MergeManualIntoCatalog(manual, catalog, settings.GetLauncherProfiles())
	if err != nil {
		emitLauncherCommandError(emitter, err)
		return
	}
	delete(apps, manualID)
	apps[catalogID] = merged
	if err := settings.SetLauncherApps(apps); err != nil {
		emitLauncherCommandError(emitter, err)
		return
	}
	if err := settings.SetLauncherProfiles(profiles); err != nil {
		emitLauncherCommandError(emitter, err)
		return
	}
	emitter.Emit("launcher:app:merge:confirmed", map[string]any{
		"manualId":  manualID,
		"catalogId": catalogID,
	})
	handleLauncherSnapshot(svc, emitter)
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
func handleProfileHotkeySet(profileID, combo string, profileHkMgr *launcher.HotkeyManager, emitter app.EventEmitter, onChanged func(string, string)) {
	if combo == "" {
		profileHkMgr.Unregister(profileID)
		emitter.Emit("launcher:profile:hotkey:set", map[string]any{"profileId": profileID, "combo": ""})
		if onChanged != nil {
			onChanged(profileID, combo)
		}
		return
	}
	if err := profileHkMgr.Register(profileID, combo); err != nil {
		log.Printf("launcher:profile:hotkey:set error: %v", err)
		emitter.Emit("launcher:profile:hotkey:error", map[string]any{"profileId": profileID, "message": err.Error()})
		return
	}
	emitter.Emit("launcher:profile:hotkey:set", map[string]any{"profileId": profileID, "combo": combo})
	if onChanged != nil {
		onChanged(profileID, combo)
	}
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
// It re-emits the snapshot through the live orchestrator: building a throwaway
// launcher.Service here used to answer with an empty ActiveChains list, so
// starring an app mid-launch blanked the chain the UI was drawing.
func handleAppFavorite(id string, favorite bool, settingsSvc *app.SettingsService, svc *launcher.Service, emitter app.EventEmitter) {
	if err := settingsSvc.SetLauncherAppFavorite(id, favorite); err != nil {
		log.Printf("launcher:app:favorite error: %v", err)
		emitLauncherCommandError(emitter, err)
		return
	}
	handleLauncherSnapshot(svc, emitter)
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

func main() {
	if nonce, child := voiceinput.ChildNonceFromArgs(os.Args[1:]); child {
		if err := voiceinput.RunUnavailableChild(nonce, os.Stdout); err != nil {
			os.Exit(2)
		}
		return
	}
	// Set WebView2 user data folder to version-specific path to prevent cache issues across releases
	if appData := os.Getenv("LOCALAPPDATA"); appData != "" {
		udf := filepath.Join(appData, "Vantare", "webview_v0.1.0.5")
		_ = os.Setenv("WEBVIEW2_USER_DATA_FOLDER", udf)
	}

	// The log is installed before anything else runs, so the startup warnings
	// below — the ones that explain why a feature is missing — are the first
	// thing in the file a support request will carry. In a windowed build they
	// previously went to a stderr nobody could read.
	cfgDir := configsDir()
	logsDir := ""
	if root, err := logsRoot(cfgDir); err == nil {
		logsDir = root
	}
	// An empty logsDir has to stay empty rather than being joined with the file
	// name: filepath.Join("", "vantare.log") is a relative path, which would
	// drop a log file into whatever directory the app happened to start in.
	logPath := ""
	if logsDir != "" {
		logPath = filepath.Join(logsDir, applog.FileName)
	}
	logService, logErr := applog.New(applog.Options{Path: logPath, Console: os.Stderr})
	logService.Install()
	defer func() { _ = logService.Close() }()
	if logErr != nil {
		// Only the file failed. The ring and the console still work, so this is
		// a degraded log rather than no log, and it says so on the record.
		logsDir = ""
		log.Printf("warning: log file unavailable, keeping this session in memory only: %v", logErr)
	}

	live := flag.Bool("live", true, "use LMU shared memory (-live=false keeps telemetry disconnected)")
	strategyPublicTransport := flag.Bool("strategy-public-transport", false, "temporarily expose Strategy telemetry over Wails/SSE")
	legacyEngineerSpotter := flag.Bool("engineer-legacy-spotter", false, "rollback to the legacy Engineer Spotter projection instead of radio.v1")
	legacyEngineerFamilies := flag.Bool("engineer-legacy-families", false, "rollback to the five legacy Engineer family monitors instead of radio.v1")
	engineerVoiceInput := flag.Bool("engineer-voice-input", false, "enable the experimental memory-only Engineer voice-input lane")
	profilePath := flag.String("profile", "configs/example-racing.json", "profile JSON path")
	edit := flag.Bool("edit", false, "force edit mode (overrides profile displayMode)")
	httpAddr := flag.String("http", "127.0.0.1:39261", "HTTP/SSE address for OBS Browser Source")
	reorderArgs()
	flag.Parse()
	if !*live {
		log.Printf("live telemetry disabled explicitly; disconnected state will be published")
	}

	if err := server.ValidateAddr(*httpAddr); err != nil {
		log.Fatalf("http: %v", err)
	}

	if *edit {
		log.Printf("warning: -edit is deprecated in Hub Preview flow; start Hub and use Preview instead")
	}

	distFS := frontend.DistFS()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Gancho de diagnostico (ISA-912): `VANTARE_CPU_PROFILE_PATH` captura un
	// perfil CPU del host a fichero para poder atribuir su coste real. No abre
	// ningun puerto. Se detiene solo al agotar su duracion acotada; este defer
	// cubre la salida normal de main y la rama de error de `wailsApp.Run` lo
	// llama explicitamente, porque `log.Fatal` no ejecuta defers. El gancho
	// solo se compila sin `-tags production` (ver cpu_profile.go); en release
	// es un noop.
	stopCPUProfile := startCPUProfile()
	defer stopCPUProfile()

	appOptions := application.Options{
		Name: "Vantare Simracing Suite",
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(distFS),
		},
	}
	// Gancho de diagnostico: `VANTARE_WEBVIEW_DEBUG_PORT=9222` abre el protocolo
	// DevTools del WebView2 para poder perfilar la app real (tracing, metricas de
	// frame) desde fuera. Wails limpia WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS al
	// crear el entorno, asi que la variable de entorno estandar no basta y hay
	// que pasar el argumento por las opciones. El gancho solo se compila en
	// builds sin `-tags production` (ver webview_debug.go); en release devuelve
	// vacio y nunca se abre el puerto de depuracion remota.
	if arg := webviewDebugArgs(); arg != "" {
		appOptions.Windows.AdditionalBrowserArgs = append(
			appOptions.Windows.AdditionalBrowserArgs,
			arg,
		)
		log.Printf("webview: remote debugging enabled via %s", arg)
	}

	wailsApp := application.New(appOptions)

	emitter := &wailsEmitter{wailsApp: wailsApp}
	appSettingsPath := filepath.Join(cfgDir, "app-settings.json")
	settingsSvc := app.NewSettingsService(appSettingsPath, emitter, nil)
	if err := settingsSvc.Load(); err != nil {
		log.Printf("warning: could not load settings: %v (using defaults)", err)
	}
	var studioProfileSvc *app.StudioProfileService
	effectivePerformanceLevel := func() int {
		var profile *config.ProfileDocumentV4
		if studioProfileSvc != nil {
			profile = studioProfileSvc.PerformanceProfile()
		}
		return int(settingsSvc.EffectivePerformancePolicy(profile).Level)
	}
	if err := app.ApplyProcessPowerPolicy(effectivePerformanceLevel()); err != nil {
		log.Printf("warning: performance process policy unavailable: %v", err)
	}
	var cleanup sync.Once
	var hotkeyMu sync.Mutex
	var opsBridge *app.OpsBridge
	var httpSrv *server.Server
	var overlayController *app.OverlayController
	var rtSampler *ops.RuntimeSampler
	var overlayRunning atomic.Bool
	var hkMgr *app.HotkeyManager
	var engBridge *app.EngineerBridge
	var engSvc *engineerservice.EngineerService
	var engineerVoiceRuntime *engineerVoiceInputLane
	var launcherSvc *launcher.Service
	var profileHkMgr *launcher.HotkeyManager
	var notifySvc *notify.Service
	var diagnosticsBridge *app.DiagnosticsBridge
	var testingCenterReportDraftBridge *app.TestingCenterReportDraftBridge
	var testingCenterDiagnosticBridge *app.TestingCenterDiagnosticBridge
	var telemetryCoreRuntime *app.TelemetryCoreRuntime
	var performanceRuntime *app.PerformanceRuntime
	telemetryStatusReplayCleanup := func() {}
	overlayPullCleanup := func() {}
	var telemetryAnalysisSvc *app.TelemetryAnalysisService
	cleanupApp := func() {
		cleanup.Do(func() {
			shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 8*time.Second)
			defer cancelShutdown()
			results := runShutdown(shutdownCtx, []shutdownStep{
				{name: "overlay", stop: func(context.Context) error {
					if overlayController != nil {
						overlayController.Stop()
					}
					return nil
				}},
				{name: "telemetry-status-replay-handlers", stop: func(context.Context) error {
					telemetryStatusReplayCleanup()
					return nil
				}},
				{name: "overlay-telemetry-pull-handlers", stop: func(context.Context) error {
					overlayPullCleanup()
					return nil
				}},
				{name: "performance-sensor", stop: func(ctx context.Context) error {
					if performanceRuntime == nil {
						return nil
					}
					return performanceRuntime.Stop(ctx)
				}},
				{name: "telemetry-core", stop: func(ctx context.Context) error {
					if telemetryCoreRuntime == nil {
						return nil
					}
					return telemetryCoreRuntime.Stop(ctx)
				}},
				{name: "telemetry-analysis", stop: func(context.Context) error {
					if telemetryAnalysisSvc == nil {
						return nil
					}
					return telemetryAnalysisSvc.ServiceShutdown()
				}},
				{name: "http", stop: func(context.Context) error {
					if httpSrv == nil {
						return nil
					}
					return httpSrv.Stop()
				}},
				{name: "ops", stop: func(context.Context) error {
					if opsBridge != nil {
						opsBridge.Stop()
					}
					return nil
				}},
				{name: "global-hotkeys", stop: func(context.Context) error {
					hotkeyMu.Lock()
					manager := hkMgr
					hkMgr = nil
					hotkeyMu.Unlock()
					if manager != nil {
						manager.Stop()
					}
					return nil
				}},
				{name: "profile-hotkeys", stop: func(context.Context) error {
					if profileHkMgr != nil {
						profileHkMgr.Stop()
					}
					return nil
				}},
				{name: "engineer-bridge", stop: func(context.Context) error {
					if engBridge != nil {
						engBridge.Stop()
					}
					return nil
				}},
				{name: "engineer-voice-input", stop: func(ctx context.Context) error {
					if engineerVoiceRuntime != nil {
						return engineerVoiceRuntime.Stop(ctx)
					}
					return nil
				}},
				{name: "launcher", stop: func(context.Context) error {
					if launcherSvc != nil {
						launcherSvc.CancelAll()
					}
					return nil
				}},
				{name: "diagnostics", stop: func(context.Context) error {
					if diagnosticsBridge != nil {
						diagnosticsBridge.Close()
					}
					return nil
				}},
				{name: "testing-center-report-draft", stop: func(context.Context) error {
					if testingCenterReportDraftBridge != nil {
						testingCenterReportDraftBridge.Close()
					}
					return nil
				}},
				{name: "engineer", stop: func(context.Context) error {
					if engSvc != nil {
						engSvc.Stop()
					}
					return nil
				}},
				{name: "application-context", stop: func(context.Context) error {
					stop()
					return nil
				}},
			})
			for _, result := range results {
				if result.err != nil {
					log.Printf("shutdown %s error after %s: %v", result.name, result.duration, result.err)
				}
			}
		})
	}
	wailsApp.OnShutdown(cleanupApp)
	defer cleanupApp()
	// The configs directory was already resolved at the top of main so the log
	// could be opened beside it.
	if cfgDir == "" {
		log.Printf("warning: configs directory not found — hub profile CRUD disabled")
	}
	var strategyBridge strategyCommandExecutor
	strategyRoot, strategyRootErr := strategyRepositoryRoot(cfgDir)
	if strategyRootErr != nil {
		log.Printf("warning: Strategy repository is unavailable")
	} else if repo, openErr := strategyrepository.Open[json.RawMessage](strategyRoot, strategyrepository.Options{}); openErr != nil {
		log.Printf("warning: Strategy repository could not be opened: %v", openErr)
	} else {
		referenceCatalog := strategycatalog.NewConsumer(strategycatalog.ConsumerOptions{
			StatePath: filepath.Join(strategyRoot, "reference-catalog-state.json"),
			URL:       strategyCatalogURL, Fixture: strategycatalog.FixtureSignedV1,
			TrustedKeys: strategycatalog.FixtureTrustedKeys(), MinEpoch: "2026-08-a", MinVersion: 1,
		})
		var sessionCatalog *telemetryanalysis.SessionCatalog
		var coldStart *strategycoldstart.Service
		sessionStore, storeErr := telemetryanalysis.OpenAuthorizedSessionStore(filepath.Join(strategyRoot, "authorized-sessions.json"))
		if storeErr != nil {
			log.Printf("warning: authorized Strategy sessions are unavailable")
			sessionCatalog = telemetryanalysis.NewSessionCatalog(nil)
		} else {
			sessionCatalog = telemetryanalysis.NewSessionCatalog(sessionStore)
			if executable, executableErr := os.Executable(); executableErr == nil {
				importer, importerErr := strategycoldstart.NewLMUImporter(filepath.Dir(executable), filepath.Join(strategyRoot, "telemetry-staging"))
				if importerErr == nil {
					coldStart = strategycoldstart.NewService(strategycoldstart.ServiceOptions{
						StatePath: filepath.Join(strategyRoot, "cold-start.json"),
						Discover: func(ctx context.Context) ([]telemetryanalysis.Candidate, error) {
							return strategycoldstart.DiscoverStandardLMU(ctx, strategycoldstart.StandardLMUTelemetryRoot(), time.Second)
						},
						Importer: importer, Store: sessionStore,
					})
				} else {
					log.Printf("warning: Strategy cold start importer is unavailable")
				}
			}
		}
		// Un *Service nulo dentro de la interfaz coldStartPort no es nil como
		// interfaz: pasarlo tal cual hace que Status() entre con receptor nulo y
		// rompa la app al arrancar. Solo se inyecta cuando existe de verdad.
		strategyService := strategyapplication.NewServiceWithSources(repo, sessionCatalog, nil, referenceCatalog)
		if coldStart != nil {
			strategyService = strategyapplication.NewServiceWithSourcesAndColdStart(repo, sessionCatalog, nil, referenceCatalog, coldStart)
		}
		strategyBridge = strategyapplication.NewJSONBridge(strategyService)
	}
	app.NewStrategyApplicationBridge(ctx, strategyBridge, emitter).RegisterHandlers(wailsApp)
	var curationUploadService *curation.UploadService
	if strategyRootErr == nil {
		curationTarget := fmt.Sprintf("Vantare/%s/CurationCredentialsV1", buildChannel)
		var curationOpenErr error
		curationUploadService, curationOpenErr = curation.OpenUploadService(curation.UploadServiceOptions{
			StatePath:   filepath.Join(strategyRoot, "curation-upload.json"),
			Credentials: curation.NewProtectedCredentialStore(curationTarget),
			Endpoint:    curationWorkerURL,
			BuildToken:  curationBuildAdmissionToken,
		})
		if curationOpenErr != nil {
			log.Printf("warning: Curation upload is unavailable")
			curationUploadService = nil
		}
	}
	app.NewCurationUploadBridge(ctx, curationUploadService, emitter).RegisterHandlers(wailsApp)
	strategyTyresBridge := strategytyres.JSONBridge{}
	wailsApp.Event.On("strategy:tyres:validate", func(event *application.CustomEvent) {
		result, failure := executeStrategyTyresCommand(ctx, strategyTyresBridge, event.Data)
		if failure != nil {
			emitter.Emit("strategy:tyres:error", failure)
			return
		}
		emitter.Emit("strategy:tyres:result", result)
	})
	strategyManualBridge := strategymanual.JSONBridge{}
	wailsApp.Event.On("strategy:manual:calculate", func(event *application.CustomEvent) {
		result, failure := executeStrategyManualCommand(ctx, strategyManualBridge, event.Data)
		if failure != nil {
			emitter.Emit("strategy:manual:error", failure)
			return
		}
		emitter.Emit("strategy:manual:result", result)
	})

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
	// The windowClosed closure runs when the Wails window closes externally
	// (e.g. Alt+F4). It must sync overlayRunning and reset the profile to
	// racing mode so the next open is not accidentally editable. A delayed
	// event from an older window is ignored by the controller identity check.
	overlayController = app.NewOverlayController(newWailsOverlayFactory(wailsApp, func(closed app.OverlayWindow) {
		overlayController.HandleWindowClosed(closed, func() {
			// This callback runs under the controller lock and therefore must not
			// call back into it. Finish the old window's side effects before a new
			// Start can install another current window.
			overlayRunning.Store(false)
			resetOverlayProfileDisplayMode(studioProfileSvc)
		})
	}, effectivePerformanceLevel))

	hubProbe := newHubSuspendEventProbe(wailsApp, emitter)
	hubBlockers := app.NewHubBlockerRegistry()
	wailsApp.Event.On("hub:blockers", func(event *application.CustomEvent) {
		var payload struct {
			Generation    string   `json:"generation"`
			StudioDirty   bool     `json:"studioDirty"`
			LauncherDraft bool     `json:"launcherDraft"`
			OAuthPending  bool     `json:"oauthPending"`
			Other         []string `json:"other"`
			Reasons       []string `json:"reasons"`
		}
		raw, err := json.Marshal(event.Data)
		if err != nil || json.Unmarshal(raw, &payload) != nil {
			return
		}
		accepted := hubBlockers.Update(app.HubBlockerSnapshot{
			Generation: payload.Generation, StudioDirty: payload.StudioDirty,
			LauncherDraft: payload.LauncherDraft, OAuthPending: payload.OAuthPending,
			Other: payload.Other, Reasons: payload.Reasons,
		})
		log.Printf("hub lifecycle: blockers pushed generation=%s accepted=%t blocked=%t reasons=%s",
			payload.Generation, accepted, len(payload.Reasons) > 0, strings.Join(payload.Reasons, "; "))
	})
	var hubLifecycle *app.HubLifecycle
	newHubWindow := func() app.HubWindow {
		generation := newHubSuspendRequestID()
		hubBlockers.Expect(generation)
		window := &wailsHubWindow{w: wailsApp.Window.NewWithOptions(hubWindowOptions(generation))}
		hubProbe.SetTarget(window.w)
		window.w.RegisterHook(events.Common.WindowClosing, func(_ *application.WindowEvent) {
			if window.intentionalClose.Load() {
				return
			}
			go wailsApp.Quit()
		})
		window.w.OnWindowEvent(events.Common.WindowMinimise, func(_ *application.WindowEvent) {
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
				defer cancel()
				hubLifecycle.HandleMinimise(ctx)
			}()
		})
		return window
	}
	hubLifecycle = app.NewHubLifecycle(newHubWindow, effectivePerformanceLevel, func(context.Context) bool {
		return hubBlockers.CanSuspend()
	}, func() {
		snapshot, received := hubBlockers.Snapshot()
		log.Printf("hub lifecycle: kept alive from pushed blockers received=%t generation=%s reasons=%s",
			received, snapshot.Generation, strings.Join(snapshot.Reasons, "; "))
	})
	hubWindow, openedIn := hubLifecycle.Open()
	log.Printf("hub lifecycle: opened in %s", openedIn)
	// Show first, then minimise: on Windows a window has to exist on screen
	// before it can be minimised. Launched at sign-in with this flag, Vantare
	// stays out of the way until the user asks for it.
	if startup.WantsMinimised(os.Args) {
		hubWindow.Minimise()
	}

	openHub := func() {
		_, duration := hubLifecycle.Open()
		log.Printf("hub lifecycle: reopened in %s", duration)
	}
	wailsApp.Event.On("hub:open", func(*application.CustomEvent) { openHub() })
	trayMenu := application.NewMenu()
	trayMenu.Add("Abrir Vantare").OnClick(func(*application.Context) { openHub() })
	trayMenu.AddSeparator()
	trayMenu.Add("Salir").OnClick(func(*application.Context) { go wailsApp.Quit() })
	tray := wailsApp.SystemTray.New().SetMenu(trayMenu).OnClick(openHub)
	tray.SetTooltip("Vantare")

	// Desktop notifications. Wails talks to the platform -- Windows toasts --
	// which is the only route that works: the browser Notification API is not
	// wired up inside WebView2, so an earlier attempt through it could never
	// deliver anything.
	notificationService := notifications.New()
	wailsApp.RegisterService(application.NewService(notificationService))
	// notifySvc itself is built further down, once the settings service exists
	// to answer whether the user wants these. Every method on it tolerates a
	// nil receiver, so a status request that arrives first is answered with an
	// honest "not supported yet" rather than a crash.
	emitNotificationStatus := func() {
		authorized, err := notifySvc.Authorized()
		if err != nil {
			log.Printf("notification authorization check failed: %v", err)
		}
		emitter.Emit("notifications:status", map[string]any{
			"supported":  notifySvc.Supported(),
			"authorized": authorized,
		})
	}

	wailsApp.Event.On("notifications:status:get", func(_ *application.CustomEvent) {
		emitNotificationStatus()
	})

	wailsApp.Event.On("notifications:authorize", func(_ *application.CustomEvent) {
		// On Windows there is nothing to ask: the platform notifier answers yes
		// unconditionally, because per-app permission is a browser concept and
		// not a Windows one. Kept so a platform that does prompt can, and so
		// the answer always comes back from the platform rather than from us.
		if _, err := notifySvc.RequestAuthorization(); err != nil {
			log.Printf("notification authorization request failed: %v", err)
		}
		emitNotificationStatus()
	})

	// "Notifications do not work" is not something a user can diagnose, and the
	// logs do not answer it either: Windows drops toasts silently for reasons
	// of its own -- Focus Assist, an unregistered app id, notifications off in
	// system settings. This turns that into either a toast they can see or an
	// error they can read.
	wailsApp.Event.On("notifications:test", func(_ *application.CustomEvent) {
		err := notifySvc.SendTest()
		payload := map[string]any{"ok": err == nil}
		if err != nil {
			log.Printf("test notification failed: %v", err)
			payload["message"] = err.Error()
		}
		emitter.Emit("notifications:test:result", payload)
	})

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
	licensePublicKeysResolved := resolveLicensePublicKeys(
		licensePublicKeys,
		os.Getenv("VANTARE_LICENSE_PUBLIC_KEYS"),
	)
	licenseClockTarget, authSessionTarget := protectedStoreTargets(
		buildChannel,
		supabaseURLResolved,
	)
	licenseSvc := license.NewService(license.Config{
		SupabaseURL:     supabaseURLResolved,
		SupabaseAnonKey: supabaseAnonKeyResolved,
		CachePath:       licenseCachePath,
	}, emitter, license.MachineFingerprint)
	licenseSvc.WithCache(license.NewLicenseCache(licenseCachePath))
	publicKeys, publicKeyErr := license.ParsePublicKeys(licensePublicKeysResolved)
	if publicKeyErr != nil {
		log.Printf("license: invalid public key configuration: %v", publicKeyErr)
	} else if len(publicKeys) == 0 {
		log.Printf("license: no offline credential public keys configured")
	} else {
		licenseSvc.WithVerifier(license.NewCredentialVerifier(
			publicKeys,
			license.NewProtectedClockStore(licenseClockTarget),
		))
	}
	if supabaseURLResolved != "" && supabaseAnonKeyResolved != "" {
		licenseSvc.WithClient(license.NewStdlibSupabaseClient(supabaseURLResolved, supabaseAnonKeyResolved))
	} else {
		log.Printf("license: supabase env vars missing, running in offline-grace mode")
	}
	if err := licenseSvc.LoadCache(); err != nil {
		log.Printf("warning: could not load license cache: %v", err)
	}
	// Publica el estado cacheado en cuanto haya un suscriptor, para que el Hub
	// pinte sin esperar a la validacion de red. Sin esto, LoadCache cargaba la
	// cache y nadie la usaba: el frontend se quedaba en "Cargando licencia..."
	// uno a tres segundos en cada arranque.
	wailsApp.Event.On("license:cached:get", func(_ *application.CustomEvent) {
		licenseSvc.EmitCachedState()
	})
	wailsApp.RegisterService(application.NewService(licenseSvc))
	telemetryAnalysisCfg, telemetryAnalysisCfgErr := telemetryAnalysisBackendConfig()
	if telemetryAnalysisCfgErr != nil {
		log.Printf("warning: Telemetry Analysis backend configuration is unavailable")
	} else {
		analysisService, analysisServiceErr := app.NewTelemetryAnalysisService(telemetryAnalysisCfg, licenseSvc)
		if analysisServiceErr != nil {
			log.Printf("warning: Telemetry Analysis service is unavailable")
		} else {
			telemetryAnalysisSvc = analysisService
			wailsApp.RegisterService(application.NewService(telemetryAnalysisSvc))
			if status := telemetryAnalysisSvc.Status(); !status.Available {
				log.Printf("warning: Telemetry Analysis reader runtime is unavailable; the rest of Vantare will continue")
			}
		}
	}
	authManager := authsession.NewManager(authsession.NewStore(authSessionTarget))

	// Forward UI license validation requests to the Go service. The frontend
	// fires Events.Emit("license:validate", { sessionToken }) and we answer
	// by running Validate and re-emitting license:changed.
	// Deduplica validaciones concurrentes con el mismo token. El frontend las
	// emite en rafaga desde varios sitios -- se han observado cuatro seguidas en
	// un solo arranque -- y cada una era una llamada de red a Supabase
	// redundante. Quien llega tarde no se queda sin respuesta: EmitChanged es un
	// broadcast, asi que recibe el resultado de la validacion en curso.
	var (
		licenseValidateMu       sync.Mutex
		licenseValidateInFlight = map[string]bool{}
	)
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
		log.Printf("license:validate request tokenLen=%d refreshLen=%d",
			len(payload.SessionToken), len(payload.RefreshToken))
		licenseValidateMu.Lock()
		if licenseValidateInFlight[payload.SessionToken] {
			licenseValidateMu.Unlock()
			log.Printf("license:validate coalesced into the in-flight request")
			return
		}
		licenseValidateInFlight[payload.SessionToken] = true
		licenseValidateMu.Unlock()
		defer func() {
			licenseValidateMu.Lock()
			delete(licenseValidateInFlight, payload.SessionToken)
			licenseValidateMu.Unlock()
		}()
		trustedSessionToken := ""
		if protectedSession, restoreErr := authManager.Restore(); restoreErr == nil {
			trustedSessionToken = protectedSession.AccessToken
		} else if !errors.Is(restoreErr, authsession.ErrNotFound) &&
			!errors.Is(restoreErr, authsession.ErrInvalidStoredSessionRemoved) {
			log.Printf("auth session restore for license fallback failed: %v", restoreErr)
		}
		res, verr := licenseSvc.ValidateWithTrustedSession(
			context.Background(),
			payload.SessionToken,
			trustedSessionToken,
		)
		if verr != nil {
			log.Printf("license:validate error: %v", verr)
			emitter.Emit("license:error", map[string]any{"message": verr.Error()})
			return
		}
		if res != nil {
			log.Printf("license:validate result state=%s deviceOK=%v entitlementCount=%d err=%v",
				res.State, res.DeviceOK, len(res.Entitlements), res.Error)
		}
		// Persist only sessions that have been accepted by the backend. Windows
		// Credential Manager owns persistence; the WebView only keeps memory.
		if shouldPersistValidatedSession(res, payload.SessionToken, payload.RefreshToken) {
			if err := authManager.AcceptValidated(authsession.Session{
				AccessToken: payload.SessionToken, RefreshToken: payload.RefreshToken,
			}); err != nil {
				log.Printf("auth session save failed: %v", err)
			}
			emitter.Emit("auth:session", map[string]any{
				"access_token":  payload.SessionToken,
				"refresh_token": payload.RefreshToken,
				"source":        "validated",
			})
		}
	})

	wailsApp.Event.On("auth:session:get", func(_ *application.CustomEvent) {
		session, err := authManager.Restore()
		if err != nil {
			if errors.Is(err, authsession.ErrInvalidStoredSessionRemoved) {
				log.Printf("invalid protected auth session removed")
				emitter.Emit("auth:session:invalidated", map[string]any{"reason": "invalid_credential"})
			} else if !errors.Is(err, authsession.ErrNotFound) {
				log.Printf("auth session restore failed: %v", err)
				emitter.Emit("auth:session:error", map[string]any{"code": "restore_failed"})
			}
			return
		}
		emitter.Emit("auth:session", map[string]any{
			"access_token": session.AccessToken, "refresh_token": session.RefreshToken, "source": "restore",
		})
	})

	wailsApp.Event.On("auth:session:clear:request", func(event *application.CustomEvent) {
		var payload struct {
			RequestID string `json:"requestId"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		if payload.RequestID == "" {
			log.Printf("auth session clear ignored: missing request id")
			return
		}
		if err := authManager.Clear(); err != nil {
			log.Printf("auth session clear failed: %v", err)
			emitter.Emit("auth:session:clear:result", map[string]any{
				"requestId": payload.RequestID, "ok": false, "code": "credential_delete_failed",
			})
			return
		}
		// Signing out is the one conclusive way to stop being someone. The
		// license service now ignores tokenless anonymous results, precisely so
		// a launch cannot demote an owner, so it has to be told explicitly here
		// or the capabilities of the account that just left would outlive it.
		licenseSvc.ClearCurrent()
		emitter.Emit("auth:session:clear:result", map[string]any{
			"requestId": payload.RequestID, "ok": true,
		})
	})

	// Token rotation may only replace a session that the backend has already
	// validated or restored from Credential Manager. An arbitrary WebView event
	// can never establish the first trusted session.
	wailsApp.Event.On("auth:session:save", func(event *application.CustomEvent) {
		var payload struct {
			AccessToken  string `json:"accessToken"`
			RefreshToken string `json:"refreshToken"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		if payload.AccessToken == "" || payload.RefreshToken == "" {
			log.Printf("auth session rotation ignored: incomplete token pair")
			return
		}
		if err := authManager.Rotate(authsession.Session{
			AccessToken: payload.AccessToken, RefreshToken: payload.RefreshToken,
		}); err != nil {
			log.Printf("auth session rotation save failed: %v", err)
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
		log.Printf("license:reset-device request tokenLen=%d", len(payload.SessionToken))
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
		log.Printf("license:reset-device ok")
	})

	// Ajustes ya se cargaron antes de componer las ventanas. El perfil activo
	// se carga ahora, todavía antes del runtime, para resolver una única pareja
	// confirmada sin crear un segundo SettingsService.

	// Overlay Studio V3 profile persistence (canonical runtime document owner)
	studioProfileSvc = app.NewStudioProfileService(emitter, func(saved app.StudioProfileSaved) {
		log.Printf("studio profile saved: %s revision=%s", saved.Path, saved.Revision)
		refreshActiveOverlayAfterSave(overlayController, studioProfileSvc, &overlayRunning, saved)
	})
	studioProfileSvc.SetProfilesDir(cfgDir)
	if _, err := studioProfileSvc.Load(resolvedProfilePath); err != nil {
		log.Printf("warning: could not load studio V3 profile %s: %v", resolvedProfilePath, err)
	}
	hubSvc.SetStudioProfileService(studioProfileSvc)
	studioProfileSvc.RegisterHandlers(wailsApp)
	// La política inicial debe usar la pareja confirmada ajustes+perfil. La
	// restauración ocurre antes de construir TelemetryCoreRuntime y, como el
	// reconciliador aún no está conectado, no emite performance:level.
	hubSvc.SetSettingsService(settingsSvc)
	if err := hubSvc.RestoreActiveProfile(); err != nil {
		log.Printf("warning: could not restore active profile: %v", err)
	}

	// Widget design library for Overlay Studio V3
	designSvc := app.NewWidgetDesignService(cfgDir, emitter)
	if err := designSvc.Load(); err != nil {
		log.Printf("warning: could not load widget designs: %v (using empty)", err)
	}
	designSvc.RegisterHandlers(wailsApp)

	// Updater service
	settingsPath := filepath.Join(cfgDir, "updater-settings.json")
	updaterSvc, err := app.NewUpdaterService(version, settingsPath, emitter)
	if err != nil {
		log.Printf("updater service init error: %v", err)
	} else {
		updaterSvc.SetChannelAuthorizer(func(channel updater.Channel) bool {
			return licenseSvc.AllowsUpdateChannel(string(channel))
		})
		wailsApp.RegisterService(application.NewService(updaterSvc))
	}

	// Engineer owns product behavior only. TelemetryCoreRuntime below is its
	// sole production telemetry source.
	engSvc = engineerservice.NewEngineerService(emitter)
	engSvc.SetVisualPresentationEnabled(effectivePerformanceLevel() < 4)
	if err := engSvc.SetLegacySpotterRollback(*legacyEngineerSpotter); err != nil {
		log.Printf("engineer legacy spotter rollback configuration error: %v", err)
	}
	if err := engSvc.SetLegacyFamiliesRollback(*legacyEngineerFamilies); err != nil {
		log.Printf("engineer legacy families rollback configuration error: %v", err)
	}
	engineerAudioConfig, audioConfigErr := engineerAudioConfigFor(engSvc)
	engSvc.SetAudioPlayer(engineeraudio.NewPlayer())
	if audioConfigErr != nil {
		log.Printf("engineer audio locale configuration unavailable; using visual delivery only: %v", audioConfigErr)
	} else {
		engSvc.SetAudioConfig(engineerAudioConfig)
	}
	// ENG-06 is cache-only: a miss remains a visual notification. TTS
	// synthesis stays outside the preemptible product delivery path.
	engineerAudioCache, cacheErr := tts.NewCache(tts.DefaultCacheRoot(), "kokoro")
	if cacheErr != nil {
		log.Printf("engineer audio cache unavailable; using visual delivery only: %v", cacheErr)
	} else if engineerAudioConfig != nil {
		engSvc.SetAudioRouter(engineeraudio.NewCacheOnlyAudioRouter(engineerAudioConfig, engineerAudioCache))
	}
	if *engineerVoiceInput {
		engineerVoiceRuntime, err = composeEngineerVoiceInput(true, settingsSvc.Settings(), commands.Locale(engSvc.Locale()), engineerVoiceInputDependencies{
			readerFactory: func() ptt.Reader { return ptt.NewPlatformReader(0) },
			hostFactory:   func() voiceinput.Host { return voiceinput.NewProcessHost(nil) },
			queryPort:     voiceinput.UnavailableQueryPort{}, publisher: engSvc,
			lifecycle: func() commands.DialogueLifecycle {
				return commands.DialogueLifecycle{SessionID: "voice-experimental", DriverID: "local-driver", SourceID: "telemetry-core", Epoch: 1}
			},
		})
		if err != nil {
			log.Printf("engineer experimental voice-input unavailable: %v", err)
			if healthErr := engSvc.SetVoiceInputHealth(unavailableEngineerVoiceHealth); healthErr != nil {
				log.Printf("engineer experimental voice-input health error: %v", healthErr)
			}
			engineerVoiceRuntime = nil
		} else if healthErr := engSvc.SetVoiceInputHealth(engineerVoiceRuntime.Health); healthErr != nil {
			log.Printf("engineer experimental voice-input health error: %v", healthErr)
		}
	}
	if err := engSvc.Start(ctx); err != nil {
		log.Printf("engineer service start error: %v", err)
	}
	if engineerVoiceRuntime != nil {
		if err := engineerVoiceRuntime.Start(ctx); err != nil && *engineerVoiceInput {
			log.Printf("engineer experimental voice-input unavailable: %v", err)
		}
	}

	// Register Wails bridge for Engineer events and commands
	engBridge = app.NewEngineerBridge(wailsApp, emitter, engSvc)
	engBridge.Start()

	telemetryCoreRuntime, err = app.NewTelemetryCoreRuntime(app.TelemetryCoreRuntimeConfig{
		Enabled:                 *live,
		Emitter:                 emitter,
		Engineer:                engSvc,
		StrategyPublicTransport: *strategyPublicTransport,
		PerformancePolicy:       settingsSvc.EffectivePerformancePolicy(studioProfileSvc.PerformanceProfile()),
	})
	if err != nil {
		log.Printf("telemetry core init error: %v", err)
		telemetryCoreRuntime = nil
	}
	if telemetryCoreRuntime != nil {
		performanceRuntime = app.NewPerformanceRuntime(
			func() app.PerformanceSampleRunner {
				return performancesensor.New(
					performancesensor.NewHostSampler(os.Getenv("WEBVIEW2_USER_DATA_FOLDER")),
					performancesensor.NewPresentMonSource(performancesensor.DefaultPresentMonPath()),
				)
			},
			settingsSvc.Settings().Performance,
			telemetryCoreRuntime,
			emitter,
			func() bool { return !hubW.IsMinimised() },
			engSvc,
		)
		performanceRuntime.SetGameForegroundHandler(func(foreground bool) {
			if overlayController.Status().Mode != config.ModeRacing {
				return
			}
			if current := overlayController.CurrentWindow(); current != nil {
				if window, ok := current.(interface{ SetGameForeground(bool) }); ok {
					window.SetGameForeground(foreground)
				}
			}
		})
		if err := performanceRuntime.Start(ctx); err != nil {
			log.Printf("performance sensor start error: %v", err)
			performanceRuntime = nil
		}
	}
	reconcilePerformance := func(settings app.PerformanceSettings, profile *config.ProfileDocumentV4) {
		if performanceRuntime != nil {
			performanceRuntime.ApplySettings(settings)
			return
		}
		if telemetryCoreRuntime != nil {
			telemetryCoreRuntime.SetPerformancePolicy(app.ResolveEffectivePerformancePolicy(settings, profile))
		}
	}
	performanceSaves := app.NewPerformanceSaveCoordinator(settingsSvc, studioProfileSvc, reconcilePerformance)
	studioProfileSvc.SetPerformanceSaveCoordinator(performanceSaves)
	hubSvc.SetPerformancePolicyReconciler(func(profile *config.ProfileDocumentV4) {
		reconcilePerformance(settingsSvc.Settings().Performance, profile)
	})
	telemetrySourceStatus := func() driver.SourceStatus {
		if telemetryCoreRuntime == nil {
			return driver.UnknownSourceStatus()
		}
		return telemetryCoreRuntime.SourceStatus()
	}

	// DriverManager no registra ninguna transicion, asi que un fallo de conexion
	// solo era observable desde fuera como "no llega telemetria": el unico
	// rastro en el log era la foto que se toma justo despues de Start, tomada
	// antes de que la deteccion termine. Este decorador escribe una linea por
	// cada cambio de estado o de intento, que es lo minimo para distinguir un
	// reintento en curso de un error terminal. El sampler ya lo invoca de forma
	// periodica; se llama desde varias goroutines, de ahi el mutex.
	telemetrySourceStatus = func(next func() driver.SourceStatus) func() driver.SourceStatus {
		var mu sync.Mutex
		var lastState string
		var lastAttempt int
		var seen bool
		return func() driver.SourceStatus {
			status := next()
			mu.Lock()
			if !seen || status.State != lastState || status.ReconnectAttempt != lastAttempt {
				seen, lastState, lastAttempt = true, status.State, status.ReconnectAttempt
				log.Printf("telemetry source: state=%s available=%v reconnectAttempt=%d",
					status.State, status.Available, status.ReconnectAttempt)
			}
			mu.Unlock()
			return status
		}
	}(telemetrySourceStatus)

	// --- OBS / SSE / Auth HTTP server (start early, before any login gate) ---
	httpSrv = server.New(server.ServerConfig{
		Addr:        *httpAddr,
		DistFS:      distFS,
		CfgDir:      cfgDir,
		EngineerSvc: engSvc,
		Emitter:     emitter,
		OverlayProjection: func() *telemetrytransport.Hub {
			if telemetryCoreRuntime == nil {
				return nil
			}
			return telemetryCoreRuntime.Hub()
		}(),
		StrategyProjection: func() *telemetrytransport.Hub {
			if telemetryCoreRuntime == nil || !*strategyPublicTransport {
				return nil
			}
			return telemetryCoreRuntime.StrategyHub()
		}(),
		StrategyPublicTransport: *strategyPublicTransport,
		OverlayV2Publishers: func() *telemetrytransport.PublisherRegistry {
			if telemetryCoreRuntime == nil {
				return nil
			}
			return telemetryCoreRuntime.OverlayV2Publishers()
		}(),
	})
	httpSrv.Start()
	wailsApp.Event.On("auth:attempt:create", func(event *application.CustomEvent) {
		var payload struct {
			RequestID string `json:"requestId"`
			Provider  string `json:"provider"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		attempt, err := httpSrv.CreateAuthAttempt(payload.Provider)
		if err != nil {
			emitter.Emit("auth:attempt:error", map[string]any{
				"requestId": payload.RequestID, "message": err.Error(),
			})
			return
		}
		emitter.Emit("auth:attempt:created", map[string]any{
			"requestId": payload.RequestID, "redirectUrl": attempt.RedirectURL,
		})
	})
	log.Printf("OBS overlay: http://%s/overlay?profile=%s", *httpAddr, filepath.Base(*profilePath))

	// App settings service (delta mode, hotkeys, cpu sampling toggle) was loaded
	// before Engineer so the experimental PTT binding can fail closed on conflicts.
	notifySvc = notify.New(
		wailsNotifier{service: notificationService},
		func() bool { return settingsSvc.Snapshot().Notifications.SystemEnabled },
		// A toast is for what you are not watching. Minimised is the honest
		// signal the window layer can give us.
		func() bool { return hubLifecycle.IsMinimised() },
	)

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

	// The owner publishes the weekly schedule centrally, so ask for it once at
	// startup. It happens in the background: a slow or unreachable Supabase must
	// not hold up the window, and the bundled schedule applied just above is
	// already good enough to open with.
	schedulePublisher := calendar.NewSchedulePublisher(supabaseURLResolved, supabaseAnonKeyResolved)
	scheduleImportSvc := app.NewScheduleImportService(schedulePublisher, emitter)
	calendarDiscordInbox, inboxErr := discordbot.NewInbox(filepath.Join(cfgDir, "calendar-discord-inbox.json"))
	if inboxErr != nil {
		log.Printf("warning: Discord calendar inbox unavailable: %v", inboxErr)
	}
	refreshPublishedSchedule := func() {
		session, err := authManager.Restore()
		if err != nil {
			// Signed out: the bundled schedule is the only one available.
			return
		}
		source, err := calendarSvc.RefreshPublishedSchedule(
			context.Background(), schedulePublisher, session.AccessToken, time.Now(),
		)
		if err != nil {
			log.Printf("warning: could not refresh published schedule: %v (using %s)", err, source)
			return
		}
		app.HandleCalendarGet(calendarSvc, emitter)
	}
	go refreshPublishedSchedule()

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
	// The launcher emits through this, so a finished chain can raise a desktop
	// toast without the launcher package knowing anything about notifications.
	launcherSvc = launcher.NewService(
		settingsSvc,
		notifyingEmitter{downstream: emitter, notify: notifySvc, settings: settingsSvc},
		exec.Command,
	)

	// Diagnostics service
	diagSvc := app.NewDiagnosticsService(version, cfgDir, profileSvc, settingsSvc, telemetrySourceStatus)
	sessionsRoot, err := telemetrySessionsRoot(cfgDir)
	if err != nil {
		// Keep the client on a closed unavailable state without logging paths.
		log.Printf("warning: diagnostics session storage is unavailable")
		sessionsRoot = ""
	}
	diagnosticsBridge = app.NewDiagnosticsBridge(ctx, sessionsRoot, diagSvc, emitter)
	diagnosticsBridge.RegisterHandlers(wailsApp)

	// Local data. The service is handed the two directories resolved here and
	// answers only for those: the frontend sends a location key, never a path,
	// so nothing else on the disk is reachable through these events.
	storageSvc := storage.New(cfgDir, sessionsRoot, logsDir)

	emitStorage := func() {
		emitter.Emit("storage", storageSvc.Summary())
	}
	emitStorageError := func(err error) {
		log.Printf("storage error: %v", err)
		emitter.Emit("storage:error", map[string]any{"message": err.Error()})
	}

	wailsApp.Event.On("storage:get", func(event *application.CustomEvent) {
		emitStorage()
	})

	storageKey := func(data any) string {
		var payload struct {
			Key string `json:"key"`
		}
		if data != nil {
			if raw, err := json.Marshal(data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		return payload.Key
	}

	wailsApp.Event.On("storage:reveal", func(event *application.CustomEvent) {
		if err := storageSvc.Reveal(storageKey(event.Data)); err != nil {
			emitStorageError(err)
		}
	})

	wailsApp.Event.On("storage:clear", func(event *application.CustomEvent) {
		summary, err := storageSvc.Clear(storageKey(event.Data))
		if err != nil {
			emitStorageError(err)
		}
		// Emit the summary either way: after a refusal the UI has to go back to
		// showing what is really on disk.
		emitter.Emit("storage", summary)
	})

	// Application log. The hub asks once for the ring and is pushed each new
	// entry after that, so the Diagnostics list survives a reload without the
	// backend having to replay anything.
	wailsApp.Event.On("applog:get", func(event *application.CustomEvent) {
		emitter.Emit("applog", map[string]any{
			"entries": logService.Snapshot(),
			"path":    logService.Path(),
			// The hub uses this to decide between "no events yet" and "no log
			// available", which are different things to tell the user.
			"available": true,
		})
	})
	logService.Observe(func(entry applog.Entry) {
		emitter.Emit("applog:entry", entry)
	})

	// Testing Center report drafts persist only resumable form text. The path is
	// selected here; frontend events can never provide filesystem locations.
	var reportDraftStore *reportdraft.Store
	if cfgDir != "" {
		reportDraftPath := filepath.Clean(filepath.Join(cfgDir, reportdraft.DirectoryName, reportdraft.FileName))
		if store, storeErr := reportdraft.NewStore(reportDraftPath); storeErr == nil {
			reportDraftStore = store
		} else {
			log.Printf("warning: Testing Center report draft storage is unavailable")
		}
	}
	testingCenterReportDraftBridge = app.NewTestingCenterReportDraftBridge(ctx, reportDraftStore, emitter)
	testingCenterReportDraftBridge.RegisterHandlers(wailsApp)
	testingCenterDiagnosticBridge = app.NewTestingCenterDiagnosticBridge(version, buildChannel, emitter)
	testingCenterDiagnosticBridge.RegisterHandlers(wailsApp)

	// Set profiles directory for legacy hub listing and V3 runtime cycling.
	profileSvc.SetProfilesDir(cfgDir)

	// Hotkey managers. Global registrations are always built before Start so
	// RegisterHotKey and UnregisterHotKey run on the message-loop owner thread.
	hkMgr = configuredHotkeyManager(
		settingsSvc.Settings(),
		buildHotkeyActionMap(hubSvc, studioProfileSvc, overlayController, &overlayRunning, emitter),
	)
	profileHkMgr = launcher.NewHotkeyManager()

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
			// The notification carries only the tag, but this check already
			// fetched every pending release with its notes. Publishing the
			// whole result lets the shell say what the update brings without
			// asking for a second check, which would mean a network call for
			// hovering a pill.
			//
			// A throttled check is not an answer: it never looked, so its
			// result carries no releases and no channels. Publishing it would
			// make the UI state "nothing to update" on the strength of a
			// cooldown.
			if !info.Throttled {
				emitter.Emit("updater:available", map[string]any{"info": info})
			}
		}()
	}

	// Version info broadcast for UI.
	emitter.Emit("app:version", map[string]any{"version": version, "buildChannel": app.TestingCenterBuildChannel(buildChannel)})

	wailsApp.Event.On("app:version:get", func(event *application.CustomEvent) {
		emitter.Emit("app:version", map[string]any{"version": version, "buildChannel": app.TestingCenterBuildChannel(buildChannel)})
	})

	wailsApp.Event.On(telemetrySourceStatusRequestEvent, func(event *application.CustomEvent) {
		emitter.Emit(telemetrySourceStatusEvent, telemetrySourceStatus())
	})

	// Strategy conserva su replay Wails bajo el rollback explicito. Overlay usa
	// un pull dirigido para no difundir frames al Hub ni adelantar al WebView.
	telemetryStatusReplayCleanup = registerTelemetryStatusReplayHandlers(wailsApp.Event, emitter, telemetryCoreRuntime)
	if telemetryCoreRuntime != nil {
		overlayPullService := newOverlayPullHTTPService(
			newWailsOverlayPullTarget(wailsApp),
			telemetrytransport.NewOverlayPullTransport(
				telemetryCoreRuntime.Hub(),
				telemetryCoreRuntime.OverlayV2Publishers(),
			),
		)
		wailsApp.RegisterService(application.NewServiceWithOptions(
			overlayPullService,
			application.ServiceOptions{
				Name:  "overlay-telemetry-pull",
				Route: telemetrytransport.OverlayPullServiceRoute,
			},
		))
		overlayPullCleanup = overlayPullService.shutdown
	}

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

		// Dos comprobaciones, no una. `updater:check` respeta el enfriamiento y
		// lo dispara cada montaje de Ajustes: abrir la pantalla tres veces
		// seguidas no puede costar tres recorridos del catalogo contra el
		// limite de peticiones de GitHub. `updater:check:force` es el boton de
		// comprobar y todo aquello que cambia la respuesta (canal, ignorar).
		emitCheck := func(manual bool) {
			var info *updater.UpdateInfo
			var err error
			if manual {
				info, err = updaterSvc.CheckUpdatesManualCtx(ctx)
			} else {
				info, err = updaterSvc.CheckUpdatesCtx(ctx)
			}
			if err != nil {
				log.Printf("updater:check error: %v", err)
				emitUpdaterError(err.Error())
				return
			}
			emitter.Emit("updater:available", map[string]any{"info": info})
		}

		wailsApp.Event.On("updater:check", func(event *application.CustomEvent) {
			emitCheck(false)
		})

		wailsApp.Event.On("updater:check:force", func(event *application.CustomEvent) {
			emitCheck(true)
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
			// Del payload solo se toma el tag: la URL de descarga y el checksum
			// los resuelve el backend contra la lista que el mismo se ha
			// traido. Antes se descargaba y ejecutaba lo que dijera el
			// renderer.
			var payload struct {
				TagName string `json:"tag_name"`
			}
			if event.Data != nil {
				if raw, err := json.Marshal(event.Data); err == nil {
					json.Unmarshal(raw, &payload)
				}
			}
			tag := payload.TagName
			if tag == "" {
				emitUpdaterError("release is required")
				return
			}
			// El 0% lo emite la propia descarga al arrancar. Anunciarlo aqui,
			// antes de saber si la instalacion siquiera empieza, hacia que un
			// segundo clic rebobinara la barra de la que si estaba en marcha.
			go func() {
				if err := updaterSvc.InstallVerifiedVersionCtx(ctx, tag); err != nil {
					if ctx.Err() != nil {
						log.Printf("updater:install:verified aborted: %v", ctx.Err())
						return
					}
					// Un segundo clic no es un fallo de la instalacion que si va:
					// anunciarlo como error borraba la barra y decia que habia
					// fallado justo lo que estaba descargandose bien.
					if errors.Is(err, app.ErrInstallInProgress) {
						log.Printf("updater:install:verified ignored: %v", err)
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
		hotkeyMu.Lock()
		defer hotkeyMu.Unlock()
		if hkMgr != nil {
			hkMgr.Stop()
		}
		replacement := configuredHotkeyManager(
			settingsSvc.Settings(),
			buildHotkeyActionMap(hubSvc, studioProfileSvc, overlayController, &overlayRunning, emitter),
		)
		if err := replacement.Start(); err != nil {
			log.Printf("warning: hotkey manager rebuild error: %v", err)
		}
		hkMgr = replacement
	}

	wailsApp.Event.On("settings:get", func(event *application.CustomEvent) {
		emitter.Emit("settings", settingsSvc.Settings())
		if telemetryCoreRuntime != nil {
			telemetryCoreRuntime.EmitPerformanceLevel()
		}
	})

	wailsApp.Event.On("settings:save", func(event *application.CustomEvent) {
		var request struct {
			RequestID string           `json:"requestId"`
			Settings  *app.AppSettings `json:"settings"`
		}
		var s app.AppSettings
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &request)
				if request.Settings != nil {
					s = *request.Settings
				} else {
					_ = json.Unmarshal(raw, &s)
				}
			}
		}
		if s.Performance.Mode == "auto" {
			s.CpuSampling = true
		}
		confirmed, _, err := performanceSaves.Execute(func() error { return settingsSvc.Save(&s) })
		if err != nil {
			log.Printf("settings:save error: %v", err)
			emitSettingsError(err.Error())
			return
		}
		level := effectivePerformanceLevel()
		if err := app.ApplyProcessPowerPolicy(level); err != nil {
			log.Printf("warning: performance process policy update unavailable: %v", err)
		}
		if overlayController != nil && studioProfileSvc != nil {
			if err := overlayController.ApplyPerformanceLevel(level, studioProfileSvc.Document()); err != nil {
				log.Printf("warning: overlay performance geometry update unavailable: %v", err)
			}
		}
		if engSvc != nil {
			engSvc.SetVisualPresentationEnabled(level < 4)
		}
		// Apply CPU sampling toggle if runtime sampler exists
		if rtSampler != nil {
			rtSampler.SetCPUEnabled(confirmed.CpuSampling)
		}
		// Rebuild hotkeys with new combos
		rebuildHotkeys()
		if engineerVoiceRuntime != nil {
			if err := revalidateEngineerVoiceSettings(engineerVoiceRuntime, settingsSvc.Settings()); err != nil {
				log.Printf("engineer experimental voice-input PTT reservation unavailable after settings save: %v", err)
			}
		}
		emitter.Emit("settings-saved", map[string]any{
			"ok": true, "requestId": request.RequestID, "settings": confirmed,
		})
	})

	// Autostart lives in the Windows Run key and nowhere else. Keeping a copy
	// in app-settings would let the two disagree the moment the user turns it
	// off from Task Manager, and the settings page would then report a lie.
	emitStartup := func() {
		options, err := startup.Read()
		if err != nil {
			log.Printf("startup:get error: %v", err)
			emitter.Emit("startup:error", map[string]any{"message": err.Error()})
			return
		}
		emitter.Emit("startup", options)
	}

	wailsApp.Event.On("startup:get", func(event *application.CustomEvent) {
		emitStartup()
	})

	wailsApp.Event.On("startup:set", func(event *application.CustomEvent) {
		var options startup.Options
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &options)
			}
		}
		if err := startup.Apply(options); err != nil {
			log.Printf("startup:set error: %v", err)
			emitter.Emit("startup:error", map[string]any{"message": err.Error()})
		}
		// Re-read either way: the registry, not the request, is the truth, and
		// after a failure the UI has to go back to showing what is really set.
		emitStartup()
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
			resetOverlayDisplayMode(overlayController, studioProfileSvc)
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
		emitter.Emit(telemetrySourceStatusEvent, telemetrySourceStatus())

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
		resetOverlayDisplayMode(overlayController, studioProfileSvc)
	})

	wailsApp.Event.On("overlay:stop", func(event *application.CustomEvent) {
		hubSvc.StopOverlay()
		resetOverlayDisplayMode(overlayController, studioProfileSvc)
		overlayRunning.Store(false)
	})

	wailsApp.Event.On("overlay:start-active", func(event *application.CustomEvent) {
		emitter.Emit(telemetrySourceStatusEvent, telemetrySourceStatus())

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
		resetOverlayDisplayMode(overlayController, studioProfileSvc)
	})

	wailsApp.Event.On("overlay:profile-v3:get", func(_ *application.CustomEvent) {
		handleOverlayProfileSnapshotRequest(studioProfileSvc)
	})

	wailsApp.Event.On("overlay:toggle-edit-mode", func(_ *application.CustomEvent) {
		handleToggleEditMode(hubSvc, studioProfileSvc, overlayController, &overlayRunning, emitter)
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

	// Start telemetry
	if telemetryCoreRuntime != nil {
		if err := telemetryCoreRuntime.Start(ctx); err != nil {
			log.Printf("telemetry core start error: %v", err)
		}
	}
	status := telemetrySourceStatus()
	log.Printf("telemetry source: kind=%s name=%s live=%v available=%v state=%s", status.Kind, status.Name, status.Live, status.Available, status.State)
	rtSampler = ops.NewRuntimeSampler(telemetrySourceStatus)
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

	wailsApp.Event.On("launcher:snapshot:get", func(event *application.CustomEvent) {
		_ = event
		handleLauncherSnapshot(launcherSvc, emitter)
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
		handleCancelProfile(payload.ID, launcherSvc)
	})

	wailsApp.Event.On("launcher:decision:resolve", func(event *application.CustomEvent) {
		var payload struct {
			DecisionID string `json:"decisionId"`
			Action     string `json:"action"`
			Remember   bool   `json:"remember"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleResolveLauncherDecision(payload.DecisionID, payload.Action, payload.Remember, emitter)
	})

	wailsApp.Event.On("launcher:onboarding:complete", func(event *application.CustomEvent) {
		_ = event
		handleLauncherOnboardingComplete(settingsSvc, emitter)
	})

	for _, command := range []string{"launcher:app:close", "launcher:app:restart"} {
		command := command
		wailsApp.Event.On(command, func(event *application.CustomEvent) {
			var payload struct {
				ID  string `json:"id"`
				PID int    `json:"pid"`
			}
			if event.Data != nil {
				if raw, err := json.Marshal(event.Data); err == nil {
					_ = json.Unmarshal(raw, &payload)
				}
			}
			if command == "launcher:app:close" {
				handleCloseLauncherApp(payload.ID, payload.PID, launcherSvc, emitter, ctx)
				return
			}
			handleRestartLauncherApp(payload.ID, payload.PID, launcherSvc, emitter, ctx)
		})
	}

	// File picker for custom apps: the native "open file" dialog answers with
	// launcher:app:picked so the Add application form gets a real, launchable
	// path (the browser's file input only hands over a sandboxed File).
	launcherPicker := newWailsLauncherFilePicker(wailsApp)
	wailsApp.Event.On("launcher:app:pick", func(event *application.CustomEvent) {
		_ = event
		handleAppPick(launcherPicker, emitter)
	})

	// Custom app creation. The frontend sends only what the user typed and
	// chose; every derived field is computed in the launcher package.
	wailsApp.Event.On("launcher:app:addCustom", func(event *application.CustomEvent) {
		var payload struct {
			DisplayName string `json:"displayName"`
			Path        string `json:"path"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleAddCustomApp(payload.DisplayName, payload.Path, launcherSvc, emitter)
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
		handleAppUpdate(payload.ID, payload.Args, launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:app:path:set", func(event *application.CustomEvent) {
		var payload struct {
			ID   string `json:"id"`
			Path string `json:"path"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleSetAppPath(payload.ID, payload.Path, launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:app:merge:preview", func(event *application.CustomEvent) {
		var payload struct {
			ManualID string `json:"manualId"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handlePreviewAppMerge(payload.ManualID, launcherSvc, emitter)
	})

	wailsApp.Event.On("launcher:app:merge:confirm", func(event *application.CustomEvent) {
		var payload struct {
			ManualID  string `json:"manualId"`
			CatalogID string `json:"catalogId"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		handleConfirmAppMerge(payload.ManualID, payload.CatalogID, launcherSvc, emitter)
	})

	// App icon handler. Frontend emits launcher:app:icon with { id, executablePath }.
	// Responds with launcher:app:icon:result containing a base64 data URI or empty string.
	wailsApp.Event.On("launcher:app:icon", func(event *application.CustomEvent) {
		var payload struct {
			ID             string `json:"id"`
			ExecutablePath string `json:"executablePath"`
		}
		if event.Data != nil {
			if raw, err := json.Marshal(event.Data); err == nil {
				_ = json.Unmarshal(raw, &payload)
			}
		}
		dataURI := launcher.GetAppIconForAppBase64(payload.ID, payload.ExecutablePath)
		emitter.Emit("launcher:app:icon:result", map[string]any{
			"id":      payload.ID,
			"iconUrl": dataURI,
		})
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
		handleProfileHotkeySet(payload.ProfileID, payload.Combo, profileHkMgr, emitter, func(profileID, combo string) {
			if engineerVoiceRuntime == nil {
				return
			}
			if err := revalidateEngineerVoiceProfile(engineerVoiceRuntime, settingsSvc.Settings(), profileID, combo); err != nil {
				log.Printf("engineer experimental voice-input PTT reservation unavailable after launcher profile hotkey change: %v", err)
			}
		})
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
		handleAppFavorite(payload.ID, payload.Favorite, settingsSvc, launcherSvc, emitter)
	})

	// Calendar event handlers (CALENDAR-02-A) and series follow/unfollow
	// handlers (CALENDAR-05-E1). Five thin events that delegate to the calendar
	// service and surface the canonical calendar document back to the frontend.
	// The service is synchronous: no goroutine, ticker, or reminder logic in
	// this phase.

	wailsApp.Event.On("calendar:get", func(event *application.CustomEvent) {
		app.HandleCalendarGet(calendarSvc, emitter)
	})

	// Owner-only schedule publishing. The parse runs locally so the owner sees
	// what was understood before anything is stored; the database enforces who
	// may store it.
	wailsApp.Event.On("calendar:schedule:refresh", func(_ *application.CustomEvent) {
		go refreshPublishedSchedule()
	})

	wailsApp.Event.On("schedule:parse", func(event *application.CustomEvent) {
		var payload struct {
			Text string `json:"text"`
		}
		decodeEventPayload(event, &payload)
		scheduleImportSvc.Parse(payload.Text)
	})

	wailsApp.Event.On("schedule:draft:save", func(event *application.CustomEvent) {
		var payload struct {
			Text string `json:"text"`
		}
		decodeEventPayload(event, &payload)
		session, err := authManager.Restore()
		if err != nil {
			emitter.Emit("schedule:error", map[string]any{"message": "Inicia sesión para importar el horario"})
			return
		}
		go scheduleImportSvc.SaveDraft(context.Background(), session.AccessToken, payload.Text)
	})

	wailsApp.Event.On("schedule:publish", func(event *application.CustomEvent) {
		var payload struct {
			DraftID string `json:"draftId"`
		}
		decodeEventPayload(event, &payload)
		session, err := authManager.Restore()
		if err != nil {
			emitter.Emit("schedule:error", map[string]any{"message": "Inicia sesión para publicar el horario"})
			return
		}
		go func() {
			scheduleImportSvc.Publish(context.Background(), session.AccessToken, payload.DraftID)
			refreshPublishedSchedule()
		}()
	})

	wailsApp.Event.On("schedule:draft:get", func(_ *application.CustomEvent) {
		session, err := authManager.Restore()
		if err != nil {
			return
		}
		go scheduleImportSvc.LoadDraft(context.Background(), session.AccessToken)
	})

	wailsApp.Event.On("schedule:discord:inbox:get", func(_ *application.CustomEvent) {
		if calendarDiscordInbox == nil {
			emitter.Emit("schedule:error", map[string]any{"message": "La bandeja de Discord no está disponible"})
			return
		}
		candidates, err := calendarDiscordInbox.List()
		if err != nil {
			emitter.Emit("schedule:error", map[string]any{"message": err.Error()})
			return
		}
		emitter.Emit("schedule:discord:inbox", map[string]any{"candidates": candidates})
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
		// log.Fatal exits without running defers, so the capture is flushed
		// here explicitly. Stopping twice is safe.
		stopCPUProfile()
		log.Fatal(err)
	}
}

func shouldPersistValidatedSession(res *license.Result, sessionToken, refreshToken string) bool {
	return res != nil && res.OnlineValidated && res.UserID != "" && sessionToken != "" && refreshToken != ""
}

func resolveLicensePublicKeys(embedded, developmentOverride string) string {
	// Release builds embed a required trust root. Once present it must never be
	// replaceable by the user process environment. Local development builds do
	// not embed keys and may opt in through VANTARE_LICENSE_PUBLIC_KEYS.
	if embedded != "" {
		return embedded
	}
	return developmentOverride
}

type hubSuspendEventProbe struct {
	emitter app.EventEmitter
	mu      sync.Mutex
	pending map[string]chan bool
	target  hubSuspendEventTarget
}

type hubSuspendEventTarget interface {
	DispatchWailsEvent(*application.CustomEvent)
}

func newHubSuspendEventProbe(wailsApp *application.App, emitter app.EventEmitter) *hubSuspendEventProbe {
	probe := &hubSuspendEventProbe{emitter: emitter, pending: make(map[string]chan bool)}
	if wailsApp != nil && wailsApp.Event != nil {
		wailsApp.Event.On("hub:can-suspend:result", probe.handleResult)
	}
	return probe
}

func (p *hubSuspendEventProbe) Probe(ctx context.Context) bool {
	if p == nil {
		return false
	}
	requestID := newHubSuspendRequestID()
	result := make(chan bool, 1)
	p.mu.Lock()
	p.pending[requestID] = result
	p.mu.Unlock()
	defer func() {
		p.mu.Lock()
		delete(p.pending, requestID)
		p.mu.Unlock()
	}()
	p.mu.Lock()
	target := p.target
	emitter := p.emitter
	p.mu.Unlock()
	emittedAtUnixMs := time.Now().UnixMilli()
	payload := map[string]any{"requestId": requestID, "emittedAtUnixMs": emittedAtUnixMs}
	log.Printf("hub lifecycle: hub:can-suspend emitted request=%s go=%d", requestID, emittedAtUnixMs)
	if target != nil {
		target.DispatchWailsEvent(&application.CustomEvent{Name: "hub:can-suspend", Data: payload})
	} else if emitter != nil {
		emitter.Emit("hub:can-suspend", payload)
	} else {
		return false
	}
	select {
	case canSuspend := <-result:
		return canSuspend
	case <-ctx.Done():
		log.Printf("hub lifecycle: hub:can-suspend timed out: %v", ctx.Err())
		return false
	}
}

func (p *hubSuspendEventProbe) SetTarget(target hubSuspendEventTarget) {
	if p == nil {
		return
	}
	p.mu.Lock()
	p.target = target
	p.mu.Unlock()
}

func (p *hubSuspendEventProbe) handleResult(event *application.CustomEvent) {
	var payload struct {
		RequestID         string   `json:"requestId"`
		CanSuspend        bool     `json:"canSuspend"`
		Reasons           []string `json:"reasons"`
		EmittedAtUnixMs   int64    `json:"emittedAtUnixMs"`
		ReceivedAtUnixMs  int64    `json:"receivedAtUnixMs"`
		RespondedAtUnixMs int64    `json:"respondedAtUnixMs"`
	}
	if event == nil || event.Data == nil {
		return
	}
	raw, err := json.Marshal(event.Data)
	if err != nil || json.Unmarshal(raw, &payload) != nil || payload.RequestID == "" {
		return
	}
	p.mu.Lock()
	result := p.pending[payload.RequestID]
	p.mu.Unlock()
	log.Printf(
		"hub lifecycle: hub:can-suspend response request=%s emitted-go=%d received-js=%d responded-js=%d arrived-go=%d pending=%t",
		payload.RequestID, payload.EmittedAtUnixMs, payload.ReceivedAtUnixMs,
		payload.RespondedAtUnixMs, time.Now().UnixMilli(), result != nil,
	)
	if result != nil {
		if payload.CanSuspend {
			log.Printf("hub lifecycle: hub:can-suspend acknowledged clean")
		} else {
			log.Printf("hub lifecycle: hub:can-suspend blocked: %s", strings.Join(payload.Reasons, "; "))
		}
		select {
		case result <- payload.CanSuspend:
		default:
		}
	}
}

func newHubSuspendRequestID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err == nil {
		return hex.EncodeToString(value[:])
	}
	return fmt.Sprintf("hub-%d", time.Now().UnixNano())
}

type wailsHubWindow struct {
	w                *application.WebviewWindow
	intentionalClose atomic.Bool
}

func (w *wailsHubWindow) Close() {
	w.intentionalClose.Store(true)
	w.w.Close()
}
func (w *wailsHubWindow) Hide()             { w.w.Hide() }
func (w *wailsHubWindow) Show()             { w.w.Show() }
func (w *wailsHubWindow) Focus()            { w.w.Focus() }
func (w *wailsHubWindow) Minimise()         { w.w.Minimise() }
func (w *wailsHubWindow) UnMinimise()       { w.w.UnMinimise() }
func (w *wailsHubWindow) IsMinimised() bool { return w.w.IsMinimised() }

func hubWindowOptions(generation string) application.WebviewWindowOptions {
	return application.WebviewWindowOptions{
		Title:          "Vantare Hub",
		Width:          1280,
		Height:         800,
		Frameless:      false,
		BackgroundType: application.BackgroundTypeSolid,
		URL:            "/#/hub?hubGeneration=" + generation,
		MinWidth:       900,
		MinHeight:      600,
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
type overlayScreenResolver func(int) *application.Screen

type wailsOverlayFactory struct {
	app            *application.App
	screens        overlayScreenResolver
	windowClosed   func(app.OverlayWindow)
	effectiveLevel func() int
}

func newWailsOverlayFactory(wailsApp *application.App, windowClosed func(app.OverlayWindow), effectiveLevel ...func() int) *wailsOverlayFactory {
	var screens overlayScreenResolver
	if wailsApp != nil && wailsApp.Screen != nil {
		screens = wailsApp.Screen.GetByIndex
	}
	level := func() int { return 1 }
	if len(effectiveLevel) > 0 && effectiveLevel[0] != nil {
		level = effectiveLevel[0]
	}
	return &wailsOverlayFactory{
		app:            wailsApp,
		screens:        screens,
		windowClosed:   windowClosed,
		effectiveLevel: level,
	}
}

type wailsOverlayWindow struct {
	mu     sync.Mutex
	w      *application.WebviewWindow
	handle *wailsWindowHandle
	mgr    *window.Manager
	screen *application.Screen
	level  int
}

func (o *wailsOverlayWindow) SetGameForeground(foreground bool) {
	if o == nil || o.w == nil {
		return
	}
	if foreground {
		o.w.Show()
		return
	}
	o.w.Hide()
}

func (o *wailsOverlayWindow) Close() {
	o.w.Close()
}

func (o *wailsOverlayWindow) ApplyProfileMode(document *config.ProfileDocumentV3) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.mgr == nil || document == nil {
		return fmt.Errorf("overlay window not ready for mode application")
	}
	o.mgr.ApplyProfileV3(document, false)
	o.applyPerformanceGeometry(document)
	return nil
}

func (o *wailsOverlayWindow) ApplyPerformanceLevel(level int, document *config.ProfileDocumentV3) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if document == nil {
		return fmt.Errorf("overlay profile document is required for performance geometry")
	}
	if o.level == level {
		return nil
	}
	o.level = level
	o.applyPerformanceGeometry(document)
	return nil
}

func (o *wailsOverlayWindow) applyPerformanceGeometry(document *config.ProfileDocumentV3) {
	if o == nil || o.w == nil || o.handle == nil || o.screen == nil || document == nil {
		return
	}
	monitor := window.WailsRect{X: o.screen.Bounds.X, Y: o.screen.Bounds.Y, Width: o.screen.Bounds.Width, Height: o.screen.Bounds.Height}
	geometry := window.ResolveOverlayGeometry(document, monitor, o.level, overlayBoundingMargin)
	if !geometry.ShrinkWrapped {
		o.w.UnFullscreen()
		o.handle.SetBounds(geometry.Window)
		o.w.ExecJS(resetOverlayGeometryScript)
		return
	}
	o.w.UnFullscreen()
	o.handle.SetBounds(geometry.Window)
	o.w.ExecJS(overlayGeometryScript(geometry))
}

const (
	overlayBoundingMargin      = 16
	resetOverlayGeometryScript = `(() => { const root = document.getElementById("root"); if (!root) return; root.style.position = ""; root.style.left = ""; root.style.top = ""; root.style.width = "100%"; root.style.height = "100%"; root.style.transform = ""; })()`
)

func overlayGeometryScript(geometry window.OverlayGeometry) string {
	localX := geometry.Window.X - geometry.Monitor.X
	localY := geometry.Window.Y - geometry.Monitor.Y
	return fmt.Sprintf(`(() => { const root = document.getElementById("root"); if (!root) return; root.style.position = "absolute"; root.style.left = "0"; root.style.top = "0"; root.style.width = "%dpx"; root.style.height = "%dpx"; root.style.transformOrigin = "top left"; root.style.transform = "translate(%dpx, %dpx)"; })()`, geometry.Monitor.Width, geometry.Monitor.Height, -localX, -localY)
}

func resolveOverlayWindowOptions(document *config.ProfileDocumentV3, screens overlayScreenResolver) (application.WebviewWindowOptions, error) {
	return resolveOverlayWindowOptionsAtLevel(document, screens, 1)
}

func resolveOverlayWindowOptionsAtLevel(document *config.ProfileDocumentV3, screens overlayScreenResolver, level int) (application.WebviewWindowOptions, error) {
	if document == nil {
		return application.WebviewWindowOptions{}, fmt.Errorf("overlay profile document is required")
	}
	if screens == nil {
		return application.WebviewWindowOptions{}, fmt.Errorf("overlay screen resolver is unavailable")
	}
	screen := screens(document.MonitorIndex)
	if screen == nil {
		return application.WebviewWindowOptions{}, fmt.Errorf("overlay monitor index %d is unavailable", document.MonitorIndex)
	}
	if screen.Bounds.Width <= 0 || screen.Bounds.Height <= 0 {
		return application.WebviewWindowOptions{}, fmt.Errorf(
			"overlay monitor index %d has invalid bounds %dx%d",
			document.MonitorIndex,
			screen.Bounds.Width,
			screen.Bounds.Height,
		)
	}
	monitor := window.WailsRect{X: screen.Bounds.X, Y: screen.Bounds.Y, Width: screen.Bounds.Width, Height: screen.Bounds.Height}
	geometry := window.ResolveOverlayGeometry(document, monitor, level, overlayBoundingMargin)
	options := application.WebviewWindowOptions{
		Title:             "Vantare Overlay",
		Width:             geometry.Window.Width,
		Height:            geometry.Window.Height,
		InitialPosition:   application.WindowXY,
		X:                 geometry.Window.X,
		Y:                 geometry.Window.Y,
		Frameless:         true,
		BackgroundType:    application.BackgroundTypeTransparent,
		BackgroundColour:  application.NewRGBA(0, 0, 0, 0),
		IgnoreMouseEvents: false,
		AlwaysOnTop:       true,
		URL:               "/overlay.html",
		Screen:            screen,
	}
	if geometry.ShrinkWrapped {
		options.JS = overlayGeometryScript(geometry)
	}
	return options, nil
}

func (f *wailsOverlayFactory) NewOverlayWindow(document *config.ProfileDocumentV3, origin config.Rect, bounds config.Rect) (app.OverlayWindow, error) {
	if f == nil {
		return nil, fmt.Errorf("overlay window factory is unavailable")
	}
	level := f.effectiveLevel()
	options, err := resolveOverlayWindowOptionsAtLevel(document, f.screens, level)
	if err != nil {
		return nil, fmt.Errorf("create overlay window: %w", err)
	}
	if f.app == nil || f.app.Window == nil {
		return nil, fmt.Errorf("create overlay window: Wails window manager is unavailable")
	}
	w := f.app.Window.NewWithOptions(options)
	handle := &wailsWindowHandle{w: w}
	mgr := window.NewManager(handle, 0)
	overlayWindow := &wailsOverlayWindow{w: w, handle: handle, mgr: mgr, screen: f.screens(document.MonitorIndex), level: level}

	// When the user (or Stop) closes the overlay window, we must stop treating
	// it as the current window so StartOverlay can create a fresh one next time.
	w.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		go func() {
			if notify := f.windowClosed; notify != nil {
				notify(overlayWindow)
			}
		}()
	})

	// Apply the profile document display mode instead of hard-coding passthrough.
	// ModeRacing starts click-through; ModeEdit starts interactive.
	mgr.ApplyProfileV3(document, false)
	overlayWindow.applyPerformanceGeometry(document)
	return overlayWindow, nil
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

// refreshActiveOverlayAfterSave reloads the running desktop overlay when Studio
// saves the same profile that is currently active in the runtime.
func refreshActiveOverlayAfterSave(
	overlayController *app.OverlayController,
	studioProfileSvc *app.StudioProfileService,
	overlayRunning *atomic.Bool,
	saved app.StudioProfileSaved,
) {
	if overlayController == nil || studioProfileSvc == nil || !overlayRunning.Load() {
		return
	}
	status := overlayController.Status()
	if !status.Running {
		return
	}
	if saved.Path == "" || studioProfileSvc.Path() != saved.Path {
		return
	}
	if saved.Document == nil {
		return
	}
	if _, err := overlayController.Start(saved.Document); err != nil {
		log.Printf("overlay refresh after save error: %v", err)
		return
	}
	studioProfileSvc.EmitRuntimeLoaded()
	resetOverlayDisplayMode(overlayController, studioProfileSvc)
}

// handleToggleEditMode toggles the running desktop overlay between racing and
// edit display mode. When the overlay is not running, it opens the active
// profile and enters edit mode directly. Streaming (no desktop window) is a
// no-op: there is no in-place surface to edit.
func handleToggleEditMode(
	hubSvc *app.HubService,
	studioProfileSvc *app.StudioProfileService,
	overlayController *app.OverlayController,
	overlayRunning *atomic.Bool,
	emitter app.EventEmitter,
) {
	if studioProfileSvc == nil {
		return
	}
	if !overlayRunning.Load() {
		if hubSvc == nil {
			return
		}
		status, err := hubSvc.StartActiveOverlay()
		if err != nil || !status.Running {
			if overlayRunning != nil {
				overlayRunning.Store(false)
			}
			if err != nil {
				log.Printf("hotkey toggle edit mode open overlay error: %v", err)
			}
			return
		}
		overlayRunning.Store(true)
	}
	document := studioProfileSvc.Document()
	if document == nil {
		return
	}
	target := config.ModeEdit
	if document.DisplayMode == config.ModeEdit {
		target = config.ModeRacing
	}
	if err := studioProfileSvc.SetDisplayMode(target); err != nil {
		log.Printf("hotkey toggle edit mode error: %v", err)
		return
	}
	if overlayController != nil {
		if current := overlayController.CurrentWindow(); current != nil {
			if err := current.ApplyProfileMode(studioProfileSvc.Document()); err != nil {
				log.Printf("hotkey toggle edit mode apply window error: %v", err)
			}
		}
	}
	studioProfileSvc.EmitRuntimeLoaded()
	if emitter != nil {
		emitter.Emit("overlay:edit-mode-changed", map[string]any{"mode": string(target)})
	}
}

// handleOpenOverlayStudio requests Hub navigation to Overlay Studio for the
// active profile. Runtime editing chrome is never toggled from the hotkey.
func handleOpenOverlayStudio(studioProfileSvc *app.StudioProfileService, emitter app.EventEmitter) {
	if emitter == nil {
		return
	}
	payload := map[string]any{}
	if studioProfileSvc != nil {
		if doc := studioProfileSvc.Document(); doc != nil && doc.ID != "" {
			payload["profileId"] = doc.ID
		}
		if path := studioProfileSvc.Path(); path != "" {
			payload["file"] = filepath.Base(path)
		}
	}
	emitter.Emit("hub:open-overlay-studio", payload)
}

// handleOverlayProfileSnapshotRequest responds to the desktop WebView only
// after its profile listener is ready. The startup broadcast can otherwise
// race a newly-created window and leave it loading indefinitely.
func handleOverlayProfileSnapshotRequest(studioProfileSvc *app.StudioProfileService) {
	if studioProfileSvc == nil {
		return
	}
	studioProfileSvc.EmitRuntimeLoaded()
}

// resetOverlayDisplayMode forces the active V3 document back to racing mode and
// applies it to the running window when one exists.
func resetOverlayDisplayMode(overlayController *app.OverlayController, studioProfileSvc *app.StudioProfileService) {
	document := resetOverlayProfileDisplayMode(studioProfileSvc)
	if document == nil {
		return
	}
	if overlayController != nil {
		current := overlayController.CurrentWindow()
		if current != nil {
			if err := current.ApplyProfileMode(document); err != nil {
				log.Printf("overlay reset display mode apply window error: %v", err)
			}
		}
	}
}

// resetOverlayProfileDisplayMode resets profile state without touching the
// controller. It is safe for the serialized native-window-close callback.
func resetOverlayProfileDisplayMode(studioProfileSvc *app.StudioProfileService) *config.ProfileDocumentV3 {
	if studioProfileSvc == nil {
		return nil
	}
	document := studioProfileSvc.Document()
	if document == nil || document.DisplayMode == config.ModeRacing {
		return nil
	}
	if err := studioProfileSvc.SetDisplayMode(config.ModeRacing); err != nil {
		log.Printf("overlay reset display mode error: %v", err)
		return nil
	}
	document = studioProfileSvc.Document()
	studioProfileSvc.EmitRuntimeLoaded()
	return document
}

// buildHotkeyActionMap returns the action map used for hotkey registration and
// rebuild. Keeping this in a separate function makes it testable and guarantees
// that rebuildHotkeys includes every action (including toggleEditMode).
func buildHotkeyActionMap(
	hubSvc *app.HubService,
	studioProfileSvc *app.StudioProfileService,
	overlayController *app.OverlayController,
	overlayRunning *atomic.Bool,
	emitter app.EventEmitter,
) map[string]func() {
	return map[string]func(){
		"cycleDeltaReference": func() {
			if studioProfileSvc == nil {
				return
			}
			reference, err := studioProfileSvc.CycleDeltaReference()
			if err != nil {
				log.Printf("hotkey cycle delta reference error: %v", err)
				return
			}
			if emitter != nil {
				emitter.Emit("overlay:delta-reference-changed", map[string]any{"reference": reference})
			}
		},
		"toggleOverlay": func() {
			if hubSvc == nil {
				return
			}
			if overlayRunning.Load() {
				hubSvc.StopOverlay()
				resetOverlayDisplayMode(overlayController, studioProfileSvc)
				overlayRunning.Store(false)
				return
			}
			status, err := hubSvc.StartActiveOverlay()
			if err != nil {
				log.Printf("hotkey toggle overlay error: %v", err)
				if !status.Running {
					overlayRunning.Store(false)
				}
				return
			}
			overlayRunning.Store(status.Running)
			resetOverlayDisplayMode(overlayController, studioProfileSvc)
		},
		"nextProfile": func() {
			if !overlayRunning.Load() || studioProfileSvc == nil || hubSvc == nil {
				return
			}
			if err := studioProfileSvc.NextProfile(); err != nil {
				log.Printf("hotkey next profile error: %v", err)
				return
			}
			if err := hubSvc.ActivateProfile(filepath.Base(studioProfileSvc.Path())); err != nil {
				log.Printf("hotkey next profile activation error: %v", err)
				return
			}
			if status, err := hubSvc.StartActiveOverlay(); err != nil {
				log.Printf("hotkey next profile restart overlay error: %v", err)
				if !status.Running {
					overlayRunning.Store(false)
				}
			} else {
				overlayRunning.Store(status.Running)
				resetOverlayDisplayMode(overlayController, studioProfileSvc)
			}
		},
		"prevProfile": func() {
			if !overlayRunning.Load() || studioProfileSvc == nil || hubSvc == nil {
				return
			}
			if err := studioProfileSvc.PreviousProfile(); err != nil {
				log.Printf("hotkey prev profile error: %v", err)
				return
			}
			if err := hubSvc.ActivateProfile(filepath.Base(studioProfileSvc.Path())); err != nil {
				log.Printf("hotkey previous profile activation error: %v", err)
				return
			}
			if status, err := hubSvc.StartActiveOverlay(); err != nil {
				log.Printf("hotkey prev profile restart overlay error: %v", err)
				if !status.Running {
					overlayRunning.Store(false)
				}
			} else {
				overlayRunning.Store(status.Running)
				resetOverlayDisplayMode(overlayController, studioProfileSvc)
			}
		},
		"toggleEditMode": func() {
			handleToggleEditMode(hubSvc, studioProfileSvc, overlayController, overlayRunning, emitter)
		},
	}
}

func configuredHotkeyManager(settings *app.AppSettings, actions map[string]func()) *app.HotkeyManager {
	manager := app.NewHotkeyManager()
	if settings == nil {
		return manager
	}
	for name, action := range actions {
		combo := settings.Hotkeys[name]
		if combo == "" {
			continue
		}
		if err := manager.Register(name, combo, action); err != nil {
			log.Printf("hotkey: skip %q: %v", name, err)
		}
	}
	return manager
}

// decodeEventPayload reads a Wails custom event's data into a typed payload.
// Wails hands it over as a generic value, so the round trip through JSON is the
// shortest path to a struct. A malformed payload leaves the zero value, which
// every caller already treats as "nothing supplied".
func decodeEventPayload(event *application.CustomEvent, out any) {
	if event == nil || event.Data == nil {
		return
	}
	raw, err := json.Marshal(event.Data)
	if err != nil {
		return
	}
	_ = json.Unmarshal(raw, out)
}
