package live

import (
	"go/parser"
	"go/token"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

func TestProductionImportsOnlyPublicStrategyProjectionAndDomain(t *testing.T) {
	packages, err := parser.ParseDir(token.NewFileSet(), ".", func(info fs.FileInfo) bool {
		return !strings.HasSuffix(info.Name(), "_test.go")
	}, parser.ImportsOnly)
	if err != nil {
		t.Fatal(err)
	}
	for _, pkg := range packages {
		for name, file := range pkg.Files {
			for _, imported := range file.Imports {
				path, err := strconv.Unquote(imported.Path.Value)
				if err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(path, "/internal/") {
					continue
				}
				if path != "github.com/vantare/overlays/v2/internal/strategy/contract" &&
					path != "github.com/vantare/overlays/v2/internal/telemetry/projection" &&
					path != "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy" {
					t.Fatalf("%s imports private reader/transport/storage dependency %q", name, path)
				}
			}
		}
	}
}
