package timings_test

import (
	"math"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/timings"
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestRelationsSeparateClassFromOverallStandings(t *testing.T) {
	// TIM-REL-001: the prototype adjacent in overall order is not our class rival.
	obs := relationObservation(t, []relationCar{{"P", "GT", 5, 4900}, {"F", "GT", 3, 300}, {"X", "PROTO", 4, 4950}, {"B", "GT", 7, 4800}, {"Y", "PROTO", 6, 4850}})
	got := timings.NewRelationTracker(timings.RelationOptions{Enabled: true}).Observe(obs, nil)
	if got.Leader.VehicleID != "F" || got.RaceFront.VehicleID != "F" || got.RaceRear.VehicleID != "B" || got.ClassPosition != 2 || got.ClassCount != 3 {
		t.Fatalf("class relations = %+v; want leader/front F, rear B, class position 2/3", got)
	}
}

type relationCar struct {
	id, class string
	position  int
	distance  float64
}

func TestRelationsTrackAndAutomaticCandidateAreDistinct(t *testing.T) {
	obs := relationObservation(t, []relationCar{{"P", "GT", 5, 4900}, {"F", "GT", 3, 300}, {"X", "PROTO", 4, 4950}, {"B", "GT", 7, 4800}, {"Y", "PROTO", 6, 4850}, {"T", "GT", 1, 4825}})
	e := trackEvidence(obs)
	got := timings.NewRelationTracker(timings.RelationOptions{Enabled: true}).Observe(obs, &e)
	if got.TrackFront.VehicleID != "X" || got.TrackRear.VehicleID != "Y" || got.AutoTrackRear.VehicleID != "T" {
		t.Fatalf("track/class candidates conflated: %+v", got)
	}
	if got.TrackRear.Gap.Known {
		t.Fatal("initial marks fabricated a temporal gap")
	}
}

func TestRelationsTrackWrapCoincidenceAndMissingPitEntry(t *testing.T) {
	for _, tc := range []struct {
		name     string
		distance float64
		pitKnown bool
		want     timings.RelationState
	}{{"wrap", 100, true, timings.RelationKnown}, {"coincident", 4900, true, timings.RelationAbsent}, {"missing InLap", 100, false, timings.RelationUnknown}} {
		t.Run(tc.name, func(t *testing.T) {
			obs := relationObservation(t, []relationCar{{"P", "GT", 2, 4900}, {"F", "GT", 1, tc.distance}})
			e := trackEvidence(obs)
			if !tc.pitKnown {
				delete(e.PitEntries, "F")
			}
			got := timings.NewRelationTracker(timings.RelationOptions{Enabled: true}).Observe(obs, &e)
			if got.TrackFront.State != tc.want {
				t.Fatalf("front=%+v, want %s", got.TrackFront, tc.want)
			}
			if tc.name == "wrap" && got.TrackFront.DistanceM != 200 {
				t.Fatalf("wrap distance=%v", got.TrackFront.DistanceM)
			}
		})
	}
}

func trackEvidence(obs engineer.ObservationV1) timings.TrackEvidence {
	now, _ := obs.SourceTime.Value()
	e := timings.TrackEvidence{Context: obs.Context, SourceTime: now, TrackName: "synthetic", LayoutID: "layout", CatalogVersion: "v1", LengthM: 5000, PitEntries: map[engineer.VehicleID]timings.PitEntryEvidence{}}
	for _, car := range obs.Vehicles {
		e.PitEntries[car.ID] = timings.PitEntryEvidence{State: engineer.ValueFresh, Provenance: engineer.ProvenanceObserved}
	}
	return e
}

func TestRelationsPassageGapNeedsHistoryAndResets(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	// At t=100 P is at20, F at30. At t=101 both occupy point40's
	// interval, F ten metres ahead at20m/s: its crossing was0.5s earlier.
	first := relationObservationAt(t, []relationCar{{"P", "GT", 2, 20}, {"F", "GT", 1, 30}}, 100, 10, 1)
	e := trackEvidence(first)
	if got := tracker.Observe(first, &e); got.TrackFront.Gap.Known {
		t.Fatal("first observation invented history")
	}
	next := relationObservationAt(t, []relationCar{{"P", "GT", 2, 40}, {"F", "GT", 1, 50}}, 101, 10, 1)
	e = trackEvidence(next)
	got := tracker.Observe(next, &e)
	if !got.TrackFront.Gap.Known || got.TrackFront.Gap.Seconds != -0.5 || got.TrackFront.Gap.Laps != 0 {
		t.Fatalf("passage delta=%+v, want known -0.5s /0laps", got.TrackFront.Gap)
	}
	reset := relationObservationAt(t, []relationCar{{"P", "GT", 2, 60}, {"F", "GT", 1, 70}}, 102, 10, 2)
	e = trackEvidence(reset)
	if got := tracker.Observe(reset, &e); got.TrackFront.Gap.Known {
		t.Fatal("epoch inherited previous passage history")
	}
}

func TestRelationsRejectIncompleteOrAmbiguousStandings(t *testing.T) {
	for _, name := range []string{"disabled", "missing class", "duplicate position", "duplicate id", "missing player", "incomplete roster", "missing clock", "invalid context"} {
		t.Run(name, func(t *testing.T) {
			obs := relationObservation(t, []relationCar{{"P", "GT", 2, 100}, {"F", "GT", 1, 200}})
			enabled := true
			switch name {
			case "disabled":
				enabled = false
			case "missing class":
				obs.Vehicles[1].VehicleClass = engineer.Field[string]{}
			case "duplicate position":
				obs.Vehicles[1].Position = obs.Player.Position
			case "duplicate id":
				obs.Vehicles[1].ID = "P"
			case "missing player":
				obs.PlayerPresent = engineer.Field[bool]{}
			case "incomplete roster":
				obs.Vehicles = obs.Vehicles[:1]
			case "missing clock":
				obs.SourceTime = engineer.Field[float64]{}
			case "invalid context":
				obs.Context.Epoch = 0
			}
			got := timings.NewRelationTracker(timings.RelationOptions{Enabled: enabled}).Observe(obs, nil)
			if got.Leader.State != timings.RelationUnknown || got.Leader.VehicleID != "" || got.Reason == "" {
				t.Fatalf("unsafe relation accepted: %+v", got)
			}
		})
	}
}

func TestRelationsLeaderLastAndRetirement(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	first := tracker.Observe(relationObservation(t, []relationCar{{"P", "GT", 1, 100}, {"B", "GT", 2, 50}}), nil)
	if first.Leader.VehicleID != "P" || first.RaceFront.State != timings.RelationAbsent || first.RaceRear.VehicleID != "B" {
		t.Fatalf("leader: %+v", first)
	}
	last := tracker.Observe(relationObservation(t, []relationCar{{"P", "GT", 1, 100}}), nil)
	if last.RaceRear.State != timings.RelationAbsent || last.ClassCount != 1 {
		t.Fatalf("retired rival survived: %+v", last)
	}
}

func relationObservation(t *testing.T, cars []relationCar) engineer.ObservationV1 {
	return relationObservationAt(t, cars, 100, 10, 1)
}

func relationObservationAt(t *testing.T, cars []relationCar, seconds float64, laps int, epoch uint64, edits ...func(*core.ObservedState)) engineer.ObservationV1 {
	t.Helper()
	run := identity.RunIdentity{Event: "event", Session: "race", Vehicle: "P", Driver: "driver"}
	vehicles := make([]core.VehicleState, 0, len(cars))
	for _, car := range cars {
		id := run
		id.Vehicle = identity.VehicleID(car.id)
		vehicles = append(vehicles, core.VehicleState{Identity: id, Player: observed(t, car.id == "P"), VehicleClass: observed(t, standings.VehicleClass(car.class)), Position: observed(t, standings.Position(car.position)), CompletedLaps: observed(t, standings.CompletedLaps(laps)), LapDistance: observed(t, standings.LapDistance(car.distance)), SpeedMPS: observed(t, 20.0)})
	}
	stamp := time.Duration(seconds * float64(time.Second))
	state := derive.FinalState{Observed: core.ObservedState{SessionType: observed(t, session.TypeRace), SourceTime: observed(t, stamp), TrackName: observed(t, "synthetic"), VehicleCount: observed(t, schema.Count(len(cars))), PlayerPresent: observed(t, true), Vehicles: vehicles}}
	for _, edit := range edits {
		edit(&state.Observed)
	}
	header := envelope.Header{Source: "relation-fixture", Cursor: schema.Cursor{Epoch: schema.Epoch(epoch), Sequence: 1}, Identity: run, Clock: schema.NewClock(observed(t, stamp), observed(t, stamp), time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC))}
	snapshot, err := envelope.NewSnapshot(header, state, func(v derive.FinalState) derive.FinalState {
		v.Observed.Vehicles = append([]core.VehicleState(nil), v.Observed.Vehicles...)
		return v
	})
	if err != nil {
		t.Fatal(err)
	}
	var caps []engineer.Capability
	for _, id := range []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings, engineer.CapabilityControls, engineer.CapabilityPit, engineer.CapabilityFuel, engineer.CapabilityGaps, engineer.CapabilitySpatial} {
		caps = append(caps, engineer.Capability{ID: id, State: engineer.CapabilitySupported})
	}
	manifest, err := engineer.NewManifest(caps)
	if err != nil {
		t.Fatal(err)
	}
	projected, err := engineer.ProjectObservationV1(snapshot, manifest)
	if err != nil {
		t.Fatal(err)
	}
	return projected.ObservationV1
}

