package delta_test

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/delta"
)

func TestComputeDelta_Exact(t *testing.T) {
	ref := delta.NewReferenceLap("self", "Spa", "GT3", []delta.LapPoint{
		{Distance: 0, TimeIntoLap: 0},
		{Distance: 1000, TimeIntoLap: 20},
		{Distance: 2000, TimeIntoLap: 40},
	})

	// Same time as reference at 1000m -> delta 0
	current := delta.LapPoint{Distance: 1000, TimeIntoLap: 20}
	d, ok := delta.ComputeDelta(ref, current)
	if !ok {
		t.Fatal("expected ok")
	}
	if d != 0 {
		t.Fatalf("expected 0 delta, got %f", d)
	}
}

func TestComputeDelta_Slower(t *testing.T) {
	ref := delta.NewReferenceLap("self", "Spa", "GT3", []delta.LapPoint{
		{Distance: 0, TimeIntoLap: 0},
		{Distance: 1000, TimeIntoLap: 20},
		{Distance: 2000, TimeIntoLap: 40},
	})

	// 1s slower at 1000m -> delta +1
	current := delta.LapPoint{Distance: 1000, TimeIntoLap: 21}
	d, ok := delta.ComputeDelta(ref, current)
	if !ok {
		t.Fatal("expected ok")
	}
	if d != 1 {
		t.Fatalf("expected 1.0 delta, got %f", d)
	}
}

func TestComputeDelta_Faster(t *testing.T) {
	ref := delta.NewReferenceLap("self", "Spa", "GT3", []delta.LapPoint{
		{Distance: 0, TimeIntoLap: 0},
		{Distance: 1000, TimeIntoLap: 20},
		{Distance: 2000, TimeIntoLap: 40},
	})

	// 0.5s faster at 1500m (interpolated ref=30)
	current := delta.LapPoint{Distance: 1500, TimeIntoLap: 29.5}
	d, ok := delta.ComputeDelta(ref, current)
	if !ok {
		t.Fatal("expected ok")
	}
	if math.Abs(d+0.5) > 0.001 {
		t.Fatalf("expected -0.5 delta, got %f", d)
	}
}

func TestComputeDelta_InterpolateBetweenPoints(t *testing.T) {
	ref := delta.NewReferenceLap("self", "Spa", "GT3", []delta.LapPoint{
		{Distance: 0, TimeIntoLap: 0},
		{Distance: 500, TimeIntoLap: 10},
		{Distance: 1000, TimeIntoLap: 20},
	})

	// At 750m, ref time = 15 (interpolated). Current = 16 -> delta +1
	current := delta.LapPoint{Distance: 750, TimeIntoLap: 16}
	d, ok := delta.ComputeDelta(ref, current)
	if !ok {
		t.Fatal("expected ok")
	}
	if math.Abs(d-1) > 0.001 {
		t.Fatalf("expected 1.0 delta, got %f", d)
	}
}

func TestComputeDelta_NilRef(t *testing.T) {
	d, ok := delta.ComputeDelta(nil, delta.LapPoint{})
	if ok {
		t.Fatal("expected false for nil ref")
	}
	if d != 0 {
		t.Fatalf("expected 0, got %f", d)
	}
}

func TestComputeDelta_EmptyPoints(t *testing.T) {
	ref := delta.NewReferenceLap("self", "Spa", "GT3", []delta.LapPoint{})
	_, ok := delta.ComputeDelta(ref, delta.LapPoint{Distance: 100, TimeIntoLap: 5})
	if ok {
		t.Fatal("expected false for empty ref")
	}
}

func TestComputeDelta_BeforeFirstPoint(t *testing.T) {
	ref := delta.NewReferenceLap("self", "Spa", "GT3", []delta.LapPoint{
		{Distance: 100, TimeIntoLap: 5},
		{Distance: 200, TimeIntoLap: 10},
	})

	// Before the first point, use first point's time
	current := delta.LapPoint{Distance: 50, TimeIntoLap: 4}
	d, ok := delta.ComputeDelta(ref, current)
	if !ok {
		t.Fatal("expected ok")
	}
	// ref at 50m = 5s, current = 4s -> delta -1
	if math.Abs(d+1) > 0.001 {
		t.Fatalf("expected -1.0 delta, got %f", d)
	}
}

