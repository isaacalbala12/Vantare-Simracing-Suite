package repository

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
)

func TestRepositoryMigratesV1AndPersistsDocumentV2WithoutLosingLifecycle(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	v1, err := os.ReadFile(filepath.Join("testdata", "repository-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, stateFileName), v1, 0o600); err != nil {
		t.Fatal(err)
	}
	repo, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	before, err := repo.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if before.Version != 7 || len(before.Drafts) != 1 || before.StrategyDocument != nil {
		t.Fatalf("migrated v1 snapshot = %#v", before)
	}

	document := repositoryDocumentFixture("Evento migrado")
	committed, err := repo.Commit(ctx, before.Version, ChangeSet[testPayload]{StrategyDocument: &document})
	if err != nil {
		t.Fatal(err)
	}
	if len(committed.Drafts) != 1 || committed.Drafts[0].DraftID != "fixture-draft" {
		t.Fatalf("v1 lifecycle data was lost: %+v", committed.Drafts)
	}

	reopened, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	after, err := reopened.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if after.Version != 8 || len(after.Drafts) != 1 || after.StrategyDocument == nil {
		t.Fatalf("reopened snapshot = %#v", after)
	}
	if !reflect.DeepEqual(*after.StrategyDocument, document) {
		t.Fatalf("document round-trip changed value:\ngot  %#v\nwant %#v", *after.StrategyDocument, document)
	}
	if got := after.StrategyDocument.Events[0].DurationMin.Evidence.Provenance.Kind; got != strategydocument.ProvenanceLegacySyntheticDefault {
		t.Fatalf("legacy synthetic marker = %q", got)
	}

	primary, err := os.ReadFile(filepath.Join(root, stateFileName))
	if err != nil {
		t.Fatal(err)
	}
	var envelope diskEnvelope
	if err := json.Unmarshal(primary, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.RepositoryVersion != RepositoryVersion || len(envelope.StrategyDocument) == 0 {
		t.Fatalf("persisted envelope did not advance to v2: %+v", envelope)
	}
}

func TestRepositoryDocumentReopenAndBackupRecovery(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	repo, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	firstDocument := repositoryDocumentFixture("Primera generación")
	first, err := repo.Commit(ctx, 0, ChangeSet[testPayload]{StrategyDocument: &firstDocument})
	if err != nil {
		t.Fatal(err)
	}
	secondDocument := repositoryDocumentFixture("Segunda generación")
	secondDocument.GeneratedAt = secondDocument.GeneratedAt.Add(time.Minute)
	second, err := repo.Commit(ctx, first.Version, ChangeSet[testPayload]{StrategyDocument: &secondDocument})
	if err != nil {
		t.Fatal(err)
	}

	reopened, err := Open[testPayload](root, Options{})
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := reopened.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Version != second.Version || !reflect.DeepEqual(*snapshot.StrategyDocument, secondDocument) {
		t.Fatalf("reopen did not preserve latest document: %#v", snapshot)
	}

	if err := os.WriteFile(filepath.Join(root, stateFileName), []byte(`{"repositoryVersion":`), 0o600); err != nil {
		t.Fatal(err)
	}
	recovered, err := reopened.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !recovered.RecoveredFromBackup || recovered.Version != first.Version {
		t.Fatalf("recovery metadata = %#v", recovered)
	}
	if recovered.StrategyDocument == nil || !reflect.DeepEqual(*recovered.StrategyDocument, firstDocument) {
		t.Fatalf("backup did not preserve document: %#v", recovered.StrategyDocument)
	}
}

func repositoryDocumentFixture(name string) strategydocument.StrategyDocumentV2 {
	now := time.Date(2026, 8, 21, 19, 0, 0, 0, time.UTC)
	legacyEvidence := repositoryEvidence(strategydocument.ProvenanceLegacySyntheticDefault)
	manualEvidence := repositoryEvidence(strategydocument.ProvenanceManual)
	compoundRaw := 2
	compound := strategydocument.TyreCompound("2")
	activeEventID := strategydocument.EventID("event-1")
	activeVariantID := strategydocument.VariantID("variant-1")
	return strategydocument.StrategyDocumentV2{
		ContractVersion: strategydocument.ContractVersionV2,
		SchemaVersion:   strategydocument.SchemaVersionV2,
		GeneratedAt:     now,
		ActiveEventID:   &activeEventID,
		Events: []strategydocument.Event{{
			ID:             activeEventID,
			Name:           strategydocument.Sourced[string]{Value: name, Evidence: legacyEvidence},
			Source:         strategydocument.Sourced[strategydocument.EventSource]{Value: strategydocument.EventSourceCustom, Evidence: manualEvidence},
			Track:          strategydocument.Sourced[string]{Value: "Spa", Evidence: manualEvidence},
			Class:          strategydocument.Sourced[string]{Value: "LMGT3", Evidence: manualEvidence},
			DurationMin:    strategydocument.Sourced[int]{Value: 60, Evidence: legacyEvidence},
			StartAt:        strategydocument.Sourced[*time.Time]{Value: nil, Evidence: repositoryUnknownEvidence()},
			Drivers:        []strategydocument.Driver{{ID: "driver-1", Order: 0}, {ID: "driver-2", Order: 1}},
			TankLiters:     strategydocument.Sourced[float64]{Value: 90, Evidence: legacyEvidence},
			PitLossSeconds: strategydocument.Sourced[float64]{Value: 60, Evidence: legacyEvidence},
			Strategies: []strategydocument.Variant{{
				ID:        activeVariantID,
				Name:      strategydocument.Sourced[string]{Value: "Base", Evidence: manualEvidence},
				Note:      strategydocument.Sourced[string]{Value: "", Evidence: manualEvidence},
				Mode:      strategydocument.Sourced[strategydocument.VariantMode]{Value: strategydocument.VariantModeDry, Evidence: manualEvidence},
				Order:     []strategydocument.DriverID{"driver-1", "driver-2"},
				State:     strategydocument.Sourced[strategydocument.VariantState]{Value: strategydocument.VariantStateDraft, Evidence: manualEvidence},
				Overrides: map[string]json.RawMessage{"fuel": json.RawMessage(`90`)},
				Tyres:     map[string]json.RawMessage{"compound": json.RawMessage(`2`)},
			}},
			Availability: map[strategydocument.DriverID][]strategydocument.AvailabilityWindow{
				"driver-1": {{State: strategydocument.AvailabilityOK, From: 600, To: 720}},
			},
			ActiveStrategyID: &activeVariantID,
			FillMode: strategydocument.Sourced[strategydocument.FillMode]{
				Value: strategydocument.FillModeManual, Evidence: manualEvidence,
			},
			TyreInventory: strategydocument.TyreInventory{
				Sets: []strategydocument.TyreSet{{
					CompoundRaw: &compoundRaw,
					Compound:    &compound,
					Count:       3,
					Presence:    strategydocument.PresenceValid,
					Provenance:  manualEvidence.Provenance,
				}},
				ByCompound: map[strategydocument.TyreCompound]int{"2": 3},
				Note:       "mapping legacy crudo",
			},
			RawLegacy: json.RawMessage(`{"id":"event-1","durationMin":60}`),
		}},
	}
}

func repositoryEvidence(kind strategydocument.ProvenanceKind) strategydocument.Evidence {
	return strategydocument.Evidence{
		Provenance: strategydocument.Provenance{Kind: kind, SourceID: "repository-test"},
		Confidence: strategydocument.Confidence{Level: strategydocument.ConfidenceHigh, Basis: "fixture"},
	}
}

func repositoryUnknownEvidence() strategydocument.Evidence {
	return strategydocument.Evidence{
		Provenance: strategydocument.Provenance{Kind: strategydocument.ProvenanceUnknown},
		Confidence: strategydocument.Confidence{Level: strategydocument.ConfidenceUnknown},
	}
}
