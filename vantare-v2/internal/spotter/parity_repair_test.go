package spotter

import (
	"errors"
	"fmt"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
)

// CrewChief 4c3865e0 NoisyCartesianCoordinateSpotter.cs checks strict world
// X and Z component limits, rather than a relative-speed magnitude.
func TestNewOverlapWorldVelocityBoundaries(t *testing.T) {
	for _, axis := range []string{"x", "z"} {
		for _, delta := range []float64{-12.001, -12, -11.999, 11.999, 12, 12.001} {
			t.Run(fmt.Sprintf("%s_%g", axis, delta), func(t *testing.T) {
				snapshot := spotterObservation(t, func(state *telemetrycore.ObservedState) {
					velocity := spatial.LocalVelocity{Z: 40}
					if axis == "x" {
						velocity.X = delta
					} else {
						velocity.Z += delta
					}
					state.Vehicles[1].LocalVelocity = benchmarkField(t, velocity)
					state.Vehicles[1].WorldPosition = benchmarkField(t, spatial.Position{X: 102.8, Z: 101})
				}, 2.8)
				_, producer, _ := newSpotterHarness(t, 4)
				message, emit, err := producer.Evaluate(snapshot)
				want := delta > -12 && delta < 12
				if err != nil || emit != want || (emit && message.Intent != IntentCarLeft) {
					t.Fatalf("delta %s=%g: %s/%v/%v, want new overlap=%v", axis, delta, message.Intent, emit, err, want)
				}
			})
		}
	}
}

func TestNewOverlapUsesEachCarsWorldFrameAndObservedZero(t *testing.T) {
	quarterTurn := spatial.Orientation{Row0: spatial.Vector3{Z: 1}, Row1: spatial.Vector3{Y: 1}, Row2: spatial.Vector3{X: -1}}
	for _, test := range []struct {
		name string
		edit func(*telemetrycore.ObservedState)
		want bool
	}{
		{name: "diagonal_components_below_12", want: true, edit: func(s *telemetrycore.ObservedState) {
			s.Vehicles[1].LocalVelocity = benchmarkField(t, spatial.LocalVelocity{X: 11.9, Z: 51.9})
		}},
		{name: "stationary_rival", edit: func(s *telemetrycore.ObservedState) {
			s.Vehicles[1].LocalVelocity = benchmarkField(t, spatial.LocalVelocity{})
		}},
		{name: "zero_is_observed_at_10mps_delta", want: true, edit: func(s *telemetrycore.ObservedState) {
			s.Vehicles[0].SpeedMPS = benchmarkField(t, 10.0)
			s.Vehicles[0].LocalVelocity = benchmarkField(t, spatial.LocalVelocity{Z: 10})
			s.Vehicles[1].LocalVelocity = benchmarkField(t, spatial.LocalVelocity{})
		}},
		{name: "rotated_rival_same_world_velocity", want: true, edit: func(s *telemetrycore.ObservedState) {
			s.Vehicles[1].Orientation = benchmarkField(t, quarterTurn)
			s.Vehicles[1].LocalVelocity = benchmarkField(t, spatial.LocalVelocity{X: -40})
		}},
		{name: "equal_local_different_world_velocity", edit: func(s *telemetrycore.ObservedState) { s.Vehicles[1].Orientation = benchmarkField(t, quarterTurn) }},
		{name: "rotated_player_same_world_velocity", want: true, edit: func(s *telemetrycore.ObservedState) {
			s.Vehicles[0].Orientation = benchmarkField(t, quarterTurn)
			s.Vehicles[0].LocalVelocity = benchmarkField(t, spatial.LocalVelocity{X: -40})
			s.Vehicles[1].WorldPosition = benchmarkField(t, spatial.Position{X: 101, Z: 97.2})
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, producer, _ := newSpotterHarness(t, 4)
			message, emit, err := producer.Evaluate(spotterObservation(t, test.edit, 2.8))
			if err != nil || emit != test.want || (emit && message.Intent != IntentCarLeft) {
				t.Fatalf("world-frame admission = %s/%v/%v, want %v", message.Intent, emit, err, test.want)
			}
		})
	}
}

