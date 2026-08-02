package license

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// LicenseCache persists only the server-signed envelope. Runtime state and
// entitlements are always re-derived after signature and policy validation.
type LicenseCache struct {
	mu   sync.RWMutex
	path string
}

func NewLicenseCache(path string) *LicenseCache { return &LicenseCache{path: path} }
func (c *LicenseCache) Path() string            { return c.path }

func (c *LicenseCache) Read() (*OfflineCredential, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	data, err := os.ReadFile(c.path)
	if err != nil {
		return nil, err
	}
	var shape map[string]json.RawMessage
	if err := json.Unmarshal(data, &shape); err != nil {
		return nil, fmt.Errorf("parsing license cache: %w", err)
	}
	for _, legacy := range []string{"state", "entitlements", "expires_at", "updated_at"} {
		if _, exists := shape[legacy]; exists {
			return nil, ErrLegacyCache
		}
	}
	var credential OfflineCredential
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&credential); err != nil {
		return nil, fmt.Errorf("parsing signed license cache: %w", err)
	}
	return &credential, nil
}

func (c *LicenseCache) Write(credential *OfflineCredential) error {
	if credential == nil {
		return ErrInvalidCredential
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	data, err := json.MarshalIndent(credential, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding license cache: %w", err)
	}
	dir := filepath.Dir(c.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("creating cache directory: %w", err)
	}
	tmpFile, err := os.CreateTemp(dir, "license-cache-*.tmp")
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpPath)
	}()
	if err := tmpFile.Chmod(0600); err != nil {
		return fmt.Errorf("chmod temp file: %w", err)
	}
	if _, err := tmpFile.Write(data); err != nil {
		return fmt.Errorf("writing temp file: %w", err)
	}
	if err := tmpFile.Sync(); err != nil {
		return fmt.Errorf("syncing temp file: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("closing temp file: %w", err)
	}
	if err := os.Rename(tmpPath, c.path); err != nil {
		return fmt.Errorf("renaming temp file: %w", err)
	}
	return nil
}
