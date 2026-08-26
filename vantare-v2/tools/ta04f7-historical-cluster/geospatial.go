package main

import (
	"errors"
	"math"
	"sort"
)

type GeoPoint struct{ Lat, Lon float64 }

func interpolateCyclic(u, v []float64, target float64) (float64, error) {
	if len(u) != len(v) || len(u) < 2 || target < 0 || target >= 1 {
		return 0, errors.New("interpolation")
	}
	i := sort.SearchFloat64s(u, target)
	if i < len(u) && u[i] == target {
		return v[i], nil
	}
	lo, hi := i-1, i
	if i == 0 {
		lo = len(u) - 1
		hi = 0
	} else if i == len(u) {
		lo = len(u) - 1
		hi = 0
	}
	ul, uh := u[lo], u[hi]
	t := target
	if hi == 0 {
		uh += 1
		if t < ul {
			t += 1
		}
	}
	d := uh - ul
	if d <= 0 {
		return 0, errors.New("interpolation")
	}
	out := v[lo] + (t-ul)/d*(v[hi]-v[lo])
	if !finite(out) {
		return 0, errors.New("interpolation")
	}
	return out, nil
}
func geoAnchor(laps [][]GeoPoint, indices []int) (GeoPoint, error) {
	var a GeoPoint
	n := 0
	for _, k := range indices {
		if k < 0 || k >= len(laps) || len(laps[k]) != gridSize {
			return a, errors.New("anchor")
		}
		for _, p := range laps[k] {
			if !finite(p.Lat) || !finite(p.Lon) {
				return a, errors.New("anchor")
			}
			a.Lat += p.Lat
			a.Lon += p.Lon
			n++
		}
	}
	if n == 0 {
		return a, errors.New("anchor")
	}
	a.Lat /= float64(n)
	a.Lon /= float64(n)
	return a, nil
}
func projectGeo(lap []GeoPoint, a GeoPoint) ([]Point, error) {
	out := make([]Point, len(lap))
	lat0, lon0 := a.Lat*math.Pi/180, a.Lon*math.Pi/180
	for i, p := range lap {
		lat, lon := p.Lat*math.Pi/180, p.Lon*math.Pi/180
		out[i] = Point{6371000 * math.Cos(lat0) * (lon - lon0), 6371000 * (lat - lat0)}
		if !finite(out[i].X) || !finite(out[i].Y) {
			return nil, errors.New("projection")
		}
	}
	return out, nil
}
func trainingGeometry(laps [][]GeoPoint, indices []int) (GeoPoint, []Point, error) {
	a, e := geoAnchor(laps, indices)
	if e != nil {
		return a, nil, e
	}
	p := make([][]Point, len(indices))
	defer func() {
		for _, v := range p {
			clear(v)
		}
		clear(p)
	}()
	for i, k := range indices {
		p[i], e = projectGeo(laps[k], a)
		if e != nil {
			return a, nil, e
		}
	}
	c, e := recordingCenterline(p)
	return a, c, e
}
func crossfitGeo(laps [][]GeoPoint) CrossfitLedger {
	r := CrossfitLedger{Total: len(laps), Structural: len(laps) >= 2}
	if len(laps) < 2 {
		r.Structural = false
		r.FailTraining = len(laps)
		return r
	}
	for parity := 0; parity < 2; parity++ {
		var train, eval []int
		defer clear(train)
		defer clear(eval)
		for i := range laps {
			if i%2 == parity {
				train = append(train, i)
			} else {
				eval = append(eval, i)
			}
		}
		a, c, e := trainingGeometry(laps, train)
		if e != nil {
			r.Structural = false
			r.FailTraining += len(eval)
			continue
		}
		defer clear(c)
		for _, k := range eval {
			p, x := projectGeo(laps[k], a)
			if x != nil {
				r.FailGeometry++
				continue
			}
			defer clear(p)
			aligned, x := alignRigid(p, c)
			if x != nil {
				r.FailGeometry++
				continue
			}
			defer clear(aligned)
			res := make([]float64, len(c))
			defer clear(res)
			for i := range c {
				res[i] = math.Hypot(aligned[i].X-c[i].X, aligned[i].Y-c[i].Y)
			}
			sort.Float64s(res)
			if slotPass(res[int(math.Ceil(.95*float64(len(res))))-1], res[int(math.Ceil(.99*float64(len(res))))-1]) {
				r.Pass++
			} else {
				r.FailThreshold++
			}
		}
	}
	return r
}
