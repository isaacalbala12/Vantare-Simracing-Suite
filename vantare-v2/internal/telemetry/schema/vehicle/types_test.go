package vehicle

import "testing"

func TestGearZeroRemainsAValue(t *testing.T) {
	t.Parallel()

	var gear Gear
	if gear != Gear(0) {
		t.Fatalf("zero gear = %d, want 0", gear)
	}
}
