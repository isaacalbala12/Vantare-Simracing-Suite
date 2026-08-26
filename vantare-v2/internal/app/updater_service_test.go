package app_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/updater"
)

func TestUpdaterServiceContextCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
	defer server.Close()

	t.Setenv("VANTARE_RELEASES_URL", server.URL+"/releases")
	settingsPath := filepath.Join(t.TempDir(), "updater-settings.json")
	svc, err := app.NewUpdaterService("v0.1.0", settingsPath, &spyEmitter{})
	if err != nil {
		t.Fatalf("NewUpdaterService error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err = svc.CheckUpdatesCtx(ctx)
	if err == nil {
		t.Fatal("expected context cancellation error")
	}
}

func TestUpdaterServiceRejectsUnauthorizedProtectedChannel(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "updater-settings.json")
	svc, err := app.NewUpdaterService("v0.1.0", settingsPath, &spyEmitter{})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.SaveSettings(&updater.Settings{Channel: updater.ChannelTesters}); err == nil {
		t.Fatal("default authorizer accepted Testers")
	}
	svc.SetChannelAuthorizer(func(channel updater.Channel) bool {
		return channel == updater.ChannelStable || channel == updater.ChannelTesters
	})
	if err := svc.SaveSettings(&updater.Settings{Channel: updater.ChannelTesters}); err != nil {
		t.Fatalf("authorized Testers rejected: %v", err)
	}
	if err := svc.SaveSettings(&updater.Settings{Channel: updater.ChannelNightly}); err == nil {
		t.Fatal("Tester authorizer accepted Nightly")
	}
}

func TestUpdaterServiceRejectsDirectNightlyInstallForTester(t *testing.T) {
	server := releaseListServer(t, `[
		{"tag_name":"v0.2.0-nightly.1","name":"nightly","prerelease":true,"assets":[{"name":"vantare-amd64-installer.exe","browser_download_url":"https://example.invalid/installer.exe"},{"name":"vantare-amd64-installer.exe.sha256","browser_download_url":"https://example.invalid/installer.exe.sha256"}]}
	]`)
	defer server.Close()

	t.Setenv("VANTARE_RELEASES_URL", server.URL+"/releases")
	settingsPath := filepath.Join(t.TempDir(), "updater-settings.json")
	svc, err := app.NewUpdaterService("v0.1.0", settingsPath, &spyEmitter{})
	if err != nil {
		t.Fatal(err)
	}
	svc.SetChannelAuthorizer(func(channel updater.Channel) bool {
		return channel == updater.ChannelStable || channel == updater.ChannelTesters
	})
	if err := svc.InstallVerifiedVersion("v0.2.0-nightly.1"); err == nil {
		t.Fatal("direct Nightly install bypassed the channel gate")
	}
}

// releaseListServer serves a fixed releases payload for every request.
func releaseListServer(t *testing.T, payload string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(payload))
	}))
}

func TestUpdaterServiceConcurrentChecksAndIgnore(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.2.0","prerelease":false,"published_at":"2026-06-02T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.2.0.exe"}]}
		]`))
	}))
	defer server.Close()

	t.Setenv("VANTARE_RELEASES_URL", server.URL+"/releases")
	settingsPath := filepath.Join(t.TempDir(), "updater-settings.json")
	svc, err := app.NewUpdaterService("v0.1.0", settingsPath, &spyEmitter{})
	if err != nil {
		t.Fatalf("NewUpdaterService error: %v", err)
	}

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if _, err := svc.CheckUpdatesCtx(ctx); err != nil {
				t.Errorf("CheckUpdatesCtx error: %v", err)
			}
		}()
	}
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := svc.IgnoreVersion("v0.2.0"); err != nil {
				t.Errorf("IgnoreVersion error: %v", err)
			}
		}()
	}
	wg.Wait()

	settings, err := svc.GetSettings()
	if err != nil {
		t.Fatalf("GetSettings error: %v", err)
	}
	if settings.Channel != "stable" {
		t.Fatalf("unexpected channel: %s", settings.Channel)
	}
}

func TestUpdaterServiceInstallVerifiedVersionCtxRespectsCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
	defer server.Close()

	t.Setenv("VANTARE_RELEASES_URL", server.URL+"/releases")
	settingsPath := filepath.Join(t.TempDir(), "updater-settings.json")
	svc, err := app.NewUpdaterService("v0.1.0", settingsPath, &spyEmitter{})
	if err != nil {
		t.Fatalf("NewUpdaterService error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan error, 1)
	go func() {
		done <- svc.InstallVerifiedVersionCtx(ctx, "v0.2.0")
	}()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected context cancellation error, got nil")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("InstallVerifiedVersionCtx did not return after context cancellation")
	}
}
