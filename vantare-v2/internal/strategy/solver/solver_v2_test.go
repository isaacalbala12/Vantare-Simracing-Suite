package solver

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/manual"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func validTime() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }

func TestSolverInputV2_Validate(t *testing.T) {
	in := SolverInputV2{
		ContractVersion: SolverContractVersionV2,
		RaceLaps: 30,
		BaseLapSeconds: 100,
		Projection: &sp.StrategyInputProjectionV2{
			ContractVersion: sp.ContractVersionStrategyInputProjectionV2,
			GeneratedAt: validTime(),
			ComputationVersion: "test",
			SourceSessions: []string{"s1"},
			CombinationID: "spa",
			SessionClassification: sp.SessionClassificationFamily{
				Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: "s"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "v1"},
			},
			CombinedStintPaceCurve: sp.CombinedStintPaceCurve{Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: "s"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "v1"}, Identifiability: sp.IdentifiabilityCombinedOnly},
			Pit: sp.PitFamily{Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: "s"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "v1"}},
		},
		PitCost: PitCostModel{TransitSeconds: 20, RefuelRateLPerS: 2.5, VERatePPerS: 2.5, TyreSeconds: 3, ServiceMode: manual.PitServiceParallel},
		Formation: Formation{Seconds: 5, Presence: "valid"},
		EventRules: EventRules{RequiredWindows: []PitWindow{{FromLap: 5, ToLap: 10}}},
		Budget: ComputeBudget{P95Millis: 500, MaxCandidates: 10},
		FuelCapacityLiters: 90,
		VECapacityPercent: 100,
		TyreLifeLaps: 15,
	}
	if err := in.Validate(); err != nil {
		t.Fatalf("validate: %v", err)
	}
	// budget invalid
	bad := in
	bad.Budget.P95Millis = 0
	if err := bad.Validate(); err == nil {
		t.Fatalf("expected budget error")
	}
	// projection with separable without gate should fail
}
