package main

import (
	"fmt"
	"log"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/app/launcher"
	"github.com/vantare/overlays/v2/internal/notify"
)

// centerEmitter forwards every bus event downstream and feeds the
// notification center from the whitelisted ones. Everything else — race
// output like the Spotter's included — just passes through. It replaces the
// old notifyingEmitter: the launcher result toast now goes through the
// center's channel matrix instead of a separate call.
type centerEmitter struct {
	downstream app.EventEmitter
	center     *notify.Center
	settings   *app.SettingsService
}

func (e centerEmitter) Emit(name string, data any) {
	e.downstream.Emit(name, data)
	if e.center == nil || name != "launcher:chain:done" {
		return
	}
	progress, ok := data.(launcher.ChainProgress)
	if !ok {
		return
	}
	e.publishLaunchResult(progress)
}

func (e centerEmitter) publishLaunchResult(progress launcher.ChainProgress) {
	profile := launchProfileName(e.settings, progress.ProfileID)
	severity := notify.SeverityInfo
	fallback := fmt.Sprintf("El perfil %s está listo.", profile)
	titleKey := "notifications.record.launcher.finished.title"
	textKey := "notifications.record.launcher.finished.text"
	if !progress.Success {
		severity = notify.SeverityError
		fallback = fmt.Sprintf("El perfil %s no se pudo iniciar del todo.", profile)
		titleKey = "notifications.record.launcher.failed.title"
		textKey = "notifications.record.launcher.failed.text"
	}
	rec := notify.Record{
		Source:    notify.SourceLauncher,
		Severity:  severity,
		DedupeKey: fmt.Sprintf("launcher:%s:%t", progress.ProfileID, progress.Success),
		TitleKey:  titleKey,
		TextKey:   textKey,
		Params:    map[string]string{"profile": profile},
		Action:    &notify.Action{Kind: "navigate", Target: "launcher"},
		Fallback:  fallback,
	}
	if err := e.center.Publish(rec); err != nil {
		log.Printf("notification center: launch result rejected: %v", err)
	}
}

// publishUpdateAvailable records a pending update. The dedupe key carries the
// tag so a repeated check for the same version is a quiet repetition, and a
// newer tag counts as a new occurrence.
func publishUpdateAvailable(center *notify.Center, tag string) {
	if center == nil || tag == "" {
		return
	}
	rec := notify.Record{
		Source:    notify.SourceUpdater,
		Severity:  notify.SeverityInfo,
		DedupeKey: "updater:update:" + tag,
		TitleKey:  "notifications.record.updater.available.title",
		TextKey:   "notifications.record.updater.available.text",
		Params:    map[string]string{"tag": tag},
		Action:    &notify.Action{Kind: "navigate", Target: "settings:updates"},
		Fallback:  fmt.Sprintf("Hay una actualización disponible: %s.", tag),
	}
	if err := center.Publish(rec); err != nil {
		log.Printf("notification center: update available rejected: %v", err)
	}
}

// publishUpdaterError records a failed update operation with its cause.
func publishUpdaterError(center *notify.Center, message string) {
	if center == nil || message == "" {
		return
	}
	rec := notify.Record{
		Source:        notify.SourceUpdater,
		Severity:      notify.SeverityError,
		DedupeKey:     "updater:error:" + message,
		TitleKey:      "notifications.record.updater.error.title",
		ConcreteCause: message,
		Action:        &notify.Action{Kind: "navigate", Target: "settings:updates"},
		Fallback:      "La actualización no se pudo completar.",
	}
	if err := center.Publish(rec); err != nil {
		log.Printf("notification center: updater error rejected: %v", err)
	}
}

// publishUpdateInstalling records that the installer was launched — not that
// the update is installed; the app is about to close.
func publishUpdateInstalling(center *notify.Center) {
	if center == nil {
		return
	}
	rec := notify.Record{
		Source:    notify.SourceUpdater,
		Severity:  notify.SeverityInfo,
		DedupeKey: "updater:installed",
		TitleKey:  "notifications.record.updater.installed.title",
		Fallback:  "El instalador de la actualización está en marcha.",
	}
	if err := center.Publish(rec); err != nil {
		log.Printf("notification center: installed record rejected: %v", err)
	}
}

// publishTestResult records the manual test outcome in the center. The toast
// itself keeps its direct path, which intentionally ignores mute/minimized.
func publishTestResult(center *notify.Center, err error) {
	if center == nil {
		return
	}
	rec := notify.Record{
		Source:    notify.SourceSystem,
		Severity:  notify.SeverityInfo,
		DedupeKey: "system:test",
		TitleKey:  "notifications.record.system.test.title",
		TextKey:   "notifications.record.system.test.sent",
	}
	if err != nil {
		rec.Severity = notify.SeverityError
		rec.TextKey = "notifications.record.system.test.failed"
		rec.ConcreteCause = err.Error()
	}
	if publishErr := center.Publish(rec); publishErr != nil {
		log.Printf("notification center: test record rejected: %v", publishErr)
	}
}
