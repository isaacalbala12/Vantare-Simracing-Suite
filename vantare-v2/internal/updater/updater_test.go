package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func newTestUpdater(t *testing.T, currentVersion string) *Updater {
	t.Helper()
	u, err := New(currentVersion, filepath.Join(t.TempDir(), "settings.json"))
	if err != nil {
		t.Fatalf("New error: %v", err)
	}
	return u
}

func TestCheckFiltersChannel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.1.2-prealpha","prerelease":true,"published_at":"2026-06-03T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.2.exe"}]},
			{"tag_name":"v0.1.1","prerelease":false,"published_at":"2026-06-02T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.1.exe"}]}
		]`))
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	u.releasesURL = server.URL

	info, err := u.Check(&Settings{Channel: ChannelStable})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if len(info.Releases) != 1 {
		t.Fatalf("stable releases=%d, want 1", len(info.Releases))
	}
	if info.Releases[0].TagName != "v0.1.1" {
		t.Fatalf("stable tag=%s, want v0.1.1", info.Releases[0].TagName)
	}

	info, err = u.Check(&Settings{Channel: ChannelPrerelease})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if len(info.Releases) != 2 {
		t.Fatalf("prerelease releases=%d, want 2", len(info.Releases))
	}
}

func TestCheckNoUpdateWhenCurrentIsLatest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.1.0","prerelease":false,"published_at":"2026-06-01T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.0.exe"}]}
		]`))
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	u.releasesURL = server.URL

	info, err := u.Check(&Settings{Channel: ChannelStable})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if info.HasUpdate {
		t.Fatal("expected no update")
	}
	if info.IsDowngrade {
		t.Fatal("expected not downgrade")
	}
}

func TestCheckDetectsIgnoredVersion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.1.1","prerelease":false,"published_at":"2026-06-02T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.1.exe"}]}
		]`))
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	u.releasesURL = server.URL

	info, err := u.Check(&Settings{Channel: ChannelStable, IgnoreVersion: "v0.1.1"})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if info.HasUpdate {
		t.Fatal("expected no update when ignored")
	}
}

func TestCheckDetectsDowngrade(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.1.0","prerelease":false,"published_at":"2026-06-01T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.0.exe"}]}
		]`))
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.1")
	u.releasesURL = server.URL

	info, err := u.Check(&Settings{Channel: ChannelStable})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if info.HasUpdate {
		t.Fatal("expected no update for downgrade")
	}
	if !info.IsDowngrade {
		t.Fatal("expected downgrade flag")
	}
}

func TestDownloadFile(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("installer bytes"))
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	dest := filepath.Join(t.TempDir(), "installer.exe")
	var lastPercent int
	if err := u.downloadFile(context.Background(), server.URL, dest, func(p int) { lastPercent = p }); err != nil {
		t.Fatalf("download error: %v", err)
	}
	data, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "installer bytes" {
		t.Fatalf("content=%s", string(data))
	}
	if lastPercent != 100 {
		t.Fatalf("percent=%d, want 100", lastPercent)
	}
}

func TestDownloadFileNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	dest := filepath.Join(t.TempDir(), "installer.exe")
	if err := u.downloadFile(context.Background(), server.URL, dest, nil); err == nil {
		t.Fatal("expected error")
	}
}

func TestInstallVerifiedHashMismatch(t *testing.T) {
	installerBody := []byte("installer bytes")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/installer.exe":
			w.Write(installerBody)
		case "/installer.exe.sha256":
			fmt.Fprint(w, "0000000000000000000000000000000000000000000000000000000000000000  installer.exe\n")
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	installerPath := filepath.Join(filepath.Dir(u.SettingsPath()), "update", "vantare-installer.exe")
	release := Release{
		TagName: "v0.1.1",
		Assets: []Asset{
			{Name: "vantare-amd64-installer.exe", Size: len(installerBody), DownloadURL: server.URL + "/installer.exe"},
			{Name: "vantare-amd64-installer.exe.sha256", Size: 100, DownloadURL: server.URL + "/installer.exe.sha256"},
		},
	}

	err := u.InstallVerified(release, nil)
	if err == nil {
		t.Fatal("expected hash mismatch error")
	}
	if _, statErr := os.Stat(installerPath); !os.IsNotExist(statErr) {
		t.Fatalf("expected installer to be removed after checksum failure, got err=%v", statErr)
	}
}

func TestInstallVerifiedHashOK(t *testing.T) {
	installerBody := []byte("installer bytes")
	hash := sha256.Sum256(installerBody)
	hashStr := hex.EncodeToString(hash[:])

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/installer.exe":
			w.Write(installerBody)
		case "/installer.exe.sha256":
			fmt.Fprintf(w, "%s  installer.exe\n", hashStr)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	release := Release{
		TagName: "v0.1.1",
		Assets: []Asset{
			{Name: "vantare-amd64-installer.exe", Size: len(installerBody), DownloadURL: server.URL + "/installer.exe"},
			{Name: "vantare-amd64-installer.exe.sha256", Size: 100, DownloadURL: server.URL + "/installer.exe.sha256"},
		},
	}

	// Execution is Windows-only; we cannot actually run a fake .exe, so skip on Windows.
	if runtime.GOOS == "windows" {
		t.Skip("cannot execute fake installer on windows")
	}

	// On non-Windows, just verify checksum passes by writing the file manually.
	mpFile := filepath.Join(t.TempDir(), "installer.exe")
	if err := os.WriteFile(mpFile, installerBody, 0644); err != nil {
		t.Fatal(err)
	}
	if err := u.verifyChecksum(context.Background(), mpFile, release.Assets[1].DownloadURL); err != nil {
		t.Fatalf("checksum verification failed: %v", err)
	}
}

