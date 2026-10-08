package application

import (
	"testing"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestOrbitPitServicesReplaceLegacyAllInCost(t *testing.T) {
	for _, test := range []struct {
		mode string
		want float64
	}{{"parallel", 28}, {"sequential", 33}} {
		t.Run(test.mode, func(t *testing.T) {
			event := OrbitCalculationEvent{
				TankLiters: 100, FuelReserveLiters: resourceValue(0), PitLossSeconds: 60,
				VirtualEnergy: &OrbitCalculationVirtualEnergy{Applicability: "not_applicable"},
				PitServices: &OrbitCalculationPitServices{
					TransitSeconds: resourceValue(20), RefuelRateLPerS: resourceValue(2), VERatePPerS: resourceValue(2), TyreSeconds: resourceValue(8), ServiceMode: test.mode,
				},
			}
			planning := isa825OrbitInput().PlanningInputs
			planning.Projection.Pit = sp.PitFamily{
				Presence:             sp.PresenceValid,
				Provenance:           sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "test:contradictory-pit"},
				Confidence:           sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"},
				TransitSecondsManual: resourceValue(200),
				ServiceSecondsManual: resourceValue(80),
				FuelRate:             sp.ObservedRateFamily{Presence: sp.PresenceValid, Mean: 0.5, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "test:contradictory-fuel-rate"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"}},
				VERate:               sp.ObservedRateFamily{Presence: sp.PresenceValid, Mean: 0.5, Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "test:contradictory-ve-rate"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"}},
			}
			planning.Overrides = map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride{
				strategydocument.PlanningInputPitLoss: {Value: 99, Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceManual, SourceID: "test:legacy-pit"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"}},
			}
			input := orbitSolverInput(20, event, 60, 1, sp.ClimateBucketDry, planning)
			decision := solver.DecisionVector{
				Stints:   []solver.StintDecision{{Index: 0, Laps: 10}, {Index: 1, Laps: 10}},
				PitStops: []solver.PitStopDecision{{Lap: 10, FuelLiters: 10, ChangeTyres: true, ServiceMode: manual.PitServiceMode(test.mode)}},
			}
			replayed, err := solver.ReplayDecisionV2(input, decision)
			if err != nil {
				t.Fatal(err)
			}
			if !replayed.Feasible {
				t.Fatalf("replay is infeasible: %+v", replayed.Reasons)
			}
			if replayed.Evaluation.PitSeconds != test.want {
				t.Fatalf("pit seconds = %v, want %v", replayed.Evaluation.PitSeconds, test.want)
			}
			if input.PitCost.TransitSeconds.Value != 20 || input.PitCost.TransitSeconds.Role != solver.ScalarRoleUserOverride {
				t.Fatalf("explicit pit cost = %+v", input.PitCost)
			}
		})
	}
}

func TestOrbitPitServicesValidateCompletenessAndKeepLegacy(t *testing.T) {
	legacy := orbitSolverInput(4, OrbitCalculationEvent{TankLiters: 4, PitLossSeconds: 60}, 60, 1, sp.ClimateBucketDry, nil)
	if legacy.PitCost.TransitSeconds.Value != 60 || legacy.PitCost.RefuelRateLPerS.Value != orbitLegacyAllInServiceRate {
		t.Fatalf("legacy pit cost changed: %+v", legacy.PitCost)
	}
	invalid := finalEvaluationInput()
	invalid.Event.PitServices = &OrbitCalculationPitServices{TransitSeconds: resourceValue(0), RefuelRateLPerS: resourceValue(2), VERatePPerS: resourceValue(2), ServiceMode: "parallel"}
	if _, err := calculateOrbit(invalid); err == nil {
		t.Fatal("incomplete pit services accepted")
	}
	invalid.Event.PitServices.TyreSeconds = resourceValue(0)
	invalid.Event.PitServices.RefuelRateLPerS = resourceValue(0)
	if _, err := calculateOrbit(invalid); err == nil {
		t.Fatal("zero refuel rate accepted")
	}
}

func TestOrbitComparisonUsesReplayedPitCost(t *testing.T) {
	comparison := compareOrbitPlans(
		"active", OrbitCalculationPlan{Stops: 2, PitSeconds: 66},
		"other", OrbitCalculationPlan{Stops: 1, PitSeconds: 28},
		OrbitCalculationEvent{PitLossSeconds: 60, PitServices: &OrbitCalculationPitServices{}}, nil,
	)
	if comparison.SavedSecs != 38 {
		t.Fatalf("saved pit seconds = %v, want 38", comparison.SavedSecs)
	}
	legacy := compareOrbitPlans(
		"active", OrbitCalculationPlan{Stops: 2, PitSeconds: 66},
		"other", OrbitCalculationPlan{Stops: 1, PitSeconds: 28},
		OrbitCalculationEvent{PitLossSeconds: 60}, nil,
	)
	if legacy.SavedSecs != 60 {
		t.Fatalf("legacy saved pit seconds = %v, want 60", legacy.SavedSecs)
	}
}
