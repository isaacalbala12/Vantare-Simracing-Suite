package simulator

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func TestScenarioLeftBasic(t *testing.T) {
	frames := Build(ScenarioLeftBasic)
	if len(frames) < 4 {
		t.Fatalf("expected left scenario to have at least 4 frames, got %d", len(frames))
	}

	// Frame 1 check
	f1 := frames[1]
	var nonPlayerVehiclesOnPositiveX int
	for _, v := range f1.Vehicles {
		if !v.IsPlayer && v.Position.X > 0 {
			nonPlayerVehiclesOnPositiveX++
		}
	}

	if nonPlayerVehiclesOnPositiveX != 1 {
		t.Errorf("expected frame 1 of left scenario to have exactly 1 non-player vehicle on positive X, got %d", nonPlayerVehiclesOnPositiveX)
	}

	// Verify track length and num vehicles
	if f1.Session == nil || f1.Session.TrackLength <= 0 {
		t.Errorf("expected valid SessionInfo in frame 1, got %v", f1.Session)
	}
	if f1.Session != nil && f1.Session.NumVehicles != int32(len(f1.Vehicles)) {
		t.Errorf("expected NumVehicles %d to match Vehicles count %d", f1.Session.NumVehicles, len(f1.Vehicles))
	}
}

func TestScenarioThreeWide(t *testing.T) {
	frames := Build(ScenarioThreeWide)

	// In three-wide scenario, we should have a left and right overlap (LMU local +X is left, -X is right).
	// Let's check frame 1 (or frames where both overlap)
	hasBothOverlap := false
	for _, f := range frames {
		var hasLeft, hasRight bool
		for _, v := range f.Vehicles {
			if !v.IsPlayer {
				// overlap is Z between -5 and +5, position X is positive for left, negative for right.
				if v.Position.Z >= -5.0 && v.Position.Z <= 5.0 {
					if v.Position.X > 0 {
						hasLeft = true
					} else if v.Position.X < 0 {
						hasRight = true
					}
				}
			}
		}
		if hasLeft && hasRight {
			hasBothOverlap = true
			break
		}
	}

	if !hasBothOverlap {
		t.Errorf("expected three-wide scenario to have at least one frame with both left and right overlapping vehicles")
	}
}

func TestSimulatorSource(t *testing.T) {
	frames := Build(ScenarioLeftBasic)
	src := NewSource(frames)

	info := src.Info()
	if info.Kind != "simulator" {
		t.Errorf("expected Kind 'simulator', got %v", info.Kind)
	}

	// Read all frames sequentially
	for i := 0; i < len(frames); i++ {
		f := src.ReadFrame()
		if f == nil {
			t.Fatalf("expected non-nil frame at index %d", i)
		}
		if f.TimestampUnixMS != frames[i].TimestampUnixMS {
			t.Errorf("frame mismatch at index %d: got timestamp %d, want %d", i, f.TimestampUnixMS, frames[i].TimestampUnixMS)
		}
	}

	// After EOF, we should get the last frame repeatedly
	lastFrame := frames[len(frames)-1]
	for i := 0; i < 3; i++ {
		f := src.ReadFrame()
		if f == nil {
			t.Fatalf("expected non-nil frame after EOF")
		}
		if f.TimestampUnixMS != lastFrame.TimestampUnixMS {
			t.Errorf("expected last frame repeatedly after EOF, got timestamp %d, want %d", f.TimestampUnixMS, lastFrame.TimestampUnixMS)
		}
	}

	if err := src.Close(); err != nil {
		t.Errorf("unexpected error on close: %v", err)
	}
}

func TestScenarioAllClear(t *testing.T) {
	frames := Build(ScenarioAllClear)
	if len(frames) < 4 {
		t.Fatalf("expected all_clear scenario to have at least 4 frames, got %d", len(frames))
	}

	for i := range frames {
		zones := spotter.Classify(&frames[i], spotter.SensitivityNormal)
		if len(zones) != 0 {
			t.Errorf("frame %d: expected 0 zones for all-clear, got %d zones: %+v", i, len(zones), zones)
		}
	}
}

func TestBuild_RightBasic(t *testing.T) {
	frames := Build(ScenarioRightBasic)
	if len(frames) < 4 {
		t.Fatalf("expected at least 4 frames, got %d", len(frames))
	}

	// Frame 1 should have an opponent on negative X (right side).
	frame1 := frames[1]
	var opponent *telemetry.VehicleScoring
	for i := range frame1.Vehicles {
		if !frame1.Vehicles[i].IsPlayer {
			opponent = &frame1.Vehicles[i]
			break
		}
	}
	if opponent == nil {
		t.Fatal("expected a non-player opponent in frame 1")
	}
	if opponent.Position.X >= 0 {
		t.Errorf("expected right opponent at negative X, got X=%f", opponent.Position.X)
	}

	// Frame 0 and 3 should have no opponents.
	if len(frames[0].Vehicles) > 1 {
		t.Errorf("frame 0 should have only player, got %d vehicles", len(frames[0].Vehicles))
	}
	if len(frames[3].Vehicles) > 1 {
		t.Errorf("frame 3 should have only player, got %d vehicles", len(frames[3].Vehicles))
	}

	// Verify deterministic timestamps.
	if frames[0].TimestampUnixMS != frames[len(frames)-1].TimestampUnixMS-3000 || len(frames) == 4 {
		// Timestamps should be 1000ms apart: base, base+1000, base+2000, base+3000
		if frames[1].TimestampUnixMS != frames[0].TimestampUnixMS+1000 {
			t.Errorf("expected deterministic 1s spacing, got frame0=%d frame1=%d",
				frames[0].TimestampUnixMS, frames[1].TimestampUnixMS)
		}
	}
}
