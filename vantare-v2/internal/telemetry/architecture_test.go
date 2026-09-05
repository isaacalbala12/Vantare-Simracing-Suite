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

func TestHarnessOnlyReplayIsNotImportedByProductionAnywhere(t *testing.T) {
	t.Parallel()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate architecture test")
	}
	repositoryRoot := filepath.Dir(filepath.Dir(filepath.Dir(filename)))
	violations, err := scanForbiddenProductionImport(
		repositoryRoot,
		modulePath+"/internal/telemetry/recording/replay",
		"internal/telemetry/recording/replay",
	)
	if err != nil {
		t.Fatalf("scan repository replay imports: %v", err)
	}
	if len(violations) != 0 {
		t.Fatalf("harness-only replay reached production:\n%s", strings.Join(violations, "\n"))
	}
}

func TestLMUOverlayRuntimeChainHasNoLegacyMockOrProductUICoupling(t *testing.T) {
	t.Parallel()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate architecture test")
	}
	telemetryRoot := filepath.Dir(filename)
	files := []string{
		"drivers/lmu/driver.go",
		"drivers/lmu/batch_mapper.go",
		"core/reducer.go",
		"core/session_coordinator.go",
		"derive/pipeline.go",
		// R7a: projection/overlay/v1.go esta retirado; la cadena runtime
		// LMU continua en toda la proyeccion productiva Overlay V2.
		"projection/overlayv2/cadence.go",
		"projection/overlayv2/cadence_dirty.go",
		"projection/overlayv2/frame.go",
		"projection/overlayv2/builder_controls.go",
		"projection/overlayv2/builder_damage.go",
		"projection/overlayv2/builder_delta.go",
		"projection/overlayv2/builder_fuel.go",
		"projection/overlayv2/builder_player.go",
		"projection/overlayv2/builder_relative.go",
		"projection/overlayv2/builder_session.go",
		"projection/overlayv2/builder_spotter.go",
		"projection/overlayv2/builder_standings.go",
		"projection/overlayv2/builder_weather.go",
		"projection/overlayv2/relative_settler.go",
	}
	forbidden := []string{
		modulePath + "/internal/telemetry/lmu",
		"BuildSyntheticBuffer",
		"createMockSource",
		modulePath + "/internal/app",
		modulePath + "/internal/server",
		modulePath + "/internal/overlay",
	}
	for _, relative := range files {
		contents, err := os.ReadFile(filepath.Join(telemetryRoot, filepath.FromSlash(relative)))
		if err != nil {
			t.Fatalf("read runtime chain file %s: %v", relative, err)
		}
		for _, token := range forbidden {
			if strings.Contains(string(contents), token) {
				t.Errorf("runtime chain file %s references forbidden %s", relative, token)
			}
		}
	}
}

