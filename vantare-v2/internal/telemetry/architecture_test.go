package telemetry_test

import (
	"bytes"
	"fmt"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const modulePath = "github.com/vantare/overlays/v2"

type importEdge struct {
	Package string
	Import  string
}

func TestTelemetryProductionImportsFollowADR0004(t *testing.T) {
	t.Parallel()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate architecture test")
	}
	telemetryRoot := filepath.Dir(filename)

	violations, err := scanProductionImports(telemetryRoot)
	if err != nil {
		t.Fatalf("scan production imports: %v", err)
	}
	if len(violations) != 0 {
		t.Fatalf("ADR 0004 dependency violations:\n%s", strings.Join(violations, "\n"))
	}
}

func TestValidateImport(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		edge    importEdge
		wantErr bool
	}{
		{name: "schema may use standard library", edge: importEdge{Package: "internal/telemetry/schema", Import: "time"}},
		{name: "schema rejects reflection", edge: importEdge{Package: "internal/telemetry/schema", Import: "reflect"}, wantErr: true},
		{name: "schema rejects third party", edge: importEdge{Package: "internal/telemetry/schema", Import: "example.com/dependency"}, wantErr: true},
		{name: "catalog may use schema", edge: importEdge{Package: "internal/telemetry/catalog", Import: modulePath + "/internal/telemetry/schema"}},
		{name: "catalog may use standard library", edge: importEdge{Package: "internal/telemetry/catalog", Import: "sort"}},
		{name: "catalog rejects reflection", edge: importEdge{Package: "internal/telemetry/catalog", Import: "reflect"}, wantErr: true},
		{name: "catalog rejects third party", edge: importEdge{Package: "internal/telemetry/catalog", Import: "example.com/dependency"}, wantErr: true},
		{name: "catalog rejects core", edge: importEdge{Package: "internal/telemetry/catalog", Import: modulePath + "/internal/telemetry/core"}, wantErr: true},
		{name: "catalog rejects legacy telemetry", edge: importEdge{Package: "internal/telemetry/catalog", Import: modulePath + "/internal/telemetry/diff"}, wantErr: true},
		{name: "driver contract may use schema", edge: importEdge{Package: "internal/telemetry/driver", Import: modulePath + "/internal/telemetry/schema/envelope"}},
		{name: "driver contract rejects core", edge: importEdge{Package: "internal/telemetry/driver", Import: modulePath + "/internal/telemetry/core"}, wantErr: true},
		{name: "core may use schema", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/schema"}},
		{name: "core may use neutral driver contracts", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/driver"}},
		{name: "core rejects catalog", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/catalog"}, wantErr: true},
		{name: "projection root may use core", edge: importEdge{Package: "internal/telemetry/projection", Import: modulePath + "/internal/telemetry/core"}},
		{name: "projection may use core", edge: importEdge{Package: "internal/telemetry/projection/overlay", Import: modulePath + "/internal/telemetry/core"}},
		{name: "projection root rejects driver contracts", edge: importEdge{Package: "internal/telemetry/projection", Import: modulePath + "/internal/telemetry/driver"}, wantErr: true},
		{name: "recording may use core", edge: importEdge{Package: "internal/telemetry/recording", Import: modulePath + "/internal/telemetry/core"}},
		{name: "recording rejects projection", edge: importEdge{Package: "internal/telemetry/recording", Import: modulePath + "/internal/telemetry/projection"}, wantErr: true},
		{name: "legacy telemetry package may use internal core thresholds", edge: importEdge{Package: "internal/telemetry/diff", Import: modulePath + "/internal/core"}},
		{name: "core rejects concrete LMU driver", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/drivers/lmu"}, wantErr: true},
		{name: "core rejects legacy concrete LMU", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/lmu"}, wantErr: true},
		{name: "schema rejects core", edge: importEdge{Package: "internal/telemetry/schema", Import: modulePath + "/internal/telemetry/core"}, wantErr: true},
		{name: "projection rejects acquisition", edge: importEdge{Package: "internal/telemetry/projection/engineer", Import: modulePath + "/internal/telemetry/drivers/lmu"}, wantErr: true},
		{name: "telemetry rejects overlay product", edge: importEdge{Package: "internal/telemetry/drivers/lmu", Import: modulePath + "/internal/overlay"}, wantErr: true},
		{name: "telemetry rejects engineer product", edge: importEdge{Package: "internal/telemetry/schema", Import: modulePath + "/internal/engineer/telemetry"}, wantErr: true},
		{name: "telemetry rejects strategy product", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/strategy"}, wantErr: true},
		{name: "telemetry rejects app composition root", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/app"}, wantErr: true},
		{name: "telemetry rejects server transport", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/server"}, wantErr: true},
		{name: "telemetry rejects Wails", edge: importEdge{Package: "internal/telemetry/core", Import: "github.com/wailsapp/wails/v3/pkg/application"}, wantErr: true},
		{name: "telemetry rejects Wails webview module", edge: importEdge{Package: "internal/telemetry/core", Import: "github.com/wailsapp/wails/webview2"}, wantErr: true},
		{name: "telemetry allows unrelated package containing wails", edge: importEdge{Package: "internal/telemetry/core", Import: "example.com/acme/swails-client"}},
		{name: "telemetry rejects database sql", edge: importEdge{Package: "internal/telemetry/core", Import: "database/sql"}, wantErr: true},
		{name: "telemetry rejects DuckDB", edge: importEdge{Package: "internal/telemetry/recording", Import: "github.com/marcboeker/go-duckdb"}, wantErr: true},
		{name: "telemetry rejects DuckDB bindings", edge: importEdge{Package: "internal/telemetry/recording", Import: "github.com/duckdb/duckdb-go-bindings/v2"}, wantErr: true},
		{name: "telemetry allows unrelated package containing duckdb", edge: importEdge{Package: "internal/telemetry/recording", Import: "example.com/acme/duckdb-tools"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateImport(tt.edge)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateImport(%+v) error = %v, wantErr %v", tt.edge, err, tt.wantErr)
			}
		})
	}
}

func TestScanProductionImportsIgnoresTestsGeneratedFilesAndTools(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFixture(t, root, "core/good.go", "package core\nimport \"time\"\nvar _ = time.Second\n")
	writeFixture(t, root, "core/bad_test.go", "package core\nimport _ \""+modulePath+"/internal/engineer\"\n")
	writeFixture(t, root, "core/generated.go", "// Code generated by fixture. DO NOT EDIT.\npackage core\nimport _ \""+modulePath+"/internal/app\"\n")
	writeFixture(t, root, "tools/bad.go", "package tools\nimport _ \""+modulePath+"/internal/strategy\"\n")

	violations, err := scanProductionImports(root)
	if err != nil {
		t.Fatalf("scan fixtures: %v", err)
	}
	if len(violations) != 0 {
		t.Fatalf("ignored fixtures produced violations: %v", violations)
	}

	writeFixture(t, root, "core/bad.go", "package core\n\nimport (\n\t\"time\"\n\t_ \""+modulePath+"/internal/telemetry/drivers/lmu\"\n)\n\nvar _ = time.Second\n")
	violations, err = scanProductionImports(root)
	if err != nil {
		t.Fatalf("scan fixture with violation: %v", err)
	}
	if len(violations) != 1 || !strings.Contains(violations[0], "bad.go:5:") || !strings.Contains(violations[0], "drivers/lmu") {
		t.Fatalf("violations = %v, want one concrete LMU violation at bad.go:5", violations)
	}
}

func scanProductionImports(telemetryRoot string) ([]string, error) {
	var violations []string
	err := filepath.WalkDir(telemetryRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if path != telemetryRoot && ignoredDirectory(entry.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			return nil
		}

		contents, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		if isGenerated(contents) {
			return nil
		}

		fileSet := token.NewFileSet()
		parsed, err := parser.ParseFile(fileSet, path, contents, parser.ImportsOnly)
		if err != nil {
			return fmt.Errorf("parse imports in %s: %w", path, err)
		}
		relDir, err := filepath.Rel(telemetryRoot, filepath.Dir(path))
		if err != nil {
			return fmt.Errorf("relative package for %s: %w", path, err)
		}
		pkg := "internal/telemetry"
		if relDir != "." {
			pkg += "/" + filepath.ToSlash(relDir)
		}
		for _, spec := range parsed.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return fmt.Errorf("unquote import in %s: %w", path, err)
			}
			if err := validateImport(importEdge{Package: pkg, Import: importPath}); err != nil {
				relFile, relErr := filepath.Rel(telemetryRoot, path)
				if relErr != nil {
					relFile = path
				}
				line := fileSet.Position(spec.Pos()).Line
				violations = append(violations, fmt.Sprintf("%s:%d: %v", filepath.ToSlash(relFile), line, err))
			}
		}
		return nil
	})
	sort.Strings(violations)
	return violations, err
}

func validateImport(edge importEdge) error {
	productPrefixes := []string{
		modulePath + "/internal/app",
		modulePath + "/internal/engineer",
		modulePath + "/internal/overlay",
		modulePath + "/internal/server",
		modulePath + "/internal/strategy",
		modulePath + "/pkg/overlay",
	}
	for _, prefix := range productPrefixes {
		if hasImportPrefix(edge.Import, prefix) {
			return fmt.Errorf("%s must not import product, transport, or composition package %s", edge.Package, edge.Import)
		}
	}

	frameworkAndDatabasePrefixes := []string{
		"github.com/wailsapp/wails/v3",
		"github.com/wailsapp/wails/webview2",
		"github.com/marcboeker/go-duckdb",
		"github.com/duckdb/duckdb-go-bindings",
	}
	if edge.Import == "database/sql" || hasAnyImportPrefix(edge.Import, frameworkAndDatabasePrefixes) {
		return fmt.Errorf("%s must not import framework or database package %s", edge.Package, edge.Import)
	}

	if edge.Package == "internal/telemetry/schema" || strings.HasPrefix(edge.Package, "internal/telemetry/schema/") {
		if edge.Import == "reflect" {
			return fmt.Errorf("schema must not use reflection")
		}
		if isThirdPartyImport(edge.Import) {
			return fmt.Errorf("schema may only import standard library or its own tree, not %s", edge.Import)
		}
		if strings.HasPrefix(edge.Import, modulePath+"/") && !hasImportPrefix(edge.Import, modulePath+"/internal/telemetry/schema") {
			return fmt.Errorf("schema is the lowest telemetry layer and must not import %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/catalog" || strings.HasPrefix(edge.Package, "internal/telemetry/catalog/") {
		if edge.Import == "reflect" {
			return fmt.Errorf("catalog must not use reflection")
		}
		if isThirdPartyImport(edge.Import) {
			return fmt.Errorf("catalog may only import standard library and schema, not %s", edge.Import)
		}
		if strings.HasPrefix(edge.Import, modulePath+"/") && !hasImportPrefix(edge.Import, modulePath+"/internal/telemetry/schema") {
			return fmt.Errorf("catalog may only import the schema telemetry layer, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/driver" || strings.HasPrefix(edge.Package, "internal/telemetry/driver/") {
		if unexpectedTelemetryImport(edge.Import, modulePath+"/internal/telemetry/schema") {
			return fmt.Errorf("driver contracts may only import schema within telemetry, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/core" || strings.HasPrefix(edge.Package, "internal/telemetry/core/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/driver",
		) {
			return fmt.Errorf("core may only import schema and neutral driver contracts within telemetry, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/projection" || strings.HasPrefix(edge.Package, "internal/telemetry/projection/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/core",
			modulePath+"/internal/telemetry/projection",
		) {
			return fmt.Errorf("projection may only import schema, core, and its own tree within telemetry, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/recording" || strings.HasPrefix(edge.Package, "internal/telemetry/recording/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/core",
			modulePath+"/internal/telemetry/recording",
		) {
			return fmt.Errorf("recording may only import schema, core, and its own tree within telemetry, not %s", edge.Import)
		}
	}
	return nil
}

func unexpectedTelemetryImport(importPath string, allowedPrefixes ...string) bool {
	if !hasImportPrefix(importPath, modulePath+"/internal/telemetry") {
		return false
	}
	return !hasAnyImportPrefix(importPath, allowedPrefixes)
}

func hasAnyImportPrefix(value string, prefixes []string) bool {
	for _, prefix := range prefixes {
		if hasImportPrefix(value, prefix) {
			return true
		}
	}
	return false
}

func hasImportPrefix(value, prefix string) bool {
	return value == prefix || strings.HasPrefix(value, prefix+"/")
}

func isThirdPartyImport(importPath string) bool {
	first, _, _ := strings.Cut(importPath, "/")
	return strings.Contains(first, ".") && !strings.HasPrefix(importPath, modulePath+"/")
}

func ignoredDirectory(name string) bool {
	return name == "testdata" || name == "tools" || name == "vendor" || strings.HasPrefix(name, ".")
}

func isGenerated(contents []byte) bool {
	firstLine := contents
	if index := bytes.IndexByte(contents, '\n'); index >= 0 {
		firstLine = contents[:index]
	}
	return bytes.Contains(firstLine, []byte("Code generated")) && bytes.Contains(firstLine, []byte("DO NOT EDIT"))
}

func writeFixture(t *testing.T, root, relativePath, contents string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create fixture directory: %v", err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
}