func TestNewOverlapNeedsUsableVelocityAndOrientation(t *testing.T) {
	for _, car := range []int{0, 1} {
		for _, signal := range []string{"velocity", "orientation"} {
			for _, quality := range []schema.Freshness{schema.FreshnessMissing, schema.FreshnessStale, schema.FreshnessInvalid} {
				t.Run(fmt.Sprintf("car%d_%s_%v", car, signal, quality), func(t *testing.T) {
					_, producer, _ := newSpotterHarness(t, 4)
					observation := spotterObservation(t, func(s *telemetrycore.ObservedState) {
						if signal == "velocity" {
							s.Vehicles[car].LocalVelocity = spotterQualityField(t, spatial.LocalVelocity{Z: 40}, quality)
						} else {
							orientation, _ := s.Vehicles[car].Orientation.Value()
							s.Vehicles[car].Orientation = spotterQualityField(t, orientation, quality)
						}
					}, 2.8)
					message, emit, err := producer.Evaluate(observation)
					if emit || (err != nil && !errors.Is(err, ErrObservationNotReady)) {
						t.Fatalf("unusable %s authorized overlap = %s/%v/%v", signal, message.Intent, emit, err)
					}
				})
			}
		}
	}
}

func TestVelocityPredicateOnCoherentPositionsAfter200Milliseconds(t *testing.T) {
	// Both trajectories initially lie outside longitudinal overlap. At 200ms
	// the rivals are within overlap with nonzero longitudinal offsets after
	// the RF2 rival sampling window. Positions agree with observed velocity.
	for _, test := range []struct {
		name                 string
		rivalSpeed, initialZ float64
		want                 bool
	}{
		{"stationary", 0, 109, false}, {"closing_10mps", 30, 106, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			clock, producer, _ := newSpotterHarness(t, 4)
			for _, elapsedMS := range []int64{0, 200} {
				elapsed := float64(elapsedMS) / 1000
				clock.now = 1000 + elapsedMS
				observation := spotterObservation(t, func(s *telemetrycore.ObservedState) {
					s.SourceTime = benchmarkField(t, time.Second+time.Duration(elapsedMS)*time.Millisecond)
					s.Vehicles[0].WorldPosition = benchmarkField(t, spatial.Position{X: 100, Z: 100 + 40*elapsed})
					s.Vehicles[1].WorldPosition = benchmarkField(t, spatial.Position{X: 102.8, Z: test.initialZ + test.rivalSpeed*elapsed})
					s.Vehicles[1].LocalVelocity = benchmarkField(t, spatial.LocalVelocity{Z: test.rivalSpeed})
				}, 2.8)
				message, emit, err := producer.Evaluate(observation)
				want := elapsedMS == 200 && test.want
				if err != nil || emit != want || (emit && message.Intent != IntentCarLeft) {
					t.Fatalf("t=%dms: %s/%v/%v, want overlap=%v", elapsedMS, message.Intent, emit, err, want)
				}
			}
		})
	}
}

func TestEstablishedOverlapKeepsGeometryWithoutVelocityAdmission(t *testing.T) {
	for _, velocityMissing := range []bool{false, true} {
		t.Run(fmt.Sprintf("velocity_missing_%v", velocityMissing), func(t *testing.T) {
			clock, producer, _ := newSpotterHarness(t, 4)
			first, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8))
			if err != nil || !emit {
				t.Fatalf("seed = %v/%v", emit, err)
			}
			if err := producer.AcknowledgeStarted(first, clock.now); err != nil {
				t.Fatal(err)
			}
			clock.now = 1100
			observation := spotterObservation(t, func(s *telemetrycore.ObservedState) {
				if velocityMissing {
					s.Vehicles[0].LocalVelocity = schema.MissingField[spatial.LocalVelocity]()
					s.Vehicles[1].LocalVelocity = schema.MissingField[spatial.LocalVelocity]()
					s.Vehicles[1].Orientation = schema.MissingField[spatial.Orientation]()
				} else {
					s.Vehicles[1].LocalVelocity = benchmarkField(t, spatial.LocalVelocity{})
				}
				s.Vehicles[1].WorldPosition = benchmarkField(t, spatial.Position{X: 102.8, Z: 95.3})
			}, 2.8)
			if _, emit, err := producer.Evaluate(observation); err != nil || emit {
				t.Fatalf("established overlap changed = %v/%v", emit, err)
			}
			clock.now = 4000
			if message, emit, err := producer.Evaluate(observation); err != nil || !emit || message.Intent != IntentStillThere {
				t.Fatalf("established overlap lost = %s/%v/%v", message.Intent, emit, err)
			}
		})
	}
}

