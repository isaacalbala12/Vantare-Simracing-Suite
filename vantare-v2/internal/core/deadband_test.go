package core

import "testing"

func TestShouldEmit(t *testing.T) {
	if ShouldEmit(100, 100.05, ThresholdSpeed) {
		t.Fatal("expected below speed threshold to skip emit")
	}
	if !ShouldEmit(100, 100.2, ThresholdSpeed) {
		t.Fatal("expected above speed threshold to emit")
	}
}

func TestThresholdSpeedMPS(t *testing.T) {
	// 0.1 km/h ≈ 0.0278 m/s
	if ShouldEmit(10.0, 10.02, ThresholdSpeedMPS) {
		t.Fatal("0.02 m/s change should be below ~0.1 km/h threshold")
	}
	if !ShouldEmit(10.0, 10.05, ThresholdSpeedMPS) {
		t.Fatal("0.05 m/s change should exceed threshold")
	}
}