func TestRelationsDoNotPromoteInitialMarksOrFrozenHistory(t *testing.T) {
	for _, delta := range []struct {
		name           string
		time, distance float64
	}{{"same interval", 1, 1}, {"long gap", 30, 20}, {"frozen", 1, 0}} {
		t.Run(delta.name, func(t *testing.T) {
			tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
			first := relationObservationAt(t, []relationCar{{"P", "GT", 2, 20}, {"F", "GT", 1, 30}}, 100, 10, 1)
			e := trackEvidence(first)
			tracker.Observe(first, &e)
			next := relationObservationAt(t, []relationCar{{"P", "GT", 2, 20 + delta.distance}, {"F", "GT", 1, 30 + delta.distance}}, 100+delta.time, 10, 1)
			e = trackEvidence(next)
			if got := tracker.Observe(next, &e); got.TrackFront.Gap.Known {
				t.Fatalf("unmeasured passage accepted: %+v", got.TrackFront.Gap)
			}
		})
	}
}

func TestRelationsRelativeWrapFromMeasuredReplay(t *testing.T) {
	for _, tc := range []struct {
		name    string
		p, r    float64
		laps    int
		seconds float64
	}{{"about to be lapped", 21, 81, -1, 2}, {"about to lap", 81, 21, 1, -2}} {
		t.Run(tc.name, func(t *testing.T) {
			tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
			var got timings.Relations
			for tick := 0; tick <= 5; tick++ {
				p, r := tc.p+20*float64(tick), tc.r+20*float64(tick)
				obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, math.Mod(p, 100)}, {"F", "GT", 1, math.Mod(r, 100)}}, 100+float64(tick), 10, 1, func(state *core.ObservedState) {
					for i := range state.Vehicles {
						total := r
						if state.Vehicles[i].Identity.Vehicle == "P" {
							total = p
						}
						state.Vehicles[i].CompletedLaps = observed(t, standings.CompletedLaps(10+int(total/100)))
					}
				})
				e := trackEvidence(obs)
				e.LengthM = 100
				got = tracker.Observe(obs, &e)
			}
			gap := got.TrackRear.Gap
			if tc.seconds < 0 {
				gap = got.TrackFront.Gap
			}
			if got.Leader.Gap != gap {
				t.Fatalf("leader must use relative delta: %+v vs %+v", got.Leader.Gap, gap)
			}
			if !gap.Known || gap.Laps != tc.laps || math.Abs(gap.Seconds-tc.seconds) > 1e-8 {
				t.Fatalf("relative wrap=%+v, want %d/%v", gap, tc.laps, tc.seconds)
			}
		})
	}
}

