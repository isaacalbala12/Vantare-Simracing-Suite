package main

import (
	"math"
	"testing"
	"time"
)

func TestGoldenClassificationAndPhysicalOrdinalGraph(t *testing.T) {
	r, err := ClassifyV1(goldenRecording(t))
	if err != nil {
		t.Fatal(err)
	}
	if r.Population != PopulationEvaluable || r.Resets != 13 || r.Boundaries != 13 || r.WindowsAttempted != 12 || r.WindowsValid != 12 || r.Matches != 13 || r.Mismatches != 0 || r.OneSideInvalid != 0 || r.Unpaired != 0 || len(r.PreliminaryLaps) != 12 {
		t.Fatalf("unexpected result: %+v", r)
	}
	for _, lap := range r.PreliminaryLaps {
		if lap.TotalLength != 1 || lap.LapLength != 1 {
			t.Fatalf("length %+v", lap)
		}
	}

	wrong := goldenRecording(t)
	for i := 1; i < len(wrong.LapEvents.Events); i++ {
		wrong.LapEvents.Events[i].Timestamp += 2
	}
	wrong.GPSTime.Samples = append(wrong.GPSTime.Samples,
		SampleV1{Index: 53, Value: 26.75, Quality: "valid"},
		SampleV1{Index: 54, Value: 27.25, Quality: "valid"})
	r, err = ClassifyV1(wrong)
	if err != nil {
		t.Fatal(err)
	}
	if r.Matches != 0 || r.Mismatches != 13 || len(r.PreliminaryLaps) != 0 {
		t.Fatalf("off-by-one pairing accepted: %+v", r)
	}
}

func TestPopulationPrecedenceAndOracleDefects(t *testing.T) {
	base := goldenRecording(t)
	for n := 0; n <= 1; n++ {
		r := base
		r.LapEvents.Events = append([]EventV1(nil), base.LapEvents.Events[:n]...)
		if n == 1 {
			r.LapEvents.Events[0].Timestamp = math.NaN()
		}
		got, err := ClassifyV1(r)
		if err != nil || got.Population != PopulationLowEvent {
			t.Fatalf("n=%d got=%+v err=%v", n, got, err)
		}
	}
	cases := []func(*CanonicalRecordingV1){
		func(r *CanonicalRecordingV1) { r.LapEvents.Events[1].Present = false },
		func(r *CanonicalRecordingV1) { r.LapEvents.Events[1].Quality = "bad" },
		func(r *CanonicalRecordingV1) { r.LapEvents.Events[1].Timestamp = math.Inf(1) },
		func(r *CanonicalRecordingV1) { r.LapEvents.Events[2].Index = r.LapEvents.Events[1].Index },
		func(r *CanonicalRecordingV1) { r.LapEvents.Events[2].Timestamp = r.LapEvents.Events[1].Timestamp },
		func(r *CanonicalRecordingV1) { r.LapEvents.Events[len(r.LapEvents.Events)-1].Timestamp = 100 },
	}
	for i, mutate := range cases {
		r := base
		r.LapEvents.Events = append([]EventV1(nil), base.LapEvents.Events...)
		mutate(&r)
		got, err := ClassifyV1(r)
		if err != nil || got.Population != PopulationInvalid {
			t.Fatalf("case %d got=%+v err=%v", i, got, err)
		}
	}
}

