//go:build !windows

package launcher

// GetAppIcon is a no-op on non-Windows platforms.
func GetAppIcon(exePath string) []byte { return nil }

// GetAppIconBase64 is a no-op on non-Windows platforms.
func GetAppIconBase64(exePath string) string { return "" }

// GetAppIconForApp is a no-op on non-Windows platforms.
func GetAppIconForApp(id, exePath string) []byte { return nil }

// GetAppIconForAppBase64 is a no-op on non-Windows platforms.
func GetAppIconForAppBase64(id, exePath string) string { return "" }
