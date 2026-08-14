package main

import (
	"errors"
	"math"
	"testing"
)

func TestGroupDiagnosticExpectedUnavailableAndUnexpected(t *testing.T) {
	if err := diagnoseGroupCenterline(nil, func([][]Point) ([]Point, error) { return nil, ErrGeometry }); err != nil {
		t.Fatal(err)
	}
	sentinel := errors.New("unexpected")
	if err := diagnoseGroupCenterline(nil, func([][]Point) ([]Point, error) { return nil, sentinel }); !errors.Is(err, sentinel) {
		t.Fatalf("%v", err)
	}
}

func circleLap(rotation, wobble float64) []Point {
	v := make([]Point, gridSize)
	for i := range v {
		u := (float64(i) + .5) / gridSize
		r := 100.0
		if wobble != 0 {
			if i%2 == 0 {
				r += wobble
			} else {
				r -= wobble
			}
		}
		a := 2*math.Pi*u + rotation
		v[i] = Point{r * math.Cos(a), r * math.Sin(a)}
	}
	return v
}

func TestGoldenCircleCrossfitABRotations(t *testing.T) {
	a1 := [][]Point{circleLap(0, 0), circleLap(math.Pi/2, 0)}
	a2 := [][]Point{circleLap(math.Pi, 0), circleLap(-math.Pi/2, 0), circleLap(0, 0)}
	b1 := [][]Point{circleLap(math.Pi/2, 0), circleLap(math.Pi, 0)}
	for name, laps := range map[string][][]Point{"A1": a1, "A2": a2, "B1": b1} {
		got := crossfit(laps)
		if got.Pass != len(laps) || got.FailThreshold+got.FailGeometry+got.FailTraining != 0 || !got.Structural {
			t.Fatalf("%s %+v", name, got)
		}
	}
	ca, err := recordingCenterline(a1)
	if err != nil {
		t.Fatal(err)
	}
	cb, err := recordingCenterline(a2)
	if err != nil {
		t.Fatal(err)
	}
	group, err := groupCenterline([][]Point{ca, cb})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range group {
		if math.Abs(math.Hypot(p.X, p.Y)-100) > 1e-9 {
			t.Fatal("circle centerline")
		}
	}
}

func TestNonRigidElevenMetersCannotBeEliminated(t *testing.T) {
	got := crossfit([][]Point{circleLap(0, 0), circleLap(0, 11)})
	if got.Pass != 0 || got.FailThreshold != 2 || got.Total != 2 {
		t.Fatalf("%+v", got)
	}
}

func TestConstantOrdinalOneLedgerIsFixed(t *testing.T) {
	c := make([]Point, gridSize)
	got := crossfit([][]Point{circleLap(0, 0), c, circleLap(0, 0)})
	if got.Pass != 0 || got.FailThreshold != 0 || got.FailGeometry != 1 || got.FailTraining != 2 || got.Total != 3 {
		t.Fatalf("%+v", got)
	}
}

func TestCrossfitFixedDenominatorThresholdCardinalities(t *testing.T) {
	for _, n := range []int{2, 3, 4, 5} {
		laps := make([][]Point, n)
		for i := range laps {
			laps[i] = circleLap(float64(i)*math.Pi/2, 0)
		}
		got := crossfit(laps)
		if got.Total != n || got.Pass != n || !recordingPass(got.Pass, got.Total) {
			t.Fatalf("n=%d %+v", n, got)
		}
	}
	if !recordingPass(4, 5) || recordingPass(3, 5) {
		t.Fatal("80 percent denominator")
	}
}

func TestGroupCenterlineGivesRecordingsEqualWeight(t *testing.T) {
	a := circleLap(0, 0)
	b := circleLap(0, 0)
	c := circleLap(0, 0)
	for i := range b {
		b[i].X *= 1.1
		b[i].Y *= 1.1
		c[i].X *= 1.2
		c[i].Y *= 1.2
	}
	one, err := groupCenterline([][]Point{a, c})
	if err != nil {
		t.Fatal(err)
	}
	many, err := groupCenterline([][]Point{a, b, c})
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(math.Hypot(one[0].X, one[0].Y)-110) > 1e-9 || math.Abs(math.Hypot(many[0].X, many[0].Y)-110) > 1e-9 {
		t.Fatal("recording weights were not equal")
	}
}
