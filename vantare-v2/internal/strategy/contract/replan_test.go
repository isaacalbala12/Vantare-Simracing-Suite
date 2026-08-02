package contract

import (
	"encoding/json"
	"testing"
	"time"
)

func validProposal(t *testing.T) ReplanProposal {
	t.Helper()
	proposal, err := NewReplanProposal(ReplanProposalInput{
		ProposalID: "proposal-strict",
		Base:       RevisionRef{PlanID: "plan", VariantID: "variant", RevisionID: "rev-1", ContentHash: validTestHash('a')},
		Candidate:  RevisionRef{PlanID: "plan", VariantID: "variant", RevisionID: "rev-2", ContentHash: validTestHash('b')},
		ReasonCode: "fuel_changed",
		Provenance: Provenance{Kind: ProvenanceDerived, SourceID: "strategy-engine"},
		Confidence: Confidence{Level: ConfidenceHigh, Basis: "five valid laps"},
		CreatedAt:  time.Date(2026, 8, 1, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatal(err)
	}
	return proposal
}

func TestDecodeReplanProposalIsStrict(t *testing.T) {
	valid, err := json.Marshal(validProposal(t))
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]interface{}
	if err := json.Unmarshal(valid, &document); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name   string
		mutate func(map[string]interface{})
	}{
		{name: "unknown field", mutate: func(value map[string]interface{}) { value["unexpected"] = true }},
		{name: "candidate from another plan", mutate: func(value map[string]interface{}) {
			value["candidate"].(map[string]interface{})["planId"] = "other-plan"
		}},
		{name: "uppercase candidate hash", mutate: func(value map[string]interface{}) {
			value["candidate"].(map[string]interface{})["contentHash"] = validTestHash('A')
		}},
		{name: "accepted without decision", mutate: func(value map[string]interface{}) { value["status"] = "accepted" }},
		{name: "proposed with decision", mutate: func(value map[string]interface{}) {
			value["decidedAt"] = "2026-08-01T18:00:01Z"
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			clone := cloneJSONMap(t, document)
			test.mutate(clone)
			encoded, _ := json.Marshal(clone)
			if _, err := DecodeReplanProposal(encoded); err == nil {
				t.Fatal("expected strict decode rejection")
			}
		})
	}
}

