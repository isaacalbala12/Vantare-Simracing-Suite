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
	text := strings.ReplaceAll(string(runtimeSource), "ProductOverlayV2", "")
	// R6b: el Hub Overlay V1 inerte esta fisicamente retirado del runtime.
	// Ni campo, ni constructor ProductOverlay, ni accessor Hub(), ni
	// import overlayprojection, ni cierre, ni metricas Overlay. Strategy V1
	// conserva su semantica y su ProjectV1 queda fuera de esta prohibicion.
	// ProductOverlayV2 es el transporte vivo y contiene el prefijo
	// ProductOverlay: se enmascara arriba para que el token sin coma no lo
	// marque.
	for _, forbidden := range []string{
		"overlayprojection.ProjectV1(final)",
		"NewOverlayFull",
		"overlayV1Emit",
		"OverlayV1Emit",
		"VANTARE_OVERLAY_V1_EMIT",
		"runtime.hub.PublishSnapshot",
		"runtime.hub.PublishStatus",
		"overlayprojection",
		"Product: telemetrytransport.ProductOverlay",
		"func (runtime *TelemetryCoreRuntime) Hub()",
		"runtime.hub",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("retired Overlay V1 production still present in runtime: %q", forbidden)
		}
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
			for _, forbidden := range []string{"overlayV1Emit", "OverlayV1Emit", "VANTARE_OVERLAY_V1_EMIT"} {
				if strings.Contains(source, forbidden) {
					t.Errorf("retired Overlay V1 switch forbidden in %s: %q", filepath.ToSlash(path), forbidden)
				}
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
		{name: "local assignment alias", source: `package sample; func f() { projection := "telemetry:overlay:projection"; emitter.Emit(projection, nil) }`, want: true},
		{name: "closure local assignment alias", source: `package sample; func f() { callback := func() { event := "telemetry:overlay:projection"; emitter.Emit(event, nil) }; _ = callback }`, want: true},
		{name: "negated diagnostic switch", source: `package sample; func f() { if !runtime.overlayV1Emit { emitter.Emit("telemetry:overlay:projection", nil) } }`, want: true},
		{name: "diagnostic switch", source: `package sample; func f() { if runtime.overlayV1Emit { emitter.Emit("telemetry:overlay:projection", nil) } }`, want: true},
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
		bindings := stringBindingsAt(file, call.Pos())
		for name := range resolveStrings(call.Args[0], bindings, nil) {
			if _, blocked := forbidden[name]; blocked {
				violation = true
				return false
			}
		}
		return true
	})
	return violation
}

func stringBindingsAt(file *ast.File, position token.Pos) map[string][]ast.Expr {
	bindings := make(map[string][]ast.Expr)
	for _, declaration := range file.Decls {
		generic, ok := declaration.(*ast.GenDecl)
		if !ok || generic.Tok != token.CONST && generic.Tok != token.VAR {
			continue
		}
		addValueSpecBindings(bindings, generic.Specs)
	}
	for _, declaration := range file.Decls {
		function, ok := declaration.(*ast.FuncDecl)
		if !ok || function.Body == nil || position < function.Body.Pos() || position > function.Body.End() {
			continue
		}
		ast.Inspect(function.Body, func(node ast.Node) bool {
			if node == nil || node.Pos() >= position {
				return false
			}
			switch statement := node.(type) {
			case *ast.FuncLit:
				// Only descend into the lexical closure that contains the call.
				// Bindings from sibling callbacks must not leak into this scope.
				return position >= statement.Body.Pos() && position <= statement.Body.End()
			case *ast.AssignStmt:
				if len(statement.Lhs) != len(statement.Rhs) {
					return true
				}
				for index, left := range statement.Lhs {
					if name, ok := left.(*ast.Ident); ok {
						bindings[name.Name] = append(bindings[name.Name], statement.Rhs[index])
					}
				}
			case *ast.DeclStmt:
				if generic, ok := statement.Decl.(*ast.GenDecl); ok {
					addValueSpecBindings(bindings, generic.Specs)
				}
			}
			return true
		})
	}
	return bindings
}

func addValueSpecBindings(bindings map[string][]ast.Expr, specifications []ast.Spec) {
	for _, specification := range specifications {
		valueSpec, ok := specification.(*ast.ValueSpec)
		if !ok {
			continue
		}
		for index, name := range valueSpec.Names {
			if index < len(valueSpec.Values) {
				bindings[name.Name] = append(bindings[name.Name], valueSpec.Values[index])
			}
		}
	}
}

func resolveStrings(expression ast.Expr, bindings map[string][]ast.Expr, resolving map[string]bool) map[string]struct{} {
	resolved := make(map[string]struct{})
	switch value := expression.(type) {
	case *ast.BasicLit:
		if value.Kind == token.STRING {
			if decoded, err := strconv.Unquote(value.Value); err == nil {
				resolved[decoded] = struct{}{}
			}
		}
	case *ast.Ident:
		if resolving == nil {
			resolving = make(map[string]bool)
		}
		if resolving[value.Name] {
			return resolved
		}
		resolving[value.Name] = true
		for _, bound := range bindings[value.Name] {
			for candidate := range resolveStrings(bound, bindings, resolving) {
				resolved[candidate] = struct{}{}
			}
		}
		delete(resolving, value.Name)
	case *ast.BinaryExpr:
		if value.Op == token.ADD {
			left := resolveStrings(value.X, bindings, resolving)
			right := resolveStrings(value.Y, bindings, resolving)
			for prefix := range left {
				for suffix := range right {
					resolved[prefix+suffix] = struct{}{}
				}
			}
		}
	}
	return resolved
}
