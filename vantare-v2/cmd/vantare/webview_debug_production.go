//go:build production

package main

// webviewDebugArgs is disabled in production builds: the WebView2
// remote-debugging port must never be opened in a release, regardless of the
// VANTARE_WEBVIEW_DEBUG_PORT environment variable.
func webviewDebugArgs() string {
	return ""
}

func webviewUserDataFolder(fallback string) string { return fallback }

func performanceSensorTraceEnabled() bool { return false }
