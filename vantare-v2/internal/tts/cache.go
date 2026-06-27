package tts

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ErrProviderNotConfigured is returned by Engine.SynthOrCache when no provider
// is registered and the cache misses.
var ErrProviderNotConfigured = errors.New("tts: no provider configured")

// Cache stores synthesized audio files under a per-provider root directory.
// The key is derived from (language, voice, text) so identical requests hit
// the same file.
type Cache struct {
	root     string
	provider string
}

// NewCache creates a Cache rooted at root/<provider>/. The directory is
// created if it doesn't exist.
func NewCache(root, provider string) (*Cache, error) {
	if root == "" {
		return nil, errors.New("tts: cache root required")
	}
	if provider == "" {
		return nil, errors.New("tts: provider name required")
	}
	dir := filepath.Join(root, provider)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("tts: create cache dir: %w", err)
	}
	return &Cache{root: dir, provider: provider}, nil
}

// Root returns the directory where cached files live.
func (c *Cache) Root() string { return c.root }

// Key produces a deterministic hex-encoded SHA-256 key for the request triple.
func (c *Cache) Key(language, voice, text string) string {
	h := sha256.Sum256([]byte(language + "\x00" + voice + "\x00" + text))
	return hex.EncodeToString(h[:])
}

// Path returns the absolute path where the cached file for key would live.
func (c *Cache) Path(key string) string {
	return filepath.Join(c.root, key+".mp3")
}

// Has returns true if a cached file exists for the given key.
func (c *Cache) Has(key string) bool {
	if key == "" {
		return false
	}
	_, err := os.Stat(c.Path(key))
	return err == nil
}

// Get returns the path of a cached file, or "" if missing.
func (c *Cache) Get(key string) string {
	if c.Has(key) {
		return c.Path(key)
	}
	return ""
}

// Put copies srcPath into the cache under key. Returns the absolute destination path.
func (c *Cache) Put(key, srcPath string) (string, error) {
	if key == "" {
		return "", errors.New("tts: empty cache key")
	}
	dst := c.Path(key)
	// Atomic write: tmp file + rename to avoid readers seeing a partial file.
	tmp, err := os.CreateTemp(c.root, "tmp-*.mp3")
	if err != nil {
		return "", fmt.Errorf("tts: create tmp: %w", err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }() // best-effort cleanup if rename fails

	data, err := os.ReadFile(srcPath)
	if err != nil {
		_ = tmp.Close()
		return "", fmt.Errorf("tts: read source: %w", err)
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return "", fmt.Errorf("tts: write tmp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return "", fmt.Errorf("tts: close tmp: %w", err)
	}
	if err := os.Rename(tmpName, dst); err != nil {
		return "", fmt.Errorf("tts: rename: %w", err)
	}
	return dst, nil
}

// DefaultCacheRoot returns the platform-default cache root for Vantare:
// %APPDATA%\Vantare\Ingeniero\tts-cache on Windows, $XDG_CACHE_HOME or
// $HOME/.cache on other platforms. Empty string if no home is available.
func DefaultCacheRoot() string {
	if appdata := os.Getenv("APPDATA"); appdata != "" {
		return filepath.Join(appdata, "Vantare", "Ingeniero", "tts-cache")
	}
	if home := userHomeDir(); home != "" {
		return filepath.Join(home, ".cache", "vantare", "tts-cache")
	}
	return ""
}

// userHomeDir returns HOME or USERPROFILE without importing os/user (avoids
// the cgo dependency on some platforms).
func userHomeDir() string {
	if h := os.Getenv("HOME"); h != "" && !strings.ContainsRune(h, 0) {
		return h
	}
	if h := os.Getenv("USERPROFILE"); h != "" && !strings.ContainsRune(h, 0) {
		return h
	}
	return ""
}