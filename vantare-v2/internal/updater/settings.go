package updater

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// Channel selects which GitHub releases are visible.
type Channel string

const (
	ChannelStable     Channel = "stable"
	ChannelPrerelease Channel = "prerelease"
)

// Settings stores updater preferences.
type Settings struct {
	Channel       Channel   `json:"channel"`
	IgnoreVersion string    `json:"ignoreVersion,omitempty"`
	LastCheckAt   time.Time `json:"lastCheckAt,omitempty"`
}

// DefaultSettings returns stable channel defaults.
func DefaultSettings() *Settings {
	return &Settings{Channel: ChannelStable}
}

// LoadSettings reads updater settings from disk.
func LoadSettings(path string) (*Settings, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return DefaultSettings(), nil
		}
		return nil, err
	}
	var s Settings
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	if s.Channel == "" {
		s.Channel = ChannelStable
	}
	return &s, nil
}

// SaveSettings persists updater settings to disk.
func SaveSettings(path string, s *Settings) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
