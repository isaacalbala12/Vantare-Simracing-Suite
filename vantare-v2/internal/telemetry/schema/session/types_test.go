package session

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestTypeUnknownAndForwardCompatibility(t *testing.T) {
	t.Parallel()

	if TypeUnknown != 0 {
		t.Fatalf("TypeUnknown = %d, want zero", TypeUnknown)
	}
	if Type(255).Known() {
		t.Fatal("unrecognized session type must remain representable without becoming known")
	}
	if !TypeRace.Known() {
		t.Fatal("canonical race type must be known")
	}
	if !TypeEndurance.Known() {
		t.Fatal("canonical endurance type must be known")
	}
}

func TestDeltaReferenceUnknownValuesAreInvalid(t *testing.T) {
	t.Parallel()

	if DeltaReferenceUnknown.Known() {
		t.Fatal("unknown delta reference must not become valid")
	}
	if !DeltaReferenceBestCompletedPlayerLap.Known() {
		t.Fatal("best completed player lap reference must be known")
	}
	if DeltaReference(255).Known() {
		t.Fatal("unrecognized delta reference must remain invalid")
	}
}

func TestSessionSignalTypesPreserveLegitimateZero(t *testing.T) {
	t.Parallel()

	assertSessionZeroPresent(t, EndTime(0))
	assertSessionZeroPresent(t, RemainingTime(0))
	assertSessionZeroPresent(t, MaximumLaps(0))
	assertSessionZeroPresent(t, DeltaSeconds(0))
}

func assertSessionZeroPresent[T comparable](t *testing.T, value T) {
	t.Helper()
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	got, present := field.Value()
	if !present || got != value {
		t.Fatalf("Value() = (%v,%v), want (%v,true)", got, present, value)
	}
}

func TestCanonicalTypesRemainStable(t *testing.T) {
	t.Parallel()

	want := []Type{TypePractice, TypeQualifying, TypeRace, TypeWarmup, TypeEndurance}
	for index, sessionType := range want {
		if sessionType != Type(index+1) {
			t.Fatalf("canonical type %d = %d, want %d", index, sessionType, index+1)
		}
	}
}
