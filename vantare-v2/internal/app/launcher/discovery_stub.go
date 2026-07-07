//go:build !windows

package launcher

import (
	"github.com/vantare/overlays/v2/internal/app"
)

// discoverPlatform returns no detected apps on non-Windows platforms. Discover
// still guarantees LMU is present (steam-uri) and may be extended later.
func discoverPlatform() map[string]app.LauncherAppEntry {
	return map[string]app.LauncherAppEntry{}
}
