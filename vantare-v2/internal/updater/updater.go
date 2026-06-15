package updater

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// Updater checks, downloads and installs Vantare releases from GitHub.
type Updater struct {
	httpClient     *http.Client
	settingsPath   string
	currentVersion string
	releasesURL    string
}

// New creates an Updater for the given current version and settings path.
func New(currentVersion, settingsPath string) *Updater {
	return &Updater{
		httpClient:     &http.Client{Timeout: 30 * time.Second},
		settingsPath:   settingsPath,
		currentVersion: currentVersion,
		releasesURL:    githubReleasesURL,
	}
}

// CurrentVersion returns the running version.
func (u *Updater) CurrentVersion() string { return u.currentVersion }

// SettingsPath returns the path where updater settings are stored.
func (u *Updater) SettingsPath() string { return u.settingsPath }

// ListAvailable returns releases matching the user's channel that have an installer.
func (u *Updater) ListAvailable(settings *Settings) ([]Release, error) {
	releases, err := listReleasesURL(u.httpClient, u.releasesURL)
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
	Releases       []Release `json:"releases,omitempty"`
}

// Check fetches available releases and compares with the current version.
func (u *Updater) Check(settings *Settings) (*UpdateInfo, error) {
	releases, err := u.ListAvailable(settings)
	if err != nil {
		return nil, err
	}
	if len(releases) == 0 {
		return &UpdateInfo{CurrentVersion: u.currentVersion}, nil
	}
	latest := releases[0]
	return &UpdateInfo{
		CurrentVersion: u.currentVersion,
		LatestVersion:  latest.TagName,
		LatestRelease:  latest,
		HasUpdate:      latest.TagName != u.currentVersion,
		Releases:       releases,
	}, nil
}

// Install downloads the installer for the given release and runs it.
// The installer is responsible for closing the running app.
func (u *Updater) Install(tag, downloadURL string, progress func(percent int)) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("auto-install only supported on windows")
	}
	if tag == "" || downloadURL == "" {
		return fmt.Errorf("tag and downloadURL are required")
	}
	tmpDir, err := os.MkdirTemp("", "vantare-update-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)

	installerPath := filepath.Join(tmpDir, "vantare-installer.exe")
	if progress != nil {
		progress(0)
	}
	if err := u.downloadFile(downloadURL, installerPath, progress); err != nil {
		return fmt.Errorf("download failed: %w", err)
	}

	cmd := exec.Command(installerPath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start installer: %w", err)
	}
	return nil
}

func (u *Updater) downloadFile(url, dest string, progress func(int)) error {
	resp, err := u.httpClient.Get(url)
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
	defer f.Close()

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
