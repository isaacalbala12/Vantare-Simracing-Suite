package telemetryanalysis

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// T12j3 — custodia de identidad y resolución diferida. El callback nativo se
// resuelve una sola vez bajo lease, después de replay, cabeza, guardas de
// grupos desconocidos y cuota. Replay, Resolve, Load y reapertura nunca
// consultan catálogo. Ni el callback ni la custodia prueban autorización de
// la fuente: cada operación nativa la verifica en su capa.

var errIdentityCatalogBoom = errors.New("catalog boom")

type identityResolveProbe struct {
	target         *CombinationIdentity
	err            error
	calls          int
	ids            []string
	sawLiveContext bool
	onCall         func(ctx context.Context)
	leaseErr       error
}

func (p *identityResolveProbe) resolve(ctx context.Context, id string) (CombinationIdentity, error) {
	p.calls++
	p.ids = append(p.ids, id)
	if ctx != nil && ctx.Err() == nil {
		p.sawLiveContext = true
	}
	if p.onCall != nil {
		p.onCall(ctx)
	}
	if p.err != nil {
		return CombinationIdentity{}, p.err
	}
	return *p.target, nil
}

func identityStoreExample(t *testing.T) (SourceAnalysisRef, LapValidityAnalysis, LapFamilyUseCorrection, ObservationCorrectionInput, CorrectionSaveCommand, *CombinationIdentity) {
	t.Helper()
	base, original, family := lapFamilyCorrectionExample(t)
	session := mixedSnapshotSession(base)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := ClassificationCorrection{Base: base, Field: ClassificationFieldTrackName, ExpectedOriginal: "Imola", Replacement: "Monza", Reason: "Reviewed identity", Provenance: ClassificationProvenanceManual, CanonicalCombinationID: target.ID}
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	input := ObservationCorrectionInput{Original: original, Effective: original, FamilyUses: []LapFamilyUseCorrection{}, Session: session, Classifications: []ClassificationCorrection{track}}
	command := CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "j3-identity", Reason: "Review canonical identity", LocalAuthorID: "local"}
	return base, original, family, input, command, target
}

func countIdentityWrites(store *CorrectionStore, counter *int) {
	previous := store.writeFile
	store.writeFile = func(path string, data []byte) error {
		*counter++
		return previous(path, data)
	}
}

func checkIdentityHeadIntact(t *testing.T, store *CorrectionStore, ctx context.Context, base SourceAnalysisRef, head string) {
	t.Helper()
	loaded, err := store.Load(ctx, base, head)
	if err != nil || loaded.HeadID != head || loaded.Revision.Snapshot.SnapshotID == "" {
		t.Fatalf("cabeza perdida tras rechazo: %v", err)
	}
}

func TestIdentityStoreSavesSingleGroupAndReloadsAfterRestart(t *testing.T) {
	ctx := context.Background()
	base, _, _, input, command, target := identityStoreExample(t)
	probe := &identityResolveProbe{target: target}
	input.ResolveCanonicalCombination = probe.resolve
	root := t.TempDir()
	store := NewCorrectionStore(root)
	writes := 0
	countIdentityWrites(store, &writes)
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := saved.Revision.Snapshot
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || len(snapshot.Classifications) != 1 || len(snapshot.Corrections) != 0 || len(snapshot.FamilyUses) != 0 {
		t.Fatalf("revisión v4 de identidad sola incorrecta: %+v", snapshot)
	}
	if snapshot.CanonicalCombination == nil || !reflect.DeepEqual(*snapshot.CanonicalCombination, *target) {
		t.Fatalf("target no conservado: %+v", snapshot.CanonicalCombination)
	}
	if probe.calls != 1 || len(probe.ids) != 1 || probe.ids[0] != target.ID || !probe.sawLiveContext {
		t.Fatalf("resolución única con contexto e ID fallida: %+v", probe)
	}
	if writes != 2 {
		t.Fatalf("escrituras inesperadas: %d", writes)
	}
	loaded, err := NewCorrectionStore(root).Load(ctx, base, saved.HeadID)
	if err != nil {
		t.Fatal("reapertura perdió la revisión de identidad", err)
	}
	if loaded.HeadID != saved.HeadID || !reflect.DeepEqual(loaded.Revision, saved.Revision) {
		t.Fatal("reapertura devolvió revisión incompleta")
	}
}