func TestThresholdsOneSideAndNoCompaction(t *testing.T) {
	base := goldenRecording(t)
	exact := cloneRecording(base)
	exact.LapEvents.Events[2].Timestamp += .113
	got, err := ClassifyV1(exact)
	if err != nil {
		t.Fatal(err)
	}
	if got.Mismatches != 0 {
		t.Fatalf("exact threshold failed: %+v", got)
	}
	over := cloneRecording(base)
	over.LapEvents.Events[2].Timestamp += .113001
	got, err = ClassifyV1(over)
	if err != nil {
		t.Fatal(err)
	}
	if got.Mismatches != 1 || len(got.PreliminaryLaps) != 10 {
		t.Fatalf("boundary adjacency wrong: %+v", got)
	}

	broken := cloneRecording(base)
	// Make only W[5] invalid by creating a GPS residual over 0.0125 inside it.
	broken.GPSTime.Samples[23].Value += .02
	got, err = ClassifyV1(broken)
	if err != nil {
		t.Fatal(err)
	}
	if got.WindowsValid != 11 || got.OneSideInvalid != 2 || got.Boundaries != 13 {
		t.Fatalf("physical graph compacted: %+v", got)
	}
	outer := goldenRecording(t)
	outer.GPSTime.Samples[3].Value += .02
	got, err = ClassifyV1(outer)
	if err != nil || got.WindowsValid != 11 || got.OneSideInvalid != 2 {
		t.Fatalf("outer one-side rule: %+v %v", got, err)
	}
}

func cloneRecording(r CanonicalRecordingV1) CanonicalRecordingV1 {
	r.GPSTime.Samples = append([]SampleV1(nil), r.GPSTime.Samples...)
	r.LapDist.Samples = append([]SampleV1(nil), r.LapDist.Samples...)
	r.TotalDist.Samples = append([]SampleV1(nil), r.TotalDist.Samples...)
	r.LapEvents.Events = append([]EventV1(nil), r.LapEvents.Events...)
	return r
}

func TestThresholdsUseDirectIEEEComparison(t *testing.T) {
	for _, limit := range []float64{.0125, .113, .003} {
		if !withinThreshold(limit, limit) {
			t.Fatalf("exact %g failed", limit)
		}
		if withinThreshold(math.Nextafter(limit, math.Inf(1)), limit) {
			t.Fatalf("nextafter %g passed", limit)
		}
	}
}

func TestFixedSlopeThresholdIsDirectThroughClassification(t *testing.T) {
	build := func(residual float64) CanonicalRecordingV1 {
		r := cloneRecording(goldenRecording(t))
		const hz = 1e300
		r.GPSTime.Frequency, r.LapDist.Frequency, r.TotalDist.Frequency, r.Coordinates.Frequency = hz, hz, hz, hz
		for i := range r.GPSTime.Samples {
			r.GPSTime.Samples[i].Value = float64(r.GPSTime.Samples[i].Index) / hz
		}
		r.GPSTime.Samples[1].Value += residual
		r.GPSTime.Samples[2].Value -= residual
		r.LapEvents.Events[0].Timestamp = 0
		for k := 0; k < 13; k++ {
			r.LapEvents.Events[k+1].Timestamp = float64(1+2*k) / hz
		}
		return r
	}
	exact, err := ClassifyV1(build(.0125))
	if err != nil || exact.WindowsValid != 12 {
		t.Fatalf("exact fixed-slope threshold: %+v %v", exact, err)
	}
	over, err := ClassifyV1(build(math.Nextafter(.0125, math.Inf(1))))
	if err != nil || over.WindowsValid != 11 {
		t.Fatalf("nextafter fixed-slope accepted: %+v %v", over, err)
	}
}

func TestLengthThresholdIsDirectThroughClassification(t *testing.T) {
	build := func(lapLength float64) CanonicalRecordingV1 {
		r := cloneRecording(goldenRecording(t))
		r.TotalDist.Samples[1].Value = 0
		for i := 2; i < len(r.TotalDist.Samples); i++ {
			r.TotalDist.Samples[i].Value = 123 + float64(i)
		}
		r.LapDist.Samples[2].Value = lapLength
		return r
	}
	// (125 - 124.625) / 125 is exactly 0.003 in IEEE-754.
	exact, err := ClassifyV1(build(124.625))
	if err != nil || exact.WindowsValid != 12 {
		t.Fatalf("exact length threshold: %+v %v", exact, err)
	}
	over, err := ClassifyV1(build(math.Nextafter(124.625, math.Inf(-1))))
	if err != nil || over.WindowsValid != 11 {
		t.Fatalf("nextafter length accepted: %+v %v", over, err)
	}
}

