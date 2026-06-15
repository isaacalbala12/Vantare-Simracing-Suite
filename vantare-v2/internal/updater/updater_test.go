package updater

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestCheckFiltersChannel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.1.2-prealpha","prerelease":true,"published_at":"2026-06-03T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.2.exe"}]},
			{"tag_name":"v0.1.1","prerelease":false,"published_at":"2026-06-02T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.1.exe"}]}
		]`))
	}))
	defer server.Close()

	u := New("v0.1.0", filepath.Join(t.TempDir(), "settings.json"))
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

	u := New("v0.1.0", filepath.Join(t.TempDir(), "settings.json"))
	u.releasesURL = server.URL

	info, err := u.Check(&Settings{Channel: ChannelStable})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if info.HasUpdate {
		t.Fatal("expected no update")
	}
}

func TestDownloadFile(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("installer bytes"))
	}))
	defer server.Close()

	u := New("v0.1.0", filepath.Join(t.TempDir(), "settings.json"))
	dest := filepath.Join(t.TempDir(), "installer.exe")
	var lastPercent int
	if err := u.downloadFile(server.URL, dest, func(p int) { lastPercent = p }); err != nil {
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

	u := New("v0.1.0", filepath.Join(t.TempDir(), "settings.json"))
	dest := filepath.Join(t.TempDir(), "installer.exe")
	if err := u.downloadFile(server.URL, dest, nil); err == nil {
		t.Fatal("expected error")
	}
}