func TestIdentityStoreSavesThreeGroups(t *testing.T) {
	ctx := context.Background()
	base, original, family, input, command, target := identityStoreExample(t)
	input.Samples = mixedSnapshotScalar(t, base)
	input.FamilyUses = []LapFamilyUseCorrection{family}
	input.Original = original
	input.Effective = original
	command.CommandID = "j3-three"
	probe := &identityResolveProbe{target: target}
	input.ResolveCanonicalCombination = probe.resolve
	store := NewCorrectionStore(t.TempDir())
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := saved.Revision.Snapshot
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || len(snapshot.Corrections) != 1 || len(snapshot.FamilyUses) != 1 || len(snapshot.Classifications) != 1 {
		t.Fatalf("revisión v4 de tres grupos incorrecta: %+v", snapshot)
	}
	if snapshot.CanonicalCombination == nil || snapshot.CanonicalCombination.TrackName != "Monza" {
		t.Fatalf("target de tres grupos no conservado: %+v", snapshot.CanonicalCombination)
	}
	if probe.calls != 1 {
		t.Fatalf("resoluciones inesperadas: %d", probe.calls)
	}
	loaded, err := store.Load(ctx, base, saved.HeadID)
	if err != nil {
		t.Fatal("tres grupos no recargables", err)
	}
	if loaded.HeadID != saved.HeadID || !reflect.DeepEqual(loaded.Revision, saved.Revision) {
		t.Fatal("tres grupos con revisión incompleta tras Load")
	}
}

func TestIdentityStoreResolvesOnceUnderRetainedLease(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	base, _, _, input, command, target := identityStoreExample(t)
	root := t.TempDir()
	store := NewCorrectionStore(root)
	probe := &identityResolveProbe{target: target}
	probe.onCall = func(call context.Context) {
		if call != ctx {
			t.Error("callback recibió un contexto distinto al de la operación")
		}
		_, lease, err := store.lock(call, base)
		probe.leaseErr = err
		if lease != nil {
			if closeErr := lease.Close(); closeErr != nil {
				t.Error(closeErr)
			}
		}
	}
	input.ResolveCanonicalCombination = probe.resolve
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	if probe.calls != 1 {
		t.Fatalf("resoluciones inesperadas: %d", probe.calls)
	}
	if !errors.Is(probe.leaseErr, ErrCorrectionWriteInProgress) {
		t.Fatalf("callback fuera del lease: %v", probe.leaseErr)
	}
	probe.target.TrackName = "Mutada"
	loaded, err := store.Load(ctx, base, saved.HeadID)
	if err != nil || loaded.Revision.Snapshot.CanonicalCombination.TrackName != "Monza" {
		t.Fatal("snapshot alias al target del llamador", err)
	}
}