func TestAcceptAndActivateValidateForgedInputs(t *testing.T) {
	proposal := validProposal(t)
	proposal.Candidate.PlanID = "other-plan"
	if _, err := AcceptReplanProposal(proposal, time.Date(2026, 8, 1, 18, 0, 1, 0, time.UTC)); !HasErrorCode(err, ErrorRevisionConflict) {
		t.Fatalf("Accept error = %v, want %s", err, ErrorRevisionConflict)
	}

	proposal = validProposal(t)
	accepted, err := AcceptReplanProposal(proposal, time.Date(2026, 8, 1, 18, 0, 1, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	active := ActivePlan{ContractVersion: "strategy.v99", Revision: proposal.Base}
	if _, err := ActivateAcceptedProposal(active, accepted, "activation-2", time.Date(2026, 8, 1, 18, 0, 2, 0, time.UTC)); !HasErrorCode(err, ErrorUnsupportedVersion) {
		t.Fatalf("Activate error = %v, want %s", err, ErrorUnsupportedVersion)
	}
}

func TestAcceptReplanProposalReturnsIndependentSnapshot(t *testing.T) {
	proposal := validProposal(t)
	expiresAt := time.Date(2026, 8, 1, 18, 5, 0, 0, time.UTC)
	observedAt := time.Date(2026, 8, 1, 17, 59, 0, 0, time.UTC)
	wantExpiresAt := expiresAt
	wantObservedAt := observedAt
	proposal.ExpiresAt = &expiresAt
	proposal.Provenance.ObservedAt = &observedAt
	decidedAt := time.Date(2026, 8, 1, 18, 1, 0, 0, time.UTC)
	accepted, err := AcceptReplanProposal(proposal, decidedAt)
	if err != nil {
		t.Fatal(err)
	}
	*proposal.ExpiresAt = time.Date(2026, 8, 1, 18, 0, 30, 0, time.UTC)
	*proposal.Provenance.ObservedAt = time.Date(2026, 8, 2, 0, 0, 0, 0, time.UTC)
	if !accepted.ExpiresAt.Equal(wantExpiresAt) || !accepted.Provenance.ObservedAt.Equal(wantObservedAt) {
		t.Fatal("accepted proposal retained mutable aliases")
	}
}

func TestActivateAcceptedProposalIsIdempotentForTheAlreadyActiveCandidate(t *testing.T) {
	proposal := validProposal(t)
	accepted, err := AcceptReplanProposal(proposal, time.Date(2026, 8, 1, 18, 0, 1, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	base, err := NewActivePlan("activation-base", proposal.Base, time.Date(2026, 8, 1, 17, 59, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	first, err := ActivateAcceptedProposal(base, accepted, "activation-candidate", time.Date(2026, 8, 1, 18, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}

	repeated, err := ActivateAcceptedProposal(first, accepted, "ignored-new-activation", time.Date(2026, 8, 1, 18, 0, 3, 0, time.UTC))
	if err != nil {
		t.Fatalf("repeat activation: %v", err)
	}
	if repeated.ActivationID != first.ActivationID || !repeated.ActivatedAt.Equal(first.ActivatedAt) || repeated.Revision != first.Revision {
		t.Fatalf("repeat changed active snapshot: got %#v, want %#v", repeated, first)
	}
	if repeated.PreviousRevision == first.PreviousRevision || repeated.PreviousRevision == nil || *repeated.PreviousRevision != proposal.Base {
		t.Fatal("repeat must return an equal, independent active snapshot")
	}
}

func TestActivateAcceptedProposalRejectsCandidateWithMismatchedActivationHistory(t *testing.T) {
	proposal := validProposal(t)
	accepted, err := AcceptReplanProposal(proposal, time.Date(2026, 8, 1, 18, 0, 1, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	wrongPlan := RevisionRef{PlanID: "other-plan", VariantID: proposal.Base.VariantID, RevisionID: "rev-0", ContentHash: validTestHash('c')}
	wrongVariant := RevisionRef{PlanID: proposal.Base.PlanID, VariantID: "other-variant", RevisionID: "rev-0", ContentHash: validTestHash('c')}
	wrongBase := RevisionRef{PlanID: proposal.Base.PlanID, VariantID: proposal.Base.VariantID, RevisionID: "rev-0", ContentHash: validTestHash('c')}

	tests := []struct {
		name     string
		current  RevisionRef
		previous *RevisionRef
	}{
		{name: "missing previous", current: proposal.Candidate},
		{name: "wrong previous revision", current: proposal.Candidate, previous: &wrongBase},
		{name: "wrong plan", current: wrongPlan, previous: &proposal.Base},
		{name: "wrong variant", current: wrongVariant, previous: &proposal.Base},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			current, err := NewActivePlan("activation-current", test.current, time.Date(2026, 8, 1, 18, 0, 2, 0, time.UTC))
			if err != nil {
				t.Fatal(err)
			}
			current.PreviousRevision = test.previous
			_, err = ActivateAcceptedProposal(current, accepted, "activation-new", time.Date(2026, 8, 1, 18, 0, 3, 0, time.UTC))
			if !HasErrorCode(err, ErrorRevisionConflict) {
				t.Fatalf("error = %v, want %s", err, ErrorRevisionConflict)
			}
		})
	}
}

func TestDecodeReplanProposalRejectsDuplicateKeys(t *testing.T) {
	document := `{"contractVersion":"strategy.v1","proposalId":"proposal","proposalId":"duplicate"}`
	if _, err := DecodeReplanProposal([]byte(document)); err == nil {
		t.Fatal("expected duplicate key rejection")
	}
}

func cloneJSONMap(t *testing.T, source map[string]interface{}) map[string]interface{} {
	t.Helper()
	data, err := json.Marshal(source)
	if err != nil {
		t.Fatal(err)
	}
	var clone map[string]interface{}
	if err := json.Unmarshal(data, &clone); err != nil {
		t.Fatal(err)
	}
	return clone
}
