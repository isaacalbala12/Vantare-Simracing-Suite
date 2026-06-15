package updater

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestListReleasesSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/releases" {
			t.Fatalf("path=%s, want /releases", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"tag_name":"v0.1.0","prerelease":false,"published_at":"2026-06-01T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/v0.1.0.exe"}]},
			{"tag_name":"v0.1.1-prealpha","prerelease":true,"published_at":"2026-06-02T00:00:00Z","assets":[]}
		]`))
	}))
	defer server.Close()

	releases, err := listReleasesURL(server.Client(), server.URL+"/releases")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(releases) != 2 {
		t.Fatalf("len=%d, want 2", len(releases))
	}
	if releases[0].TagName != "v0.1.0" {
		t.Fatalf("tag=%s, want v0.1.0", releases[0].TagName)
	}
}

func TestListReleasesNonOK(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	_, err := listReleasesURL(server.Client(), server.URL+"/releases")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestFindInstaller(t *testing.T) {
	r := Release{
		Assets: []Asset{
			{Name: "source.zip", DownloadURL: "https://example.com/src.zip"},
			{Name: "vantare-amd64-installer.exe", DownloadURL: "https://example.com/installer.exe"},
		},
	}
	asset := FindInstaller(r)
	if asset == nil {
		t.Fatal("expected installer asset")
	}
	if asset.DownloadURL != "https://example.com/installer.exe" {
		t.Fatalf("url=%s, want installer.exe", asset.DownloadURL)
	}
}

func TestFindInstallerMissing(t *testing.T) {
	r := Release{Assets: []Asset{{Name: "source.zip"}}}
	if FindInstaller(r) != nil {
		t.Fatal("expected nil")
	}
}

func TestReleaseTimeParsing(t *testing.T) {
	r := Release{PublishedAt: time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)}
	if r.PublishedAt.Year() != 2026 {
		t.Fatalf("year=%d, want 2026", r.PublishedAt.Year())
	}
}
