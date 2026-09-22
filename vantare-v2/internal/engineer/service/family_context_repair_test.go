package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/families"
	"github.com/vantare/overlays/v2/internal/radio"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

type familyContextClock struct{ now int64 }

func (clock *familyContextClock) NowMS() int64 { return clock.now }

// These cases check the context guards from CrewChief 4c3865e0 Timings.cs
// (isNotRacing, isNearRaceEnd and triggerInternal), not the unfinished cadence.
func TestFamilyTimingsRequiresValidRaceContext(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*derive.FinalState)
		want   bool
	}{
		{name: "race", want: true},
		{name: "endurance", want: true, change: func(s *derive.FinalState) { s.Observed.SessionType = observedField(t, session.TypeEndurance) }},
		{name: "practice", change: func(s *derive.FinalState) { s.Observed.SessionType = observedField(t, session.TypePractice) }},
		{name: "qualifying", change: func(s *derive.FinalState) { s.Observed.SessionType = observedField(t, session.TypeQualifying) }},
		{name: "warmup", change: func(s *derive.FinalState) { s.Observed.SessionType = observedField(t, session.TypeWarmup) }},
		{name: "session_missing", change: func(s *derive.FinalState) { s.Observed.SessionType = schema.MissingField[session.Type]() }},
		{name: "session_stale", change: func(s *derive.FinalState) { s.Observed.SessionType = staleContextField(t, session.TypeRace) }},
		{name: "in_pit", change: func(s *derive.FinalState) { s.Observed.Vehicles[0].InPit = observedField(t, pit.InPit(true)) }},
		{name: "pit_missing", change: func(s *derive.FinalState) { s.Observed.Vehicles[0].InPit = schema.MissingField[pit.InPit]() }},
		{name: "pit_stale", change: func(s *derive.FinalState) { s.Observed.Vehicles[0].InPit = staleContextField(t, pit.InPit(false)) }},
		{name: "timed_119_999", change: func(s *derive.FinalState) {
			s.Derived.SessionRemaining = observedField(t, session.RemainingTime(119.999))
		}},
		{name: "timed_120", want: true, change: func(s *derive.FinalState) { s.Derived.SessionRemaining = observedField(t, session.RemainingTime(120)) }},
		{name: "timed_zero", change: func(s *derive.FinalState) { s.Derived.SessionRemaining = observedField(t, session.RemainingTime(0)) }},
		{name: "timed_and_lap_limit", change: func(s *derive.FinalState) {
			s.Observed.MaximumLaps = observedField(t, session.MaximumLaps(10))
			s.Derived.SessionRemaining = observedField(t, session.RemainingTime(90))
		}},
		{name: "timed_remaining_missing", change: func(s *derive.FinalState) { s.Derived.SessionRemaining = schema.MissingField[session.RemainingTime]() }},
		{name: "timed_remaining_stale", change: func(s *derive.FinalState) {
			s.Derived.SessionRemaining = staleContextField(t, session.RemainingTime(600))
		}},
		// Unknown format cannot authorize a report. An observed zero is
		// distinct from missing; lap-only end guards remain a separate cut.
		{name: "unknown_format", change: func(s *derive.FinalState) {
			s.Observed.EndTime = schema.MissingField[session.EndTime]()
			s.Derived.SessionRemaining = observedField(t, session.RemainingTime(90))
		}},
		{name: "observed_zero_end", want: true, change: func(s *derive.FinalState) {
			s.Observed.EndTime = observedField(t, session.EndTime(0))
			s.Observed.MaximumLaps = observedField(t, session.MaximumLaps(10))
			s.Derived.SessionRemaining = schema.MissingField[session.RemainingTime]()
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			clock := &familyContextClock{now: 1000}
			engine, err := families.New(clock, radio.LocaleES)
			if err != nil {
				t.Fatal(err)
			}
			var found bool
			for seq := uint64(1); seq <= 2; seq++ {
				clock.now = int64(seq) * 1000
				result, err := engine.Evaluate(familyContextObservation(t, seq, test.change))
				if err != nil {
					t.Fatal(err)
				}
				for _, message := range result.Messages {
					found = found || message.Intent == families.IntentTimingGapReport
				}
			}
			if found != test.want {
				t.Fatalf("gap report = %v, want %v", found, test.want)
			}
		})
	}
}

func TestFamilyTimingsDoesNotReopenWhenEndEvidenceBecomesUnusable(t *testing.T) {
	for _, test := range []struct {
		name    string
		nearEnd bool
		change  func(*derive.FinalState)
	}{
		{name: "elapsed_clock_missing", nearEnd: true, change: func(s *derive.FinalState) {
			s.Observed.EndTime = schema.MissingField[session.EndTime]()
			s.Derived.SessionRemaining = schema.MissingField[session.RemainingTime]()
		}},
		{name: "stale_end_after_valid_race", change: func(s *derive.FinalState) {
			s.Observed.EndTime = staleContextField(t, session.EndTime(900))
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			clock := &familyContextClock{now: 1000}
			engine, err := families.New(clock, radio.LocaleES)
			if err != nil {
				t.Fatal(err)
			}
			for seq := uint64(1); seq <= 6; seq++ {
				var change func(*derive.FinalState)
				if seq == 3 && test.nearEnd {
					change = func(s *derive.FinalState) {
						s.Derived.SessionRemaining = observedField(t, session.RemainingTime(0))
					}
				} else if seq >= 3 {
					change = test.change
				}
				clock.now = int64(seq) * 1000
				result, err := engine.Evaluate(familyContextObservation(t, seq, change))
				if err != nil {
					t.Fatal(err)
				}
				var timing bool
				for _, message := range result.Messages {
					timing = timing || message.Intent == families.IntentTimingGapReport
				}
				if timing != (seq == 2) {
					t.Fatalf("sequence %d gap report = %v, want only the initial valid report", seq, timing)
				}
			}
		})
	}
}