func TestIdentityStoreSkipsCatalogForReplayResolveLoad(t *testing.T) {
	ctx := context.Background()
	base, original, _, input, command, target := identityStoreExample(t)
	command.CommandID = "j3-first"
	probe := &identityResolveProbe{target: target}
	input.ResolveCanonicalCombination = probe.resolve
	root := t.TempDir()
	store := NewCorrectionStore(root)
	first, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	restoreInput := ObservationCorrectionInput{Original: original, Effective: original, FamilyUses: []LapFamilyUseCorrection{}, Session: input.Session, Classifications: []ClassificationCorrection{}}
	restoreCmd := CorrectionSaveCommand{ExpectedRevision: first.HeadID, CommandID: "j3-restore-v1", Reason: "Restore original session", LocalAuthorID: "local"}
	second, err := store.SaveObservations(ctx, base, restoreInput, restoreCmd)
	if err != nil || second.Revision.Snapshot.ContractVersion != "analysis.sample-snapshot.v1" {
		t.Fatal("restauración explícita a v1 fallida", err)
	}
	if second.HeadID == first.HeadID {
		t.Fatal("cabeza sin avanzar tras restauración")
	}
	callsAfterWrites := probe.calls
	storeWrites := 0
	countIdentityWrites(store, &storeWrites)
	reopened := NewCorrectionStore(root)
	reopenedWrites := 0
	countIdentityWrites(reopened, &reopenedWrites)
	replayInput := input
	replayInput.ResolveCanonicalCombination = nil
	replay, err := store.SaveObservations(ctx, base, replayInput, command)
	if err != nil {
		t.Fatal("replay sin catálogo perdió revisión o cabeza", err)
	}
	if replay.HeadID != second.HeadID || !reflect.DeepEqual(replay.Revision, first.Revision) {
		t.Fatal("replay devolvió revisión incompleta")
	}
	failing := &identityResolveProbe{target: target, err: errIdentityCatalogBoom}
	replayInput.ResolveCanonicalCombination = failing.resolve
	replay, err = store.SaveObservations(ctx, base, replayInput, command)
	if err != nil {
		t.Fatal("replay consultó un catálogo que fallaría", err)
	}
	if replay.HeadID != second.HeadID || !reflect.DeepEqual(replay.Revision, first.Revision) {
		t.Fatal("replay con callback fallido devolvió revisión incompleta")
	}
	if failing.calls != 0 || probe.calls != callsAfterWrites {
		t.Fatal("replay resolvió catálogo")
	}
	found, err := store.ResolveMixedCommand(ctx, base, nil, []LapFamilyUseCorrection{}, input.Classifications, command)
	if err != nil || !found.Found || found.Revision == nil {
		t.Fatal("Resolve sin catálogo perdió revisión histórica o cabeza", err)
	}
	if found.HeadID != second.HeadID || !reflect.DeepEqual(*found.Revision, first.Revision) {
		t.Fatal("Resolve devolvió revisión incompleta")
	}
	loaded, err := reopened.Load(ctx, base, first.Revision.RevisionID)
	if err != nil {
		t.Fatal("Load tras reapertura perdió identidad o cabeza", err)
	}
	if loaded.HeadID != second.HeadID || !reflect.DeepEqual(loaded.Revision, first.Revision) {
		t.Fatal("Load tras reapertura devolvió revisión incompleta")
	}
	if storeWrites != 0 || reopenedWrites != 0 {
		t.Fatal("replay/Resolve/Load escribieron historia")
	}
}

func TestIdentityStoreRejectsChangedPayloadBeforeResolving(t *testing.T) {
	ctx := context.Background()
	base, _, _, input, command, target := identityStoreExample(t)
	probe := &identityResolveProbe{target: target}
	input.ResolveCanonicalCombination = probe.resolve
	store := NewCorrectionStore(t.TempDir())
	writes := 0
	countIdentityWrites(store, &writes)
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	writesAfterBaseline := writes
	failing := &identityResolveProbe{target: target, err: errIdentityCatalogBoom}
	renamed := command
	renamed.Reason = "Another reviewed identity"
	changedInput := input
	changedInput.ResolveCanonicalCombination = failing.resolve
	if result, err := store.SaveObservations(ctx, base, changedInput, renamed); !errors.Is(err, ErrCorrectionConflict) || result.HeadID != "" {
		t.Fatalf("comando con motivo cambiado aceptado: %v", err)
	}
	alteredClasses := append([]ClassificationCorrection(nil), input.Classifications...)
	alteredClasses[0].Reason = "Changed payload"
	if _, err := store.ResolveMixedCommand(ctx, base, nil, []LapFamilyUseCorrection{}, alteredClasses, command); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatalf("Resolve aceptó payload cambiado: %v", err)
	}
	if failing.calls != 0 {
		t.Fatalf("conflicto resolvió catálogo: %d", failing.calls)
	}
	if writes != writesAfterBaseline {
		t.Fatal("conflicto escribió historia")
	}
	checkIdentityHeadIntact(t, store, ctx, base, saved.HeadID)
}

