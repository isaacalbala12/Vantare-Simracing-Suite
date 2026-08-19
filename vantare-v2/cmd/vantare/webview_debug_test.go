//go:build !production

package main

import "testing"

func TestWebviewDebugArgsNonProductionReadsEnv(t *testing.T) {
	t.Setenv("VANTARE_WEBVIEW_DEBUG_PORT", "9222")
	if got := webviewDebugArgs(); got != "--remote-debugging-port=9222" {
		t.Fatalf("webviewDebugArgs() = %q, want --remote-debugging-port=9222", got)
	}
}

func TestWebviewDebugArgsNonProductionTrimsWhitespace(t *testing.T) {
	t.Setenv("VANTARE_WEBVIEW_DEBUG_PORT", "  9222  ")
	if got := webviewDebugArgs(); got != "--remote-debugging-port=9222" {
		t.Fatalf("webviewDebugArgs() = %q, want trimmed port", got)
	}
}

func TestWebviewDebugArgsNonProductionEmptyWhenUnset(t *testing.T) {
	t.Setenv("VANTARE_WEBVIEW_DEBUG_PORT", "")
	if got := webviewDebugArgs(); got != "" {
		t.Fatalf("webviewDebugArgs() = %q, want empty when unset", got)
	}
}
