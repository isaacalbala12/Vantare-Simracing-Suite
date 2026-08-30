package app

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestOverlayV1EmissionGuard(t *testing.T) {
	_, current, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve guard source path")
	}
	repo := filepath.Clean(filepath.Join(filepath.Dir(current), "..", ".."))
	runtimeSource, err := os.ReadFile(filepath.Join(repo, "internal", "app", "telemetry_core_runtime.go"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(runtimeSource)
	if strings.Count(text, "overlayprojection.ProjectV1(final)") != 1 ||
		!strings.Contains(text, "if sink.runtime.overlayV1Emit {\n\t\tvar err error\n\t\toverlayProjected, err = overlayprojection.ProjectV1(final)") {
		t.Fatal("Overlay V1 projection must have one construction site behind overlayV1Emit")
	}
	if !strings.Contains(text, "if runtime.overlayV1Emit {\n\t\toverlayStatus, err := telemetrytransport.NewStatus(") {
		t.Fatal("Overlay V1 status publication must stay behind overlayV1Emit")
	}

	for _, directory := range []string{"cmd", "internal"} {
		err := filepath.WalkDir(filepath.Join(repo, directory), func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() || filepath.Ext(path) != ".go" || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			data, readErr := os.ReadFile(path)
			if readErr != nil {
				return readErr
			}
			source := string(data)
			if strings.Contains(source, "Event.Emit") &&
				(strings.Contains(source, "telemetry:overlay:projection") || strings.Contains(source, "TelemetrySnapshot")) {
				t.Errorf("global Overlay V1 emission forbidden in %s", filepath.ToSlash(path))
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}
