package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
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
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/authsession"
	"github.com/vantare/overlays/v2/internal/calendar"
	engineeraudio "github.com/vantare/overlays/v2/internal/engineer/audio"
	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/license"
	"github.com/vantare/overlays/v2/internal/ops"
	"github.com/vantare/overlays/v2/internal/server"
	strategyapplication "github.com/vantare/overlays/v2/internal/strategy/application"
	strategymanual "github.com/vantare/overlays/v2/internal/strategy/manual"
	strategyrepository "github.com/vantare/overlays/v2/internal/strategy/repository"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/testingcenter/reportdraft"
	"github.com/vantare/overlays/v2/internal/tts"
	"github.com/vantare/overlays/v2/internal/updater"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// version is the current application version.
var version = "v0.1.0.5"

// buildChannel is injected by release builds. Local and public builds fail
// closed as master so the internal Testing Center cannot appear accidentally.
var buildChannel = "master"

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

type strategyCommandExecutor interface {
	Execute(context.Context, []byte) ([]byte, error)
}

func executeStrategyApplicationCommand(ctx context.Context, executor strategyCommandExecutor, data any) (any, map[string]any) {
	document, err := json.Marshal(data)
	if err != nil {
		return nil, map[string]any{"commandId": "invalid-command", "code": string(strategyapplication.ErrorInvalidCommand), "field": "", "message": "invalid Strategy command"}
	}
	var header struct {
		CommandID string `json:"commandId"`
	}
	_ = json.Unmarshal(document, &header)
	if header.CommandID == "" {
		header.CommandID = "invalid-command"
	}
	encoded, err := executor.Execute(ctx, document)
	if err != nil {
		code := strategyapplication.ErrorInvalidCommand
		field := ""
		var applicationErr *strategyapplication.ApplicationError
		if errors.As(err, &applicationErr) {
			if _, known := publicStrategyApplicationMessage(applicationErr.Code); known {
				code = applicationErr.Code
				field = applicationErr.Field
			}
		}
		message, _ := publicStrategyApplicationMessage(code)
		return nil, map[string]any{
			"commandId": header.CommandID,
			"code":      string(code),
			"field":     field,
			"message":   message,
		}
	}
	var result any
	if err := json.Unmarshal(encoded, &result); err != nil {
		return nil, map[string]any{"commandId": header.CommandID, "code": string(strategyapplication.ErrorInvalidCommand), "field": "", "message": "invalid Strategy result"}
	}
	return result, nil
}

