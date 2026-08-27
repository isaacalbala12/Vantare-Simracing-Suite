package application

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

func TestLegacyMigrationMatrixHas28ExplicitPolicies(t *testing.T) {
	path := filepath.Join("..", "..", "..", "docs", "strategy-planner", "evidence", "isa-694-spike", "matriz-migracion-orbit.csv")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := csv.NewReader(strings.NewReader(string(raw))).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 29 {
		t.Fatalf("matrix rows including header = %d, want 29", len(rows))
	}
	want := []string{"raíz", "events", "activeId", "event.id", "event.name", "event.source", "event.seriesId", "event.track", "event.cls", "event.durationMin", "event.startAt", "event.team", "event.drivers", "event.tankL", "event.pitLossSec", "event.strategies", "event.availability", "event.activeStrategyId", "event.teamMode", "event.fillMode", "event.lastOpenedAt", "writeStrategyEvents", "raíz", "wrapped.variants", "flat variant map", "availability", "variant existente", "variant local"}
	for index, field := range want {
		if rows[index+1][1] != field {
			t.Fatalf("matrix row %d = %q, want %q", index+1, rows[index+1][1], field)
		}
	}
}

const (
	eventsStorageKey = "vantare.v03orbit.strategy.events"
	legacyStorageKey = "vantare.v03orbit.strategy"
)

type legacyGoldenFixture struct {
	StorageKey string          `json:"storageKey"`
	RawValue   *string         `json:"rawValue"`
	Value      json.RawMessage `json:"value"`
}

func TestLegacyMigrationGoldenFixtures(t *testing.T) {
	tests := []struct {
		name              string
		wantEvents        int
		wantQuarantineMin int
		assert            func(*testing.T, LegacyMigrationPreview)
	}{
		{name: "events-corrupt-json.json", wantQuarantineMin: 1},
		{name: "events-full.json", wantEvents: 1},
		{name: "events-mixed-discard.json", wantEvents: 1, wantQuarantineMin: 2, assert: func(t *testing.T, preview LegacyMigrationPreview) {
			if preview.ActiveEventID != nil {
				t.Fatalf("dangling active event was activated: %q", *preview.ActiveEventID)
			}
			if len(preview.Warnings) == 0 {
				t.Fatal("dangling active event did not produce a warning")
			}
		}},
		{name: "events-sparse-defaults.json", wantEvents: 1, assert: func(t *testing.T, preview LegacyMigrationPreview) {
			event := preview.Document.Events[0]
			for field, kind := range map[string]strategydocument.ProvenanceKind{
				"name":           event.Name.Evidence.Provenance.Kind,
				"durationMin":    event.DurationMin.Evidence.Provenance.Kind,
				"tankLiters":     event.TankLiters.Evidence.Provenance.Kind,
				"pitLossSeconds": event.PitLossSeconds.Evidence.Provenance.Kind,
			} {
				if kind != strategydocument.ProvenanceLegacySyntheticDefault {
					t.Fatalf("%s provenance = %q", field, kind)
				}
			}
			if event.StartAt.Value != nil || event.StartAt.Evidence.Provenance.Kind != strategydocument.ProvenanceUnknown {
				t.Fatalf("startAt invented from runtime clock: %+v", event.StartAt)
			}
		}},
		{name: "legacy-corrupt.json", wantQuarantineMin: 1},
		{name: "legacy-flat.json", wantQuarantineMin: 1},
		{name: "legacy-wrapped.json", wantQuarantineMin: 1},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			fixture := readLegacyGoldenFixture(t, test.name)
			sources := fixtureSources(fixture)
			repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
			if err != nil {
				t.Fatal(err)
			}
			service := NewService[testPayload](repo)
			command := LegacyMigrationCommand{
				CommandHeader: documentHeader("preview", OperationPreviewLegacyMigration, 0),
				Sources:       sources,
				MigratedAt:    time.Date(2026, 8, 21, 18, 0, 0, 0, time.UTC),
			}
			previewResult, err := service.PreviewLegacyMigration(context.Background(), command)
			if err != nil {
				t.Fatal(err)
			}
			if previewResult.LegacyMigration == nil {
				t.Fatal("missing preview")
			}
			preview := *previewResult.LegacyMigration
			if got := len(preview.Document.Events); got != test.wantEvents {
				t.Fatalf("events = %d, want %d", got, test.wantEvents)
			}
			if got := len(preview.Quarantine); got < test.wantQuarantineMin {
				t.Fatalf("quarantine = %d, want >= %d", got, test.wantQuarantineMin)
			}
			if test.assert != nil {
				test.assert(t, preview)
			}
			if string(preview.Document.MigrationMeta.Sources[0].Raw) != string(sources[0].Raw) {
				t.Fatal("preview backup changed source bytes")
			}
			command.Operation = OperationMigrateLegacy
			command.CommandID = "commit"
			command.ExpectedRepositoryVersion = previewResult.RepositoryVersion
			command.ConfirmedFingerprint = preview.Fingerprint
			committed, err := service.MigrateLegacy(context.Background(), command)
			if err != nil {
				t.Fatal(err)
			}
			if committed.LegacyMigration == nil || !committed.LegacyMigration.Imported {
				t.Fatalf("fixture did not complete the full flow: %+v", committed.LegacyMigration)
			}
		})
	}
}

