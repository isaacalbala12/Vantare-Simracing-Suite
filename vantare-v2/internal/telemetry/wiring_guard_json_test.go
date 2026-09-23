package telemetry_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

// wiringGuardJSONContract recognizes only compiler-checked assertions of the
// standard JSON interfaces for this exact receiver, with the exact method
// signature. An exported method named MarshalJSON alone is still an orphan.
func wiringGuardJSONContract(file *ast.File, method *ast.FuncDecl) bool {
	if method.Recv == nil || len(method.Recv.List) != 1 {
		return false
	}
	contract := ""
	switch method.Name.Name {
	case "MarshalJSON":
		if method.Type.Params.NumFields() != 0 || method.Type.Results.NumFields() != 2 || len(method.Type.Results.List) != 2 || !jsonBytesType(method.Type.Results.List[0].Type) || !jsonNamedType(method.Type.Results.List[1].Type, "error") {
			return false
		}
		contract = "Marshaler"
	case "UnmarshalJSON":
		if method.Type.Params.NumFields() != 1 || method.Type.Results.NumFields() != 1 || !jsonBytesType(method.Type.Params.List[0].Type) || !jsonNamedType(method.Type.Results.List[0].Type, "error") {
			return false
		}
		contract = "Unmarshaler"
	default:
		return false
	}
	receiver := jsonReceiverName(method.Recv.List[0].Type)
	if receiver == "" {
		return false
	}
	aliases := make(map[string]bool)
	for _, spec := range file.Imports {
		if spec.Path.Value != `"encoding/json"` {
			continue
		}
		alias := "json"
		if spec.Name != nil {
			alias = spec.Name.Name
		}
		if alias != "_" && alias != "." {
			aliases[alias] = true
		}
	}
	for _, declaration := range file.Decls {
		group, ok := declaration.(*ast.GenDecl)
		if !ok || group.Tok != token.VAR {
			continue
		}
		for _, spec := range group.Specs {
			value, ok := spec.(*ast.ValueSpec)
			if !ok || len(value.Names) != 1 || value.Names[0].Name != "_" || len(value.Values) != 1 {
				continue
			}
			selector, ok := value.Type.(*ast.SelectorExpr)
			if !ok || selector.Sel.Name != contract {
				continue
			}
			qualifier, ok := selector.X.(*ast.Ident)
			if !ok || !aliases[qualifier.Name] {
				continue
			}
			assertionType := ast.Expr(nil)
			switch expression := value.Values[0].(type) {
			case *ast.CompositeLit:
				assertionType = expression.Type
			case *ast.CallExpr:
				// An interface assertion conventionally converts nil to a pointer type.
				if len(expression.Args) == 1 && jsonNamedType(expression.Args[0], "nil") {
					assertionType = expression.Fun
				}
			}
			if jsonReceiverName(assertionType) == receiver {
				return true
			}
		}
	}
	return false
}

func jsonReceiverName(expression ast.Expr) string {
	switch expression := expression.(type) {
	case *ast.Ident:
		return expression.Name
	case *ast.StarExpr:
		return jsonReceiverName(expression.X)
	case *ast.ParenExpr:
		return jsonReceiverName(expression.X)
	default:
		return ""
	}
}

func jsonNamedType(expression ast.Expr, name string) bool {
	identifier, ok := expression.(*ast.Ident)
	return ok && identifier.Name == name
}

func jsonBytesType(expression ast.Expr) bool {
	array, ok := expression.(*ast.ArrayType)
	return ok && array.Len == nil && jsonNamedType(array.Elt, "byte")
}

func TestWiringGuardJSONContractRequiresExactInterfaceAndReceiver(t *testing.T) {
	for _, test := range []struct {
		name, source string
		want         bool
	}{
		{"marshal", `import "encoding/json"; var _ json.Marshaler = Row{}; func (Row) MarshalJSON() ([]byte, error) { return nil,nil }`, true},
		{"unmarshal", `import "encoding/json"; var _ json.Unmarshaler = (*Row)(nil); func (*Row) UnmarshalJSON(data []byte) error { return nil }`, true},
		{"alias", `import j "encoding/json"; var _ j.Marshaler = (*Row)(nil); func (Row) MarshalJSON() ([]byte, error) { return nil,nil }`, true},
		{"name alone", `func (Row) MarshalJSON() ([]byte, error) { return nil,nil }`, false},
		{"other receiver", `import "encoding/json"; var _ json.Marshaler = (*Other)(nil); func (Row) MarshalJSON() ([]byte, error) { return nil,nil }`, false},
		{"other import", `import json "example/json"; var _ json.Marshaler = Row{}; func (Row) MarshalJSON() ([]byte, error) { return nil,nil }`, false},
		{"other interface", `import "encoding/json"; var _ json.Unmarshaler = Row{}; func (Row) MarshalJSON() ([]byte, error) { return nil,nil }`, false},
		{"function", `import "encoding/json"; var _ json.Marshaler = Row{}; func MarshalJSON() ([]byte, error) { return nil,nil }`, false},
		{"wrong marshal result", `import "encoding/json"; var _ json.Marshaler = Row{}; func (Row) MarshalJSON() (string, error) { return "",nil }`, false},
		{"grouped wrong result", `import "encoding/json"; var _ json.Marshaler = Row{}; func (Row) MarshalJSON() (a,b []byte) { return nil,nil }`, false},
		{"wrong marshal params", `import "encoding/json"; var _ json.Marshaler = Row{}; func (Row) MarshalJSON(n int) ([]byte, error) { return nil,nil }`, false},
		{"wrong unmarshal params", `import "encoding/json"; var _ json.Unmarshaler = (*Row)(nil); func (*Row) UnmarshalJSON(data string) error { return nil }`, false},
		{"wrong unmarshal result", `import "encoding/json"; var _ json.Unmarshaler = (*Row)(nil); func (*Row) UnmarshalJSON(data []byte) {}`, false},
		{"named variable", `import "encoding/json"; var example json.Marshaler = Row{}; func (Row) MarshalJSON() ([]byte, error) { return nil,nil }`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			file, err := parser.ParseFile(token.NewFileSet(), "contract.go", "package fixture; "+test.source, 0)
			if err != nil {
				t.Fatal(err)
			}
			for _, declaration := range file.Decls {
				if method, ok := declaration.(*ast.FuncDecl); ok {
					if got := wiringGuardJSONContract(file, method); got != test.want {
						t.Fatalf("contract recognized=%v, want %v", got, test.want)
					}
				}
			}
		})
	}
}
