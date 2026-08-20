package overlayv2

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
	"testing"
)

// Damage closes the F8 builder list by NOT being built.
//
// The plan asked for a builder_damage.go the way it asked for the others. The
// answer the canonical gives is that there is nothing to build from:
//
//   - core.VehicleState — the complete observed state of a vehicle — has no
//     damage field of any kind, and neither does derive.DerivedState. The test
//     below reads the canonical structs and fails if that ever stops being
//     true, which is the moment this verdict has to be revisited.
//   - Overlay Projection v1, the Go path the v2 contract has to reach parity
//     with, does not carry damage either: the frontend adapter lists it under
//     "unsupported-by-projection" (overlay-projection-adapter.ts).
//   - The v1 widgets car-damage-numbers and car-damage-visual do render damage,
//     but through snapshot.damage (widget-types/shared/damage-reader.ts), which
//     the legacy Wails path fills. The only Go code that reads real damage is
//     the Engineer product's own reader: engineer/telemetry.VehicleTelemetry
//     carries DentSeverity and WheelDetachedCount straight from the LMU shared
//     memory, private to Engineer and never promoted to the canonical schema.
//
// So `damage` is not a v2 capability. It is absent from CapabilitiesV2 rather
// than declared present-and-empty, because Supported states what the active
// driver can deliver and no driver descriptor advertises damage. Publishing a
// damage section fed by nothing would be inventing a signal.
//
// What it would take, in order: a damage domain in the canonical schema, the
// LMU driver mapping mDentSeverity and the detached-wheel count into it, a
// `damage` capability on the driver descriptor, and only then a builder and a
// view model. The first three are acquisition work and belong to F10.
func TestDamageIsNotACapabilityBecauseTheCanonicalHasNoDamageSignal(t *testing.T) {
	t.Parallel()

	final, ok := builderFinalState(t, 20).Value()
	if !ok {
		t.Fatal("missing final state")
	}
	capabilities := BuildCapabilities(final, builderSourceContext().DescriptorCapabilities)
	for _, capability := range capabilities.Supported {
		if strings.Contains(capability, "damage") {
			t.Fatalf("damage is declared supported (%q) with no canonical signal behind it", capability)
		}
	}
	for capability := range capabilities.Available {
		if strings.Contains(capability, "damage") {
			t.Fatalf("damage is declared available (%q) with no canonical signal behind it", capability)
		}
	}
}

// TestCanonicalVehicleStateStillCarriesNoDamage is the tripwire on the verdict
// above: the day a damage field lands in the canonical vehicle state, this
// test fails and the v2 contract owes it a builder.
func TestCanonicalVehicleStateStillCarriesNoDamage(t *testing.T) {
	t.Parallel()

	fields := canonicalStructFields(t, "../../core/reducer.go", "VehicleState")
	if len(fields) == 0 {
		t.Fatal("could not read core.VehicleState; the verdict on damage cannot be checked")
	}
	// The names damage would arrive under: the concept itself, or the two
	// shapes Engineer already reads from LMU (mDentSeverity, detached wheels).
	for _, field := range fields {
		lowered := strings.ToLower(field)
		for _, marker := range []string{"damage", "dentseverity", "detached"} {
			if strings.Contains(lowered, marker) {
				t.Fatalf("core.VehicleState now carries %q: v2 owes damage a builder", field)
			}
		}
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