func TestFixedSlopeAndInternalBoundaryUseWorstSide(t *testing.T) {
	exact := goldenRecording(t)
	exact.GPSTime.Samples[3].Value += .0124
	exact.GPSTime.Samples[5].Value -= .0124
	got, err := ClassifyV1(exact)
	if err != nil || got.WindowsValid != 12 {
		t.Fatalf("exact clock residual failed: %+v %v", got, err)
	}
	over := goldenRecording(t)
	over.GPSTime.Samples[3].Value += .0126
	over.GPSTime.Samples[5].Value -= .0126
	got, err = ClassifyV1(over)
	if err != nil || got.WindowsValid != 11 {
		t.Fatalf("clock residual over threshold accepted: %+v %v", got, err)
	}

	leftFails := goldenRecording(t)
	for _, i := range []int{2, 3, 4, 5} {
		leftFails.GPSTime.Samples[i].Value += .01
	}
	leftFails.LapEvents.Events[2].Timestamp -= .108
	got, err = ClassifyV1(leftFails)
	if err != nil || got.Mismatches != 1 {
		t.Fatalf("favorable right side selected: %+v %v", got, err)
	}
	rightFails := goldenRecording(t)
	for _, i := range []int{7, 8, 9} {
		rightFails.GPSTime.Samples[i].Value += .01
	}
	rightFails.LapEvents.Events[2].Timestamp -= .108
	got, err = ClassifyV1(rightFails)
	if err != nil || got.Mismatches != 1 {
		t.Fatalf("favorable left side selected: %+v %v", got, err)
	}
}

func TestChannelAndLengthGuards(t *testing.T) {
	base := goldenRecording(t)
	cases := []func(*CanonicalRecordingV1){
		func(r *CanonicalRecordingV1) { r.GPSTime.Present = false },
		func(r *CanonicalRecordingV1) { r.LapDist.Quality = "bad" },
		func(r *CanonicalRecordingV1) { r.TotalDist.Frequency = 2 },
		func(r *CanonicalRecordingV1) { r.TotalDist.Samples = r.TotalDist.Samples[:26] },
		func(r *CanonicalRecordingV1) { r.TotalDist.Samples[3].Index = 9 },
		func(r *CanonicalRecordingV1) { r.TotalDist.Samples[3].Value = -1 },
		func(r *CanonicalRecordingV1) { r.Coordinates.LatitudePresent = false },
		func(r *CanonicalRecordingV1) { r.Coordinates.Count = 26 },
	}
	for i, mutate := range cases {
		r := base
		r.GPSTime.Samples = append([]SampleV1(nil), base.GPSTime.Samples...)
		r.LapDist.Samples = append([]SampleV1(nil), base.LapDist.Samples...)
		r.TotalDist.Samples = append([]SampleV1(nil), base.TotalDist.Samples...)
		mutate(&r)
		_, err := ClassifyV1(r)
		if !IsCode(err, CodeDataInvalid) {
			t.Fatalf("guard %d: %v", i, err)
		}
	}

	pass := cloneRecording(base)
	pass.TotalDist.Samples[2].Value = 2.003
	got, err := ClassifyV1(pass)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.PreliminaryLaps) != 12 {
		t.Fatalf("exact 0.003 failed")
	}
	fail := cloneRecording(base)
	fail.TotalDist.Samples[2].Value = 2.00302
	got, err = ClassifyV1(fail)
	if err != nil {
		t.Fatal(err)
	}
	if got.WindowsValid != 11 || len(got.PreliminaryLaps) != 10 {
		t.Fatalf("over 0.003 accepted: %d", len(got.PreliminaryLaps))
	}
}

