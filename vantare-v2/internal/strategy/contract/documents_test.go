package contract

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"
)

type testPlanPayload struct {
	Fuel       FuelLiters             `json:"fuelLiters"`
	Energy     VirtualEnergyPercent   `json:"virtualEnergyPercent"`
	StintLaps  LapCount               `json:"stintLaps"`
	Labels     []string               `json:"labels"`
	Parameters map[string]interface{} `json:"parameters"`
}

func validDraft(t *testing.T) PlanDraft[testPlanPayload] {
	t.Helper()
	fuel, _ := NewFuelLiters(98.5)
	energy, _ := NewVirtualEnergyPercent(72)
	laps, _ := NewLapCount(17)
	return PlanDraft[testPlanPayload]{
		ContractVersion: CurrentVersion,
		DraftID:         DraftID("draft-001"),
		PlanID:          PlanID("plan-le-mans"),
		VariantID:       VariantID("conservative"),
		Name:            "Conservative",
		Mode:            PlanModeAssisted,
		Capabilities:    []Capability{CapabilityFuel, CapabilityTelemetryImport, CapabilityFuel},
		Provenance:      Provenance{Kind: ProvenanceManual, SourceID: "user-input"},
		Confidence:      Confidence{Level: ConfidenceMedium, Basis: "fuel sample available"},
		UpdatedAt:       time.Date(2026, 8, 1, 18, 0, 0, 0, time.UTC),
		Payload: testPlanPayload{
			Fuel:       fuel,
			Energy:     energy,
			StintLaps:  laps,
			Labels:     []string{"dry", "baseline"},
			Parameters: map[string]interface{}{"track": "le-mans", "risk": float64(2)},
		},
	}
}

func TestPlanRevisionCapturesAnImmutableReproducibleSnapshot(t *testing.T) {
	draft := validDraft(t)
	observedAt := time.Date(2026, 8, 1, 17, 59, 0, 0, time.UTC)
	draft.Provenance.ObservedAt = &observedAt
	metadata := RevisionMetadata{
		RevisionID: RevisionID("revision-001"),
		CreatedAt:  time.Date(2026, 8, 1, 18, 1, 0, 0, time.UTC),
	}

	revision, err := NewPlanRevision(draft, metadata)
	if err != nil {
		t.Fatalf("NewPlanRevision: %v", err)
	}
	originalHash := revision.ContentHash()
	if len(originalHash) != 64 {
		t.Fatalf("hash length = %d, want 64", len(originalHash))
	}

	// Mutating the source draft after capture must not mutate the revision.
	draft.Payload.Labels[0] = "wet"
	draft.Payload.Parameters["risk"] = float64(99)
	*draft.Provenance.ObservedAt = time.Date(2026, 8, 2, 0, 0, 0, 0, time.UTC)
	got, err := revision.Payload()
	if err != nil {
		t.Fatalf("Payload: %v", err)
	}
	if got.Labels[0] != "dry" || got.Parameters["risk"] != float64(2) {
		t.Fatalf("revision payload changed with draft: %#v", got)
	}

	// Mutating a decoded copy must not mutate the stored revision either.
	got.Labels[0] = "wet"
	again, err := revision.Payload()
	if err != nil {
		t.Fatalf("Payload again: %v", err)
	}
	if again.Labels[0] != "dry" || revision.ContentHash() != originalHash {
		t.Fatal("revision did not remain immutable")
	}
	encoded, err := json.Marshal(revision)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) == "" || revision.envelope.Provenance.ObservedAt.Equal(*draft.Provenance.ObservedAt) {
		t.Fatal("revision provenance changed through the draft pointer")
	}

	sameDraft := validDraft(t)
	originalObservedAt := time.Date(2026, 8, 1, 17, 59, 0, 0, time.UTC)
	sameDraft.Provenance.ObservedAt = &originalObservedAt
	same, err := NewPlanRevision(sameDraft, metadata)
	if err != nil {
		t.Fatalf("NewPlanRevision same content: %v", err)
	}
	if same.ContentHash() != originalHash {
		t.Fatalf("hash not deterministic: %s != %s", same.ContentHash(), originalHash)
	}
}

func TestRevisionRejectsUnitValuesThatBypassConstructors(t *testing.T) {
	draft := validDraft(t)
	draft.Payload.Fuel = FuelLiters(-1)
	_, err := NewPlanRevision(draft, RevisionMetadata{
		RevisionID: "revision-invalid-unit",
		CreatedAt:  time.Date(2026, 8, 1, 18, 1, 0, 0, time.UTC),
	})
	if !HasErrorCode(err, ErrorInvalidUnit) {
		t.Fatalf("error = %v, want %s", err, ErrorInvalidUnit)
	}
}

