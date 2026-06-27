package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// checkCooldown is the minimum time between automatic update checks.
const checkCooldown = 15 * time.Minute

// Updater checks, downloads and installs Vantare releases from GitHub.
type Updater struct {
	httpClient     *http.Client
	settingsPath   string
	currentVersion string
	releasesURL    string
}

// New creates an Updater for the given current version and settings path.
func New(currentVersion, settingsPath string) (*Updater, error) {
	releasesURL, err := releasesURL()
	if err != nil {
		return nil, err
	}
	return &Updater{
		httpClient:     &http.Client{Timeout: 30 * time.Second},
		settingsPath:   settingsPath,
		currentVersion: currentVersion,
		releasesURL:    releasesURL,
	}, nil
}

// CurrentVersion returns the running version.
func (u *Updater) CurrentVersion() string { return u.currentVersion }

// updateDir returns a persistent directory where the installer is stored.
func (u *Updater) updateDir() (string, error) {
	cfgDir := filepath.Dir(u.settingsPath)
	return filepath.Join(cfgDir, "update"), nil
}

// SettingsPath returns the path where updater settings are stored.
func (u *Updater) SettingsPath() string { return u.settingsPath }

// ListAvailable returns releases matching the user's channel that have an installer.
func (u *Updater) ListAvailable(settings *Settings) ([]Release, error) {
	return u.ListAvailableCtx(context.Background(), settings)
}