func observed[T comparable](t *testing.T, value T) schema.Field[T] {
	t.Helper()
	f, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func TestRelationsGameFrontSourceAndRaceSession(t *testing.T) {
	for _, tc := range []struct {
		name           string
		value          float64
		missing, stale bool
		kind           session.Type
		wantKnown      bool
		want           float64
	}{
		{name: "positive", value: 2, kind: session.TypeRace, wantKnown: true, want: -2},
		{name: "negative normalized", value: -2, kind: session.TypeRace, wantKnown: true, want: -2},
		{name: "present zero", kind: session.TypeRace, wantKnown: true},
		{name: "missing", missing: true, kind: session.TypeRace},
		{name: "stale", value: 2, stale: true, kind: session.TypeRace},
		{name: "practice", value: 2, kind: session.TypePractice},
		{name: "qualifying", value: 2, kind: session.TypeQualifying},
		{name: "unmapped endurance", value: 2, kind: session.TypeEndurance},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
			var got timings.Relations
			for tick := 0; tick < 2; tick++ {
				obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, 20 + 20*float64(tick)}, {"F", "GT", 1, 30 + 20*float64(tick)}}, 100+float64(tick), 10, 1, func(state *core.ObservedState) {
					state.SessionType = observed(t, tc.kind)
					if !tc.missing {
						state.Vehicles[0].TimeBehindNext = observed(t, standings.TimeGap(tc.value))
					}
					if tc.stale {
						field, err := schema.NewField(standings.TimeGap(tc.value), schema.ProvenanceObserved, schema.FreshnessStale)
						if err != nil {
							t.Fatal(err)
						}
						state.Vehicles[0].TimeBehindNext = field
					}
				})
				e := trackEvidence(obs)
				got = tracker.Observe(obs, &e)
			}
			if got.RaceFront.Gap.Known != tc.wantKnown || got.RaceFront.Gap.Seconds != tc.want {
				t.Fatalf("game gap=%+v", got.RaceFront.Gap)
			}
			if tc.kind == session.TypePractice || tc.kind == session.TypeQualifying {
				if got.RaceFront.State != timings.RelationUnknown {
					t.Fatal("non-race exposed race rival")
				}
			}
			if !got.TrackFront.Gap.Known || got.TrackFront.Gap.Seconds != -0.5 {
				t.Fatal("fixture did not produce independent measured history")
			}
		})
	}
}

