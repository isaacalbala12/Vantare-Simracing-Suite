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
		RaceLaps:        30,
		BaseLapSeconds:  NewFallbackScalar(100, "test:base-lap"),
		Projection: &sp.StrategyInputProjectionV2{
			ContractVersion:    sp.ContractVersionStrategyInputProjectionV2,
			GeneratedAt:        validTime(),
			ComputationVersion: "test",
			SourceSessions:     []string{"s1"},
			CombinationID:      "spa",
			SessionClassification: sp.SessionClassificationFamily{
				Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: "s"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "v1"},
			},
			CombinedStintPaceCurve: sp.CombinedStintPaceCurve{Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: "s"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "v1"}, Identifiability: sp.IdentifiabilityCombinedOnly},
			Pit:                    sp.PitFamily{Presence: sp.PresenceValid, Provenance: sp.Provenance{Kind: sp.ProvenanceObserved, SourceID: "s"}, Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "v1"}},
		},
		PitCost: PitCostModel{
			TransitSeconds: NewFallbackScalar(20, "test:pit-transit"), RefuelRateLPerS: NewFallbackScalar(2.5, "test:refuel-rate"),
			VERatePPerS: NewFallbackScalar(2.5, "test:ve-rate"), TyreSeconds: NewFallbackScalar(3, "test:tyre-service"), ServiceMode: manual.PitServiceParallel,
		},
		Formation:          Formation{Seconds: NewFallbackScalar(5, "test:formation"), Presence: "valid"},
		EventRules:         EventRules{RequiredWindows: []PitWindow{{FromLap: 5, ToLap: 10}}},
		Budget:             ComputeBudget{P95Millis: 500, MaxCandidates: 10},
		FuelCapacityLiters: NewFallbackScalar(90, "test:fuel-capacity"),
		VECapacityPercent:  NewFallbackScalar(100, "test:ve-capacity"),
		TyreLifeLaps:       NewFallbackScalar(15, "test:tyre-life"),
		FuelPerLapLiters:   NewFallbackScalar(0, "test:fuel-per-lap"),
		VEPerLapPercent:    NewFallbackScalar(0, "test:ve-per-lap"),
		DegradationPerLap:  NewFallbackScalar(0, "test:degradation"),
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
	bad = in
	bad.FuelWeight = &FuelWeightParameter{
		Presence: sp.PresenceValid, SecondsPerLiter: 0.03,
		Provenance: sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "not-gated"},
		Confidence: sp.Confidence{SampleSize: 1, ComputationVersion: "test.v1"},
	}
	if err := bad.Validate(); err == nil {
		t.Fatal("expected derived fallback fuel weight to be rejected")
	}
}