// ListAvailableCtx returns releases matching the user's channel that have an installer.
func (u *Updater) ListAvailableCtx(ctx context.Context, settings *Settings) ([]Release, error) {
	releases, err := listReleasesURL(ctx, u.httpClient, u.releasesURL)
	if err != nil {
		return nil, err
	}
	var out []Release
	for _, r := range releases {
		if settings.Channel == ChannelStable && r.Prerelease {
			continue
		}
		if FindInstaller(r) == nil {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

// UpdateInfo is the result of checking for updates.
type UpdateInfo struct {
	CurrentVersion string    `json:"currentVersion"`
	LatestVersion  string    `json:"latestVersion,omitempty"`
	LatestRelease  Release   `json:"latestRelease,omitempty"`
	HasUpdate      bool      `json:"hasUpdate"`
	IsDowngrade    bool      `json:"isDowngrade"`
	Releases       []Release `json:"releases,omitempty"`
	IgnoredVersion string    `json:"ignoredVersion,omitempty"`
	Throttled      bool      `json:"throttled"`
}

// Check fetches available releases and compares with the current version.
// Automatic checks respect the configured cooldown; use CheckManual to force a check.
func (u *Updater) Check(settings *Settings) (*UpdateInfo, error) {
	return u.checkInternal(context.Background(), settings, false)
}

// CheckCtx is like Check but accepts a context.
func (u *Updater) CheckCtx(ctx context.Context, settings *Settings) (*UpdateInfo, error) {
	return u.checkInternal(ctx, settings, false)
}

// CheckManual forces an update check, ignoring the cooldown.
func (u *Updater) CheckManual(settings *Settings) (*UpdateInfo, error) {
	return u.checkInternal(context.Background(), settings, true)
}

// CheckManualCtx is like CheckManual but accepts a context.
func (u *Updater) CheckManualCtx(ctx context.Context, settings *Settings) (*UpdateInfo, error) {
	return u.checkInternal(ctx, settings, true)
}

func (u *Updater) checkInternal(ctx context.Context, settings *Settings, manual bool) (*UpdateInfo, error) {
	if !manual && !settings.LastCheckAt.IsZero() && time.Since(settings.LastCheckAt) < checkCooldown {
		return &UpdateInfo{
			CurrentVersion: u.currentVersion,
			IgnoredVersion: settings.IgnoreVersion,
			Throttled:      true,
		}, nil
	}

	releases, err := u.ListAvailableCtx(ctx, settings)
	if err != nil {
		return nil, err
	}
	settings.LastCheckAt = time.Now().UTC()
	if len(releases) == 0 {
		return &UpdateInfo{
			CurrentVersion: u.currentVersion,
			IgnoredVersion: settings.IgnoreVersion,
		}, nil
	}
	latest := releases[0]
	current := ParseVersion(u.currentVersion)
	selected := ParseVersion(latest.TagName)
	cmp := selected.Compare(current)
	isDowngrade := cmp < 0
	hasUpdate := cmp > 0
	if settings.IgnoreVersion != "" {
		ignored := ParseVersion(settings.IgnoreVersion)
		if selected.Compare(ignored) == 0 {
			hasUpdate = false
		}
	}
	return &UpdateInfo{
		CurrentVersion: u.currentVersion,
		LatestVersion:  latest.TagName,
		LatestRelease:  latest,
		HasUpdate:      hasUpdate,
		IsDowngrade:    isDowngrade,
		Releases:       releases,
		IgnoredVersion: settings.IgnoreVersion,
	}, nil
}

// Install downloads the installer for the given release and runs it.
// The installer is responsible for closing the running app.
func (u *Updater) Install(tag, downloadURL string, progress func(percent int)) error {
	return u.InstallCtx(context.Background(), tag, downloadURL, progress)
}

// InstallCtx is like Install but accepts a context.
func (u *Updater) InstallCtx(ctx context.Context, tag, downloadURL string, progress func(percent int)) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("auto-install only supported on windows")
	}
	if tag == "" || downloadURL == "" {
		return fmt.Errorf("tag and downloadURL are required")
	}

	updateDir, err := u.updateDir()
	if err != nil {
		return fmt.Errorf("update directory: %w", err)
	}
	if err := os.RemoveAll(updateDir); err != nil {
		return fmt.Errorf("cleanup update dir: %w", err)
	}
	if err := os.MkdirAll(updateDir, 0755); err != nil {
		return fmt.Errorf("create update dir: %w", err)
	}

	installerPath := filepath.Join(updateDir, "vantare-installer.exe")
	if progress != nil {
		progress(0)
	}
	if err := u.downloadFile(ctx, downloadURL, installerPath, progress); err != nil {
		return fmt.Errorf("download failed: %w", err)
	}

	cmd := exec.Command(installerPath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start installer: %w", err)
	}
	return nil
}

// InstallVerified downloads the installer and its SHA256 checksum when available,
// verifies the hash, and then runs the installer.
func (u *Updater) InstallVerified(release Release, progress func(percent int)) error {
	return u.InstallVerifiedCtx(context.Background(), release, progress)
}

// InstallVerifiedCtx is like InstallVerified but accepts a context.
func (u *Updater) InstallVerifiedCtx(ctx context.Context, release Release, progress func(percent int)) error {
	installer := FindInstaller(release)
	if installer == nil {
		return fmt.Errorf("release %s has no installer asset", release.TagName)
	}

	checksum := FindChecksumAsset(release)
	if checksum == nil {
		return fmt.Errorf("release %s has no checksum asset; refusing to install", release.TagName)
	}

	// Persist installer in a known location so it is not deleted while running.
	updateDir, err := u.updateDir()
	if err != nil {
		return fmt.Errorf("update directory: %w", err)
	}
	if err := os.RemoveAll(updateDir); err != nil {
		return fmt.Errorf("cleanup update dir: %w", err)
	}
	if err := os.MkdirAll(updateDir, 0755); err != nil {
		return fmt.Errorf("create update dir: %w", err)
	}

	installerPath := filepath.Join(updateDir, "vantare-installer.exe")
	if progress != nil {
		progress(0)
	}
	if err := u.downloadFile(ctx, installer.DownloadURL, installerPath, progress); err != nil {
		return fmt.Errorf("download failed: %w", err)
	}

	if err := u.verifyChecksum(ctx, installerPath, checksum.DownloadURL); err != nil {
		_ = os.Remove(installerPath)
		return fmt.Errorf("checksum verification failed: %w", err)
	}

	cmd := exec.Command(installerPath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start installer: %w", err)
	}
	// Do NOT wait or remove the installer here. The installer is self-contained
	// and will replace the current executable then relaunch the app.
	return nil
}

func (u *Updater) verifyChecksum(ctx context.Context, filePath, checksumURL string) error {
	expected, err := u.fetchChecksum(ctx, checksumURL)
	if err != nil {
		return err
	}
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	got := hex.EncodeToString(h.Sum(nil))
	if !strings.EqualFold(got, expected) {
		return fmt.Errorf("hash mismatch: got %s, want %s", got, expected)
	}
	return nil
}

func (u *Updater) fetchChecksum(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}
	resp, err := u.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("http %d", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	parts := strings.Fields(string(data))
	if len(parts) == 0 {
		return "", fmt.Errorf("empty checksum file")
	}
	hash := parts[0]
	if len(hash) != 64 {
		return "", fmt.Errorf("invalid checksum length: got %d, want 64", len(hash))
	}
	return hash, nil
}

func (u *Updater) downloadFile(ctx context.Context, url, dest string, progress func(int)) (err error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}
	resp, err := u.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("http %d", resp.StatusCode)
	}

	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer func() {
		closeErr := f.Close()
		if err == nil {
			err = closeErr
		}
		if err != nil {
			_ = os.Remove(dest)
		}
	}()

	total := resp.ContentLength
	var written int64
	buf := make([]byte, 64*1024)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				return werr
			}
			written += int64(n)
			if total > 0 && progress != nil {
				progress(int(written * 100 / total))
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}
	return nil
}