func TestRelationsGameFrontAcrossFinishLine(t *testing.T) {
	obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, 4990}, {"F", "GT", 1, 10}}, 100, 10, 1, func(state *core.ObservedState) {
		state.Vehicles[1].CompletedLaps = observed(t, standings.CompletedLaps(11))
		state.Vehicles[0].TimeBehindNext = observed(t, standings.TimeGap(2))
	})
	e := trackEvidence(obs)
	got := timings.NewRelationTracker(timings.RelationOptions{Enabled: true}).Observe(obs, &e)
	if !got.RaceFront.Gap.Known || got.RaceFront.Gap.Seconds != -2 || got.RaceFront.Gap.Laps != 0 {
		t.Fatalf("same race lap across finish=%+v", got.RaceFront.Gap)
	}
}

func TestRelationsAutomaticRearDoesNotFallBack(t *testing.T) {
	obs := relationObservation(t, []relationCar{{"P", "GT", 1, 100}, {"B", "GT", 2, 90}, {"T", "GT", 3, 80}})
	e := trackEvidence(obs)
	got := timings.NewRelationTracker(timings.RelationOptions{Enabled: true}).Observe(obs, &e)
	if got.TrackRear.VehicleID != "B" || got.RaceRear.VehicleID != "B" || got.AutoTrackRear.State != timings.RelationAbsent {
		t.Fatalf("automatic fallback=%+v", got)
	}
}

