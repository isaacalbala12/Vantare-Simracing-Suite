package main

import (
	"math"
	"testing"
)

func oracleFixture() OracleRecording {
	const n = 8
	r := OracleRecording{Frequency: 100, GPSTimeFrequency: 100, CoordinateFrequency: 100, CoordinateFirst: 0, CoordinateLast: n - 1, CoordinateCount: n}
	for i := 0; i < n; i++ {
		ld := float64(i % 2)
		r.GPSTime = append(r.GPSTime, OracleValue{int64(i), float64(i) / 100})
		r.LapDist = append(r.LapDist, OracleValue{int64(i), ld})
		r.TotalDist = append(r.TotalDist, OracleValue{int64(i), float64(i)})
	}
	r.Events = []LapEvent{{0, 0, 0, true, true}, {1, .01, 1, true, true}, {3, .03, 2, true, true}, {5, .05, 3, true, true}, {7, .07, 4, true, true}}
	return r
}
func TestF6OracleSnapshotResetsAndHalfOpenLengths(t *testing.T) {
	r := oracleFixture()
	got := classifyOracle(r)
	if got.Class != "accepted" || len(got.Laps) != 2 {
		t.Fatalf("%+v", got)
	}
	for i, l := range got.Laps {
		if l.Start != 2*i+2 || l.End != 2*i+4 || l.LapLength != 1 || l.TotalLength != 1 {
			t.Fatalf("lap %d %+v", i, l)
		}
	}
	r.Events = r.Events[2:]
	if classifyOracle(r).Class != "insufficient_laps" {
		t.Fatal("snapshot cardinality not honored")
	}
}
func TestF6OracleInclusiveAndNextafterLimits(t *testing.T) {
	r := oracleFixture()
	r.GPSTime[4].Value += .01875
	if classifyOracle(r).Class != "accepted" {
		t.Fatal("exact gps residual")
	}
	if !oracleWithin(.0125, .0125) || oracleWithin(math.Nextafter(.0125, math.Inf(1)), .0125) {
		t.Fatal("gps inclusive nextafter")
	}
	if !oracleWithin(.113, .113) || oracleWithin(math.Nextafter(.113, math.Inf(1)), .113) {
		t.Fatal("event inclusive nextafter")
	}
}
func TestF6OracleCoverageGapsCoordinatesAndTotalMonotonic(t *testing.T) {
	cases := []func(*OracleRecording){func(r *OracleRecording) { r.GPSTime[3].Index++ }, func(r *OracleRecording) { r.CoordinateFirst = 3 }, func(r *OracleRecording) { r.CoordinateCount-- }, func(r *OracleRecording) { r.TotalDist[4].Value = r.TotalDist[3].Value - 1 }, func(r *OracleRecording) { r.LapDist = r.LapDist[:7] }}
	for i, mut := range cases {
		r := oracleFixture()
		mut(&r)
		if classifyOracle(r).Class != "data_invalid" {
			t.Fatalf("case %d", i)
		}
	}
}
