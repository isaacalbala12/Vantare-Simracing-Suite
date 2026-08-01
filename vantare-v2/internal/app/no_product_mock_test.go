package app

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestProductionPackagesDoNotReferenceSyntheticTelemetryBuilders(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate test source")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
	for _, relativeRoot := range []string{"internal/app", "cmd/vantare"} {
		root := filepath.Join(repoRoot, filepath.FromSlash(relativeRoot))
		err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() || filepath.Ext(path) != ".go" || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			content, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			for _, forbidden := range []string{"BuildSyntheticBuffer", "createMockSource"} {
				if strings.Contains(string(content), forbidden) {
					t.Errorf("production file %s references forbidden %s", path, forbidden)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatalf("scan %s: %v", relativeRoot, err)
		}
	}
}

func TestProductionEngineerIsWiredOnlyThroughTelemetryCore(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate test source")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
	mainSource, err := os.ReadFile(filepath.Join(repoRoot, "cmd", "vantare", "main.go"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(mainSource), "Engineer: engSvc") {
		t.Fatal("composition root does not inject Engineer into TelemetryCoreRuntime")
	}
	bridgeSource, err := os.ReadFile(filepath.Join(repoRoot, "internal", "app", "engineer_bridge.go"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(bridgeSource), "engineer:source:set") {
		t.Fatal("production Engineer bridge still exposes a telemetry source selector")
	}
}
