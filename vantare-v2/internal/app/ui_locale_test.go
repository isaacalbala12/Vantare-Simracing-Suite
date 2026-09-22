package app_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestUILocalePersistsAndOldSettingsCannotOverwriteIt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.InitializeUILocale("it"); err != nil {
		t.Fatal(err)
	}
	if got, err := svc.InitializeUILocale("es"); err != nil || got.Locale != "it" {
		t.Fatalf("second initialization: %+v %v", got, err)
	}
	if _, err := svc.SetUILocale("pt"); err != nil {
		t.Fatal(err)
	}
	oldForm := svc.Settings()
	oldForm.UILocale = "it"
	oldForm.CpuSampling = false
	if err := svc.Save(oldForm); err != nil {
		t.Fatal(err)
	}
	if got := svc.UILocaleSnapshot(); got.Locale != "pt" || got.Revision != 2 {
		t.Fatalf("locale changed by old form: %+v", got)
	}
	reloaded := app.NewSettingsService(path, nil, nil)
	if err := reloaded.Load(); err != nil {
		t.Fatal(err)
	}
	if got := reloaded.UILocaleSnapshot().Locale; got != "pt" {
		t.Fatalf("persisted locale = %q", got)
	}
}

func TestUILocaleRejectsInvalidAndFailedWritesWithoutEvents(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	_, changes, cancel := svc.SubscribeUILocale()
	defer cancel()
	if _, err := svc.SetUILocale("fr"); err == nil {
		t.Fatal("invalid locale accepted")
	}
	if got := svc.UILocaleSnapshot(); got.Locale != "" || got.Revision != 0 {
		t.Fatalf("invalid locale changed state: %+v", got)
	}
	// A directory at the destination fails even after the existing retries.
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetUILocale("en"); err == nil {
		t.Fatal("expected persistence error")
	}
	if got := svc.UILocaleSnapshot(); got.Locale != "" || got.Revision != 0 {
		t.Fatalf("failed write changed state: %+v", got)
	}
	select {
	case event := <-changes:
		t.Fatalf("failed write published %+v", event)
	default:
	}
	if _, err := os.Stat(path + ".failed"); !os.IsNotExist(err) {
		t.Fatalf("failed locale left recoverable sidecar: %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	reloaded := app.NewSettingsService(path, nil, nil)
	if err := reloaded.Load(); err != nil {
		t.Fatal(err)
	}
	if got := reloaded.UILocaleSnapshot().Locale; got != "" {
		t.Fatalf("failed locale restored on restart: %q", got)
	}
}

func TestUILocaleSubscriptionIsAtomicAndKeepsLatest(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	svc := app.NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	initial, changes, cancel := svc.SubscribeUILocale()
	defer cancel()
	if initial.Locale != "" || initial.Revision != 0 {
		t.Fatalf("initial %+v", initial)
	}
	for _, locale := range []string{"es", "en", "pt", "it"} {
		if _, err := svc.SetUILocale(locale); err != nil {
			t.Fatal(err)
		}
	}
	select {
	case got := <-changes:
		if got.Locale != "it" || got.Revision != 4 {
			t.Fatalf("latest %+v", got)
		}
	default:
		t.Fatal("missing latest update")
	}
	cancel()
	if _, err := svc.SetUILocale("es"); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-changes:
		t.Fatalf("cancelled listener got %+v", got)
	default:
	}
}
