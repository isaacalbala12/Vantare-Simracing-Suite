package application

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

func TestRecordedConfigurationDraftSurvivesReopenWithoutCalculation(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	repo, err := repository.Open[json.RawMessage](root, repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[json.RawMessage](repo)
	draft := contract.PlanDraft[json.RawMessage]{
		ContractVersion: contract.CurrentVersion, DraftID: "recorded-draft:event", PlanID: "recorded-plan:event", VariantID: "recorded-main",
		Name: "Spa · Car", Mode: contract.PlanModeManual, Capabilities: []contract.Capability{contract.CapabilityManualInputs, contract.CapabilityTelemetryImport},
		Provenance: contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "strategy-recorded-wizard"},
		Confidence: contract.Confidence{Level: contract.ConfidenceUnknown}, UpdatedAt: canonicalTime(1),
		Payload: json.RawMessage(`{"contractVersion":"strategy.recorded.draft.v1","eventId":"event","draft":{"step":"sessions","mode":"manual","name":"","race":{"format":"timed"},"drivers":[],"sessions":[],"invalidatedSessionCount":0,"combination":{"combinationId":"lmu:spa","simId":"lmu","trackName":"Spa","trackLayout":"","carName":"Car","carClass":"LMP2"}}}`),
	}
	created, err := service.Create(ctx, CreateCommand[json.RawMessage]{CommandHeader: commandHeader("recorded-create", OperationCreate, 0), Draft: draft})
	if err != nil {
		t.Fatal(err)
	}
	if created.Draft == nil || created.Draft.BaseRevision != nil {
		t.Fatal("creation must remain a configuration draft")
	}
	draft.UpdatedAt = canonicalTime(2)
	draft.Name = "Configured race"
	saved, err := service.SaveRevision(ctx, SaveRevisionCommand[json.RawMessage]{CommandHeader: commandHeader("recorded-save", OperationSaveRevision, created.RepositoryVersion), Draft: draft, RevisionID: "recorded-configuration:one", CreatedAt: canonicalTime(2)})
	if err != nil {
		t.Fatal(err)
	}
	reopened, err := repository.Open[json.RawMessage](root, repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	opened, err := NewService[json.RawMessage](reopened).Open(ctx, OpenCommand{CommandHeader: commandHeader("recorded-open", OperationOpen, 0), DraftID: draft.DraftID})
	if err != nil {
		t.Fatal(err)
	}
	if opened.Draft == nil || opened.Draft.Name != draft.Name || !jsonEqual(t, opened.Draft.Payload, draft.Payload) || opened.Draft.BaseRevision == nil {
		t.Fatal("reopened configuration differs from the saved draft")
	}
	snapshot, err := reopened.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.ActivePlan != nil {
		t.Fatal("saving configuration activated a plan")
	}
	if saved.RepositoryVersion != opened.RepositoryVersion {
		t.Fatal("reopen changed the repository version")
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(opened.Draft.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	var configuration map[string]json.RawMessage
	if err := json.Unmarshal(payload["draft"], &configuration); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"tankLiters", "initialFuelLiters", "fuelReserveLiters", "pitLossSeconds", "calculatedPlan"} {
		if _, exists := configuration[field]; exists {
			t.Fatalf("missing field %s was manufactured", field)
		}
	}
}