func TestMedianSelectionOrderAndAllEligible(t *testing.T) {
	if v, err := median([]float64{3, 1, 2}); err != nil || v != 2 {
		t.Fatalf("odd %v %v", v, err)
	}
	if v, err := median([]float64{4, 1, 2, 3}); err != nil || v != 2.5 {
		t.Fatalf("even %v %v", v, err)
	}
	groups := []GroupKeyV1{{"a", "l", "c", "x"}, {"track", "layout", "car", "class"}, {"track", "layout", "car", "class"}, {"track", "layout", "car", "class"}, {"c", "l", "c", "x"}, {"c", "l", "c", "x"}, {"c", "l", "c", "x"}, {"c", "l", "c", "x"}}
	var results []RecordingResultV1
	for i, g := range groups {
		r := goldenRecording(t)
		r.Group = g
		got, err := ClassifyV1(r)
		if err != nil {
			t.Fatal(err)
		}
		got.Order = i
		got.RecordingToken = string(rune('a' + i))
		results = append(results, got)
	}
	freeze, err := SelectCohortV1(results)
	if err != nil {
		t.Fatal(err)
	}
	if freeze.Group != groups[1] || len(freeze.Recordings) != 3 || len(freeze.Laps) != 36 || freeze.Center != 1 {
		t.Fatalf("selection %+v", freeze)
	}
	// A later, larger C group must not displace B.
}

func TestGroupFirstAppearancePrecedesEligibility(t *testing.T) {
	a, b := GroupKeyV1{"a", "l", "c", "x"}, GroupKeyV1{"b", "l", "c", "x"}
	makeR := func(g GroupKeyV1, token string, n int) RecordingResultV1 {
		r := RecordingResultV1{Group: g, Population: PopulationEvaluable, RecordingToken: token, PreliminaryLaps: make([]LapV1, n), RecordingMedian: 1}
		for i := range r.PreliminaryLaps {
			r.PreliminaryLaps[i].TotalLength = 1
		}
		return r
	}
	results := []RecordingResultV1{makeR(a, "a0", 9), makeR(b, "b0", 10), makeR(b, "b1", 10), makeR(b, "b2", 10), makeR(a, "a1", 10), makeR(a, "a2", 10), makeR(a, "a3", 10)}
	f, err := SelectCohortV1(results)
	if err != nil || f.Group != a || len(f.Recordings) != 3 {
		t.Fatalf("eligibility reordered groups: %+v %v", f, err)
	}
}

func TestGlobalValidLapsExcludesGroupsWithoutCenter(t *testing.T) {
	makeResult := func(token string, group GroupKeyV1) RecordingResultV1 {
		laps := make([]LapV1, 12)
		for i := range laps {
			laps[i] = LapV1{StartOrdinal: uint64(i), EndOrdinal: uint64(i + 1), LapLength: 1, TotalLength: 1}
		}
		return RecordingResultV1{Group: group, RecordingToken: token, Population: PopulationEvaluable, PreliminaryLaps: laps, RecordingMedian: 1}
	}
	a, b, c := GroupKeyV1{"a", "l", "c", "x"}, GroupKeyV1{"b", "l", "c", "x"}, GroupKeyV1{"c", "l", "c", "x"}
	results := []RecordingResultV1{makeResult("a", a), makeResult("b1", b), makeResult("b2", b), makeResult("b3", b), makeResult("c1", c), makeResult("c2", c), makeResult("c3", c), makeResult("c4", c)}
	freeze, total, err := SelectCohortAndCountValidLapsV1(results)
	if err != nil {
		t.Fatal(err)
	}
	if freeze.Group != b || len(freeze.Laps) != 36 || total != 84 {
		t.Fatalf("group=%+v selected=%d global=%d", freeze.Group, len(freeze.Laps), total)
	}
}

