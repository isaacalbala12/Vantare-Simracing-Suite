package timings_test

import (
	"math"
	"slices"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/timings"
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestSamplingProfileSourcePoints(t *testing.T) {
	for _, tc := range []struct {
		name    string
		length  float64
		sectors int
		hard    []timings.HardPart
		want    []float64
	}{
		{"TIM-SAMPLE-009", 5000, 2, nil, []float64{2500, 4950}},
		{"TIM-SAMPLE-010", 3300, 3, nil, nil},
		{"TIM-SAMPLE-011", 3301, 3, nil, []float64{780, 1560, 2340, 3251}},
		{"TIM-SAMPLE-012", 5000, 3, []timings.HardPart{{StartM: 780, EndM: 900}}, []float64{900, 1680, 2460, 3240, 4020, 4950}},
		{"two sectors at threshold", 3300, 2, nil, []float64{1650, 3250}},
		{"midpoint to even down", 3301, 2, nil, []float64{1650, 3251}},
		{"midpoint to even up", 3303, 2, nil, []float64{1652, 3253}},
		{"strict last regular point", 3900, 3, nil, []float64{780, 1560, 2340, 3850}},
		{"empty adjusted two sectors", 5000, 2, []timings.HardPart{}, []float64{780, 1560, 2340, 3120, 3900, 4950}},
		{"hardparts override two sectors", 5000, 2, []timings.HardPart{{StartM: 700, EndM: 900}}, []float64{900, 1680, 2460, 3240, 4020, 4950}},
		{"hardpart end inclusive", 5000, 3, []timings.HardPart{{StartM: 700, EndM: 780}}, []float64{780, 1560, 2340, 3120, 3900, 4950}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p, err := timings.NewSamplingProfile(timings.SamplingProfileSpec{TrackName: "synthetic", LayoutID: "layout", CatalogVersion: "v1", LengthM: tc.length, Sectors: tc.sectors, HardParts: tc.hard})
			if err != nil {
				t.Fatal(err)
			}
			if got := p.GapPoints(); !slices.Equal(got, tc.want) {
				t.Fatalf("points=%v want %v", got, tc.want)
			}
			points := p.GapPoints()
			if len(points) > 0 {
				points[0] = -1
				if p.GapPoints()[0] < 0 {
					t.Fatal("caller mutated profile")
				}
			}
		})
	}
}

func TestSamplingProfileRejectsAmbiguity(t *testing.T) {
	for _, name := range []string{"name", "layout", "version", "nan", "length", "sector", "reversed hardpart", "overlap", "out of bounds", "unsorted result"} {
		t.Run(name, func(t *testing.T) {
			s := timings.SamplingProfileSpec{TrackName: "synthetic", LayoutID: "layout", CatalogVersion: "v1", LengthM: 5000, Sectors: 3}
			switch name {
			case "name":
				s.TrackName = ""
			case "layout":
				s.LayoutID = ""
			case "version":
				s.CatalogVersion = ""
			case "nan":
				s.LengthM = math.NaN()
			case "length":
				s.LengthM = 0
			case "sector":
				s.Sectors = 0
			case "reversed hardpart":
				s.HardParts = []timings.HardPart{{StartM: 900, EndM: 780}}
			case "overlap":
				s.HardParts = []timings.HardPart{{StartM: 700, EndM: 1000}, {StartM: 900, EndM: 1200}}
			case "out of bounds":
				s.HardParts = []timings.HardPart{{StartM: 700, EndM: 5001}}
			case "unsorted result":
				s.HardParts = []timings.HardPart{{StartM: 700, EndM: 4990}}
			}
			if _, err := timings.NewSamplingProfile(s); err == nil {
				t.Fatal("ambiguous profile accepted")
			}
		})
	}
}

func sampleObservation(t *testing.T, now, distance float64, laps, sector int) engineer.ObservationV1 {
	t.Helper()
	return relationObservationAt(t, []relationCar{{"P", "GT", 2, distance}, {"F", "GT", 1, 100}, {"B", "GT", 3, 50}, {"T", "GT", 4, 30}}, now, laps, 1, func(s *core.ObservedState) { s.Vehicles[0].Sector = observed(t, standings.Sector(sector)) })
}

