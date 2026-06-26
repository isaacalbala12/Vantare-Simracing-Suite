package license

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"runtime"
)

// MachineFingerprint returns a stable, non-invasive device identifier hash.
// On Windows it tries the registry MachineGuid first; on any other OS or on
// registry failure it falls back to a hash of the user home directory and
// runtime.GOOS. The result is suitable for sending to Supabase as a stable
// per-device token but it is not stored locally as a secret.
func MachineFingerprint() (string, error) {
	switch runtime.GOOS {
	case "windows":
		guid, err := readMachineGUID()
		if err == nil && guid != "" {
			return hashFingerprint(guid), nil
		}
		return fallbackFingerprint()
	default:
		return fallbackFingerprint()
	}
}

// readMachineGUID reads the Windows MachineGuid from HKLM. It is wrapped in a
// build-tag-free helper and falls back to an error so the rest of the package
// stays cross-platform. The actual registry call lives in a sibling file that
// is only compiled on Windows.
func readMachineGUID() (string, error) {
	guid, err := readMachineGUIDPlatform()
	if err != nil {
		return "", fmt.Errorf("reading machine guid: %w", err)
	}
	if guid == "" {
		return "", fmt.Errorf("empty machine guid")
	}
	return guid, nil
}

func fallbackFingerprint() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("user home dir: %w", err)
	}
	return hashFingerprint(home + "|" + runtime.GOOS), nil
}

func hashFingerprint(input string) string {
	h := sha256.Sum256([]byte(input))
	return hex.EncodeToString(h[:])
}
