package main

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

var ErrGeometry = errors.New("geometry_unavailable")

const gridSize = 1000

func centerlineTwoPass(series [][]Point) ([]Point, error) {
	if len(series) == 0 {
		return nil, errors.New("empty centerline")
	}
	for _, v := range series {
		if len(v) != gridSize {
			return nil, errors.New("grid")
		}
	}
	first := series[0]
	aligned := make([][]Point, len(series))
	defer func() {
		for _, v := range aligned {
			clear(v)
		}
		clear(aligned)
	}()
	for i, v := range series {
		a, err := alignRigid(v, first)
		if err != nil {
			return nil, err
		}
		aligned[i] = a
	}
	provisional, err := coordinateMedian(aligned)
	if err != nil {
		return nil, err
	}
	defer clear(provisional)
	for i, v := range series {
		a, e := alignRigid(v, provisional)
		if e != nil {
			return nil, e
		}
		clear(aligned[i])
		aligned[i] = a
	}
	final, err := coordinateMedian(aligned)
	if err != nil {
		return nil, err
	}
	defer clear(final)
	return append([]Point(nil), final...), nil
}
func recordingCenterline(laps [][]Point) ([]Point, error) { return centerlineTwoPass(laps) }
func groupCenterline(recordings [][]Point) ([]Point, error) {
	v, e := centerlineTwoPass(recordings)
	if e != nil {
		return nil, fmt.Errorf("%w: %v", ErrGeometry, e)
	}
	return v, nil
}
func diagnoseGroupCenterline(v [][]Point, fn func([][]Point) ([]Point, error)) error {
	_, err := fn(v)
	if err == nil || errors.Is(err, ErrGeometry) {
		return nil
	}
	return err
}
func coordinateMedian(v [][]Point) ([]Point, error) {
	out := make([]Point, gridSize)
	xs := make([]float64, len(v))
	ys := make([]float64, len(v))
	defer clear(xs)
	defer clear(ys)
	for i := 0; i < gridSize; i++ {
		for j := range v {
			xs[j] = v[j][i].X
			ys[j] = v[j][i].Y
		}
		x, e := median(xs)
		if e != nil {
			return nil, e
		}
		y, e := median(ys)
		if e != nil {
			return nil, e
		}
		out[i] = Point{x, y}
	}
	return out, nil
}

type CrossfitLedger struct {
	Total, Pass, FailThreshold, FailGeometry, FailTraining int
	Structural                                             bool
}

func crossfit(laps [][]Point) CrossfitLedger {
	r := CrossfitLedger{Total: len(laps), Structural: len(laps) >= 2}
	if len(laps) < 2 {
		r.Structural = false
		r.FailTraining = len(laps)
		return r
	}
	for parity := 0; parity < 2; parity++ {
		var train, eval [][]Point
		defer clear(train)
		defer clear(eval)
		for i, v := range laps {
			if i%2 == parity {
				train = append(train, v)
			} else {
				eval = append(eval, v)
			}
		}
		if len(train) == 0 || len(eval) == 0 {
			r.Structural = false
			r.FailTraining += len(eval)
			continue
		}
		center, err := recordingCenterline(train)
		if err != nil {
			r.Structural = false
			r.FailTraining += len(eval)
			continue
		}
		defer clear(center)
		for _, lap := range eval {
			aligned, e := alignRigid(lap, center)
			if e != nil {
				r.FailGeometry++
				continue
			}
			defer clear(aligned)
			res := make([]float64, gridSize)
			defer clear(res)
			valid := true
			for i := range res {
				res[i] = math.Hypot(aligned[i].X-center[i].X, aligned[i].Y-center[i].Y)
				if !finite(res[i]) {
					valid = false
					break
				}
			}
			if !valid {
				r.FailGeometry++
				continue
			}
			sort.Float64s(res)
			p95 := res[int(math.Ceil(.95*float64(len(res))))-1]
			p99 := res[int(math.Ceil(.99*float64(len(res))))-1]
			if slotPass(p95, p99) {
				r.Pass++
			} else {
				r.FailThreshold++
			}
		}
	}
	return r
}