func TestLegacyMigrationIdempotencyProperty(t *testing.T) {
	for index := 0; index < 32; index++ {
		t.Run(fmt.Sprintf("case-%02d", index), func(t *testing.T) {
			raw := []byte(fmt.Sprintf(`{"events":[{"id":"event-%d","drivers":[{"id":"driver-%d"}],"strategies":[],"durationMin":%d}],"activeId":"event-%d"}`, index, index, index+1, index))
			repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
			if err != nil {
				t.Fatal(err)
			}
			service := NewService[testPayload](repo)
			now := time.Date(2026, 8, 21, 18, index, 0, 0, time.UTC)
			command := LegacyMigrationCommand{CommandHeader: documentHeader("preview", OperationPreviewLegacyMigration, 0), Sources: []LegacyStorageSource{{Key: eventsStorageKey, Present: true, Raw: raw}}, MigratedAt: now}
			preview, err := service.PreviewLegacyMigration(context.Background(), command)
			if err != nil {
				t.Fatal(err)
			}
			command.Operation = OperationMigrateLegacy
			command.CommandID = "first"
			command.ExpectedRepositoryVersion = preview.RepositoryVersion
			command.ConfirmedFingerprint = preview.LegacyMigration.Fingerprint
			first, err := service.MigrateLegacy(context.Background(), command)
			if err != nil {
				t.Fatal(err)
			}
			command.CommandID = "second"
			command.ExpectedRepositoryVersion = first.RepositoryVersion
			second, err := service.MigrateLegacy(context.Background(), command)
			if err != nil {
				t.Fatal(err)
			}
			if second.RepositoryVersion != first.RepositoryVersion || second.LegacyMigration == nil || !second.LegacyMigration.AlreadyImported {
				t.Fatalf("second migration changed state: first=%+v second=%+v", first, second)
			}
		})
	}
}