func TestFamilyTimingsRevokesPendingContextBeforeStarted(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*derive.FinalState)
	}{
		{name: "pit_entry", change: func(s *derive.FinalState) { s.Observed.Vehicles[0].InPit = observedField(t, pit.InPit(true)) }},
		{name: "pit_missing", change: func(s *derive.FinalState) { s.Observed.Vehicles[0].InPit = schema.MissingField[pit.InPit]() }},
		{name: "practice", change: func(s *derive.FinalState) { s.Observed.SessionType = observedField(t, session.TypePractice) }},
		{name: "near_end", change: func(s *derive.FinalState) { s.Derived.SessionRemaining = observedField(t, session.RemainingTime(90)) }},
		{name: "end_missing", change: func(s *derive.FinalState) { s.Observed.EndTime = schema.MissingField[session.EndTime]() }},
		{name: "end_stale", change: func(s *derive.FinalState) { s.Observed.EndTime = staleContextField(t, session.EndTime(900)) }},
	} {
		t.Run(test.name, func(t *testing.T) {
			gate := &firstSpotterResolveGate{started: make(chan struct{}), release: make(chan struct{}), done: make(chan error, 1)}
			svc := timingOnlyService(t)
			svc.SetAudioResolver(gate)
			svc.SetAudioPlayer(immediateAudioPlayer{})
			if err := svc.Start(context.Background()); err != nil {
				t.Fatal(err)
			}
			defer svc.Stop()
			notifications, unsubscribe := svc.Subscribe()
			defer unsubscribe()
			for seq := uint64(1); seq <= 2; seq++ {
				if err := svc.ConsumeObservation(familyContextObservation(t, seq, nil)); err != nil {
					t.Fatal(err)
				}
			}
			select {
			case <-gate.started:
			case <-time.After(time.Second):
				t.Fatal("gap report did not reach selected delivery")
			}
			if err := svc.ConsumeObservation(familyContextObservation(t, 3, test.change)); err != nil {
				t.Fatal(err)
			}
			select {
			case err := <-gate.done:
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("obsolete timing cancellation = %v", err)
				}
			case <-time.After(time.Second):
				t.Fatal("context loss did not cancel selected timing")
			}
			select {
			case notification := <-notifications:
				t.Fatalf("obsolete timing reached started: %+v", notification)
			default:
			}
			// A revoked candidate must not consume cooldown or permanently mute
			// the family. Restoration seeds once, then delivers a valid report.
			for seq := uint64(4); seq <= 5; seq++ {
				if err := svc.ConsumeObservation(familyContextObservation(t, seq, nil)); err != nil {
					t.Fatal(err)
				}
				if seq == 4 {
					select {
					case notification := <-notifications:
						t.Fatalf("restoration seed emitted: %+v", notification)
					default:
					}
				}
			}
			waitForIntent(t, notifications, families.IntentTimingGapReport)
		})
	}
}

func TestFamilyTimingsContextResetPreservesStartedDelivery(t *testing.T) {
	player := &firstStartedAudioGate{started: make(chan struct{}), release: make(chan struct{}), result: make(chan error, 1)}
	svc := timingOnlyService(t)
	svc.SetAudioResolver(staticResolver{path: "cached.wav"})
	svc.SetAudioPlayer(player)
	if err := svc.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	for seq := uint64(1); seq <= 2; seq++ {
		if err := svc.ConsumeObservation(familyContextObservation(t, seq, nil)); err != nil {
			t.Fatal(err)
		}
	}
	select {
	case <-player.started:
	case <-time.After(time.Second):
		t.Fatal("timing did not reach audio after started")
	}
	if err := svc.ConsumeObservation(familyContextObservation(t, 3, func(s *derive.FinalState) { s.Observed.Vehicles[0].InPit = observedField(t, pit.InPit(true)) })); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-player.result:
		t.Fatalf("context reset interrupted started timing: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(player.release)
	select {
	case err := <-player.result:
		if err != nil {
			t.Fatalf("context reset interrupted started timing: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("started timing did not complete")
	}
}

func timingOnlyService(t *testing.T) *service.EngineerService {
	t.Helper()
	svc := service.NewEngineerService(nil)
	if err := svc.SetSpotterEnabled(false); err != nil {
		t.Fatal(err)
	}
	for _, family := range []string{"fuel", "laps", "pitstops", "penalties"} {
		if err := svc.SetOutputMode(family, "disabled"); err != nil {
			t.Fatal(err)
		}
	}
	return svc
}

func familyContextObservation(t *testing.T, sequence uint64, change func(*derive.FinalState)) engineerprojection.ObservationSnapshotV1 {
	t.Helper()
	return canonicalObservationWithState(t, 1, sequence, 5, 100, 100, true, 0, func(state *derive.FinalState) {
		state.Observed.SessionType = observedField(t, session.TypeRace)
		state.Observed.EndTime = observedField(t, session.EndTime(900))
		state.Observed.MaximumLaps = observedField(t, session.MaximumLaps(0))
		state.Derived.SessionRemaining = observedField(t, session.RemainingTime(600))
		if change != nil {
			change(state)
		}
	})
}

func staleContextField[T comparable](t *testing.T, value T) schema.Field[T] {
	t.Helper()
	field, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessStale)
	if err != nil {
		t.Fatal(err)
	}
	return field
}
