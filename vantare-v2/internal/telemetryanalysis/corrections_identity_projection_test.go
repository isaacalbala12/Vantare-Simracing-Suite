package telemetryanalysis

import (
	"context"
	"reflect"
	"testing"
)

// T12j4 — proyección de identidad canónica desde la custodia J3: guardar v4,
// avanzar/restaurar cabeza, reabrir y derivar la revisión exacta sin volver a
// consultar catálogo. La restauración usa el original; mutar el resultado no
// altera lecturas posteriores.

func TestIdentityProjectionDerivesStoredV4Revision(t *testing.T) {
	ctx := context.Background()
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	probe := &identityResolveProbe{target: target}
	classes := []ClassificationCorrection{
		canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza"),
		classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify"),
	}
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	store := NewCorrectionStore(root)
	input := ObservationCorrectionInput{
		FamilyUses:                  []LapFamilyUseCorrection{},
		Session:                     session,
		Classifications:             classes,
		ResolveCanonicalCombination: probe.resolve,
	}
	first, err := store.SaveObservations(ctx, base, input, CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "j4-identity", Reason: "reviewed identity", LocalAuthorID: "test"})
	if err != nil {
		t.Fatal(err)
	}
	if first.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || first.Revision.Snapshot.CanonicalCombination == nil {
		t.Fatalf("custodia no guardó v4: %+v", first.Revision.Snapshot)
	}
	restore := ObservationCorrectionInput{
		FamilyUses:      []LapFamilyUseCorrection{},
		Session:         session,
		Classifications: []ClassificationCorrection{},
	}
	second, err := store.SaveObservations(ctx, base, restore, CorrectionSaveCommand{ExpectedRevision: first.HeadID, CommandID: "j4-restore", Reason: "restore original", LocalAuthorID: "test"})
	if err != nil {
		t.Fatal(err)
	}
	if second.Revision.Snapshot.ContractVersion != "analysis.sample-snapshot.v1" || second.HeadID == first.HeadID {
		t.Fatal("restauración no avanzó la cabeza a v1")
	}
	reopened := NewCorrectionStore(root)
	old, err := reopened.DeriveProjectionSession(ctx, base, session, pages, caller, first.Revision.RevisionID)
	if err != nil {
		t.Fatalf("revisión v4 antigua no derivable tras reapertura: %v", err)
	}
	digest, err := base.Digest()
	if err != nil {
		t.Fatal(err)
	}
	if old.Revision == nil || old.Revision.SessionID != base.SessionID || old.Revision.BaseDigest != digest || old.Revision.RevisionID != first.Revision.RevisionID || old.Revision.SnapshotID != first.Revision.Snapshot.SnapshotID {
		t.Fatalf("perdió la referencia exacta de la revisión: %+v", old.Revision)
	}
	if !reflect.DeepEqual(old.Classified.Combination, *target) || old.Classified.Combination.ID != target.ID {
		t.Fatalf("la revisión antigua no derivó el target persistido: %+v", old.Classified.Combination)
	}
	if old.Classified.Type != SessionTypeQualify {
		t.Fatalf("la revisión antigua perdió la clasificación corregida: %+v", old.Classified)
	}
	if probe.calls != 1 {
		t.Fatalf("la proyección consultó el catálogo de nuevo: %d", probe.calls)
	}
	restored, err := reopened.DeriveProjectionSession(ctx, base, session, pages, caller, second.Revision.RevisionID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(restored.Classified.Combination, caller.Combination) || restored.Classified.Type != SessionTypeRace {
		t.Fatalf("la restauración no usó el original: %+v", restored.Classified)
	}
}

func TestIdentityProjectionMutationDoesNotAlterLaterReads(t *testing.T) {
	ctx := context.Background()
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	probe := &identityResolveProbe{target: target}
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	store := NewCorrectionStore(root)
	input := ObservationCorrectionInput{
		FamilyUses:                  []LapFamilyUseCorrection{},
		Session:                     session,
		Classifications:             []ClassificationCorrection{canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")},
		ResolveCanonicalCombination: probe.resolve,
	}
	saved, err := store.SaveObservations(ctx, base, input, CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "j4-mutation", Reason: "reviewed identity", LocalAuthorID: "test"})
	if err != nil {
		t.Fatal(err)
	}
	reopened := NewCorrectionStore(root)
	old, err := reopened.DeriveProjectionSession(ctx, base, session, pages, caller, saved.Revision.RevisionID)
	if err != nil {
		t.Fatal(err)
	}
	old.Classified.Combination.TrackName = "caller mutation"
	old.Classified.Type = SessionTypePractice
	if old.Validity != nil && len(old.Validity.Laps) > 0 {
		old.Validity.Laps[0].Number = 9999
	}
	if old.Consumption != nil {
		old.Consumption.CombinationID = "caller mutation"
	}
	again, err := reopened.DeriveProjectionSession(ctx, base, session, pages, caller, saved.Revision.RevisionID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(again.Classified.Combination, *target) || again.Classified.Type != SessionTypeRace {
		t.Fatal("una mutación del resultado alteró la custodia o la derivación")
	}
	if again.Consumption != nil && again.Consumption.CombinationID != target.ID {
		t.Fatal("una mutación del resultado alteró el CombinationID derivado")
	}
	if again.Revision == nil || again.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatal("la relectura perdió la referencia exacta")
	}
}