func TestRelationsTrackEligibilityAndEvidence(t *testing.T) {
	for _, tc := range []struct {
		name   string
		speed  float64
		inLap  bool
		mutate string
		want   timings.RelationState
	}{
		{name: "boundary", speed: 0.5, want: timings.RelationAbsent},
		{name: "above boundary", speed: 0.501, want: timings.RelationKnown},
		{name: "entry", speed: 20, inLap: true, want: timings.RelationAbsent},
		{name: "missing entry", speed: 20, mutate: "entry", want: timings.RelationUnknown},
		{name: "stale entry", speed: 20, mutate: "stale", want: timings.RelationUnknown},
		{name: "wrong context", speed: 20, mutate: "context", want: timings.RelationUnknown},
		{name: "wrong time", speed: 20, mutate: "time", want: timings.RelationUnknown},
		{name: "missing layout", speed: 20, mutate: "layout", want: timings.RelationUnknown},
		{name: "nan length", speed: 20, mutate: "length", want: timings.RelationUnknown},
	} {
		t.Run(tc.name, func(t *testing.T) {
			obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, 100}, {"F", "GT", 1, 120}}, 100, 10, 1, func(state *core.ObservedState) { state.Vehicles[1].SpeedMPS = observed(t, tc.speed) })
			e := trackEvidence(obs)
			v := e.PitEntries["F"]
			v.InLap = tc.inLap
			e.PitEntries["F"] = v
			switch tc.mutate {
			case "entry":
				delete(e.PitEntries, "F")
			case "stale":
				v.State = engineer.ValueStale
				e.PitEntries["F"] = v
			case "context":
				e.Context.Epoch++
			case "time":
				e.SourceTime++
			case "layout":
				e.LayoutID = ""
			case "length":
				e.LengthM = math.NaN()
			}
			got := timings.NewRelationTracker(timings.RelationOptions{Enabled: true}).Observe(obs, &e)
			if got.TrackFront.State != tc.want {
				t.Fatalf("eligibility=%+v want %s", got.TrackFront, tc.want)
			}
		})
	}
}

func TestRelationsHistoryInvalidation(t *testing.T) {
	for _, name := range []string{"epoch", "time reversed", "geometry", "rival id", "stopped", "reverse", "duplicate clock movement", "missing evidence", "stale speed", "driver", "layout", "length"} {
		t.Run(name, func(t *testing.T) {
			tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
			for tick := 0; tick < 2; tick++ {
				obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, 20 + 20*float64(tick)}, {"F", "GT", 1, 30 + 20*float64(tick)}}, 100+float64(tick), 10, 1)
				e := trackEvidence(obs)
				got := tracker.Observe(obs, &e)
				if tick == 1 && !got.TrackFront.Gap.Known {
					t.Fatal("missing positive history")
				}
			}
			epoch := uint64(1)
			now := 102.0
			id := "F"
			p, r := 60.0, 70.0
			switch name {
			case "epoch":
				epoch = 2
			case "time reversed":
				now = 99
			case "rival id":
				id = "NEW"
			case "reverse":
				p, r = 20, 30
			case "duplicate clock movement":
				now = 101
			}
			obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, p}, {id, "GT", 1, r}}, now, 10, epoch, func(state *core.ObservedState) {
				if name == "stopped" {
					state.Vehicles[1].SpeedMPS = observed(t, 0.0)
				}
				if name == "stale speed" {
					f, err := schema.NewField(20.0, schema.ProvenanceObserved, schema.FreshnessStale)
					if err != nil {
						t.Fatal(err)
					}
					state.Vehicles[1].SpeedMPS = f
				}
			})
			if name == "driver" {
				obs.Context.Identity.Driver = "replacement"
			}
			e := trackEvidence(obs)
			if name == "layout" {
				e.LayoutID = "replacement"
			}
			if name == "length" {
				e.LengthM = 5100
			}
			if name == "geometry" {
				e.CatalogVersion = "v2"
			}
			evidence := &e
			if name == "missing evidence" {
				evidence = nil
			}
			if got := tracker.Observe(obs, evidence); got.TrackFront.Gap.Known {
				t.Fatalf("stale history reused: %+v", got.TrackFront.Gap)
			}
		})
	}
}

