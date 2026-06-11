package lmu

import "testing"

func TestGeneratedOffsets(t *testing.T) {
	// Golden values from pyLMUSharedMemory ctypes layout (2026-06-11).
	if ObjectOutSize != 324820 {
		t.Fatalf("ObjectOutSize = %d, want 324820", ObjectOutSize)
	}
	if telemetryTelemStride != 1888 || vehicleScoringStride != 584 {
		t.Fatalf("stride mismatch: telem=%d scoring=%d", telemetryTelemStride, vehicleScoringStride)
	}
	if telemetryTelemOffset != 128468 || vehicleScoringOffset != 2192 {
		t.Fatalf("absolute offset mismatch")
	}
	if vehicleTelemetryLocalVel != 184 {
		t.Fatalf("vehicleTelemetryLocalVel = %d, want 184", vehicleTelemetryLocalVel)
	}
	if scoringInfoSize != 548 {
		t.Fatalf("scoringInfoSize = %d, want 548", scoringInfoSize)
	}
}
