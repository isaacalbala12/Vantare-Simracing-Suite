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
}
