package application

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

func transferProvenance() packaging.Provenance {
	return packaging.Provenance{
		Application:        "vantare",
		ApplicationVersion: "0.1.0.7",
		ExportedAt:         canonicalTime(30),
	}
}

// populated builds a service holding one plan with a draft and a revision, and
// returns the exported package for it.
func populated(t *testing.T) (*Service[testPayload], []byte) {
	t.Helper()
	service := libraryService(t)
	draft := validDraft("draft-1", "plan-1", 10)
	createPlan(t, service, draft, 0)
	if _, err := service.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
		CommandHeader: commandHeader("save-1", OperationSaveRevision, 1),
		Draft:         draft,
		RevisionID:    "revision-1",
		CreatedAt:     canonicalTime(5),
	}); err != nil {
		t.Fatalf("SaveRevision: %v", err)
	}
	exported, err := service.Export(context.Background(), ExportCommand{
		CommandHeader: commandHeader("export-1", OperationExport, 0),
		Plans:         []PlanSelector{{PlanID: "plan-1", VariantID: "variant-1"}},
		Provenance:    transferProvenance(),
	})
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	return service, exported.Package
}

func versionOf(t *testing.T, service *Service[testPayload]) uint64 {
	t.Helper()
	result, err := service.List(context.Background(), ListCommand{
		CommandHeader: commandHeader("version-probe", OperationList, 0),
	})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	return result.RepositoryVersion
}

func TestExportProducesAPackageAndLeavesTheRepositoryAlone(t *testing.T) {
	service, encoded := populated(t)
	before := versionOf(t, service)

	decoded, err := packaging.Decode[testPayload](encoded)
	if err != nil {
		t.Fatalf("the exported package must be readable: %v", err)
	}
	if len(decoded.Bundles) != 1 || decoded.Bundles[0].Draft == nil || len(decoded.Bundles[0].Revisions) != 1 {
		t.Fatalf("export lost documents: %+v", decoded.Bundles)
	}
	if decoded.Provenance != transferProvenance() {
		t.Fatalf("export lost its provenance: %+v", decoded.Provenance)
	}
	if after := versionOf(t, service); after != before {
		t.Fatalf("exporting wrote to the repository: %d became %d", before, after)
	}
}

func TestExportRefusesToGuessWhatToSend(t *testing.T) {
	service, _ := populated(t)
	// An empty selection is a mistake, not "everything".
	if _, err := service.Export(context.Background(), ExportCommand{
		CommandHeader: commandHeader("export-empty", OperationExport, 0),
		Provenance:    transferProvenance(),
	}); err == nil {
		t.Fatal("an empty selection must be refused")
	}
}

func TestExportRefusesAPlanThatIsNotThere(t *testing.T) {
	service, _ := populated(t)
	_, err := service.Export(context.Background(), ExportCommand{
		CommandHeader: commandHeader("export-missing", OperationExport, 0),
		Plans:         []PlanSelector{{PlanID: "plan-absent", VariantID: "variant-1"}},
		Provenance:    transferProvenance(),
	})
	if !errors.Is(err, ErrPlanNotFound) {
		t.Fatalf("expected a plan-not-found refusal, got %v", err)
	}
}