func TestReducerRunLoopStaysRemoved(t *testing.T) {
	t.Parallel()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate architecture test")
	}
	contents, err := os.ReadFile(filepath.Join(filepath.Dir(filename), "core", "reducer.go"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(contents, []byte("func (reducer *Reducer) Run(")) {
		t.Fatal("Reducer.Run reintroduced a second orchestration loop")
	}
}

func TestDeriveRegistryStaysRemoved(t *testing.T) {
	t.Parallel()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve architecture test path")
	}
	contents, err := os.ReadFile(filepath.Join(filepath.Dir(filename), "derive", "pipeline.go"))
	if err != nil {
		t.Fatalf("read derive pipeline: %v", err)
	}
	for _, deadAPI := range []string{"type Definition struct", "func Registry(", "func ValidateDefinitions("} {
		if bytes.Contains(contents, []byte(deadAPI)) {
			t.Fatalf("dead derive DAG registry API returned: %q", deadAPI)
		}
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
		{name: "diagnostics may use recording", edge: importEdge{Package: "internal/telemetry/diagnostics", Import: modulePath + "/internal/telemetry/recording"}},
		{name: "diagnostics may use own tree", edge: importEdge{Package: "internal/telemetry/diagnostics/export", Import: modulePath + "/internal/telemetry/diagnostics/model"}},
		{name: "diagnostics rejects core", edge: importEdge{Package: "internal/telemetry/diagnostics", Import: modulePath + "/internal/telemetry/core"}, wantErr: true},
		{name: "diagnostics rejects derive", edge: importEdge{Package: "internal/telemetry/diagnostics", Import: modulePath + "/internal/telemetry/derive"}, wantErr: true},
		{name: "diagnostics rejects projection", edge: importEdge{Package: "internal/telemetry/diagnostics", Import: modulePath + "/internal/telemetry/projection/analysis"}, wantErr: true},
		{name: "diagnostics rejects driver contracts", edge: importEdge{Package: "internal/telemetry/diagnostics", Import: modulePath + "/internal/telemetry/driver"}, wantErr: true},
		{name: "diagnostics rejects concrete driver", edge: importEdge{Package: "internal/telemetry/diagnostics", Import: modulePath + "/internal/telemetry/drivers/lmu"}, wantErr: true},
		{name: "driver contract may use schema", edge: importEdge{Package: "internal/telemetry/driver", Import: modulePath + "/internal/telemetry/schema/envelope"}},
		{name: "driver contract rejects core", edge: importEdge{Package: "internal/telemetry/driver", Import: modulePath + "/internal/telemetry/core"}, wantErr: true},
		{name: "concrete driver may use core port", edge: importEdge{Package: "internal/telemetry/drivers/lmu", Import: modulePath + "/internal/telemetry/core"}},
		{name: "concrete driver may use neutral driver contract", edge: importEdge{Package: "internal/telemetry/drivers/lmu", Import: modulePath + "/internal/telemetry/driver"}},
		{name: "concrete driver may use identity policy", edge: importEdge{Package: "internal/telemetry/drivers/lmu", Import: modulePath + "/internal/telemetry/identity"}},
		{name: "concrete driver may use own subpackage", edge: importEdge{Package: "internal/telemetry/drivers/lmu", Import: modulePath + "/internal/telemetry/drivers/lmu/sharedmemory"}},
		{name: "concrete driver rejects projection", edge: importEdge{Package: "internal/telemetry/drivers/lmu", Import: modulePath + "/internal/telemetry/projection/overlayv2"}, wantErr: true},
		{name: "concrete driver rejects another simulator", edge: importEdge{Package: "internal/telemetry/drivers/lmu", Import: modulePath + "/internal/telemetry/drivers/iracing"}, wantErr: true},
		{name: "core may use schema", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/schema"}},
		{name: "core may use neutral driver contracts", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/driver"}},
		{name: "core may use identity policy", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/identity"}},
		{name: "core rejects catalog", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/catalog"}, wantErr: true},
		{name: "derive may use core", edge: importEdge{Package: "internal/telemetry/derive", Import: modulePath + "/internal/telemetry/core"}},
		{name: "derive rejects driver contracts", edge: importEdge{Package: "internal/telemetry/derive", Import: modulePath + "/internal/telemetry/driver"}, wantErr: true},
		{name: "identity policy may use schema", edge: importEdge{Package: "internal/telemetry/identity", Import: modulePath + "/internal/telemetry/schema"}},
		{name: "identity policy rejects core", edge: importEdge{Package: "internal/telemetry/identity", Import: modulePath + "/internal/telemetry/core"}, wantErr: true},
		{name: "engine may use core", edge: importEdge{Package: "internal/telemetry/engine", Import: modulePath + "/internal/telemetry/core"}},
		{name: "engine may use derive", edge: importEdge{Package: "internal/telemetry/engine", Import: modulePath + "/internal/telemetry/derive"}},
		{name: "engine rejects concrete driver", edge: importEdge{Package: "internal/telemetry/engine", Import: modulePath + "/internal/telemetry/drivers/lmu"}, wantErr: true},
		{name: "projection root may use core", edge: importEdge{Package: "internal/telemetry/projection", Import: modulePath + "/internal/telemetry/core"}},
		{name: "projection may use core", edge: importEdge{Package: "internal/telemetry/projection/overlayv2", Import: modulePath + "/internal/telemetry/core"}},
		{name: "projection may use final derive state", edge: importEdge{Package: "internal/telemetry/projection/overlayv2", Import: modulePath + "/internal/telemetry/derive"}},
		{name: "projection may use common projection root", edge: importEdge{Package: "internal/telemetry/projection/overlayv2", Import: modulePath + "/internal/telemetry/projection"}},
		{name: "projection may use own subpackage", edge: importEdge{Package: "internal/telemetry/projection/overlayv2/render", Import: modulePath + "/internal/telemetry/projection/overlayv2/model"}},
		{name: "projection rejects another product", edge: importEdge{Package: "internal/telemetry/projection/overlayv2", Import: modulePath + "/internal/telemetry/projection/engineer"}, wantErr: true},
		{name: "projection nested package rejects another product", edge: importEdge{Package: "internal/telemetry/projection/analysis/render", Import: modulePath + "/internal/telemetry/projection/strategy/model"}, wantErr: true},
		{name: "derive rejects inverse projection import", edge: importEdge{Package: "internal/telemetry/derive", Import: modulePath + "/internal/telemetry/projection"}, wantErr: true},
		{name: "projection root rejects driver contracts", edge: importEdge{Package: "internal/telemetry/projection", Import: modulePath + "/internal/telemetry/driver"}, wantErr: true},
		{name: "recording may use core", edge: importEdge{Package: "internal/telemetry/recording", Import: modulePath + "/internal/telemetry/core"}},
		{name: "recording rejects projection", edge: importEdge{Package: "internal/telemetry/recording", Import: modulePath + "/internal/telemetry/projection"}, wantErr: true},
		{name: "replay may use its own tree", edge: importEdge{Package: "internal/telemetry/recording/replay", Import: modulePath + "/internal/telemetry/recording"}},
		{name: "driver rejects productive replay import", edge: importEdge{Package: "internal/telemetry/drivers/lmu", Import: modulePath + "/internal/telemetry/recording/replay"}, wantErr: true},
		{name: "core rejects productive replay import", edge: importEdge{Package: "internal/telemetry/core", Import: modulePath + "/internal/telemetry/recording/replay"}, wantErr: true},
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
		{name: "recording root rejects database sql", edge: importEdge{Package: "internal/telemetry/recording", Import: "database/sql"}, wantErr: true},
		{name: "private sqlite adapter may use database sql", edge: importEdge{Package: "internal/telemetry/recording/sqlite", Import: "database/sql"}},
		{name: "private sqlite adapter may use pinned sqlite driver", edge: importEdge{Package: "internal/telemetry/recording/sqlite", Import: "modernc.org/sqlite"}},
		{name: "recording root rejects sqlite driver", edge: importEdge{Package: "internal/telemetry/recording", Import: "modernc.org/sqlite"}, wantErr: true},
		{name: "other telemetry package rejects sqlite driver", edge: importEdge{Package: "internal/telemetry/derive", Import: "modernc.org/sqlite"}, wantErr: true},
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

func TestScanForbiddenProductionImportIncludesGeneratedFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFixture(
		t,
		root,
		"internal/app/generated.go",
		"// Code generated by fixture. DO NOT EDIT.\npackage app\nimport _ \""+
			modulePath+"/internal/telemetry/recording/replay\"\n",
	)
	writeFixture(
		t,
		root,
		"internal/app/allowed_test.go",
		"package app\nimport _ \""+
			modulePath+"/internal/telemetry/recording/replay\"\n",
	)

	violations, err := scanForbiddenProductionImport(
		root,
		modulePath+"/internal/telemetry/recording/replay",
		"internal/telemetry/recording/replay",
	)
	if err != nil {
		t.Fatalf("scan generated fixture: %v", err)
	}
	if len(violations) != 1 ||
		!strings.Contains(violations[0], "generated.go:3:") {
		t.Fatalf("violations = %v, want generated production import", violations)
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

func scanForbiddenProductionImport(
	repositoryRoot string,
	forbiddenImport string,
	allowedPackage string,
) ([]string, error) {
	var violations []string
	err := filepath.WalkDir(repositoryRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if path != repositoryRoot && ignoredDirectory(entry.Name()) {
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
		fileSet := token.NewFileSet()
		parsed, err := parser.ParseFile(fileSet, path, contents, parser.ImportsOnly)
		if err != nil {
			return fmt.Errorf("parse imports in %s: %w", path, err)
		}
		relDir, err := filepath.Rel(repositoryRoot, filepath.Dir(path))
		if err != nil {
			return fmt.Errorf("relative package for %s: %w", path, err)
		}
		packagePath := filepath.ToSlash(relDir)
		if packagePath == allowedPackage || strings.HasPrefix(packagePath, allowedPackage+"/") {
			return nil
		}
		for _, spec := range parsed.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return fmt.Errorf("unquote import in %s: %w", path, err)
			}
			if hasImportPrefix(importPath, forbiddenImport) {
				relFile, relErr := filepath.Rel(repositoryRoot, path)
				if relErr != nil {
					relFile = path
				}
				violations = append(violations, fmt.Sprintf(
					"%s:%d: %s imports harness-only %s",
					filepath.ToSlash(relFile),
					fileSet.Position(spec.Pos()).Line,
					packagePath,
					importPath,
				))
			}
		}
		return nil
	})
	sort.Strings(violations)
	return violations, err
}

func validateImport(edge importEdge) error {
	replayRoot := modulePath + "/internal/telemetry/recording/replay"
	if hasImportPrefix(edge.Import, replayRoot) &&
		edge.Package != "internal/telemetry/recording/replay" &&
		!strings.HasPrefix(edge.Package, "internal/telemetry/recording/replay/") {
		return fmt.Errorf("%s must not wire harness-only replay into production: %s", edge.Package, edge.Import)
	}

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
	if hasAnyImportPrefix(edge.Import, frameworkAndDatabasePrefixes) {
		return fmt.Errorf("%s must not import framework or database package %s", edge.Package, edge.Import)
	}
	privateSQLiteAdapter := edge.Package == "internal/telemetry/recording/sqlite" ||
		strings.HasPrefix(edge.Package, "internal/telemetry/recording/sqlite/")
	if edge.Import == "database/sql" && !privateSQLiteAdapter {
		return fmt.Errorf("%s must not import database package %s", edge.Package, edge.Import)
	}
	if hasImportPrefix(edge.Import, "modernc.org/sqlite") && !privateSQLiteAdapter {
		return fmt.Errorf("%s must not import SQLite outside its private adapter: %s", edge.Package, edge.Import)
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

	if edge.Package == "internal/telemetry/fusion" || strings.HasPrefix(edge.Package, "internal/telemetry/fusion/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/catalog",
			modulePath+"/internal/telemetry/fusion",
		) {
			return fmt.Errorf("shared fusion may only import schema, catalog, and its own tree within telemetry, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/capability" || strings.HasPrefix(edge.Package, "internal/telemetry/capability/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/catalog",
			modulePath+"/internal/telemetry/driver",
			modulePath+"/internal/telemetry/capability",
		) {
			return fmt.Errorf("capability may only import schema, catalog, neutral driver contracts, and its own tree within telemetry, not %s", edge.Import)
		}
	}

	if ownDriverRoot, ok := concreteDriverRoot(edge.Package); ok {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/driver",
			modulePath+"/internal/telemetry/core",
			modulePath+"/internal/telemetry/catalog",
			modulePath+"/internal/telemetry/identity",
			modulePath+"/internal/telemetry/fusion",
			modulePath+"/internal/telemetry/capability",
			ownDriverRoot,
		) {
			return fmt.Errorf("concrete driver may only import schema, core ports, neutral driver contracts, shared fusion and capability, and its own tree within telemetry, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/core" || strings.HasPrefix(edge.Package, "internal/telemetry/core/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/driver",
			modulePath+"/internal/telemetry/identity",
		) {
			return fmt.Errorf("core may only import schema, identity policy, and neutral driver contracts within telemetry, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/derive" || strings.HasPrefix(edge.Package, "internal/telemetry/derive/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/core",
			modulePath+"/internal/telemetry/derive",
		) {
			return fmt.Errorf("derive may only import schema, core, and its own tree within telemetry, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/engine" || strings.HasPrefix(edge.Package, "internal/telemetry/engine/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/core",
			modulePath+"/internal/telemetry/derive",
			modulePath+"/internal/telemetry/engine",
		) {
			return fmt.Errorf("engine may only import schema, core, derive, and its own tree within telemetry, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/identity" || strings.HasPrefix(edge.Package, "internal/telemetry/identity/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/schema",
			modulePath+"/internal/telemetry/identity",
		) {
			return fmt.Errorf("identity policy may only import schema and its own tree within telemetry, not %s", edge.Import)
		}
	}

	if edge.Package == "internal/telemetry/projection" || strings.HasPrefix(edge.Package, "internal/telemetry/projection/") {
		if err := validateProjectionImport(edge); err != nil {
			return err
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

	if edge.Package == "internal/telemetry/diagnostics" || strings.HasPrefix(edge.Package, "internal/telemetry/diagnostics/") {
		if unexpectedTelemetryImport(edge.Import,
			modulePath+"/internal/telemetry/recording",
			modulePath+"/internal/telemetry/diagnostics",
		) {
			return fmt.Errorf("diagnostics may only import recording and its own tree within telemetry, not %s", edge.Import)
		}
	}
	return nil
}

func validateProjectionImport(edge importEdge) error {
	if unexpectedTelemetryImport(edge.Import,
		modulePath+"/internal/telemetry/schema",
		modulePath+"/internal/telemetry/core",
		modulePath+"/internal/telemetry/derive",
	) {
		projectionRoot := modulePath + "/internal/telemetry/projection"
		if edge.Import == projectionRoot {
			return nil
		}
		productRoot, ok := projectionProductRoot(edge.Package)
		if ok && hasImportPrefix(edge.Import, productRoot) {
			return nil
		}
		return fmt.Errorf("projection may only import schema, core, derive, the common projection root, and its own product tree within telemetry, not %s", edge.Import)
	}
	return nil
}

func projectionProductRoot(packagePath string) (string, bool) {
	const prefix = "internal/telemetry/projection/"
	if !strings.HasPrefix(packagePath, prefix) {
		return "", false
	}
	product, _, _ := strings.Cut(strings.TrimPrefix(packagePath, prefix), "/")
	if product == "" {
		return "", false
	}
	return modulePath + "/" + prefix + product, true
}

func unexpectedTelemetryImport(importPath string, allowedPrefixes ...string) bool {
	if !hasImportPrefix(importPath, modulePath+"/internal/telemetry") {
		return false
	}
	return !hasAnyImportPrefix(importPath, allowedPrefixes)
}

func concreteDriverRoot(packagePath string) (string, bool) {
	const prefix = "internal/telemetry/drivers/"
	if !strings.HasPrefix(packagePath, prefix) {
		return "", false
	}
	simulator, _, _ := strings.Cut(strings.TrimPrefix(packagePath, prefix), "/")
	if simulator == "" {
		return "", false
	}
	return modulePath + "/" + prefix + simulator, true
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