func TestMinimumCompositionAndAllEligible(t *testing.T) {
	g := GroupKeyV1{"g", "l", "c", "x"}
	makeN := func(token string, n int) RecordingResultV1 {
		r := RecordingResultV1{Group: g, Population: PopulationEvaluable, RecordingToken: token, PreliminaryLaps: make([]LapV1, n), RecordingMedian: 1}
		for i := range r.PreliminaryLaps {
			r.PreliminaryLaps[i].TotalLength = 1
		}
		return r
	}
	for name, in := range map[string][]RecordingResultV1{"2x10": {makeN("a", 10), makeN("b", 10)}, "3x9": {makeN("a", 9), makeN("b", 9), makeN("c", 9)}} {
		if f, err := SelectCohortV1(in); err != nil || len(f.Recordings) != 0 {
			t.Fatalf("%s qualified", name)
		}
	}
	f, err := SelectCohortV1([]RecordingResultV1{makeN("a", 10), makeN("b", 11), makeN("c", 12), makeN("d", 13)})
	if err != nil || len(f.Recordings) != 4 || len(f.Laps) != 46 {
		t.Fatalf("all eligible not selected: %+v %v", f, err)
	}
	f, err = SelectCohortV1([]RecordingResultV1{makeN("a", 10), makeN("a", 10), makeN("b", 10), makeN("c", 10)})
	if err != nil || len(f.Recordings) != 3 {
		t.Fatalf("duplicate token not deduped: %+v %v", f, err)
	}
}

func TestEqualityDoesNotCreateReset(t *testing.T) {
	r := goldenRecording(t)
	r.LapDist.Samples[1].Value = r.LapDist.Samples[0].Value
	got, err := ClassifyV1(r)
	if err != nil {
		t.Fatal(err)
	}
	if got.Resets != 12 {
		t.Fatalf("equality created reset: %d", got.Resets)
	}
}

func TestCanonicalSortUsesTimeSizeAndLocatorBytes(t *testing.T) {
	tm := time.Unix(1, 2)
	v := []CandidateV1{{tm, 1, "á"}, {tm, 1, "A"}, {tm, 1, "Aa"}, {tm.Add(-time.Nanosecond), 9, "z"}, {tm, 0, "x"}}
	SortCandidatesV1(v)
	want := []string{"z", "x", "A", "Aa", "á"}
	for i := range want {
		if v[i].Locator != want[i] {
			t.Fatalf("order %v", v)
		}
	}
}

func TestRawIndicesAreNotCompacted(t *testing.T) {
	r := goldenRecording(t)
	for i := range r.LapDist.Samples {
		r.LapDist.Samples[i].Index += 100
		r.TotalDist.Samples[i].Index += 100
	}
	for i := range r.GPSTime.Samples {
		r.GPSTime.Samples[i].Index += 200
		r.GPSTime.Samples[i].Value += 100
	}
	r.Coordinates.FirstIndex += 100
	r.Coordinates.LastIndex += 100
	for i := range r.LapEvents.Events {
		r.LapEvents.Events[i].Timestamp += 100
	}
	got, err := ClassifyV1(r)
	if err != nil || got.Matches != 13 || len(got.PreliminaryLaps) != 12 {
		t.Fatalf("raw indices compacted: %+v %v", got, err)
	}
}

func TestGroupsNeedThreePostFilterContributors(t *testing.T) {
	g := GroupKeyV1{"g", "l", "c", "x"}
	results := make([]RecordingResultV1, 3)
	for i := range results {
		results[i] = RecordingResultV1{Group: g, Population: PopulationEvaluable, RecordingToken: string(rune('a' + i)), RecordingMedian: 1, PreliminaryLaps: make([]LapV1, 10)}
		for j := range results[i].PreliminaryLaps {
			results[i].PreliminaryLaps[j].TotalLength = 1
		}
	}
	results[2].PreliminaryLaps = results[2].PreliminaryLaps[:9]
	if freeze, err := SelectCohortV1(results); err != nil || len(freeze.Recordings) != 0 {
		t.Fatalf("3x9 qualified: %+v %v", freeze, err)
	}
}

func TestLowEventNeverUsesManyPhysicalResets(t *testing.T) {
	r := goldenRecording(t)
	r.LapEvents.Events = r.LapEvents.Events[:1]
	got, err := ClassifyV1(r)
	if err != nil || got.Population != PopulationLowEvent || len(got.PreliminaryLaps) != 0 || got.Matches != 0 {
		t.Fatalf("low-event contributed: %+v %v", got, err)
	}
}