func TestAPackageRoundTripsIntoAFreshRepository(t *testing.T) {
	_, encoded := populated(t)
	destination := libraryService(t)

	imported, err := destination.Import(context.Background(), ImportCommand{
		CommandHeader: commandHeader("import-1", OperationImport, 0),
		Package:       encoded,
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if !imported.Imported || imported.Preview == nil {
		t.Fatalf("import must report what it did: %+v", imported)
	}
	plans := listPlans(t, destination, "list-after-import")
	if len(plans) != 1 {
		t.Fatalf("expected one imported plan, got %+v", plans)
	}
	if plans[0].PlanID != "plan-1" || plans[0].RevisionCount != 1 || !plans[0].HasDraft {
		t.Fatalf("the imported plan lost documents: %+v", plans[0])
	}

	// Round trip closes only if what comes back out is what went in.
	reexported, err := destination.Export(context.Background(), ExportCommand{
		CommandHeader: commandHeader("export-again", OperationExport, 0),
		Plans:         []PlanSelector{{PlanID: "plan-1", VariantID: "variant-1"}},
		Provenance:    transferProvenance(),
	})
	if err != nil {
		t.Fatalf("re-export: %v", err)
	}
	if !bytes.Equal(reexported.Package, encoded) {
		t.Fatal("a package that round trips must come back byte-identical")
	}
}

func TestADryRunReportsWithoutWriting(t *testing.T) {
	_, encoded := populated(t)
	destination := libraryService(t)
	before := versionOf(t, destination)

	result, err := destination.Import(context.Background(), ImportCommand{
		CommandHeader: commandHeader("import-dry", OperationImport, 0),
		Package:       encoded,
		DryRun:        true,
	})
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	if result.Imported {
		t.Fatal("a dry run must not claim to have imported")
	}
	if result.Preview == nil || len(result.Preview.Entries) != 1 {
		t.Fatalf("a dry run must report a preview: %+v", result.Preview)
	}
	if result.Preview.Entries[0].Disposition != packaging.DispositionNew {
		t.Fatalf("expected a new plan, got %q", result.Preview.Entries[0].Disposition)
	}
	if after := versionOf(t, destination); after != before {
		t.Fatalf("a dry run wrote to the repository: %d became %d", before, after)
	}
	if plans := listPlans(t, destination, "list-after-dry"); len(plans) != 0 {
		t.Fatalf("a dry run created plans: %+v", plans)
	}
}

func TestImportingTheSamePackageTwiceIsIdempotent(t *testing.T) {
	_, encoded := populated(t)
	destination := libraryService(t)

	first, err := destination.Import(context.Background(), ImportCommand{
		CommandHeader: commandHeader("import-1", OperationImport, 0),
		Package:       encoded,
	})
	if err != nil {
		t.Fatalf("first import: %v", err)
	}
	second, err := destination.Import(context.Background(), ImportCommand{
		CommandHeader: commandHeader("import-2", OperationImport, first.RepositoryVersion),
		Package:       encoded,
	})
	if err != nil {
		t.Fatalf("second import: %v", err)
	}
	if second.Preview == nil || second.Preview.Entries[0].Disposition != packaging.DispositionUnchanged {
		t.Fatalf("the second import should change nothing: %+v", second.Preview)
	}
	if plans := listPlans(t, destination, "list-after-twice"); len(plans) != 1 {
		t.Fatalf("importing twice duplicated the plan: %+v", plans)
	}
}

// The guarantee the issue asks for, stated four ways: a package that cannot be
// trusted must leave the repository exactly as it found it.
func TestAnInvalidPackageIsRejectedWithoutMutatingTheRepository(t *testing.T) {
	_, valid := populated(t)

	tampered := bytes.Replace(valid, []byte(`"laps": 10`), []byte(`"laps": 77`), 1)
	if bytes.Equal(tampered, valid) {
		t.Fatal("the test failed to alter the package")
	}
	futureVersion := bytes.Replace(valid, []byte(packaging.PackageVersionV1), []byte("strategy.package.v9"), 1)
	if bytes.Equal(futureVersion, valid) {
		t.Fatal("the test failed to alter the package version")
	}

	for name, broken := range map[string][]byte{
		"not json":         []byte("{ this is not a package"),
		"empty":            nil,
		"tampered payload": tampered,
		"future version":   futureVersion,
	} {
		t.Run(name, func(t *testing.T) {
			destination := libraryService(t)
			// Seed the destination so "unchanged" means something.
			createPlan(t, destination, validDraft("draft-local", "plan-local", 3), 0)
			before := versionOf(t, destination)
			plansBefore := listPlans(t, destination, "before")

			if _, err := destination.Import(context.Background(), ImportCommand{
				CommandHeader: commandHeader("import-broken", OperationImport, before),
				Package:       broken,
			}); err == nil {
				t.Fatal("a broken package must be refused")
			}

			if after := versionOf(t, destination); after != before {
				t.Fatalf("a refused import wrote to the repository: %d became %d", before, after)
			}
			plansAfter := listPlans(t, destination, "after")
			if len(plansAfter) != len(plansBefore) || plansAfter[0].PlanID != plansBefore[0].PlanID {
				t.Fatalf("a refused import changed the library: %+v", plansAfter)
			}
		})
	}
}

func TestAPackageThatWouldRewriteHistoryIsRefusedWithItsReasons(t *testing.T) {
	source, encoded := populated(t)
	_ = source

	// Build a destination holding the same revision identity with different
	// content, which is the one thing an import may never overwrite.
	destination := libraryService(t)
	conflicting := validDraft("draft-1", "plan-1", 99)
	createPlan(t, destination, conflicting, 0)
	if _, err := destination.SaveRevision(context.Background(), SaveRevisionCommand[testPayload]{
		CommandHeader: commandHeader("save-conflict", OperationSaveRevision, 1),
		Draft:         conflicting,
		RevisionID:    "revision-1",
		CreatedAt:     canonicalTime(5),
	}); err != nil {
		t.Fatalf("SaveRevision: %v", err)
	}
	before := versionOf(t, destination)

	_, err := destination.Import(context.Background(), ImportCommand{
		CommandHeader: commandHeader("import-conflict", OperationImport, before),
		Package:       encoded,
	})
	if !errors.Is(err, ErrImportRefused) {
		t.Fatalf("expected an import refusal, got %v", err)
	}
	var refused *ImportRefusedError
	if !errors.As(err, &refused) {
		t.Fatalf("the refusal must carry its preview, got %T", err)
	}
	if refused.Preview.Importable {
		t.Fatal("a refusal cannot report an importable package")
	}
	entry := refused.Preview.Entries[0]
	if entry.Disposition != packaging.DispositionConflict || len(entry.ConflictingRevisions) != 1 {
		t.Fatalf("the refusal must name what collides: %+v", entry)
	}
	if after := versionOf(t, destination); after != before {
		t.Fatalf("a refused import wrote to the repository: %d became %d", before, after)
	}
}

func TestImportRefusesACommandForAnotherOperation(t *testing.T) {
	_, encoded := populated(t)
	destination := libraryService(t)
	if _, err := destination.Import(context.Background(), ImportCommand{
		CommandHeader: commandHeader("import-1", OperationOpen, 0),
		Package:       encoded,
	}); err == nil {
		t.Fatal("expected the header check to reject a mismatched operation")
	}
}

func TestImportRefusesAStaleCommand(t *testing.T) {
	_, encoded := populated(t)
	destination := libraryService(t)
	createPlan(t, destination, validDraft("draft-local", "plan-local", 3), 0)

	_, err := destination.Import(context.Background(), ImportCommand{
		CommandHeader: commandHeader("import-stale", OperationImport, 0),
		Package:       encoded,
	})
	if !errors.Is(err, ErrStaleCommand) {
		t.Fatalf("expected a stale-command refusal, got %v", err)
	}
}

// A failing repository must surface as a failure, never as a silent success.
type failingRepository struct {
	repositoryPort[testPayload]
	err error
}

func (repo failingRepository) Commit(context.Context, uint64, repository.ChangeSet[testPayload]) (repository.CommitResult[testPayload], error) {
	return repository.CommitResult[testPayload]{}, repo.err
}

func TestImportSurfacesARepositoryFailure(t *testing.T) {
	_, encoded := populated(t)
	base, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService[testPayload](failingRepository{repositoryPort: base, err: errors.New("disk on fire")})

	if _, err := service.Import(context.Background(), ImportCommand{
		CommandHeader: commandHeader("import-fail", OperationImport, 0),
		Package:       encoded,
	}); err == nil {
		t.Fatal("a repository failure must not be reported as an import")
	}
}

func TestAnExportedPackageDeclaresItsFormat(t *testing.T) {
	_, encoded := populated(t)
	var envelope struct {
		PackageVersion    string `json:"packageVersion"`
		ContractVersion   string `json:"contractVersion"`
		ChecksumAlgorithm string `json:"checksumAlgorithm"`
		Checksum          string `json:"checksum"`
	}
	if err := json.Unmarshal(encoded, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.PackageVersion != packaging.PackageVersionV1 {
		t.Fatalf("package version = %q", envelope.PackageVersion)
	}
	if envelope.ContractVersion != string(contract.CurrentVersion) {
		t.Fatalf("contract version = %q", envelope.ContractVersion)
	}
	if envelope.ChecksumAlgorithm != contract.HashAlgorithmV1 || envelope.Checksum == "" {
		t.Fatalf("a package must carry a checksum and name its algorithm: %+v", envelope)
	}
}

func TestTheBridgeCarriesAPackageOutAndBackIn(t *testing.T) {
	source, _ := populated(t)
	bridge := NewJSONBridge(source)

	exportCommand, err := json.Marshal(ExportCommand{
		CommandHeader: commandHeader("export-bridge", OperationExport, 0),
		Plans:         []PlanSelector{{PlanID: "plan-1", VariantID: "variant-1"}},
		Provenance:    transferProvenance(),
	})
	if err != nil {
		t.Fatal(err)
	}
	exported, err := bridge.Execute(context.Background(), exportCommand)
	if err != nil {
		t.Fatalf("bridge export: %v", err)
	}
	var exportResult Result[testPayload]
	if err := json.Unmarshal(exported, &exportResult); err != nil {
		t.Fatal(err)
	}
	if len(exportResult.Package) == 0 {
		t.Fatal("the bridge dropped the package")
	}

	destination := libraryService(t)
	importCommand, err := json.Marshal(ImportCommand{
		CommandHeader: commandHeader("import-bridge", OperationImport, 0),
		Package:       exportResult.Package,
	})
	if err != nil {
		t.Fatal(err)
	}
	imported, err := NewJSONBridge(destination).Execute(context.Background(), importCommand)
	if err != nil {
		t.Fatalf("bridge import: %v", err)
	}
	var importResult Result[testPayload]
	if err := json.Unmarshal(imported, &importResult); err != nil {
		t.Fatal(err)
	}
	if !importResult.Imported || importResult.Preview == nil {
		t.Fatalf("the bridge lost the import outcome: %+v", importResult)
	}
	if plans := listPlans(t, destination, "list-bridge"); len(plans) != 1 {
		t.Fatalf("the bridge import stored nothing: %+v", plans)
	}
}
