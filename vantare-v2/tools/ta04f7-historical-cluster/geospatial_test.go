package main

import (
	"context"
	"math"
	"testing"
)

func geoCircle(rotation float64) []GeoPoint {
	v := make([]GeoPoint, gridSize)
	for i := range v {
		u := (float64(i) + .5) / gridSize
		a := 2*math.Pi*u + rotation
		v[i] = GeoPoint{Lat: (100 * math.Sin(a) / 6371000) * 180 / math.Pi, Lon: (100 * math.Cos(a) / 6371000) * 180 / math.Pi}
	}
	return v
}
func TestCrossfitEvaluationMutationCannotChangeTrainingAnchorOrCenterline(t *testing.T) {
	laps := [][]GeoPoint{geoCircle(0), geoCircle(math.Pi / 2), geoCircle(math.Pi)}
	a1, c1, err := trainingGeometry(laps, []int{0, 2})
	if err != nil {
		t.Fatal(err)
	}
	for i := range laps[1] {
		laps[1][i].Lat += 10
		laps[1][i].Lon -= 20
	}
	a2, c2, err := trainingGeometry(laps, []int{0, 2})
	if err != nil {
		t.Fatal(err)
	}
	if a1 != a2 {
		t.Fatalf("anchor leaked: %+v %+v", a1, a2)
	}
	for i := range c1 {
		if c1[i] != c2[i] {
			t.Fatal("centerline leaked")
		}
	}
}
func TestCyclicInterpolationExactAndLastFirstBracket(t *testing.T) {
	u := []float64{.0005, .5, .9995}
	v := []float64{7, 20, 9}
	if got, err := interpolateCyclic(u, v, .0005); err != nil || got != 7 {
		t.Fatalf("exact %v %v", got, err)
	}
	got, err := interpolateCyclic(u, v, 0)
	if err != nil || math.Abs(got-8) > 1e-12 {
		t.Fatalf("wrap %v %v", got, err)
	}
	for i := 0; i < gridSize; i++ {
		target := (float64(i) + .5) / gridSize
		if _, err := interpolateCyclic(u, v, target); err != nil {
			t.Fatalf("bin %d: %v", i, err)
		}
	}
}
func TestGeoChainNonRigidAndConstantLedgers(t *testing.T) {
	a := geoCircle(0)
	w := geoCircle(0)
	for i := range w {
		radius := 100 + 11.0
		if i%2 == 1 {
			radius = 89
		}
		angle := 2 * math.Pi * (float64(i) + .5) / gridSize
		w[i] = GeoPoint{Lat: (radius * math.Sin(angle) / 6371000) * 180 / math.Pi, Lon: (radius * math.Cos(angle) / 6371000) * 180 / math.Pi}
	}
	g := crossfitGeo([][]GeoPoint{a, w})
	if g.Pass != 0 || g.FailThreshold != 2 || g.Total != 2 {
		t.Fatalf("nonrigid %+v", g)
	}
	constant := make([]GeoPoint, gridSize)
	g = crossfitGeo([][]GeoPoint{a, constant, geoCircle(0)})
	if g.Pass != 0 || g.FailGeometry != 1 || g.FailTraining != 2 || g.Total != 3 {
		t.Fatalf("constant %+v", g)
	}
}
func TestSyntheticParserNegativeLedgers(t *testing.T) {
	s := syntheticSpec{1, 2, []float64{0, 0}}
	got, err := (&productionBackend{}).materialize(context.Background(), buildSyntheticParser(9, s, syntheticNonrigid11, 100))
	if err != nil || got.Pass != 0 || got.FailThreshold != 2 || got.Laps != 2 {
		t.Fatalf("nonrigid %+v %v", got, err)
	}
	s = syntheticSpec{1, 3, []float64{0, 0, 0}}
	got, err = (&productionBackend{}).materialize(context.Background(), buildSyntheticParser(10, s, syntheticConstantOrdinal1, 100))
	if err != nil || got.Pass != 0 || got.FailGeometry != 1 || got.FailTraining != 2 || got.Laps != 3 {
		t.Fatalf("constant %+v %v", got, err)
	}
}

func TestMaterializeAcceptsObservedLMUMultirateChannels(t *testing.T) {
	p := buildSyntheticParser(11, syntheticSpec{1, 2, []float64{0, 0}}, syntheticNone, 100)
	if len(p.values["GPS Time"]) != 10*len(p.values["Lap Dist"]) {
		t.Fatal("synthetic must exercise LMU multirate cardinality")
	}

	got, err := (&productionBackend{}).materialize(context.Background(), p)
	if err != nil || got.Class != "accepted" || got.Laps != 2 {
		t.Fatalf("class=%q laps=%d err=%v", got.Class, got.Laps, err)
	}
}