func TestGroupCenterIsSinglePassAndRecordingWeighted(t *testing.T) {
	g := GroupKeyV1{"g", "l", "c", "x"}
	makeResult := func(token string, n int, last float64) RecordingResultV1 {
		r := RecordingResultV1{Group: g, Population: PopulationEvaluable, RecordingToken: token, PreliminaryLaps: make([]LapV1, n)}
		for i := range r.PreliminaryLaps {
			r.PreliminaryLaps[i].TotalLength = 1
		}
		if n > 0 {
			r.PreliminaryLaps[n-1].TotalLength = last
		}
		r.RecordingMedian, _ = median(lapLengths(r.PreliminaryLaps))
		return r
	}
	freeze, err := SelectCohortV1([]RecordingResultV1{makeResult("a", 10, 1), makeResult("b", 20, 1), makeResult("c", 10, 1.004), makeResult("d", 10, 1)})
	if err != nil || freeze.Center != 1 || len(freeze.Recordings) != 3 || len(freeze.Laps) != 40 {
		t.Fatalf("iterated/reweighted center: %+v %v", freeze, err)
	}
}

func largeSyntheticRecording(sampleCount int) CanonicalRecordingV1 {
	r := CanonicalRecordingV1{Schema: 1, Group: GroupKeyV1{"large", "layout", "car", "class"}, Coordinates: CoordinateSummaryV1{LatitudeName: "GPS Latitude", LongitudeName: "GPS Longitude", LatitudePresent: true, LongitudePresent: true, LatitudeQuality: "valid", LongitudeQuality: "valid", Frequency: 1, Count: uint64(sampleCount), FirstIndex: 0, LastIndex: int64(sampleCount - 1)}, GPSTime: ChannelV1{Name: "GPS Time", Present: true, Quality: "valid", Frequency: 2}, LapDist: ChannelV1{Name: "Lap Dist", Present: true, Quality: "valid", Frequency: 1}, TotalDist: ChannelV1{Name: "Total Dist", Present: true, Quality: "valid", Frequency: 1}, LapEvents: EventChannelV1{Name: "Lap", Present: true, Quality: "valid"}}
	for i := 0; i < sampleCount; i++ {
		ld := 1.0
		if i > 0 && i%2 == 1 {
			ld = 0
		}
		r.LapDist.Samples = append(r.LapDist.Samples, SampleV1{int64(i), ld, "valid"})
		r.TotalDist.Samples = append(r.TotalDist.Samples, SampleV1{int64(i), float64(i), "valid"})
	}
	for i := 0; i < 2*(sampleCount-1)+1; i++ {
		r.GPSTime.Samples = append(r.GPSTime.Samples, SampleV1{int64(i), float64(i)/2 + .25, "valid"})
	}
	r.LapEvents.Events = append(r.LapEvents.Events, EventV1{0, .25, 0, true, "valid"})
	ordinal := int64(1)
	for i := 1; i < sampleCount; i += 2 {
		r.LapEvents.Events = append(r.LapEvents.Events, EventV1{ordinal, float64(i) + .25, float64(ordinal), true, "valid"})
		ordinal++
	}
	return r
}

func TestClassifyLargeSyntheticHasBoundedAllocations(t *testing.T) {
	r := largeSyntheticRecording(20_001)
	allocs := testing.AllocsPerRun(3, func() {
		got, err := ClassifyV1(r)
		if err != nil || got.WindowsValid != 9_999 {
			panic("large classification failed")
		}
	})
	if allocs > 100 {
		t.Fatalf("allocations=%g", allocs)
	}
}

func BenchmarkClassifyLargeSynthetic(b *testing.B) {
	r := largeSyntheticRecording(20_001)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := ClassifyV1(r); err != nil {
			b.Fatal(err)
		}
	}
}
