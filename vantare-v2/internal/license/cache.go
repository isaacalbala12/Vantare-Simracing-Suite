package license

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// cachedLicense is the JSON shape persisted to {cfgDir}/license-cache.json.
type cachedLicense struct {
	State        State         `json:"state"`
	Entitlements []Entitlement `json:"entitlements"`
	ExpiresAt    *time.Time    `json:"expires_at,omitempty"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

// LicenseCache is the public local cache for the last known license state.
// It is intentionally minimal and stores nothing user-identifying beyond what
// is needed to gate the runtime during the offline grace window.
type LicenseCache struct {
	path string
}

// NewLicenseCache creates a cache bound to the given JSON file path. The path
// is not created here; the caller is expected to point at the same file the
// LicenseService will use.
func NewLicenseCache(path string) *LicenseCache {
	return &LicenseCache{path: path}
}

// Path returns the absolute or relative path used to persist the cache.
func (c *LicenseCache) Path() string {
	return c.path
}

// Read returns the cached license data. Returns os.ErrNotExist wrapped if the
// cache file is missing. Returns the parsed state, entitlements and expiration.
func (c *LicenseCache) Read() (State, []Entitlement, *time.Time, error) {
	data, err := os.ReadFile(c.path)
	if err != nil {
		return "", nil, nil, err
	}
	var cl cachedLicense
	if err := json.Unmarshal(data, &cl); err != nil {
		return "", nil, nil, fmt.Errorf("parsing cache: %w", err)
	}
	return cl.State, cl.Entitlements, cl.ExpiresAt, nil
}

// Write persists the license data to disk with 0600 permissions. The updated
// timestamp is set internally to the current UTC time.
func (c *LicenseCache) Write(state State, entitlements []Entitlement, expiresAt *time.Time) error {
	cl := cachedLicense{
		State:        state,
		Entitlements: entitlements,
		ExpiresAt:    expiresAt,
		UpdatedAt:    time.Now().UTC(),
	}
	data, err := json.MarshalIndent(cl, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding cache: %w", err)
	}
	if err := os.WriteFile(c.path, data, 0600); err != nil {
		return fmt.Errorf("writing cache: %w", err)
	}
	return nil
}

// UpdatedAt returns the time the cache was last written. Returns the zero time
// if the cache file is missing or unreadable.
func (c *LicenseCache) UpdatedAt() time.Time {
	data, err := os.ReadFile(c.path)
	if err != nil {
		return time.Time{}
	}
	var cl cachedLicense
	if err := json.Unmarshal(data, &cl); err != nil {
		return time.Time{}
	}
	return cl.UpdatedAt
}
