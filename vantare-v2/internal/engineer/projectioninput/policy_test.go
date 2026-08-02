package projectioninput

import (
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

func TestPolicyEvidenceAndCandidateShareCanonicalObservation(t *testing.T) {
	t.Parallel()

	snapshot := parityObservation(t, parityValues{})
	adapter := NewAdapter()
	evidence := PolicyEvidence(snapshot, adapter, engineer.SourceLive, 2_000)
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