func TestPlanRevisionJSONRoundTripVerifiesHash(t *testing.T) {
	revision, err := NewPlanRevision(validDraft(t), RevisionMetadata{
		RevisionID: RevisionID("revision-001"),
		CreatedAt:  time.Date(2026, 8, 1, 18, 1, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("NewPlanRevision: %v", err)
	}

	encoded, err := json.Marshal(revision)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	decoded, err := DecodePlanRevision[testPlanPayload](encoded)
	if err != nil {
		t.Fatalf("DecodePlanRevision: %v", err)
	}
	if decoded.ContentHash() != revision.ContentHash() || decoded.Ref() != revision.Ref() {
		t.Fatalf("round trip changed identity: %#v != %#v", decoded.Ref(), revision.Ref())
	}

	var document map[string]interface{}
	if err := json.Unmarshal(encoded, &document); err != nil {
		t.Fatal(err)
	}
	payload := document["payload"].(map[string]interface{})
	payload["stintLaps"] = float64(99)
	tampered, _ := json.Marshal(document)
	_, err = DecodePlanRevision[testPlanPayload](tampered)
	if !HasErrorCode(err, ErrorHashMismatch) {
		t.Fatalf("tampered error = %v, want %s", err, ErrorHashMismatch)
	}
}

func TestPlanRevisionMetadataReturnsAnIndependentReadableCopy(t *testing.T) {
	draft := validDraft(t)
	observedAt := time.Date(2026, 8, 1, 17, 59, 0, 0, time.UTC)
	draft.Provenance.ObservedAt = &observedAt
	revision, err := NewPlanRevision(draft, RevisionMetadata{
		RevisionID: "revision-readable",
		CreatedAt:  time.Date(2026, 8, 1, 18, 1, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatal(err)
	}

	metadata := revision.Metadata()
	if metadata.PlanID != draft.PlanID || metadata.Name != draft.Name || metadata.Mode != draft.Mode {
		t.Fatalf("unexpected metadata: %#v", metadata)
	}
	metadata.Capabilities[0] = CapabilityReplan
	*metadata.Provenance.ObservedAt = time.Date(2026, 8, 2, 0, 0, 0, 0, time.UTC)
	again := revision.Metadata()
	if again.Capabilities[0] == CapabilityReplan || !again.Provenance.ObservedAt.Equal(observedAt) {
		t.Fatal("metadata accessor leaked mutable revision state")
	}
}

func TestContractLifecycleRequiresExplicitAcceptedReplan(t *testing.T) {
	base, err := NewPlanRevision(validDraft(t), RevisionMetadata{
		RevisionID: RevisionID("revision-001"),
		CreatedAt:  time.Date(2026, 8, 1, 18, 1, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatal(err)
	}
	active, err := NewActivePlan(ActivationID("activation-001"), base.Ref(), time.Date(2026, 8, 1, 18, 2, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("NewActivePlan: %v", err)
	}

	nextDraft := validDraft(t)
	nextDraft.BaseRevision = ptrRevisionRef(base.Ref())
	nextDraft.Payload.Labels = []string{"dry", "replanned"}
	next, err := NewPlanRevision(nextDraft, RevisionMetadata{
		RevisionID: RevisionID("revision-002"),
		CreatedAt:  time.Date(2026, 8, 1, 18, 3, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatal(err)
	}
	proposal, err := NewReplanProposal(ReplanProposalInput{
		ProposalID: ProposalID("proposal-001"),
		Base:       base.Ref(),
		Candidate:  next.Ref(),
		ReasonCode: "fuel_consumption_changed",
		Provenance: Provenance{Kind: ProvenanceDerived, SourceID: "strategy-engine"},
		Confidence: Confidence{Level: ConfidenceHigh, Basis: "five valid laps"},
		CreatedAt:  time.Date(2026, 8, 1, 18, 4, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("NewReplanProposal: %v", err)
	}

	_, err = ActivateAcceptedProposal(active, proposal, ActivationID("activation-002"), time.Date(2026, 8, 1, 18, 5, 0, 0, time.UTC))
	if !HasErrorCode(err, ErrorProposalNotAccepted) {
		t.Fatalf("activation error = %v, want %s", err, ErrorProposalNotAccepted)
	}

	accepted, err := AcceptReplanProposal(proposal, time.Date(2026, 8, 1, 18, 4, 30, 0, time.UTC))
	if err != nil {
		t.Fatalf("AcceptReplanProposal: %v", err)
	}
	updated, err := ActivateAcceptedProposal(active, accepted, ActivationID("activation-002"), time.Date(2026, 8, 1, 18, 5, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("ActivateAcceptedProposal: %v", err)
	}
	if updated.Revision != next.Ref() || updated.PreviousRevision == nil || *updated.PreviousRevision != base.Ref() {
		t.Fatalf("unexpected active plan: %#v", updated)
	}
}

func TestProposalCannotApplyToAStaleActiveRevision(t *testing.T) {
	baseRef := RevisionRef{PlanID: "plan", VariantID: "variant", RevisionID: "rev-1", ContentHash: validTestHash('a')}
	candidateRef := RevisionRef{PlanID: "plan", VariantID: "variant", RevisionID: "rev-2", ContentHash: validTestHash('b')}
	otherRef := RevisionRef{PlanID: "plan", VariantID: "variant", RevisionID: "rev-other", ContentHash: validTestHash('c')}
	active, _ := NewActivePlan("activation-1", otherRef, time.Date(2026, 8, 1, 18, 0, 0, 0, time.UTC))
	proposal, err := NewReplanProposal(ReplanProposalInput{
		ProposalID: "proposal-1",
		Base:       baseRef,
		Candidate:  candidateRef,
		ReasonCode: "pace_changed",
		Provenance: Provenance{Kind: ProvenanceDerived, SourceID: "strategy-engine"},
		Confidence: Confidence{Level: ConfidenceMedium, Basis: "two valid laps"},
		CreatedAt:  time.Date(2026, 8, 1, 18, 1, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatal(err)
	}
	accepted, err := AcceptReplanProposal(proposal, time.Date(2026, 8, 1, 18, 2, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	_, err = ActivateAcceptedProposal(active, accepted, "activation-2", time.Date(2026, 8, 1, 18, 3, 0, 0, time.UTC))
	if !HasErrorCode(err, ErrorRevisionConflict) {
		t.Fatalf("error = %v, want %s", err, ErrorRevisionConflict)
	}
}

func TestExecutionStateRequiresMonotonicEpochAndSequence(t *testing.T) {
	ref := RevisionRef{PlanID: "plan", VariantID: "variant", RevisionID: "rev-1", ContentHash: validTestHash('a')}
	active, err := NewActivePlan("activation-1", ref, time.Date(2026, 8, 1, 18, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	state, err := NewStrategyExecutionState(ExecutionStateInput{
		ExecutionID:  "execution-1",
		ActivePlan:   active,
		Epoch:        1,
		Sequence:     1,
		Status:       ExecutionMonitoring,
		Capabilities: []Capability{CapabilityLiveUpdates, CapabilityFuel},
		Provenance:   Provenance{Kind: ProvenanceObserved, SourceID: "telemetry-core"},
		Confidence:   Confidence{Level: ConfidenceHigh, Basis: "fresh canonical signals"},
		UpdatedAt:    time.Date(2026, 8, 1, 18, 0, 1, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("NewStrategyExecutionState: %v", err)
	}
	next, err := state.Advance(2, ExecutionDeviated, time.Date(2026, 8, 1, 18, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatalf("Advance: %v", err)
	}
	if next.Sequence != 2 || next.Status != ExecutionDeviated {
		t.Fatalf("unexpected next state: %#v", next)
	}
	_, err = state.Advance(1, ExecutionMonitoring, time.Date(2026, 8, 1, 18, 0, 3, 0, time.UTC))
	if !HasErrorCode(err, ErrorNonMonotonicSequence) {
		t.Fatalf("error = %v, want %s", err, ErrorNonMonotonicSequence)
	}
}

func TestExecutionTerminalStatesCannotAdvance(t *testing.T) {
	ref := RevisionRef{PlanID: "plan", VariantID: "variant", RevisionID: "rev-1", ContentHash: validTestHash('a')}
	active, _ := NewActivePlan("activation-1", ref, time.Date(2026, 8, 1, 18, 0, 0, 0, time.UTC))
	state, err := NewStrategyExecutionState(ExecutionStateInput{
		ExecutionID:  "execution-1",
		ActivePlan:   active,
		Epoch:        1,
		Sequence:     1,
		Status:       ExecutionCompleted,
		Capabilities: []Capability{CapabilityFuel},
		Provenance:   Provenance{Kind: ProvenanceObserved, SourceID: "telemetry-core"},
		Confidence:   Confidence{Level: ConfidenceHigh, Basis: "race finished"},
		UpdatedAt:    time.Date(2026, 8, 1, 18, 0, 1, 0, time.UTC),
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = state.Advance(2, ExecutionMonitoring, time.Date(2026, 8, 1, 18, 0, 2, 0, time.UTC))
	if !HasErrorCode(err, ErrorInvalidState) {
		t.Fatalf("error = %v, want %s", err, ErrorInvalidState)
	}
}

func TestExecutionStateOwnsDeepSnapshotAndAdvanceDoesNotAlias(t *testing.T) {
	previous := RevisionRef{PlanID: "plan", VariantID: "variant", RevisionID: "rev-0", ContentHash: validTestHash('a')}
	current := RevisionRef{PlanID: "plan", VariantID: "variant", RevisionID: "rev-1", ContentHash: validTestHash('b')}
	active, _ := NewActivePlan("activation-1", current, time.Date(2026, 8, 1, 18, 0, 0, 0, time.UTC))
	active.PreviousRevision = &previous
	observedAt := time.Date(2026, 8, 1, 17, 59, 59, 0, time.UTC)
	capabilities := []Capability{CapabilityFuel, CapabilityLiveUpdates}
	state, err := NewStrategyExecutionState(ExecutionStateInput{
		ExecutionID:  "execution-1",
		ActivePlan:   active,
		Epoch:        1,
		Sequence:     1,
		Status:       ExecutionMonitoring,
		Capabilities: capabilities,
		Provenance:   Provenance{Kind: ProvenanceObserved, SourceID: "telemetry-core", ObservedAt: &observedAt},
		Confidence:   Confidence{Level: ConfidenceHigh, Basis: "fresh canonical signals"},
		UpdatedAt:    time.Date(2026, 8, 1, 18, 0, 1, 0, time.UTC),
	})
	if err != nil {
		t.Fatal(err)
	}
	capabilities[0] = CapabilityReplan
	active.PreviousRevision.RevisionID = "mutated"
	observedAt = time.Date(2026, 8, 2, 0, 0, 0, 0, time.UTC)
	if state.Capabilities[0] == CapabilityReplan || state.ActivePlan.PreviousRevision.RevisionID == "mutated" || state.Provenance.ObservedAt.Equal(observedAt) {
		t.Fatal("constructor retained mutable aliases")
	}

	next, err := state.Advance(2, ExecutionDeviated, time.Date(2026, 8, 1, 18, 0, 2, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	next.Capabilities[0] = CapabilityReplan
	next.ActivePlan.PreviousRevision.RevisionID = "mutated-next"
	*next.Provenance.ObservedAt = time.Date(2026, 8, 3, 0, 0, 0, 0, time.UTC)
	if state.Capabilities[0] == CapabilityReplan || state.ActivePlan.PreviousRevision.RevisionID == "mutated-next" || state.Provenance.ObservedAt.Equal(*next.Provenance.ObservedAt) {
		t.Fatal("Advance returned aliases to the previous snapshot")
	}
}

func TestExecutionAdvanceValidatesReceiver(t *testing.T) {
	state := StrategyExecutionState{ContractVersion: "strategy.v99", Status: ExecutionMonitoring, Sequence: 1}
	_, err := state.Advance(2, ExecutionMonitoring, time.Date(2026, 8, 1, 18, 0, 2, 0, time.UTC))
	if !HasErrorCode(err, ErrorUnsupportedVersion) {
		t.Fatalf("error = %v, want %s", err, ErrorUnsupportedVersion)
	}
}

func TestDecodeRejectsUnsupportedContractVersions(t *testing.T) {
	_, err := DecodePlanRevision[testPlanPayload]([]byte(`{"contractVersion":"strategy.v99"}`))
	if !HasErrorCode(err, ErrorUnsupportedVersion) {
		t.Fatalf("error = %v, want %s", err, ErrorUnsupportedVersion)
	}
}

func TestDecodePlanRevisionRejectsDuplicateKeysBeforeConversion(t *testing.T) {
	document, err := os.ReadFile("testdata/plan_revision_v1.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	duplicate := bytes.Replace(document, []byte(`"revisionId"`), []byte(`"revisionId":"duplicate","revisionId"`), 1)
	if _, err := DecodePlanRevision[testPlanPayload](duplicate); err == nil {
		t.Fatal("expected duplicate key rejection")
	}
}

func TestCurrentVersionMigrationIsAnExplicitNoOp(t *testing.T) {
	document := []byte(`{"contractVersion":"strategy.v1","value":1}`)
	got, migrations, err := MigrateContractJSON(document)
	if err != nil {
		t.Fatalf("MigrateContractJSON: %v", err)
	}
	if string(got) != string(document) || len(migrations) != 0 {
		t.Fatalf("current version migration = %s, %#v", got, migrations)
	}
}

func TestContractValidationReturnsStableTypedErrors(t *testing.T) {
	draft := validDraft(t)
	draft.PlanID = ""
	err := draft.Validate()
	var contractErr *ContractError
	if !errors.As(err, &contractErr) {
		t.Fatalf("error = %v, want ContractError", err)
	}
	if contractErr.Code != ErrorInvalidIdentifier || contractErr.Field != "planId" {
		t.Fatalf("unexpected typed error: %#v", contractErr)
	}
}

func ptrRevisionRef(ref RevisionRef) *RevisionRef { return &ref }

func validTestHash(char byte) string {
	value := make([]byte, 64)
	for index := range value {
		value[index] = char
	}
	return string(value)
}
