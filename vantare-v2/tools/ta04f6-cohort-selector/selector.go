package main

import (
	"math"
	"sort"
)

type PopulationV1 string

const (
	PopulationLowEvent  PopulationV1 = "low_event"
	PopulationInvalid   PopulationV1 = "oracle_invalid"
	PopulationEvaluable PopulationV1 = "oracle_evaluable"
)

type LapV1 struct {
	StartOrdinal, EndOrdinal uint64
	LapLength, TotalLength   float64
}
type windowV1 struct {
	valid bool
	b     float64
	lap   LapV1
}
type RecordingResultV1 struct {
	Group                                              GroupKeyV1
	GroupDigest                                        [32]byte
	Order                                              int
	RecordingToken                                     string
	Population                                         PopulationV1
	Resets, Boundaries, WindowsAttempted, WindowsValid int
	Matches, Mismatches, OneSideInvalid, Unpaired      int
	PreliminaryLaps                                    []LapV1
	ValidLaps                                          []LapV1
	RecordingMedian                                    float64
}
type CohortFreezeV1 struct {
	Group      GroupKeyV1
	Center     float64
	Recordings []RecordingResultV1
	Laps       []LapV1
}

func finite(v float64) bool                 { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func withinThreshold(v, limit float64) bool { return v <= limit }

func ClassifyV1(r CanonicalRecordingV1) (RecordingResultV1, error) {
	out := RecordingResultV1{Group: r.Group}
	if len(r.LapEvents.Events) < 2 {
		out.Population = PopulationLowEvent
		return out, nil
	}
	if !validOracle(r.LapEvents, r.GPSTime) {
		out.Population = PopulationInvalid
		return out, nil
	}
	out.Population = PopulationEvaluable
	if err := validChannels(r); err != nil {
		return out, err
	}
	type resetV1 struct {
		pos int
		raw int64
	}
	var resets []resetV1
	for i := 1; i < len(r.LapDist.Samples); i++ {
		if r.LapDist.Samples[i].Value < r.LapDist.Samples[i-1].Value {
			resets = append(resets, resetV1{i, r.LapDist.Samples[i].Index})
		}
	}
	out.Resets = len(resets)
	out.Boundaries = len(resets)
	if len(resets) < 2 {
		return out, nil
	}
	windows := make([]windowV1, len(resets)-1)
	out.WindowsAttempted = len(windows)
	for k := range windows {
		w, ok := windowFor(r, resets[k].pos, resets[k+1].pos)
		w.lap.StartOrdinal, w.lap.EndOrdinal = uint64(k), uint64(k+1)
		windows[k] = w
		if ok {
			out.WindowsValid++
		}
	}
	matched := make([]bool, len(resets))
	for k, reset := range resets {
		if k+1 >= len(r.LapEvents.Events) {
			out.Unpaired++
			continue
		}
		leftOK := k > 0 && windows[k-1].valid
		rightOK := k < len(windows) && windows[k].valid
		if (k == 0 && !rightOK) || (k == len(resets)-1 && !leftOK) || (k > 0 && k < len(resets)-1 && (!leftOK || !rightOK)) {
			out.OneSideInvalid++
			continue
		}
		event := r.LapEvents.Events[k+1].Timestamp
		residual := 0.0
		if leftOK {
			residual = math.Abs(event - (float64(reset.raw)/r.LapDist.Frequency + windows[k-1].b))
		}
		if rightOK {
			x := math.Abs(event - (float64(reset.raw)/r.LapDist.Frequency + windows[k].b))
			if x > residual {
				residual = x
			}
		}
		if withinThreshold(residual, .113) {
			matched[k] = true
			out.Matches++
		} else {
			out.Mismatches++
		}
	}
	for k, w := range windows {
		if w.valid && matched[k] && matched[k+1] {
			out.PreliminaryLaps = append(out.PreliminaryLaps, w.lap)
		}
	}
	if len(out.PreliminaryLaps) >= 10 {
		values := lapLengths(out.PreliminaryLaps)
		m, e := median(values)
		if e == nil && m > 0 {
			out.RecordingMedian = m
		}
	}
	return out, nil
}

func validOracle(events EventChannelV1, gps ChannelV1) bool {
	if !events.Present || events.Quality != "valid" || len(gps.Samples) == 0 {
		return false
	}
	min, max := gps.Samples[0].Value, gps.Samples[len(gps.Samples)-1].Value
	for i, e := range events.Events {
		if !e.Present || e.Quality != "valid" || e.Index < 0 || !finite(e.Timestamp) || !finite(e.Value) || e.Timestamp < min || e.Timestamp > max {
			return false
		}
		if i > 0 && (e.Index <= events.Events[i-1].Index || e.Timestamp <= events.Events[i-1].Timestamp) {
			return false
		}
	}
	return true
}
func validChannel(ch ChannelV1) bool {
	if !ch.Present || ch.Quality != "valid" || !finite(ch.Frequency) || ch.Frequency <= 0 || len(ch.Samples) == 0 {
		return false
	}
	for i, s := range ch.Samples {
		if s.Quality != "valid" || !finite(s.Value) || s.Index < 0 {
			return false
		}
		if i > 0 && s.Index != ch.Samples[i-1].Index+1 {
			return false
		}
	}
	return true
}
func validChannels(r CanonicalRecordingV1) error {
	for _, ch := range []ChannelV1{r.GPSTime, r.LapDist, r.TotalDist} {
		if !validChannel(ch) {
			return invalid()
		}
	}
	c := r.Coordinates
	if !c.LatitudePresent || !c.LongitudePresent || c.LatitudeQuality != "valid" || c.LongitudeQuality != "valid" || !finite(c.Frequency) || c.Frequency <= 0 || c.Count < 2 || c.FirstIndex < 0 || c.LastIndex < c.FirstIndex || uint64(c.LastIndex-c.FirstIndex+1) != c.Count {
		return invalid()
	}
	if r.LapDist.Frequency != r.TotalDist.Frequency || len(r.LapDist.Samples) != len(r.TotalDist.Samples) {
		return invalid()
	}
	for i := range r.LapDist.Samples {
		ld, td := r.LapDist.Samples[i], r.TotalDist.Samples[i]
		if ld.Index != td.Index || ld.Value < 0 || td.Value < 0 {
			return invalid()
		}
		if i > 0 && td.Value < r.TotalDist.Samples[i-1].Value {
			return invalid()
		}
	}
	return nil
}
func windowFor(r CanonicalRecordingV1, start, end int) (windowV1, bool) {
	if end-start < 2 {
		return windowV1{}, false
	}
	ts, te := float64(r.LapDist.Samples[start].Index)/r.LapDist.Frequency, float64(r.LapDist.Samples[end].Index)/r.LapDist.Frequency
	first := sort.Search(len(r.GPSTime.Samples), func(i int) bool { return float64(r.GPSTime.Samples[i].Index)/r.GPSTime.Frequency >= ts })
	after := sort.Search(len(r.GPSTime.Samples), func(i int) bool { return float64(r.GPSTime.Samples[i].Index)/r.GPSTime.Frequency > te })
	selected := r.GPSTime.Samples[first:after]
	if len(selected) < 2 || float64(selected[0].Index)/r.GPSTime.Frequency < ts || !withinThreshold(float64(selected[0].Index)/r.GPSTime.Frequency-ts, .0125) || !withinThreshold(te-float64(selected[len(selected)-1].Index)/r.GPSTime.Frequency, .0125) {
		return windowV1{}, false
	}
	b := 0.0
	for _, s := range selected {
		b += s.Value - float64(s.Index)/r.GPSTime.Frequency
	}
	b /= float64(len(selected))
	for _, s := range selected {
		if !withinThreshold(math.Abs(s.Value-(float64(s.Index)/r.GPSTime.Frequency+b)), .0125) {
			return windowV1{}, false
		}
	}
	cf, cl := math.Ceil(ts*r.Coordinates.Frequency), math.Floor(te*r.Coordinates.Frequency)
	if cf < float64(r.Coordinates.FirstIndex) {
		cf = float64(r.Coordinates.FirstIndex)
	}
	if cl > float64(r.Coordinates.LastIndex) {
		cl = float64(r.Coordinates.LastIndex)
	}
	if cl-cf+1 < 2 || cf/r.Coordinates.Frequency < ts || !withinThreshold(cf/r.Coordinates.Frequency-ts, 1/r.Coordinates.Frequency) || cl/r.Coordinates.Frequency > te || !withinThreshold(te-cl/r.Coordinates.Frequency, 1/r.Coordinates.Frequency) {
		return windowV1{}, false
	}
	ld := r.LapDist.Samples[end-1].Value - r.LapDist.Samples[start].Value
	td := r.TotalDist.Samples[end-1].Value - r.TotalDist.Samples[start].Value
	if !finite(ld) || !finite(td) || ld <= 0 || td <= 0 || !withinThreshold(math.Abs(td-ld)/math.Max(td, ld), .003) {
		return windowV1{}, false
	}
	return windowV1{true, b, LapV1{uint64(start), uint64(end), ld, td}}, true
}
func lapLengths(laps []LapV1) []float64 {
	v := make([]float64, len(laps))
	for i := range laps {
		v[i] = laps[i].TotalLength
	}
	return v
}
func median(v []float64) (float64, error) {
	if len(v) == 0 {
		return 0, invalid()
	}
	x := append([]float64(nil), v...)
	for _, n := range x {
		if !finite(n) {
			return 0, invalid()
		}
	}
	sort.Float64s(x)
	m := len(x) / 2
	if len(x)%2 == 1 {
		return x[m], nil
	}
	result := x[m-1] + (x[m]-x[m-1])/2
	if !finite(result) {
		return 0, invalid()
	}
	return result, nil
}

func SelectCohortV1(results []RecordingResultV1) (CohortFreezeV1, error) {
	cohort, _, err := SelectCohortAndCountValidLapsV1(results)
	return cohort, err
}

func SelectCohortAndCountValidLapsV1(results []RecordingResultV1) (CohortFreezeV1, int, error) {
	cohort, total, _, err := evaluateGroupsV1(results)
	return cohort, total, err
}

type GroupEvaluationV1 struct {
	Key                GroupKeyV1
	Digest             [32]byte
	Recordings         int
	PreliminaryCounts  []int
	Contributors       int
	CenterPresent      bool
	Center             float64
	PostfilterCounts   []int
	EligiblePostfilter int
}

func evaluateGroupsV1(results []RecordingResultV1) (CohortFreezeV1, int, []GroupEvaluationV1, error) {
	type group struct {
		key     GroupKeyV1
		all     []RecordingResultV1
		records []RecordingResultV1
	}
	var groups []group
	idx := map[GroupKeyV1]int{}
	seen := map[string]bool{}
	for _, r := range results {
		if r.RecordingToken != "" && seen[r.RecordingToken] {
			continue
		}
		if r.RecordingToken != "" {
			seen[r.RecordingToken] = true
		}
		i, ok := idx[r.Group]
		if !ok {
			i = len(groups)
			idx[r.Group] = i
			groups = append(groups, group{key: r.Group})
		}
		groups[i].all = append(groups[i].all, r)
		if r.Population == PopulationEvaluable && len(r.PreliminaryLaps) >= 10 && r.RecordingMedian > 0 && r.RecordingToken == "" {
			return CohortFreezeV1{}, 0, nil, invalid()
		}
		if r.Population != PopulationEvaluable || len(r.PreliminaryLaps) < 10 || r.RecordingMedian <= 0 {
			continue
		}
		groups[i].records = append(groups[i].records, r)
	}
	var selected CohortFreezeV1
	totalValid := 0
	evaluations := make([]GroupEvaluationV1, 0, len(groups))
	for _, g := range groups {
		evaluation := GroupEvaluationV1{Key: g.key, Recordings: len(g.all), Contributors: len(g.records)}
		for _, r := range g.all {
			evaluation.PreliminaryCounts = append(evaluation.PreliminaryCounts, len(r.PreliminaryLaps))
		}
		if len(g.all) > 0 {
			evaluation.Digest = g.all[0].GroupDigest
		}
		if len(g.records) < 3 {
			evaluations = append(evaluations, evaluation)
			continue
		}
		meds := make([]float64, len(g.records))
		for i := range g.records {
			meds[i] = g.records[i].RecordingMedian
		}
		center, err := median(meds)
		if err != nil || center <= 0 {
			evaluations = append(evaluations, evaluation)
			continue
		}
		evaluation.CenterPresent = true
		evaluation.Center = center
		postByToken := make(map[string]int)
		var eligible []RecordingResultV1
		var laps []LapV1
		for _, r := range g.records {
			r.ValidLaps = nil
			for _, lap := range r.PreliminaryLaps {
				if withinThreshold(math.Abs(lap.TotalLength-center)/math.Max(lap.TotalLength, center), .003) {
					r.ValidLaps = append(r.ValidLaps, lap)
				}
			}
			totalValid += len(r.ValidLaps)
			postByToken[r.RecordingToken] = len(r.ValidLaps)
			if len(r.ValidLaps) >= 10 {
				evaluation.EligiblePostfilter++
				eligible = append(eligible, r)
				laps = append(laps, r.ValidLaps...)
			}
		}
		for _, r := range g.all {
			evaluation.PostfilterCounts = append(evaluation.PostfilterCounts, postByToken[r.RecordingToken])
		}
		evaluations = append(evaluations, evaluation)
		if len(eligible) >= 3 {
			if len(selected.Recordings) == 0 {
				selected = CohortFreezeV1{g.key, center, eligible, laps}
			}
		}
	}
	return selected, totalValid, evaluations, nil
}
func SortCandidatesV1(v []CandidateV1) {
	sort.SliceStable(v, func(i, j int) bool {
		a, b := v[i], v[j]
		an, bn := a.ModifiedAt.UTC().UnixNano(), b.ModifiedAt.UTC().UnixNano()
		if an != bn {
			return an < bn
		}
		if a.Size != b.Size {
			return a.Size < b.Size
		}
		return a.Locator < b.Locator
	})
}