func sampleProfile(t *testing.T, length float64, sectors int) timings.SamplingProfile {
	t.Helper()
	p, err := timings.NewSamplingProfile(timings.SamplingProfileSpec{TrackName: "synthetic", LayoutID: "layout", CatalogVersion: "v1", LengthM: length, Sectors: sectors})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// This test seam supplies known T1 relations, not private sampler state.
func sampleRelations(obs engineer.ObservationV1, seconds float64) timings.Relations {
	now, _ := obs.SourceTime.Value()
	r := func(id engineer.VehicleID) timings.Relation {
		return timings.Relation{State: timings.RelationKnown, Context: obs.Context, SourceTime: now, VehicleID: id, Gap: timings.RelationDelta{Known: true, Seconds: seconds}}
	}
	return timings.Relations{RaceFront: r("F"), RaceRear: r("B"), AutoTrackRear: r("T")}
}

func sampleTick(s *timings.Sampler, obs engineer.ObservationV1, p timings.SamplingProfile, length float64, gap float64) timings.SamplingResult {
	e := trackEvidence(obs)
	e.LengthM = length
	return s.Observe(obs, &e, p, sampleRelations(obs, gap))
}

func TestSamplingSourceOpportunities(t *testing.T) {
	for _, tc := range []struct {
		name                         string
		length, prev, next, dt       float64
		lap0, lap1, sector0, sector1 int
		want                         bool
	}{
		{"TIM-SAMPLE-001", 5000, 779, 780, 1, 10, 10, 1, 1, true},
		{"TIM-SAMPLE-002", 5000, 780, 781, 1, 10, 10, 1, 1, false},
		{"TIM-SAMPLE-003", 5000, 700, 1600, 1, 10, 10, 1, 2, true},
		{"TIM-SAMPLE-004", 5000, 780, 780, 1, 10, 10, 1, 2, false},
		{"TIM-SAMPLE-005", 5000, 4950, 30, 1, 10, 11, 3, 1, false},
		{"wrap skips unobserved final point like source", 5000, 4900, 30, 1, 10, 11, 3, 1, false},
		{"TIM-SAMPLE-006", 5000, 800, 700, 1, 10, 10, 1, 1, false},
		{"TIM-SAMPLE-007", 3000, 200, 210, 1, 10, 10, 1, 2, true},
		{"TIM-SAMPLE-008", 5000, 100, 110, 1, 10, 10, 1, 2, false},
		{"repeat time", 5000, 779, 780, 0, 10, 10, 1, 1, false},
		{"long interruption", 5000, 779, 780, 3, 10, 10, 1, 1, false},
		{"lap jump", 5000, 779, 780, 1, 10, 12, 1, 1, false},
		{"sector skip", 3000, 200, 210, 1, 10, 10, 1, 3, false},
		{"sector wrap", 3000, 2990, 0, 1, 10, 11, 3, 1, true},
		{"huge distance jump", 5000, 100, 4000, 1, 10, 10, 1, 1, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := sampleProfile(t, tc.length, 3)
			s := timings.NewSampler(timings.SamplingOptions{Enabled: true})
			first := sampleTick(s, sampleObservation(t, 100, tc.prev, tc.lap0, tc.sector0), p, tc.length, 2)
			if first.Opportunity || len(first.RaceFront.Samples) != 0 {
				t.Fatal("first snapshot invented crossing")
			}
			got := sampleTick(s, sampleObservation(t, 100+tc.dt, tc.next, tc.lap1, tc.sector1), p, tc.length, 2)
			if got.Opportunity != tc.want {
				t.Fatalf("opportunity=%v want %v: %+v", got.Opportunity, tc.want, got)
			}
			n := 0
			if tc.want {
				n = 1
			}
			if len(got.RaceFront.Samples) != n {
				t.Fatalf("samples=%v want %d", got.RaceFront.Samples, n)
			}
		})
	}
}