func TestLegacyMigrationIsIdempotentAndRecoversAfterCrash(t *testing.T) {
	ctx := context.Background()
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	failing := &failCommitRepository[testPayload]{Repository: repo, failAt: 2}
	service := NewService[testPayload](failing)
	now := time.Date(2026, 8, 21, 18, 0, 0, 0, time.UTC)
	fixture := readLegacyGoldenFixture(t, "events-full.json")
	command := LegacyMigrationCommand{
		CommandHeader:        documentHeader("preview-1", OperationPreviewLegacyMigration, 0),
		Sources:              fixtureSources(fixture),
		ConfirmedFingerprint: "",
		MigratedAt:           now,
	}

	preview, err := service.PreviewLegacyMigration(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	if preview.LegacyMigration == nil || preview.LegacyMigration.Fingerprint == "" {
		t.Fatal("preview did not return a fingerprint")
	}
	command.ExpectedRepositoryVersion = preview.RepositoryVersion
	command.Operation = OperationMigrateLegacy
	command.CommandID = "migrate-1"
	command.ConfirmedFingerprint = preview.LegacyMigration.Fingerprint
	_, err = service.MigrateLegacy(ctx, command)
	if !errors.Is(err, errSimulatedMigrationCrash) {
		t.Fatalf("first migration error = %v", err)
	}

	// The backup commit survived; retrying the same fingerprint completes once.
	failing.failAt = 0
	retry, err := service.MigrateLegacy(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	if retry.LegacyMigration == nil || !retry.LegacyMigration.Imported {
		t.Fatalf("retry did not import: %+v", retry.LegacyMigration)
	}
	again := command
	again.CommandID = "migrate-2"
	again.ExpectedRepositoryVersion = retry.RepositoryVersion
	idempotent, err := service.MigrateLegacy(ctx, again)
	if err != nil {
		t.Fatal(err)
	}
	if idempotent.RepositoryVersion != retry.RepositoryVersion || idempotent.LegacyMigration == nil || !idempotent.LegacyMigration.AlreadyImported {
		t.Fatalf("second import was not idempotent: %+v", idempotent)
	}

	snapshot, err := repo.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.StrategyDocument == nil || len(snapshot.StrategyDocument.Events) != 1 {
		t.Fatalf("unexpected canonical document: %+v", snapshot.StrategyDocument)
	}
	meta := snapshot.StrategyDocument.MigrationMeta
	if meta == nil || string(meta.Sources[0].Raw) != string(sourcesRaw(t, fixture)) {
		t.Fatalf("raw backup was not preserved byte-for-byte: %+v", meta)
	}
}

func TestLegacyMigrationNewPreviewPreservesCancelledBackup(t *testing.T) {
	ctx := context.Background()
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	now := time.Date(2026, 8, 21, 18, 0, 0, 0, time.UTC)
	firstRaw := []byte(`{"events":[]}`)
	first, err := service.PreviewLegacyMigration(ctx, LegacyMigrationCommand{CommandHeader: documentHeader("first", OperationPreviewLegacyMigration, 0), Sources: []LegacyStorageSource{{Key: eventsStorageKey, Present: true, Raw: firstRaw}}, MigratedAt: now})
	if err != nil {
		t.Fatal(err)
	}
	secondRaw := []byte(`{"events":[],"activeId":null}`)
	second, err := service.PreviewLegacyMigration(ctx, LegacyMigrationCommand{CommandHeader: documentHeader("second", OperationPreviewLegacyMigration, first.RepositoryVersion), Sources: []LegacyStorageSource{{Key: eventsStorageKey, Present: true, Raw: secondRaw}}, MigratedAt: now.Add(time.Minute)})
	if err != nil {
		t.Fatal(err)
	}
	meta := second.StrategyDocument.MigrationMeta
	if meta == nil || len(meta.SupersededJournals) != 1 || string(meta.SupersededJournals[0].Sources[0].Raw) != string(firstRaw) {
		t.Fatalf("cancelled backup was not retained: %+v", meta)
	}
	if string(meta.Sources[0].Raw) != string(secondRaw) {
		t.Fatalf("new backup = %q", meta.Sources[0].Raw)
	}
}

func TestLegacyMigrationQuarantinesCollisionsAndRollbackArchivesLaterDocument(t *testing.T) {
	ctx := context.Background()
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](repo)
	now := time.Date(2026, 8, 21, 18, 0, 0, 0, time.UTC)
	existing := validEvent("own-1", []strategydocument.Driver{{ID: "driver-existing", Order: 0}})
	created, err := service.CreateEvent(ctx, CreateEventCommand{
		CommandHeader: documentHeader("existing", OperationCreateEvent, 0),
		Event:         existing, UpdatedAt: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	fixture := readLegacyGoldenFixture(t, "events-full.json")
	command := LegacyMigrationCommand{
		CommandHeader: documentHeader("preview", OperationPreviewLegacyMigration, created.RepositoryVersion),
		Sources:       fixtureSources(fixture), MigratedAt: now.Add(time.Minute),
	}
	preview, err := service.PreviewLegacyMigration(ctx, command)
	if err != nil {
		t.Fatal(err)
	}
	if preview.LegacyMigration == nil || len(preview.LegacyMigration.Quarantine) == 0 {
		t.Fatal("ID collision was not quarantined")
	}
	command.Operation = OperationMigrateLegacy
	command.CommandID = "commit"
	command.ExpectedRepositoryVersion = preview.RepositoryVersion
	command.ConfirmedFingerprint = preview.LegacyMigration.Fingerprint
	committed, err := service.MigrateLegacy(ctx, command)
	if err != nil {
		t.Fatal(err)
	}

	later := validEvent("later", []strategydocument.Driver{{ID: "driver-later", Order: 0}})
	changed, err := service.CreateEvent(ctx, CreateEventCommand{
		CommandHeader: documentHeader("later", OperationCreateEvent, committed.RepositoryVersion),
		Event:         later, UpdatedAt: now.Add(2 * time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	rolledBack, err := service.RollbackLegacyMigration(ctx, RollbackLegacyMigrationCommand{
		CommandHeader: documentHeader("rollback", OperationRollbackLegacyMigration, changed.RepositoryVersion),
		JournalID:     preview.LegacyMigration.JournalID,
		RolledBackAt:  now.Add(3 * time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	document := rolledBack.StrategyDocument
	if document == nil || len(document.Events) != 1 || document.Events[0].ID != "own-1" {
		t.Fatalf("rollback did not restore prior canonical document: %+v", document)
	}
	if len(document.MigrationArchives) != 1 || len(document.MigrationArchives[0].Events) != 2 {
		t.Fatalf("post-migration document was not archived: %+v", document.MigrationArchives)
	}
}

var errSimulatedMigrationCrash = errors.New("simulated migration crash")

type failCommitRepository[T any] struct {
	*repository.Repository[T]
	commits int
	failAt  int
}

func (repo *failCommitRepository[T]) Commit(ctx context.Context, version uint64, changes repository.ChangeSet[T]) (repository.CommitResult[T], error) {
	repo.commits++
	if repo.failAt > 0 && repo.commits == repo.failAt {
		return repository.CommitResult[T]{}, errSimulatedMigrationCrash
	}
	return repo.Repository.Commit(ctx, version, changes)
}

func readLegacyGoldenFixture(t *testing.T, name string) legacyGoldenFixture {
	t.Helper()
	path := filepath.Join("..", "..", "..", "docs", "strategy-planner", "evidence", "isa-694-spike", "fixtures", "orbit-localstorage", name)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var fixture legacyGoldenFixture
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture
}

func fixtureSources(fixture legacyGoldenFixture) []LegacyStorageSource {
	raw := fixture.Value
	if fixture.RawValue != nil {
		raw = []byte(*fixture.RawValue)
	}
	return []LegacyStorageSource{{Key: fixture.StorageKey, Present: true, Raw: raw}}
}

func sourcesRaw(t *testing.T, fixture legacyGoldenFixture) []byte {
	t.Helper()
	return fixtureSources(fixture)[0].Raw
}
