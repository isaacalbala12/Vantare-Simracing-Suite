//go:build !production

package main

import (
	"path/filepath"
	"testing"
)

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

func TestWebviewUserDataFolderNonProductionAcceptsCleanAbsolutePath(t *testing.T) {
	want := filepath.Join(t.TempDir(), "isa944-webview")
	t.Setenv("VANTARE_WEBVIEW_USER_DATA_FOLDER", want)
	if got := webviewUserDataFolder(`C:\fallback`); got != want {
		t.Fatalf("webviewUserDataFolder() = %q, want %q", got, want)
	}
}

func TestWebviewUserDataFolderNonProductionRejectsRelativePath(t *testing.T) {
	t.Setenv("VANTARE_WEBVIEW_USER_DATA_FOLDER", `relative\profile`)
	if got := webviewUserDataFolder(`C:\fallback`); got != `C:\fallback` {
		t.Fatalf("webviewUserDataFolder() = %q, want fallback", got)
	}
}

func TestPerformanceSensorTraceRequiresExplicitOne(t *testing.T) {
	t.Setenv("VANTARE_PERFORMANCE_SENSOR_TRACE", "1")
	if !performanceSensorTraceEnabled() {
		t.Fatal("explicit sensor trace was not enabled")
	}
	t.Setenv("VANTARE_PERFORMANCE_SENSOR_TRACE", "true")
	if performanceSensorTraceEnabled() {
		t.Fatal("non-canonical sensor trace value was accepted")
	}
}

func TestPerformanceSensorDiagnosticDisableRequiresExplicitOff(t *testing.T) {
	t.Setenv("VANTARE_PERFORMANCE_SENSOR", "off")
	if performanceSensorEnabled() {
		t.Fatal("diagnostic sensor off was ignored")
	}
	t.Setenv("VANTARE_PERFORMANCE_SENSOR", "false")
	if !performanceSensorEnabled() {
		t.Fatal("non-canonical sensor disable value was accepted")
	}
}
