package updater

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
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

	releases, err := listReleasesURL(context.Background(), server.Client(), server.URL+"/releases")
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

	_, err := listReleasesURL(context.Background(), server.Client(), server.URL+"/releases")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "rate limit") {
		t.Fatalf("expected rate limit hint, got %v", err)
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

func TestReleasesURLDefaultsToGitHub(t *testing.T) {
	t.Setenv("VANTARE_RELEASES_URL", "")
	url, err := releasesURL()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if url != githubReleasesURL {
		t.Fatalf("url=%s, want %s", url, githubReleasesURL)
	}
}

func TestReleasesURLOverrideValid(t *testing.T) {
	override := "https://example.com/custom/releases"
	t.Setenv("VANTARE_RELEASES_URL", override)
	url, err := releasesURL()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if url != override {
		t.Fatalf("url=%s, want %s", url, override)
	}
}

func TestReleasesURLRejectsInvalidScheme(t *testing.T) {
	tests := []string{
		"file:///etc/passwd",
		"gopher://example.com",
		"ftp://example.com",
		"relative/path/to/releases",
	}
	for _, tc := range tests {
		t.Run(tc, func(t *testing.T) {
			t.Setenv("VANTARE_RELEASES_URL", tc)
			_, err := releasesURL()
			if err == nil {
				t.Fatal("expected error for invalid URL")
			}
			if !strings.Contains(err.Error(), "scheme") && !strings.Contains(err.Error(), "host") {
				t.Fatalf("expected scheme/host error, got %v", err)
			}
		})
	}
}

func TestReleasesURLRejectsEmptyHost(t *testing.T) {
	t.Setenv("VANTARE_RELEASES_URL", "https://")
	_, err := releasesURL()
	if err == nil {
		t.Fatal("expected error for empty host")
	}
	if !strings.Contains(err.Error(), "host") {
		t.Fatalf("expected host error, got %v", err)
	}
}

func TestNewRejectsInvalidReleasesURL(t *testing.T) {
	t.Setenv("VANTARE_RELEASES_URL", "file:///etc/passwd")
	_, err := New("v0.1.0", filepath.Join(t.TempDir(), "settings.json"))
	if err == nil {
		t.Fatal("expected New to fail with invalid VANTARE_RELEASES_URL")
	}
}
