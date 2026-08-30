package app

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
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
			if hasGlobalOverlayV1Emission(source) {
				t.Errorf("global Overlay V1 emission forbidden in %s", filepath.ToSlash(path))
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}

func TestOverlayV1EmissionGuardRejectsEveryEmitterVariant(t *testing.T) {
	tests := []struct {
		name   string
		source string
		want   bool
	}{
		{name: "Wails Event Emit snapshot", source: `package sample; func f() { wailsApp.Event.Emit("telemetry:snapshot", nil) }`, want: true},
		{name: "generic Emit projection", source: `package sample; func f() { emitter.Emit("telemetry:overlay:projection", nil) }`, want: true},
		{name: "EmitEvent status", source: `package sample; func f() { window.EmitEvent("telemetry:overlay:status", nil) }`, want: true},
		{name: "constant alias", source: `package sample; const legacy = "telemetry:overlay:projection"; func f() { emitter.Emit(legacy, nil) }`, want: true},
		{name: "diagnostic switch", source: `package sample; func f() { if runtime.overlayV1Emit { emitter.Emit("telemetry:overlay:projection", nil) } }`},
		{name: "v2 stays allowed", source: `package sample; func f() { emitter.Emit("telemetry:overlay-v2:snapshot", nil) }`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := hasGlobalOverlayV1Emission(test.source); got != test.want {
				t.Fatalf("hasGlobalOverlayV1Emission() = %v, want %v", got, test.want)
			}
		})
	}
}

func hasGlobalOverlayV1Emission(source string) bool {
	file, err := parser.ParseFile(token.NewFileSet(), "guard.go", source, 0)
	if err != nil {
		return true
	}
	constants := stringConstants(file)
	forbidden := map[string]struct{}{
		"telemetry:snapshot":           {},
		"telemetry:overlay:projection": {},
		"telemetry:overlay:status":     {},
	}
	violation := false
	ast.Inspect(file, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok || len(call.Args) == 0 {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || selector.Sel.Name != "Emit" && selector.Sel.Name != "EmitEvent" {
			return true
		}
		name, ok := resolveString(call.Args[0], constants)
		if !ok {
			return true
		}
		if _, blocked := forbidden[name]; blocked && !insideOverlayV1Switch(file, call) {
			violation = true
			return false
		}
		return true
	})
	return violation
}

func stringConstants(file *ast.File) map[string]string {
	constants := make(map[string]string)
	for _, declaration := range file.Decls {
		generic, ok := declaration.(*ast.GenDecl)
		if !ok || generic.Tok != token.CONST {
			continue
		}
		for _, specification := range generic.Specs {
			valueSpec, ok := specification.(*ast.ValueSpec)
			if !ok {
				continue
			}
			for index, name := range valueSpec.Names {
				if index >= len(valueSpec.Values) {
					continue
				}
				if value, ok := resolveString(valueSpec.Values[index], constants); ok {
					constants[name.Name] = value
				}
			}
		}
	}
	return constants
}

func resolveString(expression ast.Expr, constants map[string]string) (string, bool) {
	switch value := expression.(type) {
	case *ast.BasicLit:
		if value.Kind != token.STRING {
			return "", false
		}
		decoded, err := strconv.Unquote(value.Value)
		return decoded, err == nil
	case *ast.Ident:
		resolved, ok := constants[value.Name]
		return resolved, ok
	case *ast.BinaryExpr:
		if value.Op != token.ADD {
			return "", false
		}
		left, leftOK := resolveString(value.X, constants)
		right, rightOK := resolveString(value.Y, constants)
		return left + right, leftOK && rightOK
	default:
		return "", false
	}
}

func insideOverlayV1Switch(file *ast.File, call *ast.CallExpr) bool {
	guarded := false
	ast.Inspect(file, func(node ast.Node) bool {
		statement, ok := node.(*ast.IfStmt)
		if !ok || call.Pos() < statement.Body.Pos() || call.End() > statement.Body.End() {
			return true
		}
		ast.Inspect(statement.Cond, func(conditionNode ast.Node) bool {
			switch condition := conditionNode.(type) {
			case *ast.Ident:
				guarded = guarded || condition.Name == "overlayV1Emit"
			case *ast.SelectorExpr:
				guarded = guarded || condition.Sel.Name == "overlayV1Emit"
			}
			return !guarded
		})
		return !guarded
	})
	return guarded
}
