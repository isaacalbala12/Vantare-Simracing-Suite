package application

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
)

func TestLegacyMigrationPreservesEventRules(t *testing.T) {
	ctx := context.Background()
	service := documentService(t)
	now := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	event := validEvent("rules-event", []document.Driver{{ID: "d1", Order: 0}})
	minimum := 2
	rules := sourcedValue(solver.EventRules{MinPitStops: &minimum})
	event.Rules = &rules
	created, err := service.CreateEvent(ctx, CreateEventCommand{CommandHeader: documentHeader("create", OperationCreateEvent, 0), Event: event, UpdatedAt: now})
	if err != nil {
		t.Fatal(err)
	}
	command := LegacyMigrationCommand{CommandHeader: documentHeader("preview", OperationPreviewLegacyMigration, created.RepositoryVersion), Sources: fixtureSources(readLegacyGoldenFixture(t, "events-full.json")), MigratedAt: now.Add(time.Minute)}
	preview, err := service.PreviewLegacyMigration(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	command.Operation, command.CommandID = OperationMigrateLegacy, "migrate"
	command.ExpectedRepositoryVersion = preview.RepositoryVersion
	command.ConfirmedFingerprint = preview.LegacyMigration.Fingerprint
	committed, err := service.MigrateLegacy(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	rolledBack, err := service.RollbackLegacyMigration(ctx, RollbackLegacyMigrationCommand{CommandHeader: documentHeader("rollback", OperationRollbackLegacyMigration, committed.RepositoryVersion), JournalID: preview.LegacyMigration.JournalID, RolledBackAt: now.Add(2 * time.Minute)})
	if err != nil {
		t.Fatal(err)
	}
	for _, doc := range []*document.StrategyDocumentV2{&preview.LegacyMigration.Document, committed.StrategyDocument, rolledBack.StrategyDocument} {
		if doc.SchemaVersion != document.SchemaVersionV2Rules {
			t.Fatal("schema downgraded")
		}
		found, ok := eventByID(doc.Events, event.ID)
		if !ok || !reflect.DeepEqual(found.Rules, &rules) {
			t.Fatal("rules lost in migration")
		}
	}
	archived, ok := eventByID(rolledBack.StrategyDocument.MigrationArchives[0].Events, event.ID)
	if !ok || !reflect.DeepEqual(archived.Rules, &rules) {
		t.Fatal("rules lost in archive")
	}
}