func TestRelationsSlowRewriteUsesCurrentTime(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	var got timings.Relations
	for tick := 0; tick < 3; tick++ {
		p, r := 39.0, 38.0
		ps, rs := 20.0, 20.0
		if tick == 1 {
			p, r = 41, 40.5
		}
		if tick == 2 {
			p, r = 41.5, 41
			ps, rs = 1, 1
		}
		obs := relationObservationAt(t, []relationCar{{"P", "GT", 1, p}, {"B", "GT", 2, r}}, 100+float64(tick), 10, 1, func(state *core.ObservedState) {
			state.Vehicles[0].SpeedMPS = observed(t, ps)
			state.Vehicles[1].SpeedMPS = observed(t, rs)
		})
		e := trackEvidence(obs)
		got = tracker.Observe(obs, &e)
	}
	if !got.RaceRear.Gap.Known || got.RaceRear.Gap.Seconds != 0 {
		t.Fatalf("slow same-point rewrite extrapolated: %+v", got.RaceRear.Gap)
	}
}

func TestRelationsCrossingUsesLastMarkedSpeed(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	var got timings.Relations
	for tick := 0; tick < 4; tick++ {
		p := []float64{19, 41, 45, 62}[tick]
		r := []float64{18, 40.5, 44, 61}[tick]
		speed := []float64{20, 20, 100, 20}[tick]
		obs := relationObservationAt(t, []relationCar{{"P", "GT", 1, p}, {"B", "GT", 2, r}}, 100+float64(tick), 10, 1, func(state *core.ObservedState) {
			state.Vehicles[0].SpeedMPS = observed(t, speed)
			state.Vehicles[1].SpeedMPS = observed(t, speed)
		})
		e := trackEvidence(obs)
		got = tracker.Observe(obs, &e)
	}
	if !got.RaceRear.Gap.Known || math.Abs(got.RaceRear.Gap.Seconds-0.05) > 1e-8 {
		t.Fatalf("crossing speed=%+v", got.RaceRear.Gap)
	}
}

func TestRelationsRelativeEqualMagnitudeKeepsPrimarySplit(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	var got timings.Relations
	for tick := 0; tick <= 10; tick++ {
		p, r := 81+20*float64(tick), 31+20*float64(tick)
		obs := relationObservationAt(t, []relationCar{{"P", "GT", 1, math.Mod(p, 100)}, {"B", "GT", 2, math.Mod(r, 100)}}, 100+float64(tick), 10, 1, func(state *core.ObservedState) {
			state.Vehicles[0].CompletedLaps = observed(t, standings.CompletedLaps(10+int(p/100)))
			state.Vehicles[1].CompletedLaps = observed(t, standings.CompletedLaps(10+int(r/100)))
		})
		e := trackEvidence(obs)
		e.LengthM = 100
		got = tracker.Observe(obs, &e)
	}
	if !got.TrackRear.Gap.Known || got.TrackRear.Gap.Laps != 0 || math.Abs(got.TrackRear.Gap.Seconds-2.5) > 1e-8 {
		t.Fatalf("equal magnitude did not keep primary: %+v", got.TrackRear.Gap)
	}
	if got.TrackFront.Gap.Known {
		t.Fatal("positive track gap exposed as front")
	}
}

