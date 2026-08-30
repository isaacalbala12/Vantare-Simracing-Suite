//go:build !production

package main

import (
	"os"
	"path/filepath"
	"strings"
)

// webviewDebugArgs returns the WebView2 remote-debugging argument when the
// VANTARE_WEBVIEW_DEBUG_PORT environment variable is set. This diagnostic hook
// is only compiled into non-production builds so the debugging port can never
// be opened in a release. An unset, empty or whitespace-only value enables
// nothing.
func webviewDebugArgs() string {
	port := strings.TrimSpace(os.Getenv("VANTARE_WEBVIEW_DEBUG_PORT"))
	if port == "" {
		return ""
	}
	return "--remote-debugging-port=" + port
}

// webviewUserDataFolder permite aislar una prueba local sin tocar el perfil
// WebView2 instalado. Solo existe en builds de diagnóstico.
func webviewUserDataFolder(fallback string) string {
	path := strings.TrimSpace(os.Getenv("VANTARE_WEBVIEW_USER_DATA_FOLDER"))
	if path == "" || !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return fallback
	}
	return path
}

func performanceSensorTraceEnabled() bool {
	return strings.TrimSpace(os.Getenv("VANTARE_PERFORMANCE_SENSOR_TRACE")) == "1"
}

func performanceSensorEnabled() bool {
	return strings.TrimSpace(os.Getenv("VANTARE_PERFORMANCE_SENSOR")) != "off"
}
