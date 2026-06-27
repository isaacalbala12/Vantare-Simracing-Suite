package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"
)

const githubReleasesURL = "https://api.github.com/repos/isaacalbala12/Vantare-Overlays/releases"

// Release represents a GitHub release.
type Release struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	Prerelease  bool      `json:"prerelease"`
	PublishedAt time.Time `json:"published_at"`
	HTMLURL     string    `json:"html_url"`
	Assets      []Asset   `json:"assets"`
}

// Asset represents a release asset.
type Asset struct {
	Name        string `json:"name"`
	Size        int    `json:"size"`
	DownloadURL string `json:"browser_download_url"`
}

// releasesURL returns the configured releases endpoint.
// It uses VANTARE_RELEASES_URL when set, otherwise the official GitHub Releases API.
// Only http and https schemes are accepted and the host must not be empty.
func releasesURL() (string, error) {
	override := os.Getenv("VANTARE_RELEASES_URL")
	if override == "" {
		return githubReleasesURL, nil
	}
	u, err := url.Parse(override)
	if err != nil {
		return "", fmt.Errorf("invalid VANTARE_RELEASES_URL %q: %w", override, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("invalid VANTARE_RELEASES_URL %q: scheme %q not allowed (only http/https)", override, u.Scheme)
	}
	if u.Host == "" {
		return "", fmt.Errorf("invalid VANTARE_RELEASES_URL %q: host is required", override)
	}
	return u.String(), nil
}

// ListReleases fetches public releases from the GitHub API.
func ListReleases(ctx context.Context, client *http.Client) ([]Release, error) {
	return listReleasesURL(ctx, client, githubReleasesURL)
}

func listReleasesURL(ctx context.Context, client *http.Client, url string) ([]Release, error) {
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Vantare-Overlays-Updater")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
			return nil, fmt.Errorf("github api rate limit or access denied (%d)", resp.StatusCode)
		}
		return nil, fmt.Errorf("github api returned %d", resp.StatusCode)
	}

	var releases []Release
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, err
	}
	return releases, nil
}

// FindInstaller returns the Windows amd64 installer asset for a release.
func FindInstaller(release Release) *Asset {
	for _, a := range release.Assets {
		if a.Name == "vantare-amd64-installer.exe" {
			return &a
		}
	}
	return nil
}

// FindChecksumAsset returns the SHA256 checksum asset for a release if present.
func FindChecksumAsset(release Release) *Asset {
	for _, a := range release.Assets {
		if a.Name == "vantare-amd64-installer.exe.sha256" {
			return &a
		}
	}
	return nil
}
