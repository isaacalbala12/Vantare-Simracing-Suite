package projectioninput

import (
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

func TestSemanticEvidenceUsesConfiguredSensitivity(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		rivalX      float64
		sensitivity spotter.Sensitivity
		wantLeft    bool
	}{
		{name: "conservative detects near rival", rivalX: 1.7, sensitivity: spotter.SensitivityConservative, wantLeft: true},
		{name: "normal misses conservative-only rival", rivalX: 1.7, sensitivity: spotter.SensitivityNormal, wantLeft: false},
		{name: "aggressive misses conservative-only rival", rivalX: 1.7, sensitivity: spotter.SensitivityAggressive, wantLeft: false},
		{name: "normal detects mid rival", rivalX: 1.9, sensitivity: spotter.SensitivityNormal, wantLeft: true},
		{name: "aggressive misses normal-detected rival", rivalX: 1.9, sensitivity: spotter.SensitivityAggressive, wantLeft: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			snapshot := parityObservation(t, parityValues{rivalX: tt.rivalX})
			evidence := SemanticEvidence(snapshot, NewAdapter(), tt.sensitivity)
			if !evidence.SpotterKnown {
				t.Fatalf("SpotterKnown = false for %+v", evidence)
			}
			if evidence.SpotterLeft != tt.wantLeft {
				t.Fatalf("SpotterLeft = %v, want %v (sensitivity %s)", evidence.SpotterLeft, tt.wantLeft, tt.sensitivity)
			}
		})
	}
}

func TestPolicyEvidenceUsesPresetSensitivity(t *testing.T) {
	t.Parallel()

	snapshot := parityObservation(t, parityValues{rivalX: 1.9})
	adapter := NewAdapter()
	aggressive := PolicyEvidence(snapshot, adapter, engineer.SourceLive, 2_000, spotter.SensitivityAggressive)
	if !aggressive.Semantic.SpotterKnown {
		t.Fatalf("SpotterKnown = false: %+v", aggressive)
	}
	if aggressive.Semantic.SpotterLeft {
		t.Fatal("PolicyEvidence ignored preset aggressive sensitivity (rival at 1.9m must be outside aggressive reach)")
	}
	normal := PolicyEvidence(snapshot, adapter, engineer.SourceLive, 2_000, spotter.SensitivityNormal)
	if !normal.Semantic.SpotterLeft {
		t.Fatal("PolicyEvidence with normal sensitivity missed rival at 1.9m")
	}
}

func TestPolicyEvidenceAndCandidateShareCanonicalObservation(t *testing.T) {
	t.Parallel()

	snapshot := parityObservation(t, parityValues{})
	adapter := NewAdapter()
	evidence := PolicyEvidence(snapshot, adapter, engineer.SourceLive, 2_000, spotter.SensitivityNormal)
	if evidence.Context != snapshot.Context || evidence.CanonicalVersion != snapshot.CanonicalVersion ||
		evidence.ProjectionVersion != snapshot.ProjectionVersion || !evidence.Semantic.SpotterKnown {
		t.Fatalf("PolicyEvidence() = %+v", evidence)
	}

	message := audio.Message{
		ID: "left", TextKey: messagepolicy.IntentSpotterCarLeft,
		Category: audio.CategorySpotter, Priority: audio.PrioritySpotter,
		CreatedAt: 1_000, ExpiresAt: 1_500, ValidityRule: "spotter.active_left",
	}
	candidate, err := CandidateFromMessage(message, snapshot, evidence.Semantic)
	if err != nil {
		t.Fatalf("CandidateFromMessage() error = %v", err)
	}
	if candidate.Context != snapshot.Context || candidate.Subject != string(snapshot.Context.Identity.Vehicle) ||
		candidate.Family != messagepolicy.FamilySpotter || candidate.Priority != messagepolicy.PrioritySpotter ||
		candidate.Semantic.Rule != messagepolicy.SemanticSpotterLeftActive {
		t.Fatalf("candidate = %+v", candidate)
	}
}

func TestCandidateFromMessageFailsClosed(t *testing.T) {
	t.Parallel()

	snapshot := parityObservation(t, parityValues{})
	tests := []struct {
		name    string
		message audio.Message
	}{
		{name: "invalid deadline", message: audio.Message{ID: "x", TextKey: messagepolicy.IntentSpotterCarLeft, Category: audio.CategorySpotter, CreatedAt: 1_000, ExpiresAt: 1_000}},
		{name: "object payload", message: audio.Message{ID: "x", TextKey: messagepolicy.IntentSpotterCarLeft, Category: audio.CategorySpotter, CreatedAt: 1_000, ExpiresAt: 2_000, ValidationData: map[string]any{"unsafe": []string{"x"}}}},
		{name: "unknown validity", message: audio.Message{ID: "x", TextKey: messagepolicy.IntentSpotterCarLeft, Category: audio.CategorySpotter, CreatedAt: 1_000, ExpiresAt: 2_000, ValidityRule: "raw.expression"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			_, err := CandidateFromMessage(tt.message, snapshot, messagepolicy.SemanticEvidence{SpotterKnown: true, SpotterLeft: true})
			if !errors.Is(err, ErrInvalidPolicyCandidate) {
				t.Fatalf("CandidateFromMessage() error = %v", err)
			}
		})
	}
}

func TestPenaltyCandidateUsesNeutralIntent(t *testing.T) {
	t.Parallel()

	snapshot := parityObservation(t, parityValues{})
	candidate, err := CandidateFromMessage(audio.Message{
		ID: "penalty", TextKey: "penalties.new_drivethrough", Category: audio.CategoryPenalties,
		CreatedAt: 1_000, ExpiresAt: 2_000,
	}, snapshot, messagepolicy.SemanticEvidence{PenaltyKnown: true, PenaltyCount: 1})
	if err != nil {
		t.Fatalf("CandidateFromMessage() error = %v", err)
	}
	if candidate.Intent != messagepolicy.IntentPenaltyCountIncreased {
		t.Fatalf("intent = %q", candidate.Intent)
	}
}
