package app

import (
	"testing"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetryprocess"
)

func TestRustCandidatePolicyUsesLMUDeclarationAndProductCadence(t *testing.T) {
	policy := performancepolicy.Resolve(performancepolicy.Policy{Level: performancepolicy.LevelMaximum}, nil)
	consumers := telemetryprocess.ConsumersV1{OverlayV2: true, Engineer: true}
	configuration, err := rustCandidatePolicy(1, consumers, policy)
	if err != nil {
		t.Fatal(err)
	}
	if configuration.Consumers != consumers || !configuration.Source.ResolveModesFromEvidence {
		t.Fatalf("candidate demand or mode ownership changed: %+v", configuration)
	}
	if got := configuration.Source.Modes; len(got.Spatial) != 1 || got.Spatial[0] != "xyz" || got.Gaps != "official" || got.Standings != "official" || len(got.Delta) != 3 {
		t.Fatalf("LMU declaration changed: %+v", got)
	}
	if configuration.Cadence.FastNS != int64(performancepolicy.CadenceFor(policy.Level).Fast) || configuration.Preferences.DeltaReference != "personal-best" {
		t.Fatalf("candidate policy diverged from product: %+v", configuration)
	}
	if _, err := rustCandidatePolicy(0, consumers, policy); err == nil {
		t.Fatal("zero revision accepted")
	}
}