func TestSamplingHistoriesAdmissionAndCopies(t *testing.T) {
	p := sampleProfile(t, 5000, 3)
	s := timings.NewSampler(timings.SamplingOptions{Enabled: true})
	sampleTick(s, sampleObservation(t, 100, 700, 10, 1), p, 5000, 2)
	first := sampleTick(s, sampleObservation(t, 101, 780, 10, 1), p, 5000, -2)
	for _, w := range []timings.SampleWindow{first.RaceFront, first.RaceRear, first.AutoTrackRear} {
		if !w.Admitted || len(w.Samples) != 1 || w.Samples[0].Seconds != 2 || w.Samples[0].SourceTime != 101 {
			t.Fatalf("A1 current sample unavailable: %+v", w)
		}
	}
	first.RaceFront.Samples[0].Seconds = 999
	same := sampleTick(s, sampleObservation(t, 101, 780, 10, 1), p, 5000, 2)
	if same.Opportunity || same.RaceFront.Admitted || same.RaceFront.Samples[0].Seconds != 2 {
		t.Fatalf("duplicate or alias: %+v", same)
	}
	duplicate := sampleTick(s, sampleObservation(t, 102, 1560, 10, 1), p, 5000, 2)
	if !duplicate.Opportunity || duplicate.RaceFront.Admitted || len(duplicate.RaceFront.Samples) != 1 {
		t.Fatalf("opportunity conflated with admission: %+v", duplicate)
	}
	for i, distance := range []float64{2340, 3120, 3900, 4950} {
		got := sampleTick(s, sampleObservation(t, 103+float64(i), distance, 10, 1), p, 5000, float64(i+3))
		if !got.RaceRear.Admitted || got.RaceRear.Samples[0].Seconds != float64(i+3) {
			t.Fatalf("rear lags current admitted sample: %+v", got)
		}
		if i == 3 && (len(got.RaceFront.Samples) != 4 || got.RaceFront.Samples[3].Seconds != 3) {
			t.Fatalf("bounded newest-first history: %+v", got)
		}
	}
	wrap := sampleTick(s, sampleObservation(t, 107, 30, 11, 1), p, 5000, 7)
	if wrap.Opportunity || len(wrap.RaceFront.Samples) != 4 {
		t.Fatalf("normal meta must preserve history without sampling: %+v", wrap)
	}
}

func TestSamplingRivalAndQualityChangesBeforeNextPoint(t *testing.T) {
	for _, name := range []string{"changed ID", "absence", "unknown gap", "lap difference", "context", "stale relation", "unknown ID", "duplicate roster ID", "nan"} {
		t.Run(name, func(t *testing.T) {
			p := sampleProfile(t, 5000, 3)
			s := timings.NewSampler(timings.SamplingOptions{Enabled: true})
			sampleTick(s, sampleObservation(t, 100, 700, 10, 1), p, 5000, 2)
			sampleTick(s, sampleObservation(t, 101, 780, 10, 1), p, 5000, 2)
			obs := sampleObservation(t, 102, 800, 10, 1)
			r := sampleRelations(obs, 2)
			e := trackEvidence(obs)
			switch name {
			case "changed ID":
				r.RaceFront.VehicleID = "T"
			case "absence":
				r.RaceFront.State = timings.RelationAbsent
			case "unknown gap":
				r.RaceFront.Gap.Known = false
			case "lap difference":
				r.RaceFront.Gap.Laps = -1
			case "context":
				r.RaceFront.Context.Epoch++
			case "stale relation":
				r.RaceFront.SourceTime--
			case "unknown ID":
				r.RaceFront.VehicleID = "missing"
			case "duplicate roster ID":
				obs.Vehicles = append(obs.Vehicles, obs.Vehicles[1])
			case "nan":
				r.RaceFront.Gap.Seconds = math.NaN()
			}
			got := s.Observe(obs, &e, p, r)
			if got.Opportunity || len(got.RaceFront.Samples) != 0 || len(got.RaceRear.Samples) != 1 || len(got.AutoTrackRear.Samples) != 1 {
				t.Fatalf("affected relation did not clear independently: %+v", got)
			}
			next := sampleObservation(t, 103, 1560, 10, 1)
			nr := sampleRelations(next, 2)
			ne := trackEvidence(next)
			if name == "changed ID" {
				nr.RaceFront.VehicleID = "T"
			}
			if name == "lap difference" {
				nr.RaceFront.Gap.Laps = -1
			}
			got = s.Observe(next, &ne, p, nr)
			if !got.RaceFront.Admitted || len(got.RaceFront.Samples) != 1 || got.RaceRear.Admitted {
				t.Fatalf("same gap wrongly deduplicated across boundary: %+v", got)
			}
		})
	}
}

