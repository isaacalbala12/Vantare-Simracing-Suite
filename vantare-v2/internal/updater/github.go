package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"time"
)

const githubReleasesURL = "https://api.github.com/repos/isaacalbala12/Vantare-Simracing-Suite/releases"

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

// releasesPerPage is what each request asks GitHub for. The API caps it at 100
// and defaults to 30 — the default was the whole problem: with a nightly a day,
// 30 releases are barely a month of history, so any release older than that
// simply stopped existing for the updater.
const releasesPerPage = 100

// maxReleasePages bounds the walk. At 100 per page it covers a thousand
// releases, far past anything this product will publish, and it means a broken
// or hostile `Link` header cannot spin the loop forever.
const maxReleasePages = 10

// linkNextRE extracts the `next` URL from a GitHub `Link` header, which looks
// like `<https://…&page=2>; rel="next", <https://…&page=5>; rel="last"`.
var linkNextRE = regexp.MustCompile(`<([^>]+)>\s*;\s*rel="next"`)

// withPerPage adds the page size without trampling whatever query the URL
// already carries: VANTARE_RELEASES_URL can point at a fixture with its own.
func withPerPage(rawURL string, perPage int) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	query := parsed.Query()
	query.Set("per_page", strconv.Itoa(perPage))
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func nextPageURL(linkHeader string) string {
	match := linkNextRE.FindStringSubmatch(linkHeader)
	if match == nil {
		return ""
	}
	return match[1]
}

// resolveNextPage turns the `next` link into the URL to fetch, or "" to stop.
//
// GitHub sends it absolute, but a relative one is still a legal Link, so it is
// resolved against the page it came from. It must stay on the same host: the
// walk exists to read more of the same endpoint, and following a redirect to
// somewhere else is not something a release list gets to ask for.
func resolveNextPage(current, next string) string {
	if next == "" {
		return ""
	}
	base, err := url.Parse(current)
	if err != nil {
		return ""
	}
	target, err := base.Parse(next)
	if err != nil {
		return ""
	}
	if target.Host != base.Host || target.Scheme != base.Scheme {
		return ""
	}
	return target.String()
}

// listReleasesURL walks every page of the releases endpoint.
//
// A single request returns at most one page, and the client used to keep only
// that first one. The releases a user needs are not always recent: somebody who
// has not opened the app in a month sits behind a wall of nightlies, and the
// stable release they should be offered had already fallen off the page.
func listReleasesURL(ctx context.Context, client *http.Client, rawURL string) ([]Release, error) {
	if client == nil {
		client = http.DefaultClient
	}

	var all []Release
	next := withPerPage(rawURL, releasesPerPage)
	for page := 0; next != "" && page < maxReleasePages; page++ {
		releases, link, err := fetchReleasePage(ctx, client, next)
		if err != nil {
			return nil, err
		}
		all = append(all, releases...)
		if len(releases) == 0 {
			break
		}
		next = resolveNextPage(next, nextPageURL(link))
	}
	return all, nil
}

func fetchReleasePage(ctx context.Context, client *http.Client, url string) ([]Release, string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Vantare-Overlays-Updater")

	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
			return nil, "", fmt.Errorf("github api rate limit or access denied (%d)", resp.StatusCode)
		}
		return nil, "", fmt.Errorf("github api returned %d", resp.StatusCode)
	}

	var releases []Release
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, "", err
	}
	return releases, resp.Header.Get("Link"), nil
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
