//go:build !production

package main

import (
	"os"
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
