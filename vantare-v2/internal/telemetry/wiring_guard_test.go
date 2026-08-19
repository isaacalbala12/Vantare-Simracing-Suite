package telemetry_test

import (
	"fmt"
	"go/ast"
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

type exportedSymbol struct {
	packagePath string
	name        string
	file        string
	line        int
	deprecated  bool
	method      bool
}

func TestExportedSymbolsHaveProductionCaller(t *testing.T) {
	// F4.1 intentionally records the disconnected surface before F4 removes it.
	if os.Getenv("VANTARE_F4_WIRING_GUARD") != "1" {
		t.Skip("F4: se activa al terminar los borrados")
	}

	repositoryRoot := wiringGuardRepositoryRoot(t)
	symbols, references, err := scanExportedProductionSymbols(repositoryRoot)
	if err != nil {
		t.Fatalf("scan exported telemetry symbols: %v", err)
	}

	var violations []string
	for _, symbol := range symbols {
		if wiringGuardAllowed(symbol) || references[symbolReferenceKey(symbol)] > 0 {
			continue
		}
		violations = append(violations, fmt.Sprintf(
			"%s:%d: %s.%s has no production caller",
			symbol.file,
			symbol.line,
			symbol.packagePath,
			symbol.name,
		))
	}
	sort.Strings(violations)
	if len(violations) != 0 {
		t.Fatalf("exported telemetry symbols referenced only by tests or not at all:\n%s", strings.Join(violations, "\n"))
	}
}

func wiringGuardRepositoryRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate wiring guard")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}

func scanExportedProductionSymbols(repositoryRoot string) ([]exportedSymbol, map[string]int, error) {
	fileSet := token.NewFileSet()
	type parsedFile struct {
		path       string
		packageDir string
		production bool
		file       *ast.File
	}
	var files []parsedFile

	err := filepath.WalkDir(repositoryRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if path != repositoryRoot && ignoredWiringGuardDirectory(entry.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(path) != ".go" {
			return nil
		}
		contents, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		parsed, err := parser.ParseFile(fileSet, path, contents, parser.ParseComments)
		if err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		relDir, err := filepath.Rel(repositoryRoot, filepath.Dir(path))
		if err != nil {
			return fmt.Errorf("relative package for %s: %w", path, err)
		}
		files = append(files, parsedFile{
			path:       path,
			packageDir: filepath.ToSlash(relDir),
			production: !strings.HasSuffix(entry.Name(), "_test.go"),
			file:       parsed,
		})
		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	var symbols []exportedSymbol
	declarationPositions := make(map[token.Pos]struct{})
	for _, parsed := range files {
		if !parsed.production || !wiringGuardOwnedPackage(parsed.packageDir) {
			continue
		}
		for _, declaration := range parsed.file.Decls {
			switch declaration := declaration.(type) {
			case *ast.FuncDecl:
				if !declaration.Name.IsExported() {
					continue
				}
				declarationPositions[declaration.Name.Pos()] = struct{}{}
				symbols = append(symbols, newExportedSymbol(fileSet, repositoryRoot, parsed.packageDir, declaration.Name, declaration.Doc, declaration.Recv != nil))
			case *ast.GenDecl:
				for _, spec := range declaration.Specs {
					for _, name := range exportedSpecNames(spec) {
						declarationPositions[name.Pos()] = struct{}{}
						doc := declaration.Doc
						if value, ok := spec.(*ast.TypeSpec); ok && value.Doc != nil {
							doc = value.Doc
						}
						symbols = append(symbols, newExportedSymbol(fileSet, repositoryRoot, parsed.packageDir, name, doc, false))
					}
				}
			}
		}
	}

	references := make(map[string]int)
	for _, parsed := range files {
		if !parsed.production {
			continue
		}
		aliases := importAliases(parsed.file)
		ast.Inspect(parsed.file, func(node ast.Node) bool {
			switch node := node.(type) {
			case *ast.SelectorExpr:
				if identifier, ok := node.X.(*ast.Ident); ok {
					if packagePath, ok := aliases[identifier.Name]; ok && wiringGuardOwnedPackage(packagePath) {
						references[packagePath+"."+node.Sel.Name]++
						return true
					}
				}
				// Methods are resolved conservatively by selector name without loading packages.
				references["method."+node.Sel.Name]++
			case *ast.Ident:
				if _, declaration := declarationPositions[node.Pos()]; declaration {
					return true
				}
				if wiringGuardOwnedPackage(parsed.packageDir) && node.IsExported() {
					references[parsed.packageDir+"."+node.Name]++
				}
			}
			return true
		})
	}
	return symbols, references, nil
}

func newExportedSymbol(fileSet *token.FileSet, repositoryRoot, packagePath string, name *ast.Ident, doc *ast.CommentGroup, method bool) exportedSymbol {
	position := fileSet.Position(name.Pos())
	relFile, err := filepath.Rel(repositoryRoot, position.Filename)
	if err != nil {
		relFile = position.Filename
	}
	return exportedSymbol{
		packagePath: packagePath,
		name:        name.Name,
		file:        filepath.ToSlash(relFile),
		line:        position.Line,
		deprecated:  doc != nil && strings.Contains(doc.Text(), "Deprecated:"),
		method:      method,
	}
}

func exportedSpecNames(spec ast.Spec) []*ast.Ident {
	switch spec := spec.(type) {
	case *ast.TypeSpec:
		if spec.Name.IsExported() {
			return []*ast.Ident{spec.Name}
		}
	case *ast.ValueSpec:
		var names []*ast.Ident
		for _, name := range spec.Names {
			if name.IsExported() {
				names = append(names, name)
			}
		}
		return names
	}
	return nil
}

func importAliases(file *ast.File) map[string]string {
	aliases := make(map[string]string)
	for _, spec := range file.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		if err != nil || !strings.HasPrefix(path, modulePath+"/") {
			continue
		}
		packagePath := strings.TrimPrefix(path, modulePath+"/")
		alias := filepath.Base(packagePath)
		if spec.Name != nil {
			alias = spec.Name.Name
		}
		if alias != "_" && alias != "." {
			aliases[alias] = packagePath
		}
	}
	return aliases
}

func symbolReferenceKey(symbol exportedSymbol) string {
	if symbol.method {
		return "method." + symbol.name
	}
	return symbol.packagePath + "." + symbol.name
}

func wiringGuardOwnedPackage(packagePath string) bool {
	return packagePath == "internal/telemetry" ||
		strings.HasPrefix(packagePath, "internal/telemetry/") ||
		packagePath == "internal/app/telemetrytransport"
}

func wiringGuardAllowed(symbol exportedSymbol) bool {
	if symbol.deprecated {
		return true
	}
	// 2026-08-19: Error and Unwrap are called through the standard error interfaces.
	if symbol.method && (symbol.name == "Error" || symbol.name == "Unwrap") {
		return true
	}
	// 2026-08-19: replay is a harness-only architecture guard, never production wiring.
	if strings.HasPrefix(symbol.packagePath, "internal/telemetry/recording/replay") {
		return true
	}
	// 2026-08-19: diagnostics CaptureTap remains intentionally disconnected until F12.b.
	if strings.HasPrefix(symbol.packagePath, "internal/telemetry/diagnostics") {
		return true
	}
	// 2026-08-19: recording's bounded write path is intentionally disconnected until F12.
	if symbol.packagePath == "internal/telemetry/recording" ||
		strings.HasPrefix(symbol.packagePath, "internal/telemetry/recording/sqlite") {
		return true
	}
	// 2026-08-19: the Engineer facts port is rescued now and connected in F7.
	if symbol.packagePath == "internal/telemetry/projection/engineer" &&
		(symbol.name == "ErrFactResyncRequired" || symbol.name == "FactResyncRequiredError") {
		return true
	}
	// 2026-08-19: exact pre-F4 baseline outside ISA-372's approved deletion scope.
	// Keeping this list explicit means a newly orphaned export still fails the guard.
	_, allowed := wiringGuardExistingContractBaseline[symbol.packagePath+"."+symbol.name]
	return allowed
}

var wiringGuardExistingContractBaseline = map[string]struct{}{
	"internal/telemetry/catalog.ByID":                            {},
	"internal/telemetry/catalog.LedgerActionUnknown":             {},
	"internal/telemetry/catalog.Markdown":                        {},
	"internal/telemetry/core.Derivation":                         {},
	"internal/telemetry/core.EndSession":                         {},
	"internal/telemetry/core.ErrBackpressure":                    {},
	"internal/telemetry/core.RecordingSink":                      {},
	"internal/telemetry/core.SetConnected":                       {},
	"internal/telemetry/core.SetPreferred":                       {},
	"internal/telemetry/derive.Availability":                     {},
	"internal/telemetry/derive.Registry":                         {},
	"internal/telemetry/derive.ValidateDefinitions":              {},
	"internal/telemetry/drivers/lmu.AttemptCount":                {},
	"internal/telemetry/drivers/lmu.AuthorityMatrix":             {},
	"internal/telemetry/drivers/lmu.CaptureDeltaTrace":           {},
	"internal/telemetry/drivers/lmu.CaptureSanitizedREST":        {},
	"internal/telemetry/drivers/lmu.FailureCounts":               {},
	"internal/telemetry/drivers/lmu.Frames":                      {},
	"internal/telemetry/drivers/lmu.NewCaptureTap":               {},
	"internal/telemetry/drivers/lmu.NewObservationBatchSink":     {},
	"internal/telemetry/drivers/lmu.ProbeSanitizedSharedMemory":  {},
	"internal/telemetry/drivers/lmu.RESTEndpointUnknown":         {},
	"internal/telemetry/drivers/lmu.Stats":                       {},
	"internal/telemetry/drivers/lmu.WriteDeltaTrace":             {},
	"internal/telemetry/drivers/lmu.WriteSanitizedCapture":       {},
	"internal/telemetry/drivers/lmu.WriteSanitizedCapturePair":   {},
	"internal/telemetry/projection.Deprecated":                   {},
	"internal/telemetry/projection.ErrSubscriptionClosed":        {},
	"internal/telemetry/projection.FactSubscriber":               {},
	"internal/telemetry/projection.SnapshotReader":               {},
	"internal/telemetry/projection/engineer.Capability":          {},
	"internal/telemetry/projection/engineer.CapabilityState":     {},
	"internal/telemetry/projection/engineer.PlayerObservationV1": {},
	"internal/telemetry/projection/engineer.ProjectV1":           {},
	"internal/telemetry/schema.Age":                              {},
	"internal/telemetry/schema.DomainUnknown":                    {},
	"internal/telemetry/schema.ProvenanceUnknown":                {},
	"internal/telemetry/schema.Seconds":                          {},
	"internal/telemetry/schema.TransitionBriefDisconnect":        {},
	"internal/telemetry/schema.TransitionEventChanged":           {},
	"internal/telemetry/schema.TransitionSessionChanged":         {},
	"internal/telemetry/schema/controls.Inputs":                  {},
	"internal/telemetry/schema/envelope.NewObservation":          {},
	"internal/telemetry/schema/session.DeltaReferenceUnknown":    {},
	"internal/telemetry/schema/session.TypeUnknown":              {},
	"internal/telemetry/schema/standings.SectorUnknown":          {},
	"internal/telemetry/schema/vehicle.TeamName":                 {},
	"internal/telemetry/schema/weather.Temperature":              {},
	"internal/telemetry/schema/wheels.BrakeTemperature":          {},
	"internal/telemetry/schema/wheels.CornerFrontRight":          {},
	"internal/telemetry/schema/wheels.CornerRearLeft":            {},
	"internal/telemetry/schema/wheels.CornerUnknown":             {},
}

func ignoredWiringGuardDirectory(name string) bool {
	return name == ".git" || name == ".agent" || name == "node_modules" || name == "frontend" || name == "build" || name == "dist" || name == "testdata"
}
