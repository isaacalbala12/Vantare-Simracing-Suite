package updater

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const githubReleasesURL = "https://api.github.com/repos/isaacalbala12/Vantare-Overlays/releases"

// Release represents a GitHub release.
type Release struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
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
// ListReleases fetches public releases from the GitHub API.
func ListReleases(client *http.Client) ([]Release, error) {
	return listReleasesURL(client, githubReleasesURL)
}

func listReleasesURL(client *http.Client, url string) ([]Release, error) {
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequest("GET", url, nil)
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
