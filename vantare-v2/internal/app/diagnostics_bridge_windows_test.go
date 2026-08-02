//go:build windows

package app

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/sys/windows"
)

func TestDiagnosticsBridgeAcceptsEquivalentWindowsShortPath(t *testing.T) {
	root := filepath.Join(t.TempDir(), "telemetry sessions with spaces")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatal(err)
	}
	longPath, err := windows.UTF16PtrFromString(root)
	if err != nil {
		t.Fatal(err)
	}
	required, err := windows.GetShortPathName(longPath, nil, 0)
	if err != nil {
		t.Skipf("short paths unavailable: %v", err)
	}
	buffer := make([]uint16, required)
	if _, err := windows.GetShortPathName(longPath, &buffer[0], uint32(len(buffer))); err != nil {
		t.Fatal(err)
	}
	shortPath := windows.UTF16ToString(buffer)
	if strings.EqualFold(filepath.Clean(root), filepath.Clean(shortPath)) {
		t.Skip("filesystem did not provide a distinct 8.3 path")
	}

	emitter := newDiagnosticsEventSpy()
	bridge := NewDiagnosticsBridge(
		context.Background(),
		shortPath,
		NewDiagnosticsService("v1", "", nil, nil, nil),
		emitter,
	)
	t.Cleanup(bridge.Close)
	bridge.HandleList(map[string]any{
		"requestId": "request-list-short-path",
		"limit":     10,
	})
	event := emitter.waitFor(t, DiagnosticsEventSessionsListed, "request-list-short-path")
	if _, ok := event.data.(DiagnosticsSessionsListedResponse); !ok {
		t.Fatalf("unexpected event payload: %#v", event.data)
	}
}
