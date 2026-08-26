package main

// This is an adaptation of the frozen TA-04F6 oracle in
// tools/ta04f6-cohort-selector/selector.go. Keep its inclusive tolerances and
// half-open [start,end) semantics in lockstep with that protocol.
import (
	"math"
	"sort"
)

type OracleValue struct {
	Index int64
	Value float64
}
type OracleRecording struct {
	Frequency, GPSTimeFrequency, CoordinateFrequency float64
	CoordinateFirst, CoordinateLast                  int
	CoordinateCount                                  int
	GPSTime, LapDist, TotalDist                      []OracleValue
	Events                                           []LapEvent
}
type OracleLap struct {
	Start, End             int
	LapLength, TotalLength float64
}
type OracleResult struct {
	Class string
	Laps  []OracleLap
}

func clearOracleResult(r *OracleResult) {
	if r != nil {
		clear(r.Laps)
		r.Laps = nil
	}
}
func clearOracle(r *OracleRecording) {
	if r == nil {
		return
	}
	clear(r.GPSTime)
	clear(r.LapDist)
	clear(r.TotalDist)
	clear(r.Events)
	r.GPSTime = nil
	r.LapDist = nil
	r.TotalDist = nil
	r.Events = nil
}

type oracleWindow struct {
	valid bool
	b     float64
	lap   OracleLap
}

func oracleWithin(v, limit float64) bool { return v <= limit }

func classifyOracle(r OracleRecording) OracleResult {
	if len(r.Events) < 2 {
		return OracleResult{Class: "insufficient_laps"}
	}
	if !validOracleRecording(r) {
		return OracleResult{Class: "data_invalid"}
	}
	type reset struct {
		pos int
		raw int64
	}
	var resets []reset
	for i := 1; i < len(r.LapDist); i++ {
		if r.LapDist[i].Value < r.LapDist[i-1].Value {
			resets = append(resets, reset{i, r.LapDist[i].Index})
		}
	}
	if len(resets) < 2 {
		return OracleResult{Class: "insufficient_laps"}
	}
	windows := make([]oracleWindow, len(resets)-1)
	for k := range windows {
		windows[k] = oracleWindowFor(r, resets[k].pos, resets[k+1].pos)
	}
	matched := make([]bool, len(resets))
	for k, z := range resets {
		if k+1 >= len(r.Events) {
			continue
		}
		left := k > 0 && windows[k-1].valid
		right := k < len(windows) && windows[k].valid
		if (k == 0 && !right) || (k == len(resets)-1 && !left) || (k > 0 && k < len(resets)-1 && (!left || !right)) {
			continue
		}
		res := 0.0
		if left {
			res = math.Abs(r.Events[k+1].Timestamp - (float64(z.raw)/r.Frequency + windows[k-1].b))
		}
		if right {
			x := math.Abs(r.Events[k+1].Timestamp - (float64(z.raw)/r.Frequency + windows[k].b))
			if x > res {
				res = x
			}
		}
		matched[k] = oracleWithin(res, .113)
	}
	out := OracleResult{}
	for k, w := range windows {
		if w.valid && matched[k] && matched[k+1] {
			out.Laps = append(out.Laps, w.lap)
		}
	}
	if len(out.Laps) < 2 {
		out.Class = "insufficient_laps"
	} else {
		out.Class = "accepted"
	}
	return out
}
func validOracleRecording(r OracleRecording) bool {
	if !finite(r.Frequency) || r.Frequency <= 0 || !finite(r.GPSTimeFrequency) || r.GPSTimeFrequency <= 0 || r.Frequency != r.CoordinateFrequency || len(r.GPSTime) == 0 || len(r.LapDist) == 0 || len(r.LapDist) != len(r.TotalDist) || r.CoordinateCount < 2 || r.CoordinateFirst < 0 || r.CoordinateLast < r.CoordinateFirst || r.CoordinateLast-r.CoordinateFirst+1 != r.CoordinateCount {
		return false
	}
	for _, ch := range [][]OracleValue{r.GPSTime, r.LapDist, r.TotalDist} {
		for i, s := range ch {
			if s.Index < 0 || !finite(s.Value) || (i > 0 && s.Index != ch[i-1].Index+1) {
				return false
			}
		}
	}
	for i := range r.LapDist {
		if r.LapDist[i].Index != r.TotalDist[i].Index || r.LapDist[i].Value < 0 || r.TotalDist[i].Value < 0 || (i > 0 && r.TotalDist[i].Value < r.TotalDist[i-1].Value) {
			return false
		}
	}
	lo, hi := r.GPSTime[0].Value, r.GPSTime[len(r.GPSTime)-1].Value
	for i, e := range r.Events {
		if !e.Present || !e.Valid || e.Index < 0 || !finite(e.Timestamp) || !finite(e.Value) || e.Timestamp < lo || e.Timestamp > hi || (i > 0 && (e.Index <= r.Events[i-1].Index || e.Timestamp <= r.Events[i-1].Timestamp)) {
			return false
		}
	}
	return true
}
func oracleWindowFor(r OracleRecording, start, end int) oracleWindow {
	if end-start < 2 {
		return oracleWindow{}
	}
	ts, te := float64(r.LapDist[start].Index)/r.Frequency, float64(r.LapDist[end].Index)/r.Frequency
	first := sort.Search(len(r.GPSTime), func(i int) bool { return float64(r.GPSTime[i].Index)/r.GPSTimeFrequency >= ts })
	after := sort.Search(len(r.GPSTime), func(i int) bool { return float64(r.GPSTime[i].Index)/r.GPSTimeFrequency > te })
	selected := r.GPSTime[first:after]
	if len(selected) < 2 || float64(selected[0].Index)/r.GPSTimeFrequency < ts || !oracleWithin(float64(selected[0].Index)/r.GPSTimeFrequency-ts, .0125) || !oracleWithin(te-float64(selected[len(selected)-1].Index)/r.GPSTimeFrequency, .0125) {
		return oracleWindow{}
	}
	b := 0.0
	for _, s := range selected {
		b += s.Value - float64(s.Index)/r.GPSTimeFrequency
	}
	b /= float64(len(selected))
	for _, s := range selected {
		if !oracleWithin(math.Abs(s.Value-(float64(s.Index)/r.GPSTimeFrequency+b)), .0125) {
			return oracleWindow{}
		}
	}
	cf, cl := math.Ceil(ts*r.CoordinateFrequency), math.Floor(te*r.CoordinateFrequency)
	if cf < float64(r.CoordinateFirst) {
		cf = float64(r.CoordinateFirst)
	}
	if cl > float64(r.CoordinateLast) {
		cl = float64(r.CoordinateLast)
	}
	if cl-cf+1 < 2 || cf/r.CoordinateFrequency < ts || !oracleWithin(cf/r.CoordinateFrequency-ts, 1/r.CoordinateFrequency) || cl/r.CoordinateFrequency > te || !oracleWithin(te-cl/r.CoordinateFrequency, 1/r.CoordinateFrequency) {
		return oracleWindow{}
	}
	ld := r.LapDist[end-1].Value - r.LapDist[start].Value
	td := r.TotalDist[end-1].Value - r.TotalDist[start].Value
	if !finite(ld) || !finite(td) || ld <= 0 || td <= 0 || !oracleWithin(math.Abs(td-ld)/math.Max(td, ld), .003) {
		return oracleWindow{}
	}
	return oracleWindow{true, b, OracleLap{start, end, ld, td}}
}