func publicStrategyApplicationMessage(code strategyapplication.ErrorCode) (string, bool) {
	switch code {
	case strategyapplication.ErrorInvalidCommand:
		return "The Strategy request could not be completed.", true
	case strategyapplication.ErrorStaleCommand:
		return "The Strategy document changed. Reopen it and try again.", true
	case strategyapplication.ErrorDraftNotFound:
		return "The Strategy draft was not found.", true
	case strategyapplication.ErrorDraftConflict:
		return "The Strategy draft conflicts with another saved document.", true
	case strategyapplication.ErrorRevisionNotFound:
		return "The Strategy revision was not found.", true
	case strategyapplication.ErrorActiveConflict:
		return "The active Strategy plan changed. Reopen it and try again.", true
	case strategyapplication.ErrorUnsavedChanges:
		return "The Strategy draft has unsaved changes.", true
	default:
		return "The Strategy request could not be completed.", false
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
// canonical launcher snapshot. On error it falls back to
// launcher:error so the UI can surface a message.
func handleDiscoverApps(svc *launcher.Service, emitter app.EventEmitter) {
	if _, err := svc.DiscoverApps(); err != nil {
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
// id. The caller emits the canonical snapshot after this succeeds.
func handleAppUpdate(id, args string, settingsSvc *app.SettingsService, emitter app.EventEmitter) {
	if err := settingsSvc.UpdateLauncherAppArgs(id, args); err != nil {
		log.Printf("launcher:app:update error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	handleLauncherSnapshot(launcher.NewService(settingsSvc, emitter, nil), emitter)
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
	handleLauncherSnapshot(launcher.NewService(settingsSvc, emitter, nil), emitter)
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
	// Set WebView2 user data folder to version-specific path to prevent cache issues across releases
	if appData := os.Getenv("LOCALAPPDATA"); appData != "" {
		udf := filepath.Join(appData, "Vantare", "webview_v0.1.0.5")
		_ = os.Setenv("WEBVIEW2_USER_DATA_FOLDER", udf)
	}

	live := flag.Bool("live", true, "use LMU shared memory (-live=false keeps telemetry disconnected)")
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

	wailsApp := application.New(application.Options{
		Name: "Vantare Simracing Suite",
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(distFS),
		},
	})

	emitter := &wailsEmitter{wailsApp: wailsApp}
	var cleanup sync.Once
	var hotkeyMu sync.Mutex
	var opsBridge *app.OpsBridge
	var httpSrv *server.Server
	var overlayController *app.OverlayController
	var studioProfileSvc *app.StudioProfileService
	var rtSampler *ops.RuntimeSampler
	var overlayRunning atomic.Bool
	var hkMgr *app.HotkeyManager
	var engBridge *app.EngineerBridge
	var engSvc *engineerservice.EngineerService
	var launcherSvc *launcher.Service
	var profileHkMgr *launcher.HotkeyManager
	var diagnosticsBridge *app.DiagnosticsBridge
	var testingCenterReportDraftBridge *app.TestingCenterReportDraftBridge
	var testingCenterDiagnosticBridge *app.TestingCenterDiagnosticBridge
	var telemetryCoreRuntime *app.TelemetryCoreRuntime
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
				{name: "telemetry-core", stop: func(ctx context.Context) error {
					if telemetryCoreRuntime == nil {
						return nil
					}
					return telemetryCoreRuntime.Stop(ctx)
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
	// Get and verify configs directory first
	cfgDir := configsDir()
	if cfgDir == "" {
		log.Printf("warning: configs directory not found — hub profile CRUD disabled")
	}
	var strategyBridge strategyCommandExecutor
	if root, rootErr := strategyRepositoryRoot(cfgDir); rootErr != nil {
		log.Printf("warning: Strategy repository is unavailable")
	} else if repo, openErr := strategyrepository.Open[json.RawMessage](root, strategyrepository.Options{}); openErr != nil {
		log.Printf("warning: Strategy repository could not be opened: %v", openErr)
	} else {
		strategyBridge = strategyapplication.NewJSONBridge(strategyapplication.NewService(repo))
	}
	wailsApp.Event.On("strategy:application:command", func(event *application.CustomEvent) {
		if strategyBridge == nil {
			commandID := "unavailable"
			if document, marshalErr := json.Marshal(event.Data); marshalErr == nil {
				var header struct {
					CommandID string `json:"commandId"`
				}
				if json.Unmarshal(document, &header) == nil && header.CommandID != "" {
					commandID = header.CommandID
				}
			}
			emitter.Emit("strategy:application:error", map[string]any{
				"commandId": commandID, "code": string(strategyapplication.ErrorInvalidCommand),
				"field": "", "message": "Strategy repository is unavailable",
			})
			return
		}
		result, failure := executeStrategyApplicationCommand(ctx, strategyBridge, event.Data)
		if failure != nil {
			emitter.Emit("strategy:application:error", failure)
			return
		}
		emitter.Emit("strategy:application:result", result)
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
				resetOverlayDisplayMode(overlayController, studioProfileSvc)
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
	wailsApp.RegisterService(application.NewService(licenseSvc))
	authManager := authsession.NewManager(authsession.NewStore(authSessionTarget))

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
		log.Printf("license:validate request tokenLen=%d refreshLen=%d",
			len(payload.SessionToken), len(payload.RefreshToken))
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
		wailsApp.RegisterService(application.NewService(updaterSvc))
	}

	// Engineer owns product behavior only. TelemetryCoreRuntime below is its
	// sole production telemetry source.
	engSvc = engineerservice.NewEngineerService(emitter)
	engineerAudioConfig := engineeraudio.DefaultAudioConfig()
	engSvc.SetAudioPlayer(engineeraudio.NewPlayer())
	engSvc.SetAudioConfig(engineerAudioConfig)
	// ENG-06 is cache-only: a miss remains a visual notification. TTS
	// synthesis stays outside the preemptible product delivery path.
	engineerAudioCache, cacheErr := tts.NewCache(tts.DefaultCacheRoot(), "kokoro")
	if cacheErr != nil {
		log.Printf("engineer audio cache unavailable; using visual delivery only: %v", cacheErr)
	} else {
		engSvc.SetAudioRouter(engineeraudio.NewCacheOnlyAudioRouter(engineerAudioConfig, engineerAudioCache))
	}
	if err := engSvc.Start(ctx); err != nil {
		log.Printf("engineer service start error: %v", err)
	}

	// Register Wails bridge for Engineer events and commands
	engBridge = app.NewEngineerBridge(wailsApp, emitter, engSvc)
	engBridge.Start()

	telemetryCoreRuntime, err = app.NewTelemetryCoreRuntime(app.TelemetryCoreRuntimeConfig{
		Enabled:  *live,
		Emitter:  emitter,
		Engineer: engSvc,
	})
	if err != nil {
		log.Printf("telemetry core init error: %v", err)
		telemetryCoreRuntime = nil
	}
	telemetrySourceStatus := func() driver.SourceStatus {
		if telemetryCoreRuntime == nil {
			return driver.UnknownSourceStatus()
		}
		return telemetryCoreRuntime.SourceStatus()
	}

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
			} else if studioProfileSvc != nil {
				if err := studioProfileSvc.LoadActiveProfile(path); err != nil {
					log.Printf("warning: could not load active studio profile %s: %v", activeID, err)
				}
			}
		} else {
			log.Printf("warning: active profile %s not found: %v", activeID, err)
		}
	}

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

	wailsApp.Event.On("overlay:toggle-edit-mode", func(event *application.CustomEvent) {
		handleOpenOverlayStudio(studioProfileSvc, emitter)
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

func (o *wailsOverlayWindow) ApplyProfileMode(document *config.ProfileDocumentV3) error {
	if o.mgr == nil || document == nil {
		return fmt.Errorf("overlay window not ready for mode application")
	}
	o.mgr.ApplyProfileV3(document, false)
	return nil
}

func (f *wailsOverlayFactory) NewOverlayWindow(document *config.ProfileDocumentV3, origin config.Rect, bounds config.Rect) (app.OverlayWindow, error) {
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
	// Apply the profile document display mode instead of hard-coding passthrough.
	// ModeRacing starts click-through; ModeEdit starts interactive.
	mgr.ApplyProfileV3(document, false)
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

// resetOverlayDisplayMode forces the active V3 document back to racing mode and
// applies it to the running window when one exists.
func resetOverlayDisplayMode(overlayController *app.OverlayController, studioProfileSvc *app.StudioProfileService) {
	if studioProfileSvc == nil {
		return
	}
	document := studioProfileSvc.Document()
	if document == nil || document.DisplayMode == config.ModeRacing {
		return
	}
	if err := studioProfileSvc.SetDisplayMode(config.ModeRacing); err != nil {
		log.Printf("overlay reset display mode error: %v", err)
		return
	}
	document = studioProfileSvc.Document()
	if overlayController != nil && overlayController.CurrentWindow() != nil && document != nil {
		if err := overlayController.CurrentWindow().ApplyProfileMode(document); err != nil {
			log.Printf("overlay reset display mode apply window error: %v", err)
		}
	}
	studioProfileSvc.EmitRuntimeLoaded()
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
			handleOpenOverlayStudio(studioProfileSvc, emitter)
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