func TestRelationsRaceDirectionIndependentOfSpatialOrder(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	var got timings.Relations
	for tick := 0; tick < 2; tick++ {
		obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, 30 + 20*float64(tick)}, {"F", "GT", 1, 20 + 20*float64(tick)}, {"X", "PROTO", 3, 1000 + 20*float64(tick)}}, 100+float64(tick), 10, 1, func(state *core.ObservedState) {
			state.Vehicles[1].CompletedLaps = observed(t, standings.CompletedLaps(12))
		})
		e := trackEvidence(obs)
		got = tracker.Observe(obs, &e)
	}
	if got.RaceFront.VehicleID != "F" || !got.RaceFront.Gap.Known || got.RaceFront.Gap.Seconds != -0.5 || got.RaceFront.Gap.Laps != -2 {
		t.Fatalf("race direction=%+v", got.RaceFront)
	}
}

func TestRelationsOldPassageExpiresDespiteContinuousSnapshots(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	var got timings.Relations
	for tick := 0; tick <= 306; tick++ {
		p := 39.0
		if tick > 0 {
			p = 41 + float64(tick)*0.001
		}
		r := 21 + float64(tick)*20
		obs := relationObservationAt(t, []relationCar{{"P", "GT", 1, p}, {"B", "GT", 2, math.Mod(r, 100)}}, 100+float64(tick), 10, 1, func(state *core.ObservedState) {
			state.Vehicles[1].CompletedLaps = observed(t, standings.CompletedLaps(10+int(r/100)))
		})
		e := trackEvidence(obs)
		e.LengthM = 100
		got = tracker.Observe(obs, &e)
	}
	// Both cars again occupy interval40. The player's only crossing is now305s
	// old; fresh snapshot envelopes must not revive that old passage.
	if got.RaceRear.Gap.Known || got.TrackRear.Gap.Known {
		t.Fatalf("expired crossing reused: %+v", got)
	}
}

func TestRelationsObservedZeroAtFinishLineIsARealCrossing(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	var got timings.Relations
	for tick := 0; tick < 2; tick++ {
		p, r, laps := 4980.0, 4990.0, 10
		if tick == 1 {
			p, r, laps = 0, 10, 11
		}
		obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, p}, {"F", "GT", 1, r}}, 100+float64(tick), laps, 1)
		e := trackEvidence(obs)
		got = tracker.Observe(obs, &e)
	}
	if !got.TrackFront.Gap.Known || got.TrackFront.Gap.Seconds != -0.5 {
		t.Fatalf("observed finish zero lost: %+v", got.TrackFront.Gap)
	}
}

func TestRelationsDuplicateSnapshotIsAsOfSameTime(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	var obs engineer.ObservationV1
	var got timings.Relations
	for tick := 0; tick < 2; tick++ {
		obs = relationObservationAt(t, []relationCar{{"P", "GT", 2, 20 + 20*float64(tick)}, {"F", "GT", 1, 30 + 20*float64(tick)}}, 100+float64(tick), 10, 1)
		e := trackEvidence(obs)
		got = tracker.Observe(obs, &e)
	}
	for i := 0; i < 100; i++ {
		e := trackEvidence(obs)
		repeat := tracker.Observe(obs, &e)
		if repeat.TrackFront != got.TrackFront || repeat.TrackFront.SourceTime != 101 {
			t.Fatal("duplicate refreshed or changed as-of result")
		}
	}
}

func TestRelationsGameFrontDoesNotOverrideAFullLapDifference(t *testing.T) {
	obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, 10}, {"F", "GT", 1, 100}}, 100, 10, 1, func(state *core.ObservedState) {
		state.Vehicles[1].CompletedLaps = observed(t, standings.CompletedLaps(11))
		state.Vehicles[0].TimeBehindNext = observed(t, standings.TimeGap(2))
	})
	e := trackEvidence(obs)
	got := timings.NewRelationTracker(timings.RelationOptions{Enabled: true}).Observe(obs, &e)
	if got.RaceFront.Gap.Known {
		t.Fatalf("game gap used a full lap ahead: %+v", got.RaceFront.Gap)
	}
}

