package app

import (
	"context"
	"reflect"
	"testing"
)

// TestIsa998PeekModesNoMutateNoRetain audita lo que el corte Peek necesita:
// overlayCapabilityModes solo lee el FinalState (count + modos), no muta la
// entrada ni retiene sus slices. Vale para Value y para Peek; el ahorro del
// clon omitido lo demuestra el benchmark, no este test.
func TestIsa998PeekModesNoMutateNoRetain(t *testing.T) {
	t.Parallel()

	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	result, err := runtime.engine.Apply(context.Background(), engineerRuntimeBatch())
	if err != nil {
		t.Fatal(err)
	}
	snapshot := result.State

	peeked, ok := snapshot.Peek()
	if !ok {
		t.Fatal("Peek() = not ok")
	}
	valued, ok := snapshot.Value()
	if !ok {
		t.Fatal("Value() = not ok")
	}
	if len(peeked.Observed.Vehicles) != len(valued.Observed.Vehicles) {
		t.Fatalf("vehicle count differs: peek %d value %d",
			len(peeked.Observed.Vehicles), len(valued.Observed.Vehicles))
	}
	beforeIdentity := peeked.Observed.Vehicles[0].Identity

	modesPeek := overlayCapabilityModes(runtime.capabilityDeclaration, peeked)
	modesValue := overlayCapabilityModes(runtime.capabilityDeclaration, valued)
	if !reflect.DeepEqual(modesPeek, modesValue) {
		t.Fatalf("modes differ: peek %#v value %#v", modesPeek, modesValue)
	}

	// Mutar el resultado no debe afectar llamadas posteriores (sin retención).
	modesPeek.Spatial = append(modesPeek.Spatial, "mutated")
	modesPeek.Delta = append(modesPeek.Delta, "mutated")
	again := overlayCapabilityModes(runtime.capabilityDeclaration, peeked)
	if !reflect.DeepEqual(again, modesValue) {
		t.Fatalf("modes retained caller mutation: %#v vs %#v", again, modesValue)
	}

	// La entrada sigue intacta y el snapshot sigue usable tras el Peek.
	after, ok := snapshot.Peek()
	if !ok {
		t.Fatal("Peek() after modes = not ok")
	}
	if len(after.Observed.Vehicles) != len(valued.Observed.Vehicles) ||
		after.Observed.Vehicles[0].Identity != beforeIdentity {
		t.Fatal("Peek input mutated by modes resolution")
	}
	if _, ok := snapshot.Value(); !ok {
		t.Fatal("Value() after Peek = not ok")
	}
}