func TestIdentityStoreGuardsRunBeforeResolving(t *testing.T) {
	ctx := context.Background()
	base, _, _, input, command, target := identityStoreExample(t)
	probe := &identityResolveProbe{target: target}
	input.ResolveCanonicalCombination = probe.resolve
	store := NewCorrectionStore(t.TempDir())
	writes := 0
	countIdentityWrites(store, &writes)
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	writesAfterBaseline := writes
	failing := &identityResolveProbe{target: target, err: errIdentityCatalogBoom}
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	stale := input
	stale.ResolveCanonicalCombination = failing.resolve
	staleCmd := CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "j3-stale", Reason: "Review canonical identity", LocalAuthorID: "local"}
	unknownFamilies := input
	unknownFamilies.FamilyUses = nil
	unknownFamilies.ResolveCanonicalCombination = failing.resolve
	unknownClasses := input
	unknownClasses.Classifications = nil
	unknownClasses.ResolveCanonicalCombination = failing.resolve
	for _, tc := range []struct {
		name    string
		input   ObservationCorrectionInput
		command CorrectionSaveCommand
		want    error
	}{
		{"cabeza en conflicto", stale, staleCmd, ErrCorrectionConflict},
		{"familias desconocidas", unknownFamilies, CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "j3-no-families", Reason: "Review canonical identity", LocalAuthorID: "local"}, ErrInvalidCorrection},
		{"clasificaciones desconocidas", unknownClasses, CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "j3-no-classes", Reason: "Review canonical identity", LocalAuthorID: "local"}, ErrInvalidCorrection},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if result, err := store.SaveObservations(ctx, base, tc.input, tc.command); !errors.Is(err, tc.want) || result.HeadID != "" {
				t.Fatalf("llegó %v, se esperaba %v", err, tc.want)
			}
		})
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	cancelledInput := input
	cancelledInput.ResolveCanonicalCombination = failing.resolve
	if _, err := store.SaveObservations(cancelled, base, cancelledInput, CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "j3-cancelled", Reason: "Review canonical identity", LocalAuthorID: "local"}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelación ignorada: %v", err)
	}
	if failing.calls != 0 {
		t.Fatalf("guardas resolvieron catálogo: %d", failing.calls)
	}
	if writes != writesAfterBaseline {
		t.Fatal("guardas escribieron historia")
	}
	checkIdentityHeadIntact(t, store, ctx, base, saved.HeadID)
}

func TestIdentityStoreCancellationDuringCallback(t *testing.T) {
	ctx := context.Background()
	base, _, _, input, command, target := identityStoreExample(t)
	ctx, cancel := context.WithCancel(ctx)
	probe := &identityResolveProbe{target: target}
	probe.onCall = func(context.Context) { cancel() }
	input.ResolveCanonicalCombination = probe.resolve
	store := NewCorrectionStore(t.TempDir())
	writes := 0
	countIdentityWrites(store, &writes)
	if result, err := store.SaveObservations(ctx, base, input, command); !errors.Is(err, context.Canceled) || result.HeadID != "" {
		t.Fatalf("cancelación durante callback ignorada: %v", err)
	}
	if probe.calls != 1 {
		t.Fatalf("llamadas inesperadas: %d", probe.calls)
	}
	if writes != 0 {
		t.Fatal("cancelación escribió historia")
	}
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	checkIdentityHeadIntact(t, store, context.Background(), base, initial.SnapshotID)
}