func TestRelationsSessionTypeChangeDiscardsPassages(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	for tick := 0; tick < 3; tick++ {
		kind := session.TypePractice
		if tick == 2 {
			kind = session.TypeRace
		}
		obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, 20 + 20*float64(tick)}, {"F", "GT", 1, 30 + 20*float64(tick)}}, 100+float64(tick), 10, 1, func(state *core.ObservedState) { state.SessionType = observed(t, kind) })
		e := trackEvidence(obs)
		got := tracker.Observe(obs, &e)
		if tick == 1 && !got.TrackFront.Gap.Known {
			t.Fatal("missing practice control")
		}
		if tick == 2 && got.TrackFront.Gap.Known {
			t.Fatal("practice history crossed session type boundary")
		}
	}
}

func TestRelationsWrapFrontUsesMeasuredTwoSecondGap(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	var got timings.Relations
	for tick := 0; tick <= 50; tick++ {
		p, r := 4901+100*float64(tick), 5101+100*float64(tick)
		obs := relationObservationAt(t, []relationCar{{"P", "GT", 2, math.Mod(p, 5000)}, {"F", "GT", 1, math.Mod(r, 5000)}}, 100+float64(tick), 10, 1, func(state *core.ObservedState) {
			state.Vehicles[0].CompletedLaps = observed(t, standings.CompletedLaps(10+int(p/5000)))
			state.Vehicles[1].CompletedLaps = observed(t, standings.CompletedLaps(10+int(r/5000)))
			for i := range state.Vehicles {
				state.Vehicles[i].SpeedMPS = observed(t, 100.0)
			}
		})
		e := trackEvidence(obs)
		got = tracker.Observe(obs, &e)
	}
	if got.TrackFront.DistanceM != 200 || !got.TrackFront.Gap.Known || math.Abs(got.TrackFront.Gap.Seconds+2) > 1e-8 {
		t.Fatalf("wrap gap=%+v", got.TrackFront)
	}
}

func TestRelationsEqualSpatialCandidatesRemainUnknown(t *testing.T) {
	obs := relationObservation(t, []relationCar{{"P", "GT", 1, 100}, {"B", "GT", 2, 90}, {"C", "GT", 3, 90}})
	e := trackEvidence(obs)
	got := timings.NewRelationTracker(timings.RelationOptions{Enabled: true}).Observe(obs, &e)
	if got.TrackRear.State != timings.RelationUnknown || got.AutoTrackRear.State != timings.RelationUnknown {
		t.Fatal("ambiguous spatial tie picked arbitrary ID")
	}
}

func TestRelationsImplausibleAdvanceDoesNotInventPassage(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	first := relationObservationAt(t, []relationCar{{"P", "GT", 2, 20}, {"F", "GT", 1, 30}}, 100, 10, 1)
	e := trackEvidence(first)
	tracker.Observe(first, &e)
	jump := relationObservationAt(t, []relationCar{{"P", "GT", 2, 2400}, {"F", "GT", 1, 2410}}, 101, 10, 1)
	e = trackEvidence(jump)
	if got := tracker.Observe(jump, &e); got.TrackFront.Gap.Known {
		t.Fatal("2380m in1s at20m/s produced gap")
	}
}

func TestRelationsNonFinitePlausibilityEnvelopeIsUnknown(t *testing.T) {
	tracker := timings.NewRelationTracker(timings.RelationOptions{Enabled: true})
	first := relationObservationAt(t, []relationCar{{"P", "GT", 2, 20}, {"F", "GT", 1, 30}}, 100, 10, 1, func(state *core.ObservedState) {
		for i := range state.Vehicles {
			state.Vehicles[i].SpeedMPS = observed(t, 1e308)
		}
	})
	e := trackEvidence(first)
	tracker.Observe(first, &e)
	next := relationObservationAt(t, []relationCar{{"P", "GT", 2, 2400}, {"F", "GT", 1, 2410}}, 101, 10, 1)
	e = trackEvidence(next)
	if got := tracker.Observe(next, &e); got.TrackFront.Gap.Known {
		t.Fatal("overflow disabled plausibility rejection")
	}
}
