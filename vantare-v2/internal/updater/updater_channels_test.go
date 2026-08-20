package updater

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Per-channel summary (ISA-368): the Settings cards need the latest release of
// EVERY channel, not only the ones the configured channel lets through.

const mixedChannelReleases = `[
	{"tag_name":"v0.1.0.7-nightly.11","prerelease":true,"published_at":"2026-06-05T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/n11.exe"}]},
	{"tag_name":"v0.1.0.7-nightly.9","prerelease":true,"published_at":"2026-06-04T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/n9.exe"}]},
	{"tag_name":"v0.1.0.7-testers.1","prerelease":true,"published_at":"2026-06-03T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/t1.exe"}]},
	{"tag_name":"v0.1.0.2","prerelease":false,"published_at":"2026-06-02T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/s2.exe"}]},
	{"tag_name":"v0.1.0.8-prealpha","prerelease":true,"published_at":"2026-06-06T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/pa.exe"}]}
]`

func serveReleases(t *testing.T, body string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	return server
}

func TestCheckSummarizesEveryChannelRegardlessOfConfiguredChannel(t *testing.T) {
	server := serveReleases(t, mixedChannelReleases)
	u := newTestUpdater(t, "v0.1.0.1")
	u.releasesURL = server.URL

	// The user is on Stable: Releases must stay filtered, but the summary must
	// still carry the testers and nightly releases for the cards.
	info, err := u.Check(&Settings{Channel: ChannelStable})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if len(info.Releases) != 1 || info.Releases[0].TagName != "v0.1.0.2" {
		t.Fatalf("stable releases=%v, want only v0.1.0.2", info.Releases)
	}
	if info.LatestVersion != "v0.1.0.2" {
		t.Fatalf("latestVersion=%q, want v0.1.0.2", info.LatestVersion)
	}
	if info.Channels == nil {
		t.Fatal("channels summary is nil")
	}
	if info.Channels.Stable == nil || info.Channels.Stable.TagName != "v0.1.0.2" {
		t.Fatalf("channels.stable=%v, want v0.1.0.2", info.Channels.Stable)
	}
	if info.Channels.Testers == nil || info.Channels.Testers.TagName != "v0.1.0.7-testers.1" {
		t.Fatalf("channels.testers=%v, want v0.1.0.7-testers.1", info.Channels.Testers)
	}
	// Newest nightly wins, and a nightly never lands on the testers slot.
	if info.Channels.Nightly == nil || info.Channels.Nightly.TagName != "v0.1.0.7-nightly.11" {
		t.Fatalf("channels.nightly=%v, want v0.1.0.7-nightly.11", info.Channels.Nightly)
	}
}

func TestCheckChannelSummaryOmitsChannelsWithoutRelease(t *testing.T) {
	server := serveReleases(t, `[
		{"tag_name":"v0.1.0.2","prerelease":false,"published_at":"2026-06-02T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/s2.exe"}]}
	]`)
	u := newTestUpdater(t, "v0.1.0.1")
	u.releasesURL = server.URL

	info, err := u.Check(&Settings{Channel: ChannelNightly})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if info.Channels == nil || info.Channels.Stable == nil {
		t.Fatal("channels.stable missing")
	}
	if info.Channels.Testers != nil || info.Channels.Nightly != nil {
		t.Fatalf("empty channels should be absent, got testers=%v nightly=%v", info.Channels.Testers, info.Channels.Nightly)
	}
}

func TestCheckChannelSummaryIgnoresUnmarkedPrereleases(t *testing.T) {
	server := serveReleases(t, `[
		{"tag_name":"v0.1.0.8-prealpha","prerelease":true,"published_at":"2026-06-06T00:00:00Z","assets":[{"name":"vantare-amd64-installer.exe","size":100,"browser_download_url":"https://example.com/pa.exe"}]}
	]`)
	u := newTestUpdater(t, "v0.1.0.1")
	u.releasesURL = server.URL

	info, err := u.Check(&Settings{Channel: ChannelNightly})
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if info.Channels == nil {
		t.Fatal("channels summary is nil")
	}
	if info.Channels.Stable != nil || info.Channels.Testers != nil || info.Channels.Nightly != nil {
		t.Fatalf("unmarked prerelease must belong to no channel, got %+v", info.Channels)
	}
}

func TestCheckChannelSummaryIsNilWhenThrottled(t *testing.T) {
	server := serveReleases(t, mixedChannelReleases)
	u := newTestUpdater(t, "v0.1.0.1")
	u.releasesURL = server.URL

	settings := &Settings{Channel: ChannelStable, LastCheckAt: time.Now().UTC()}
	info, err := u.Check(settings)
	if err != nil {
		t.Fatalf("check error: %v", err)
	}
	if !info.Throttled {
		t.Fatal("expected throttled check")
	}
	if info.Channels != nil {
		t.Fatalf("throttled check must not invent a summary, got %+v", info.Channels)
	}
}
