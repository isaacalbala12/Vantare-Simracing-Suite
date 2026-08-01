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

func TestRetiredTelemetryBackendStaysRemoved(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate test source")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
	for _, relative := range []string{
		"internal/telemetry/service",
		"internal/telemetry/lmu",
		"internal/telemetry/lmuapi",
		"internal/telemetry/normalizer",
		"internal/telemetry/fusion",
		"internal/telemetry/gap",
		"internal/telemetry/diff",
		"internal/telemetry/pipeline",
		"internal/telemetry/delta",
		"pkg/models",
	} {
		matches, err := filepath.Glob(filepath.Join(repoRoot, filepath.FromSlash(relative), "*.go"))
		if err != nil {
			t.Fatalf("scan retired backend path %s: %v", relative, err)
		}
		if len(matches) != 0 {
			t.Errorf("retired backend path still contains Go files: %s", relative)
		}
	}

	mainSource, err := os.ReadFile(filepath.Join(repoRoot, "cmd", "vantare", "main.go"))
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{
		"app.New(*live)",
		"EnsureLiveTelemetry",
		"TelemetrySource()",
		"/telemetry/stream",
		"internal/telemetry/service",
		"internal/telemetry/lmu\"",
	} {
		if strings.Contains(string(mainSource), forbidden) {
			t.Errorf("composition root references retired backend token %q", forbidden)
		}
	}
}

func TestLMULiveAcquisitionExistsOnlyInCanonicalDriver(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate test source")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
	canonicalRoot := filepath.Join(repoRoot, "internal", "telemetry", "drivers", "lmu")
	for _, relativeRoot := range []string{"cmd", "internal"} {
		root := filepath.Join(repoRoot, relativeRoot)
		err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() || filepath.Ext(path) != ".go" || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			if path == canonicalRoot || strings.HasPrefix(path, canonicalRoot+string(filepath.Separator)) {
				return nil
			}
			content, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			for _, forbidden := range []string{
				"OpenFileMappingW",
				"MapViewOfFile",
				"$rFactor2SMMP_Telemetry$",
				"ParseEngineerFrame",
			} {
				if strings.Contains(string(content), forbidden) {
					t.Errorf("production file outside canonical LMU driver %s references acquisition token %q", path, forbidden)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatalf("scan %s: %v", relativeRoot, err)
		}
	}
}