func TestClearDelayStartsAtFirstEmptyObservationAndIsStrict(t *testing.T) {
	for _, side := range []struct {
		name           string
		left, right    bool
		warning, clear string
	}{
		{"left", true, false, IntentCarLeft, IntentClearLeft}, {"right", false, true, IntentCarRight, IntentClearRight},
		{"both", true, true, IntentThreeWide, IntentAllClear},
	} {
		t.Run(side.name, func(t *testing.T) {
			var policy Policy
			policy.Evaluate(1000, side.left, side.right)
			if !policy.Start(side.warning, 4000, 1000) {
				t.Fatal("seed ACK rejected")
			}
			for _, now := range []int64{1050, 1100, 1199, 1200, 1201} {
				intent, emit := policy.Evaluate(now, false, false)
				if emit != (now == 1201) || (emit && intent != side.clear) {
					t.Fatalf("t=%d: %s/%v, want clear at 1201", now, intent, emit)
				}
			}
		})
	}
	var policy Policy
	policy.Evaluate(1000, true, false)
	if !policy.Start(IntentCarLeft, 4000, 1000) {
		t.Fatal("seed ACK rejected")
	}
	for now := int64(1050); now <= 1250; now += 50 {
		intent, emit := policy.Evaluate(now, false, false)
		if emit != (now == 1250) || (emit && intent != IntentClearLeft) {
			t.Fatalf("50ms ticks at %d: %s/%v", now, intent, emit)
		}
	}
}

func TestEmptyObservationRejectsLateWarningAndReminderACK(t *testing.T) {
	for _, sides := range [][]float64{{2.8}, {-2.8}, {2.8, -2.8}} {
		for _, reminder := range []bool{false, true} {
			t.Run(fmt.Sprintf("sides_%v/reminder_%v", sides, reminder), func(t *testing.T) {
				clock, producer, _ := newSpotterHarness(t, 4)
				message, emit, err := producer.Evaluate(benchmarkObservation(t, sides...))
				if err != nil || !emit {
					t.Fatalf("seed = %v/%v", emit, err)
				}
				if reminder {
					if err := producer.AcknowledgeStarted(message, clock.now); err != nil {
						t.Fatal(err)
					}
					clock.now = 4000
					message, emit, err = producer.Evaluate(benchmarkObservation(t, sides...))
					if err != nil || !emit || message.Intent != IntentStillThere {
						t.Fatalf("reminder = %s/%v/%v", message.Intent, emit, err)
					}
				}
				clock.now += 50
				if _, emit, err := producer.Evaluate(benchmarkObservation(t)); err != nil || emit {
					t.Fatalf("empty = %v/%v", emit, err)
				}
				if err := producer.AcknowledgeStarted(message, clock.now+1); !errors.Is(err, ErrDecisionObsolete) {
					t.Fatalf("late ACK = %v, want obsolete decision", err)
				}
			})
		}
	}
}

func TestReappearanceBeforeClearMustPassNewVelocityAdmission(t *testing.T) {
	for _, speed := range []float64{0, 40} {
		t.Run(fmt.Sprintf("rival_%g", speed), func(t *testing.T) {
			clock, producer, _ := newSpotterHarness(t, 4)
			first, emit, err := producer.Evaluate(benchmarkObservation(t, 2.8))
			if err != nil || !emit {
				t.Fatalf("seed = %v/%v", emit, err)
			}
			if err := producer.AcknowledgeStarted(first, clock.now); err != nil {
				t.Fatal(err)
			}
			clock.now = 1050
			if _, emit, err := producer.Evaluate(benchmarkObservation(t)); err != nil || emit {
				t.Fatalf("empty = %v/%v", emit, err)
			}
			observation := spotterObservation(t, func(s *telemetrycore.ObservedState) {
				s.Vehicles[1].LocalVelocity = benchmarkField(t, spatial.LocalVelocity{Z: speed})
			}, 2.8)
			clock.now = 1100
			if _, emit, err := producer.Evaluate(observation); err != nil || emit {
				t.Fatalf("bounce = %v/%v", emit, err)
			}
			clock.now = 1250
			message, emit, err := producer.Evaluate(observation)
			if err != nil || emit != (speed == 0) || (emit && message.Intent != IntentClearLeft) {
				t.Fatalf("bounce clear = %s/%v/%v", message.Intent, emit, err)
			}
		})
	}
}

func spotterQualityField[T comparable](t testing.TB, value T, quality schema.Freshness) schema.Field[T] {
	t.Helper()
	if quality == schema.FreshnessMissing {
		return schema.MissingField[T]()
	}
	field, err := schema.NewField(value, schema.ProvenanceObserved, quality)
	if err != nil {
		t.Fatal(err)
	}
	return field
}
