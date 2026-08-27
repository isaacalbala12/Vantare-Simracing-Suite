package v1

import (
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

const remoteV1ImportPath = "github.com/vantare/overlays/v2/internal/telemetry/projection/remote/v1"

func TestProductionCodeDoesNotImportRemoteV1(t *testing.T) {
	t.Parallel()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate architecture test")
	}
	packageRoot := filepath.Dir(filename)
	repositoryRoot := findRepositoryRoot(t, packageRoot)
	err := filepath.WalkDir(repositoryRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if path == packageRoot || entry.Name() == ".git" || entry.Name() == "testdata" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		parsed, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, imported := range parsed.Imports {
			value, err := strconv.Unquote(imported.Path.Value)
			if err != nil {
				return err
			}
			if value == remoteV1ImportPath || strings.HasPrefix(value, remoteV1ImportPath+"/") {
				relative, relErr := filepath.Rel(repositoryRoot, path)
				if relErr != nil {
					relative = path
				}
				t.Errorf("production file %s imports the intentionally unwired remote V1 package", relative)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("scan production Go files in repository: %v", err)
	}
}

func findRepositoryRoot(t *testing.T, start string) string {
	t.Helper()
	for current := filepath.Clean(start); ; current = filepath.Dir(current) {
		if _, err := os.Stat(filepath.Join(current, ".git")); err == nil {
			return current
		} else if !os.IsNotExist(err) {
			t.Fatalf("inspect repository root candidate %s: %v", current, err)
		}
		parent := filepath.Dir(current)
		if parent == current {
			t.Fatalf("find repository root from %s", start)
		}
	}
}