func TestComputeDelta_AfterLastPoint(t *testing.T) {
	ref := delta.NewReferenceLap("self", "Spa", "GT3", []delta.LapPoint{
		{Distance: 100, TimeIntoLap: 5},
		{Distance: 200, TimeIntoLap: 10},
	})

	// Past the last point, use last point's time
	current := delta.LapPoint{Distance: 250, TimeIntoLap: 12}
	d, ok := delta.ComputeDelta(ref, current)
	if !ok {
		t.Fatal("expected ok")
	}
	// ref at 250m = 10s, current = 12s -> delta +2
	if math.Abs(d-2) > 0.001 {
		t.Fatalf("expected 2.0 delta, got %f", d)
	}
}

func TestSyntheticReference(t *testing.T) {
	ref := delta.SyntheticReference(100, 5000, 20)
	if ref == nil {
		t.Fatal("expected non-nil ref")
	}
	if len(ref.Points) != 21 {
		t.Fatalf("expected 21 points, got %d", len(ref.Points))
	}
	// First point at distance 0, time 0
	if ref.Points[0].Distance != 0 || ref.Points[0].TimeIntoLap != 0 {
		t.Fatalf("first point: got (%f, %f)", ref.Points[0].Distance, ref.Points[0].TimeIntoLap)
	}
	// Last point at distance 5000, time 100
	last := ref.Points[len(ref.Points)-1]
	if math.Abs(last.Distance-5000) > 0.1 || math.Abs(last.TimeIntoLap-100) > 0.01 {
		t.Fatalf("last point: got (%f, %f), want (5000, 100)", last.Distance, last.TimeIntoLap)
	}
	// Mid point at distance 2500, time 50
	mid := ref.Points[10]
	if math.Abs(mid.Distance-2500) > 1 || math.Abs(mid.TimeIntoLap-50) > 0.1 {
		t.Fatalf("mid point: got (%f, %f), want (2500, 50)", mid.Distance, mid.TimeIntoLap)
	}
}

func TestSyntheticReference_NegativeTime(t *testing.T) {
	ref := delta.SyntheticReference(-1, 5000, 20)
	if ref != nil {
		t.Fatal("expected nil for negative time")
	}
}

func TestStore_RecordAndCompleteLap(t *testing.T) {
	s := delta.NewStore()
	s.RecordPoint(1, "Spa", "GT3", 0, 0)
	s.RecordPoint(1, "Spa", "GT3", 500, 10)
	s.RecordPoint(1, "Spa", "GT3", 1000, 20)

	s.CompleteLap(1, "Spa", "GT3", 20, "self")

	ref := s.GetReference("self", 1, "Spa", "GT3", 0, 0)
	if ref == nil {
		t.Fatal("expected self lap reference")
	}
	if len(ref.Points) != 3 {
		t.Fatalf("expected 3 points, got %d", len(ref.Points))
	}
}

func TestStore_GetReferenceSelfFallback(t *testing.T) {
	s := delta.NewStore()
	// No self lap recorded yet, but bestLapTime and trackLength provided
	ref := s.GetReference("self", 1, "Spa", "GT3", 5000, 100)
	if ref == nil {
		t.Fatal("expected synthetic fallback")
	}
}

func TestStore_GetReferenceSessionFallback(t *testing.T) {
	s := delta.NewStore()
	ref := s.GetReference("session", 0, "Spa", "GT3", 5000, 100)
	if ref == nil {
		t.Fatal("expected synthetic session lap")
	}
}

func TestStore_GetReferenceUnknownMode(t *testing.T) {
	s := delta.NewStore()
	ref := s.GetReference("unknown", 0, "Spa", "GT3", 0, 0)
	if ref != nil {
		t.Fatal("expected nil for unknown mode")
	}
}