func TestIdentityStoreRejectsResolverOutcomesWithoutWriting(t *testing.T) {
	ctx := context.Background()
	base, _, _, input, command, target := identityStoreExample(t)
	good := &identityResolveProbe{target: target}
	input.ResolveCanonicalCombination = good.resolve
	store := NewCorrectionStore(t.TempDir())
	writes := 0
	countIdentityWrites(store, &writes)
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	writesAfterBaseline := writes
	otherTarget := canonicalTestTarget("Imola", "GP", "Oreca 07", "LMP2")
	trackIndex := -1
	for i, entry := range input.Session.Metadata {
		if entry.Key == "TrackName" {
			trackIndex = i
		}
	}
	if trackIndex < 0 {
		t.Fatal("fixture sin TrackName")
	}
	badSession := input.Session
	badSession.Metadata = append([]HistoricalMetadata(nil), input.Session.Metadata...)
	badSession.Metadata[trackIndex].Quality = QualityInvalid
	mismatched := append([]ClassificationCorrection(nil), input.Classifications...)
	mismatched[0].ExpectedOriginal = "Milano"
	for i, tc := range []struct {
		name    string
		mutate  func(*ObservationCorrectionInput)
		want    error
		resolve func(context.Context, string) (CombinationIdentity, error)
	}{
		{"sin callback", func(b *ObservationCorrectionInput) { b.ResolveCanonicalCombination = nil }, ErrCorrectionTarget, nil},
		{"error de catálogo", func(b *ObservationCorrectionInput) {}, errIdentityCatalogBoom, (&identityResolveProbe{target: target, err: errIdentityCatalogBoom}).resolve},
		{"target incorrecto", func(b *ObservationCorrectionInput) {}, ErrCorrectionTarget, (&identityResolveProbe{target: otherTarget}).resolve},
		{"precondición discordante", func(b *ObservationCorrectionInput) { b.Classifications = mismatched }, ErrCorrectionPrecondition, (&identityResolveProbe{target: target}).resolve},
		{"campo no verificable", func(b *ObservationCorrectionInput) { b.Session = badSession }, ErrInvalidSessionClassification, (&identityResolveProbe{target: target}).resolve},
	} {
		t.Run(tc.name, func(t *testing.T) {
			attempt := input
			attempt.Classifications = append([]ClassificationCorrection(nil), input.Classifications...)
			attempt.Session.Metadata = append([]HistoricalMetadata(nil), input.Session.Metadata...)
			tc.mutate(&attempt)
			if tc.resolve != nil {
				attempt.ResolveCanonicalCombination = tc.resolve
			}
			next := CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: fmt.Sprintf("j3-bad-%d", i), Reason: "Review canonical identity", LocalAuthorID: "local"}
			if result, err := store.SaveObservations(ctx, base, attempt, next); !errors.Is(err, tc.want) || result.HeadID != "" {
				t.Fatalf("llegó %v, se esperaba %v", err, tc.want)
			}
			if writes != writesAfterBaseline {
				t.Fatal("rechazo escribió historia")
			}
			checkIdentityHeadIntact(t, store, ctx, base, saved.HeadID)
		})
	}
}

func TestIdentityStoreKeepsValidFieldWhenOtherIdentityAbsent(t *testing.T) {
	ctx := context.Background()
	base, _, _, input, command, target := identityStoreExample(t)
	partial := input.Session
	partial.Metadata = nil
	for _, entry := range input.Session.Metadata {
		if entry.Key != "CarClass" {
			partial.Metadata = append(partial.Metadata, entry)
		}
	}
	t.Run("identidad con otra ausente", func(t *testing.T) {
		attempt := input
		attempt.Session = partial
		before := append([]HistoricalMetadata(nil), partial.Metadata...)
		probe := &identityResolveProbe{target: target}
		attempt.ResolveCanonicalCombination = probe.resolve
		store := NewCorrectionStore(t.TempDir())
		next := command
		next.CommandID = "j3-partial-identity"
		saved, err := store.SaveObservations(ctx, base, attempt, next)
		if err != nil {
			t.Fatal(err)
		}
		if saved.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || len(saved.Revision.Snapshot.Classifications) != 1 {
			t.Fatalf("identidad parcial rechazada: %+v", saved.Revision.Snapshot)
		}
		if probe.calls != 1 {
			t.Fatalf("llamadas inesperadas: %d", probe.calls)
		}
		if !reflect.DeepEqual(attempt.Session.Metadata, before) {
			t.Fatal("guardado mutó la metadata original")
		}
		if _, err := ClassifyHistoricalSession(partial); !errors.Is(err, ErrInvalidSessionClassification) {
			t.Fatalf("ausencia dejó de bloquear clasificación global: %v", err)
		}
	})
	t.Run("campo válido sin rellenar ausencia", func(t *testing.T) {
		attempt := input
		attempt.Session = partial
		attempt.Classifications = mixedSnapshotClassRequests(base)
		before := append([]HistoricalMetadata(nil), partial.Metadata...)
		failing := &identityResolveProbe{target: target, err: errIdentityCatalogBoom}
		attempt.ResolveCanonicalCombination = failing.resolve
		store := NewCorrectionStore(t.TempDir())
		next := command
		next.CommandID = "j3-partial-legacy"
		saved, err := store.SaveObservations(ctx, base, attempt, next)
		if err != nil {
			t.Fatal(err)
		}
		if saved.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || len(saved.Revision.Snapshot.Classifications) != 2 {
			t.Fatalf("campo válido bloqueado por ausencia ajena: %+v", saved.Revision.Snapshot)
		}
		if failing.calls != 0 {
			t.Fatal("guardado sin identidad resolvió catálogo")
		}
		if !reflect.DeepEqual(attempt.Session.Metadata, before) {
			t.Fatal("guardado mutó la metadata original")
		}
		if _, err := ClassifyHistoricalSession(partial); !errors.Is(err, ErrInvalidSessionClassification) {
			t.Fatalf("ausencia dejó de bloquear clasificación global: %v", err)
		}
	})
}

