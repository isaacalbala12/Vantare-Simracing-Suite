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
//
// A file that does not parse is set aside and the defaults take over. It used
// to return the error instead, and that error had nowhere to go: every update
// check failed on it, on every launch, with no way back except deleting the
// file by hand. Losing a channel preference is a small price; never checking
// for updates again is not.
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
		// Se conserva el fichero ilegible por si hace falta mirarlo, pero fuera
		// del camino: el siguiente guardado escribe uno limpio.
		_ = os.Rename(path, path+".corrupt")
		return DefaultSettings(), nil
	}
	s.Channel = NormalizeChannel(s.Channel)
	return &s, nil
}

// SaveSettings persists updater settings to disk.
//
// Se escribe a un temporal y se renombra encima. `os.WriteFile` truncaba el
// fichero antes de escribirlo, asi que un corte a mitad dejaba un JSON
// incompleto: justo la entrada del fallo que LoadSettings tiene que remendar.
func SaveSettings(path string, s *Settings) error {
	s.Channel = NormalizeChannel(s.Channel)
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() {
		// Si algo fallo antes del Rename, el temporal no puede quedarse ahi.
		_ = os.Remove(tmpName)
	}()

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	// El contenido tiene que estar en disco antes de que el rename lo publique:
	// sin esto un corte de luz puede dejar visible un fichero vacio.
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, 0644); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}
