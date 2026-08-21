package overlayv2

import (
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

// Damage is now observed from LMU SHM and published as a v2 capability.
// The F8 verdict (no canonical damage signal) is retired by ISA-696: the driver
// maps mDentSeverity[8], mOverheating, mDetached and wheel detachments into
// damage.State, and the builder publishes it when the player signal is fresh.
func TestDamageIsACapabilityWhenSignalIsFresh(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	capabilities := BuildCapabilities(final, builderSourceContext())
	foundSupported := false
	for _, capability := range capabilities.Supported {
		if capability == "damage" {
			foundSupported = true
			break
		}
	}
	if !foundSupported {
		t.Fatalf("damage is not declared supported: %#v", capabilities.Supported)
	}
	if got := capabilities.Available["damage"]; got != QualityFresh {
		t.Fatalf("damage available = %q, want fresh", got)
	}
}

// TestCanonicalVehicleStateNowCarriesDamage verifies the ISA-696 promotion:
// damage is now observed from LMU SHM and carried in the canonical vehicle state.
// The tripwire from F8 is retired; T3 will publish it as a capability and builder.
func TestCanonicalVehicleStateNowCarriesDamage(t *testing.T) {
	t.Parallel()

	fields := canonicalStructFields(t, "../../core/reducer.go", "VehicleState")
	if len(fields) == 0 {
		t.Fatal("could not read core.VehicleState; the verdict on damage cannot be checked")
	}
	found := false
	for _, field := range fields {
		if field == "Damage" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("core.VehicleState does not carry Damage after ISA-696 T1/T2")
	}
}

func canonicalStructFields(tb testing.TB, path, name string) []string {
	tb.Helper()
	file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
	if err != nil {
		tb.Fatalf("parse %s: %v", path, err)
	}
	var fields []string
	ast.Inspect(file, func(node ast.Node) bool {
		spec, ok := node.(*ast.TypeSpec)
		if !ok || spec.Name.Name != name {
			return true
		}
		structType, ok := spec.Type.(*ast.StructType)
		if !ok {
			return false
		}
		for _, field := range structType.Fields.List {
			for _, fieldName := range field.Names {
				fields = append(fields, fieldName.Name)
			}
		}
		return false
	})
	return fields
}