func TestCheckNormalizesVersionPrefix(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.3.10.0","prerelease":false,"published_at":"2026-06-01T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.3.10.0.exe"}]}
		]`))
	}))
	defer server.Close()

	u := newTestUpdater(t, "0.3.10.0")
	u.releasesURL = server.URL

	info, err := u.Check(&Settings{Channel: ChannelStable})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if info.HasUpdate {
		t.Fatalf("expected no update for same numeric version with different prefix")
	}
}

func TestCheckIgnoresVersionNormalized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.3.10.0","prerelease":false,"published_at":"2026-06-01T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.3.10.0.exe"}]}
		]`))
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.3.9.0")
	u.releasesURL = server.URL

	info, err := u.Check(&Settings{Channel: ChannelStable, IgnoreVersion: "0.3.10.0"})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if info.HasUpdate {
		t.Fatalf("expected ignored version to silence update")
	}
}

func TestListAvailableSkipsReleasesWithoutInstaller(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.1.0","prerelease":false,"published_at":"2026-06-01T00:00:00Z","assets":[{"name":"source.zip","size":100,"browser_download_url":"https://example.com/src.zip"}]},
			{"tag_name":"v0.1.1","prerelease":false,"published_at":"2026-06-02T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.1.exe"}]}
		]`))
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	u.releasesURL = server.URL

	releases, err := u.ListAvailable(&Settings{Channel: ChannelStable})
	if err != nil {
		t.Fatalf("list error: %v", err)
	}
	if len(releases) != 1 || releases[0].TagName != "v0.1.1" {
		t.Fatalf("got %+v, want only v0.1.1", releases)
	}
}

func TestDownloadFileCleansPartialFileOnError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	dest := filepath.Join(t.TempDir(), "installer.exe")
	if err := u.downloadFile(context.Background(), server.URL, dest, nil); err == nil {
		t.Fatal("expected error")
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Fatalf("expected partial file to be removed, got err=%v", err)
	}
}

func TestFetchChecksumInvalidLength(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "abcd  installer.exe\n")
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	_, err := u.fetchChecksum(context.Background(), server.URL)
	if err == nil {
		t.Fatal("expected invalid checksum length error")
	}
}

func TestCheckAutomaticRespectsCooldown(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("automatic check should not hit the server during cooldown")
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	u.releasesURL = server.URL

	settings := &Settings{Channel: ChannelStable, LastCheckAt: time.Now().UTC()}
	info, err := u.Check(settings)
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if !info.Throttled {
		t.Fatal("expected throttled automatic check")
	}
}

func TestCheckManualSkipsCooldown(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.1.1","prerelease":false,"published_at":"2026-06-02T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.1.exe"}]}
		]`))
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	u.releasesURL = server.URL

	settings := &Settings{Channel: ChannelStable, LastCheckAt: time.Now().UTC()}
	info, err := u.CheckManual(settings)
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if info.Throttled {
		t.Fatal("manual check should not be throttled")
	}
	if !info.HasUpdate {
		t.Fatal("expected update for manual check")
	}
}

func TestCheckUpdatesLastCheckAt(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.1.1","prerelease":false,"published_at":"2026-06-02T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.1.exe"}]}
		]`))
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	u.releasesURL = server.URL

	settings := &Settings{Channel: ChannelStable}
	_, err := u.Check(settings)
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if settings.LastCheckAt.IsZero() {
		t.Fatal("expected LastCheckAt to be set after check")
	}
}

func TestInstallVerifiedMissingChecksum(t *testing.T) {
	installerBody := []byte("installer bytes")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/installer.exe":
			w.Write(installerBody)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	release := Release{
		TagName: "v0.1.1",
		Assets: []Asset{
			{Name: "vantare-amd64-installer.exe", Size: len(installerBody), DownloadURL: server.URL + "/installer.exe"},
		},
	}

	err := u.InstallVerified(release, nil)
	if err == nil {
		t.Fatal("expected missing checksum error")
	}
	if !strings.Contains(err.Error(), "no checksum asset") {
		t.Fatalf("expected no checksum asset error, got %v", err)
	}
}

func TestInstallVerifiedChecksumInvalidLength(t *testing.T) {
	installerBody := []byte("installer bytes")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/installer.exe":
			w.Write(installerBody)
		case "/installer.exe.sha256":
			fmt.Fprint(w, "abcd  installer.exe\n")
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	release := Release{
		TagName: "v0.1.1",
		Assets: []Asset{
			{Name: "vantare-amd64-installer.exe", Size: len(installerBody), DownloadURL: server.URL + "/installer.exe"},
			{Name: "vantare-amd64-installer.exe.sha256", Size: 100, DownloadURL: server.URL + "/installer.exe.sha256"},
		},
	}

	err := u.InstallVerified(release, nil)
	if err == nil {
		t.Fatal("expected invalid checksum length error")
	}
}

func TestCheckContextCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0")
	u.releasesURL = server.URL

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := u.CheckCtx(ctx, &Settings{Channel: ChannelStable})
	if err == nil {
		t.Fatal("expected context cancellation error")
	}
}
