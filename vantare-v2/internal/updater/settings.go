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
	ChannelStable  Channel = "stable"
	ChannelTesters Channel = "testers"
	ChannelNightly Channel = "nightly"
	// ChannelPrerelease is retained only to load old local settings. New UI and
	// authorization code must use the explicit Testers/Nightly channels.
	ChannelPrerelease Channel = "prerelease"
)

func NormalizeChannel(channel Channel) Channel {
	switch channel {
	case ChannelStable, ChannelTesters, ChannelNightly:
		return channel
	case ChannelPrerelease:
		return ChannelStable
	default:
		return ChannelStable
	}
}

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
	s.Channel = NormalizeChannel(s.Channel)
	return &s, nil
}

// SaveSettings persists updater settings to disk.
func SaveSettings(path string, s *Settings) error {
	s.Channel = NormalizeChannel(s.Channel)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