func TestSamplingResetAndReacquire(t *testing.T) {
	for _, name := range []string{"epoch", "driver", "session identity without epoch", "stale epoch", "clock reversal", "missing clock", "missing track", "layout", "catalog", "length", "hardparts", "sector count", "track evidence context", "track evidence clock", "missing position", "stale position", "missing laps", "session type", "missing player", "T1 unavailable", "discontinuity"} {
		t.Run(name, func(t *testing.T) {
			p := sampleProfile(t, 5000, 3)
			s := timings.NewSampler(timings.SamplingOptions{Enabled: true})
			sampleTick(s, sampleObservation(t, 100, 700, 10, 1), p, 5000, 2)
			sampleTick(s, sampleObservation(t, 101, 780, 10, 1), p, 5000, 2)
			obs := sampleObservation(t, 102, 1560, 10, 1)
			e := trackEvidence(obs)
			spec := timings.SamplingProfileSpec{TrackName: "synthetic", LayoutID: "layout", CatalogVersion: "v1", LengthM: 5000, Sectors: 3}
			switch name {
			case "epoch":
				obs.Context.Epoch = 2
				e.Context = obs.Context
			case "driver":
				obs.Context.Identity.Driver = "new"
				e.Context = obs.Context
			case "session identity without epoch":
				obs.Context.Identity.Session = "other"
				e.Context = obs.Context
			case "stale epoch":
				obs.Context.Epoch = 0
				e.Context = obs.Context
			case "clock reversal":
				obs = sampleObservation(t, 99, 1560, 10, 1)
				e = trackEvidence(obs)
			case "missing clock":
				obs.SourceTime = engineer.Field[float64]{}
			case "missing track":
				obs.TrackName = engineer.Field[string]{}
			case "layout":
				spec.LayoutID = "other"
				e.LayoutID = "other"
			case "catalog":
				spec.CatalogVersion = "v2"
				e.CatalogVersion = "v2"
			case "length":
				spec.LengthM = 5001
				e.LengthM = 5001
			case "hardparts":
				spec.HardParts = []timings.HardPart{{StartM: 700, EndM: 900}}
			case "sector count":
				spec.Sectors = 2
			case "track evidence context":
				e.Context.Epoch++
			case "track evidence clock":
				e.SourceTime--
			case "missing position":
				obs.Player.LapDistance = engineer.Field[float64]{}
			case "stale position":
				obs = relationObservationAt(t, []relationCar{{"P", "GT", 2, 1560}, {"F", "GT", 1, 1700}}, 102, 10, 1, func(st *core.ObservedState) {
					f, err := schema.NewField(standings.LapDistance(1560), schema.ProvenanceObserved, schema.FreshnessStale)
					if err != nil {
						t.Fatal(err)
					}
					st.Vehicles[0].LapDistance = f
				})
				e = trackEvidence(obs)
			case "missing laps":
				obs.Player.CompletedLaps = engineer.Field[int]{}
			case "session type":
				obs.SessionType = engineer.Field[string]{}
			case "missing player":
				obs.PlayerPresent = engineer.Field[bool]{}
			case "discontinuity":
				obs = sampleObservation(t, 105, 1560, 10, 1)
				e = trackEvidence(obs)
			}
			var err error
			p, err = timings.NewSamplingProfile(spec)
			if err != nil {
				t.Fatal(err)
			}
			r := sampleRelations(obs, 3)
			if name == "T1 unavailable" {
				r.Reason = "incomplete_roster"
			}
			got := s.Observe(obs, &e, p, r)
			if got.Opportunity || len(got.RaceFront.Samples) != 0 || len(got.RaceRear.Samples) != 0 || len(got.AutoTrackRear.Samples) != 0 {
				t.Fatalf("history survived %s: %+v", name, got)
			}
		})
	}
}

func TestSamplingDisabledAndSectorQuality(t *testing.T) {
	for _, name := range []string{"disabled", "missing sector", "zero profile", "nil evidence"} {
		t.Run(name, func(t *testing.T) {
			s := timings.NewSampler(timings.SamplingOptions{Enabled: name != "disabled"})
			p := sampleProfile(t, 3000, 3)
			sampleTick(s, sampleObservation(t, 100, 200, 10, 1), p, 3000, 0)
			obs := sampleObservation(t, 101, 210, 10, 2)
			e := trackEvidence(obs)
			e.LengthM = 3000
			ep := &e
			switch name {
			case "missing sector":
				obs.Player.Sector = engineer.Field[int]{}
			case "zero profile":
				p = timings.SamplingProfile{}
			case "nil evidence":
				ep = nil
			}
			got := s.Observe(obs, ep, p, sampleRelations(obs, 0))
			if got.Opportunity || len(got.RaceFront.Samples) != 0 {
				t.Fatalf("invalid/disabled admitted: %+v", got)
			}
		})
	}
}

func TestSamplingUsesT1RelationsThroughProjection(t *testing.T) {
	s := timings.NewSampler(timings.SamplingOptions{Enabled: true})
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	p := sampleProfile(t, 5000, 3)
	for i, d := range []float64{779, 780} {
		obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, d}, {"F", "GT", 1, d + 10}}, 100+float64(i), 10, 1, func(st *core.ObservedState) { st.Vehicles[0].TimeBehindNext = observed(t, standings.TimeGap(0)) })
		e := trackEvidence(obs)
		r := tracker.Observe(obs, &e)
		got := s.Observe(obs, &e, p, r)
		if i == 1 && (!got.Opportunity || !got.RaceFront.Admitted || got.RaceFront.Samples[0].Seconds != 0 || got.RaceRear.Admitted) {
			t.Fatalf("projector→T1→T2 lost known zero or invented rear: %+v", got)
		}
	}
}

