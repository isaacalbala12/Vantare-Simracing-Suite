//go:build production

package main

import "testing"

func TestWebviewDebugArgsProductionAlwaysDisabled(t *testing.T) {
	t.Setenv("VANTARE_WEBVIEW_DEBUG_PORT", "9222")
	if got := webviewDebugArgs(); got != "" {
		t.Fatalf("production webviewDebugArgs() = %q, want empty", got)
	}
}
