package session

import "testing"

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

func TestCanonicalTypesRemainStable(t *testing.T) {
	t.Parallel()

	want := []Type{TypePractice, TypeQualifying, TypeRace, TypeWarmup, TypeEndurance}
	for index, sessionType := range want {
		if sessionType != Type(index+1) {
			t.Fatalf("canonical type %d = %d, want %d", index, sessionType, index+1)
		}
	}
}