func TestSamplingReacquiresAfterReset(t *testing.T) {
	for _, name := range []string{"gap in time", "profile", "missing then recovery", "reversed clock", "epoch"} {
		t.Run(name, func(t *testing.T) {
			s := timings.NewSampler(timings.SamplingOptions{Enabled: true})
			p := sampleProfile(t, 5000, 3)
			sampleTick(s, sampleObservation(t, 100, 700, 10, 1), p, 5000, 2)
			sampleTick(s, sampleObservation(t, 101, 780, 10, 1), p, 5000, 2)
			now := 102.0
			epoch := uint64(1)
			if name == "gap in time" {
				now = 105
			}
			if name == "profile" {
				var err error
				p, err = timings.NewSamplingProfile(timings.SamplingProfileSpec{TrackName: "synthetic", LayoutID: "other", CatalogVersion: "v1", LengthM: 5000, Sectors: 3})
				if err != nil {
					t.Fatal(err)
				}
			}
			if name == "missing then recovery" {
				bad := sampleObservation(t, 102, 800, 10, 1)
				bad.Player.LapDistance = engineer.Field[float64]{}
				sampleTick(s, bad, p, 5000, 2)
				now = 103
			}
			if name == "reversed clock" {
				sampleTick(s, sampleObservation(t, 99, 800, 10, 1), p, 5000, 2)
			}
			if name == "epoch" {
				epoch = 2
			}
			baseline := sampleObservation(t, now, 1500, 10, 1)
			baseline.Context.Epoch = epoch
			e := trackEvidence(baseline)
			if name == "profile" {
				e.LayoutID = "other"
			}
			got := s.Observe(baseline, &e, p, sampleRelations(baseline, 2))
			if got.Opportunity || len(got.RaceFront.Samples) != 0 {
				t.Fatalf("reset baseline admitted: %+v", got)
			}
			next := sampleObservation(t, now+1, 1560, 10, 1)
			next.Context.Epoch = epoch
			e = trackEvidence(next)
			if name == "profile" {
				e.LayoutID = "other"
			}
			got = s.Observe(next, &e, p, sampleRelations(next, 2))
			if !got.Opportunity || len(got.RaceFront.Samples) != 1 || got.RaceFront.Samples[0].SourceTime != now+1 {
				t.Fatalf("fresh crossing did not reacquire: %+v", got)
			}
		})
	}
}

func TestSamplingRearRivalsAndAbsence(t *testing.T) {
	for _, name := range []string{"race rear", "auto rear", "auto absence"} {
		t.Run(name, func(t *testing.T) {
			s := timings.NewSampler(timings.SamplingOptions{Enabled: true})
			p := sampleProfile(t, 5000, 3)
			sampleTick(s, sampleObservation(t, 100, 700, 10, 1), p, 5000, 2)
			sampleTick(s, sampleObservation(t, 101, 780, 10, 1), p, 5000, 2)
			obs := sampleObservation(t, 102, 800, 10, 1)
			e := trackEvidence(obs)
			r := sampleRelations(obs, 2)
			switch name {
			case "race rear":
				r.RaceRear.VehicleID = "T"
			case "auto rear":
				r.AutoTrackRear.VehicleID = "B"
			case "auto absence":
				r.AutoTrackRear.State = timings.RelationAbsent
			}
			got := s.Observe(obs, &e, p, r)
			affected := got.AutoTrackRear
			if name == "race rear" {
				affected = got.RaceRear
			}
			if len(affected.Samples) != 0 || len(got.RaceFront.Samples) != 1 {
				t.Fatalf("rear history leaked or front reset: %+v", got)
			}
			obs = sampleObservation(t, 103, 1560, 10, 1)
			e = trackEvidence(obs)
			r = sampleRelations(obs, 2)
			if name == "race rear" {
				r.RaceRear.VehicleID = "T"
			}
			if name == "auto rear" {
				r.AutoTrackRear.VehicleID = "B"
			}
			got = s.Observe(obs, &e, p, r)
			affected = got.AutoTrackRear
			if name == "race rear" {
				affected = got.RaceRear
			}
			if !affected.Admitted || len(affected.Samples) != 1 || affected.Samples[0].SourceTime != 103 || got.RaceFront.Admitted {
				t.Fatalf("rear reacquisition deduplicated old rival: %+v", got)
			}
		})
	}
}