func TestIdentityStoreRestoresToLegacyVersionsKeepingHistory(t *testing.T) {
	ctx := context.Background()
	base, original, family, input, command, target := identityStoreExample(t)
	input.Samples = mixedSnapshotScalar(t, base)
	input.FamilyUses = []LapFamilyUseCorrection{family}
	input.Original = original
	input.Effective = original
	legacy := mixedSnapshotClassRequests(base)
	input.Classifications = append([]ClassificationCorrection{input.Classifications[0]}, legacy...)
	command.CommandID = "j3-v4"
	probe := &identityResolveProbe{target: target}
	input.ResolveCanonicalCombination = probe.resolve
	store := NewCorrectionStore(t.TempDir())
	first, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	if first.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || len(first.Revision.Snapshot.Classifications) != 3 {
		t.Fatalf("v4 con identidad y clasificaciones antiguas incorrecto: %+v", first.Revision.Snapshot)
	}
	failing := &identityResolveProbe{target: target, err: errIdentityCatalogBoom}
	dropIdentity := input
	dropIdentity.Classifications = append([]ClassificationCorrection(nil), legacy...)
	dropIdentity.ResolveCanonicalCombination = failing.resolve
	v3Cmd := CorrectionSaveCommand{ExpectedRevision: first.HeadID, CommandID: "j3-drop-identity", Reason: "Restore original identity", LocalAuthorID: "local"}
	second, err := store.SaveObservations(ctx, base, dropIdentity, v3Cmd)
	if err != nil {
		t.Fatal(err)
	}
	plainV3, err := PrepareMixedCorrectionSnapshot(base, input.Samples, original, []LapFamilyUseCorrection{family}, input.Session, legacy)
	if err != nil || second.Revision.Snapshot.SnapshotID != plainV3.SnapshotID || second.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v3" {
		t.Fatal("retirada de identidad sin v3 exacto", err)
	}
	if len(second.Revision.Snapshot.Classifications) != 2 {
		t.Fatalf("v3 perdió clasificaciones antiguas: %+v", second.Revision.Snapshot)
	}
	dropClasses := dropIdentity
	dropClasses.Classifications = []ClassificationCorrection{}
	v2Cmd := CorrectionSaveCommand{ExpectedRevision: second.HeadID, CommandID: "j3-drop-classes", Reason: "Restore original classification", LocalAuthorID: "local"}
	third, err := store.SaveObservations(ctx, base, dropClasses, v2Cmd)
	if err != nil {
		t.Fatal(err)
	}
	plainV2, err := PrepareObservationCorrectionSnapshot(base, input.Samples, original, []LapFamilyUseCorrection{family})
	if err != nil || third.Revision.Snapshot.SnapshotID != plainV2.SnapshotID || third.Revision.Snapshot.ContractVersion != "analysis.observation-snapshot.v2" {
		t.Fatal("retirada de clasificación sin v2 exacto", err)
	}
	dropFamily := dropClasses
	dropFamily.FamilyUses = []LapFamilyUseCorrection{}
	v1Cmd := CorrectionSaveCommand{ExpectedRevision: third.HeadID, CommandID: "j3-drop-family", Reason: "Restore original session", LocalAuthorID: "local"}
	fourth, err := store.SaveObservations(ctx, base, dropFamily, v1Cmd)
	if err != nil {
		t.Fatal(err)
	}
	plainV1, err := PrepareSampleCorrectionSnapshot(base, input.Samples)
	if err != nil || fourth.Revision.Snapshot.SnapshotID != plainV1.SnapshotID || fourth.Revision.Snapshot.ContractVersion != "analysis.sample-snapshot.v1" {
		t.Fatal("restauración sin v1 exacto", err)
	}
	if failing.calls != 0 {
		t.Fatal("restauración sin identidad resolvió catálogo")
	}
	old, err := store.Load(ctx, base, first.Revision.RevisionID)
	if err != nil {
		t.Fatal("restauración borró la historia v4", err)
	}
	if old.HeadID != fourth.HeadID || !reflect.DeepEqual(old.Revision, first.Revision) {
		t.Fatal("restauración devolvió historia v4 incompleta")
	}
	if len(old.Revision.Snapshot.Classifications) != 3 || !reflect.DeepEqual(old.Revision.Snapshot.CanonicalCombination, target) {
		t.Fatal("restauración perdió clasificaciones o target v4")
	}
}

