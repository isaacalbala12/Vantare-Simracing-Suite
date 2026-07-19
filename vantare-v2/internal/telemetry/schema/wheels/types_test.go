package wheels

import "testing"

func TestCornerUnknownAndForwardCompatibility(t *testing.T) {
	t.Parallel()

	if CornerUnknown != 0 {
		t.Fatalf("CornerUnknown = %d, want zero", CornerUnknown)
	}
	if Corner(255).Known() {
		t.Fatal("unrecognized corner must remain representable without becoming known")
	}
	if !CornerFrontLeft.Known() {
		t.Fatal("front-left corner must be known")
	}
}