func TestIdentityStoreRevisionQuotaOnValidChain(t *testing.T) {
	ctx := context.Background()
	base, _, _, input, command, target := identityStoreExample(t)
	probe := &identityResolveProbe{target: target}
	store := NewCorrectionStore(t.TempDir())
	writes := 0
	countIdentityWrites(store, &writes)
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	head := initial.SnapshotID
	for i := 0; i < maxCorrectionRevisions; i++ {
		next := CorrectionSaveCommand{ExpectedRevision: head, CommandID: fmt.Sprintf("j3-fill-%d", i), Reason: "Fill revision chain", LocalAuthorID: "local"}
		saved, err := store.Save(ctx, base, nil, next)
		if err != nil {
			t.Fatalf("cadena válida rota en %d: %v", i, err)
		}
		head = saved.HeadID
	}
	loaded, err := store.Load(ctx, base, head)
	if err != nil || loaded.HeadID != head {
		t.Fatal("cadena de 256 revisiones inválida", err)
	}
	writesAfterChain := writes
	input.ResolveCanonicalCombination = probe.resolve
	next := command
	next.ExpectedRevision = head
	next.CommandID = "j3-over-quota"
	if result, err := store.SaveObservations(ctx, base, input, next); !errors.Is(err, ErrInvalidCorrection) || result.HeadID != "" {
		t.Fatalf("cuota superada: %v", err)
	}
	if probe.calls != 0 {
		t.Fatal("cuota resolvió catálogo")
	}
	if writes != writesAfterChain {
		t.Fatal("cuota escribió historia")
	}
	checkIdentityHeadIntact(t, store, ctx, base, head)
}

func TestIdentityStoreRecoversUncertainCommitWithoutCatalog(t *testing.T) {
	for _, failBackup := range []bool{true, false} {
		t.Run(fmt.Sprint(failBackup), func(t *testing.T) {
			ctx := context.Background()
			base, _, _, input, command, target := identityStoreExample(t)
			probe := &identityResolveProbe{target: target}
			input.ResolveCanonicalCombination = probe.resolve
			store := NewCorrectionStore(t.TempDir())
			store.writeFile = func(path string, data []byte) error {
				if err := writeAuthorizedSessionFile(path, data); err != nil {
					return err
				}
				if strings.HasSuffix(path, ".bak") == failBackup {
					return errors.New("lost acknowledgement")
				}
				return nil
			}
			if result, err := store.SaveObservations(ctx, base, input, command); !errors.Is(err, ErrCorrectionCommitUncertain) || result.HeadID != "" {
				t.Fatal("confirmación durable falsa", err)
			}
			store.writeFile = writeAuthorizedSessionFile
			found, err := store.ResolveMixedCommand(ctx, base, nil, []LapFamilyUseCorrection{}, input.Classifications, command)
			if err != nil || !found.Found || found.Revision == nil || len(found.Revision.Snapshot.Classifications) != 1 {
				t.Fatal("comando incierto de identidad perdido", err)
			}
			if !reflect.DeepEqual(found.Revision.Snapshot.CanonicalCombination, target) {
				t.Fatal("recuperación perdió el target")
			}
			replayInput := input
			replayInput.ResolveCanonicalCombination = nil
			replay, err := store.SaveObservations(ctx, base, replayInput, command)
			if err != nil || replay.HeadID != found.Revision.RevisionID || replay.Revision.ParentRevisionID != command.ExpectedRevision {
				t.Fatal("replay sin catálogo creó otra revisión", err)
			}
			loaded, err := store.Load(ctx, base, replay.HeadID)
			if err != nil || loaded.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v4" {
				t.Fatal("replay sin v4 exacto", err)
			}
		})
	}
}
