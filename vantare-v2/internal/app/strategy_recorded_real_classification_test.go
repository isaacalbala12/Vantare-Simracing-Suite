package app

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"sort"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// T12i — banco real opt-in de revisiones de clasificación. Solo se ejecuta
// desde el banco real existente (TestRecordedStrategyRealDuckDB) con fuente y
// runtime autorizados; sin opt-in no hace nada por sí solo. Reutiliza
// servicio, custodia y autorización del banco existente, sin lector nuevo,
// sin t.TempDir propio y sin perfiles reales, .env ni licencia.
//
// Los reemplazos son decisiones manuales de validación opacas, distintas del
// original: no diagnostican el clima ni el tipo verdaderos de la sesión.
func verifyRecordedRealClassificationRevision(t *testing.T, ctx context.Context, svc *TelemetryAnalysisService, opened TelemetryAnalysisOpenedSession, base telemetryanalysis.SourceAnalysisRef, head, candidateID string) (string, string) {
	t.Helper()
	// Precondición en bruto byte a byte desde el original nativo; si la fuente
	// no ofrece un campo válido único, se expone el límite sin fabricar datos.
	originalType := recordedRealClassificationOriginal(t, opened.Session.Metadata, "sessiontype", "SessionType")
	originalWeather := recordedRealClassificationOriginal(t, opened.Session.Metadata, "weatherconditions", "WeatherConditions")
	canonicalType := strings.ToLower(strings.TrimSpace(originalType))
	switch canonicalType {
	case "practice", "qualify", "race":
	default:
		t.Skipf("real source SessionType %q is outside the closed set; bank limit without fabricated data", originalType)
	}
	// Lo proyectado es TrimSpace del RAW; la precondición sigue siendo el raw.
	trimmedOriginalWeather := strings.TrimSpace(originalWeather)
	weatherReplacement := "local-validation-opaque"
	if strings.TrimSpace(weatherReplacement) == trimmedOriginalWeather {
		weatherReplacement += "-alt"
	}
	typeReplacement := "race"
	if canonicalType == "race" {
		typeReplacement = "qualify"
	}
	observed := string(telemetryanalysis.FamilyObservedStrategy)

	baseDigest, err := base.Digest()
	if err != nil {
		t.Fatalf("real base digest: %v", err)
	}
	// Snapshot inicial mediante Load nativo, no inventado.
	headLoaded, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: opened.SessionID, Base: base, RevisionID: head})
	if err != nil {
		t.Fatalf("real head load: %v", err)
	}
	baseProjection := recordedRealClassificationProject(t, ctx, svc, opened.SessionID, base, head)
	assertRecordedRealProjectionRef(t, "base", baseProjection, base, baseDigest, head, headLoaded.Revision.Snapshot.SnapshotID)
	if baseProjection.SessionClassification.SessionType != canonicalType {
		t.Fatalf("real base type %q differs from native original %q", baseProjection.SessionClassification.SessionType, originalType)
	}
	if baseProjection.SessionClassification.WeatherConditions != trimmedOriginalWeather {
		t.Fatalf("real base weather %q differs from trimmed native original %q", baseProjection.SessionClassification.WeatherConditions, originalWeather)
	}

	// Primera revisión: solo etiqueta climática, con los tres grupos explícitos (v3).
	weatherCorrection := telemetryanalysis.ClassificationCorrection{Base: base, Field: telemetryanalysis.ClassificationFieldWeatherConditions, ExpectedOriginal: originalWeather, Replacement: weatherReplacement, Reason: "reversible validation of real recorded classification label", Provenance: telemetryanalysis.ClassificationProvenanceManual}
	weatherRequest := TelemetryAnalysisCorrectionSaveRequest{SessionID: opened.SessionID, Base: base,
		Corrections: []telemetryanalysis.SampleValueCorrection{}, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{},
		Classifications: []telemetryanalysis.ClassificationCorrection{weatherCorrection},
		Command:         telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: head, CommandID: "real-classification-weather", Reason: "validate recorded classification revision roundtrip", LocalAuthorID: "local-validation"},
	}
	weatherSaved := recordedRealClassificationSave(t, ctx, svc, weatherRequest, "analysis.mixed-snapshot.v3")
	if len(weatherSaved.Revision.Snapshot.Classifications) != 1 {
		t.Fatalf("real weather save lacks its decision: %+v", weatherSaved.Revision.Snapshot)
	}
	if weatherSaved.HeadID == head {
		t.Fatal("real weather head did not advance")
	}
	resolvedWeather, err := svc.ResolveCorrectionCommand(ctx, weatherRequest)
	if err != nil || !resolvedWeather.Found || resolvedWeather.Revision == nil || resolvedWeather.Revision.RevisionID != weatherSaved.Revision.RevisionID {
		t.Fatalf("real weather resolve: %v, found %v", err, resolvedWeather.Found)
	}
	replayWeather, err := svc.SaveCorrections(ctx, weatherRequest)
	if err != nil || replayWeather.Revision.RevisionID != weatherSaved.Revision.RevisionID || replayWeather.HeadID != weatherSaved.HeadID {
		t.Fatalf("real weather replay: %v", err)
	}
	weatherProjection := recordedRealClassificationProject(t, ctx, svc, opened.SessionID, base, weatherSaved.Revision.RevisionID)
	assertRecordedRealProjectionRef(t, "weather", weatherProjection, base, baseDigest, weatherSaved.Revision.RevisionID, weatherSaved.Revision.Snapshot.SnapshotID)
	if weatherProjection.SessionClassification.SessionType != canonicalType {
		t.Fatalf("real weather revision changed type: %+v", weatherProjection.SessionClassification)
	}
	if weatherProjection.SessionClassification.WeatherConditions != weatherReplacement {
		t.Fatalf("real weather revision lost validation label: %+v", weatherProjection.SessionClassification)
	}
	if !reflect.DeepEqual(weatherProjection.SessionClassification.UsableForFamilies, baseProjection.SessionClassification.UsableForFamilies) {
		t.Fatal("weather validation label changed preliminary family usability")
	}
	assertRecordedRealClassificationPreserved(t, "weather", baseProjection, weatherProjection)
	assertRecordedRealClassificationProjectionEqual(t, "weather", baseProjection, weatherProjection, true, false)

	// Segunda revisión: conserva la etiqueta y cambia a otro tipo cerrado.
	// La elegibilidad preliminar de observed_strategy NO conserva el false del
	// original: se recalcula con el tipo de validación y el gate preliminar de
	// vuelta completa (elegibilidad base de FamilyLapValidity).
	typeCorrection := telemetryanalysis.ClassificationCorrection{Base: base, Field: telemetryanalysis.ClassificationFieldSessionType, ExpectedOriginal: originalType, Replacement: typeReplacement, Reason: "reversible validation of real recorded session type", Provenance: telemetryanalysis.ClassificationProvenanceManual}
	typeRequest := TelemetryAnalysisCorrectionSaveRequest{SessionID: opened.SessionID, Base: base,
		Corrections: []telemetryanalysis.SampleValueCorrection{}, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{},
		Classifications: []telemetryanalysis.ClassificationCorrection{weatherCorrection, typeCorrection},
		Command:         telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: weatherSaved.HeadID, CommandID: "real-classification-type", Reason: "validate recorded type revision roundtrip", LocalAuthorID: "local-validation"},
	}
	typeSaved := recordedRealClassificationSave(t, ctx, svc, typeRequest, "analysis.mixed-snapshot.v3")
	if len(typeSaved.Revision.Snapshot.Classifications) != 2 {
		t.Fatalf("real type save lacks its decisions: %+v", typeSaved.Revision.Snapshot)
	}
	typeProjection := recordedRealClassificationProject(t, ctx, svc, opened.SessionID, base, typeSaved.Revision.RevisionID)
	assertRecordedRealProjectionRef(t, "type", typeProjection, base, baseDigest, typeSaved.Revision.RevisionID, typeSaved.Revision.Snapshot.SnapshotID)
	if typeProjection.SessionClassification.SessionType != typeReplacement {
		t.Fatalf("real type revision lost validation type: %+v", typeProjection.SessionClassification)
	}
	if typeProjection.SessionClassification.WeatherConditions != weatherReplacement {
		t.Fatalf("real type revision lost validation label: %+v", typeProjection.SessionClassification)
	}
	// lap_validity usable es el gate preliminar de vuelta completa: el resto de
	// familias lo comparte y solo observed_strategy añade la puerta de carrera.
	completeLapGate := containsFamily(baseProjection.SessionClassification.UsableForFamilies, string(telemetryanalysis.FamilyLapValidity))
	wantUsable := append([]string{}, baseProjection.SessionClassification.UsableForFamilies...)
	if typeReplacement == "race" && completeLapGate {
		if !containsFamily(wantUsable, observed) {
			wantUsable = append(wantUsable, observed)
		}
	} else {
		wantUsable = withoutObservedStrategy(wantUsable)
	}
	sort.Strings(wantUsable)
	if !reflect.DeepEqual(typeProjection.SessionClassification.UsableForFamilies, wantUsable) {
		t.Fatalf("real type revision usability is not exactly base with only observed_strategy changed: %+v", typeProjection.SessionClassification.UsableForFamilies)
	}
	assertRecordedRealClassificationPreserved(t, "type", baseProjection, typeProjection)
	assertRecordedRealClassificationProjectionEqual(t, "type", baseProjection, typeProjection, true, true)

	// Restauración explícita de ambos grupos como nueva cabeza: por contrato
	// vuelve a v1, no se queda en v3.
	restoreRequest := TelemetryAnalysisCorrectionSaveRequest{SessionID: opened.SessionID, Base: base,
		Corrections: []telemetryanalysis.SampleValueCorrection{}, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{}, Classifications: []telemetryanalysis.ClassificationCorrection{},
		Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: typeSaved.HeadID, CommandID: "real-classification-restore", Reason: "restore original recorded classification", LocalAuthorID: "local-validation"},
	}
	restored := recordedRealClassificationSave(t, ctx, svc, restoreRequest, "analysis.sample-snapshot.v1")
	if len(restored.Revision.Snapshot.Corrections) != 0 || len(restored.Revision.Snapshot.FamilyUses) != 0 || len(restored.Revision.Snapshot.Classifications) != 0 {
		t.Fatal("explicit restoration retained decisions")
	}
	if restored.HeadID == typeSaved.HeadID {
		t.Fatal("real restore head did not advance")
	}
	restoredProjection := recordedRealClassificationProject(t, ctx, svc, opened.SessionID, base, restored.Revision.RevisionID)
	assertRecordedRealProjectionRef(t, "restore", restoredProjection, base, baseDigest, restored.Revision.RevisionID, restored.Revision.Snapshot.SnapshotID)
	if restoredProjection.SessionClassification.SessionType != baseProjection.SessionClassification.SessionType ||
		restoredProjection.SessionClassification.WeatherConditions != baseProjection.SessionClassification.WeatherConditions ||
		!reflect.DeepEqual(restoredProjection.SessionClassification.UsableForFamilies, baseProjection.SessionClassification.UsableForFamilies) {
		t.Fatalf("real restore lost original labels: %+v", restoredProjection.SessionClassification)
	}
	assertRecordedRealClassificationPreserved(t, "restore", baseProjection, restoredProjection)
	assertRecordedRealClassificationProjectionEqual(t, "restore", baseProjection, restoredProjection, false, false)

	// Tras avanzar la cabeza, el primer comando devuelve su revisión inicial y la cabeza avanzada.
	resolvedOld, err := svc.ResolveCorrectionCommand(ctx, weatherRequest)
	if err != nil || !resolvedOld.Found || resolvedOld.Revision == nil || resolvedOld.Revision.RevisionID != weatherSaved.Revision.RevisionID || resolvedOld.HeadID != restored.HeadID {
		t.Fatalf("real old command resolve after head advance: %+v, %v", resolvedOld, err)
	}
	replayOld, err := svc.SaveCorrections(ctx, weatherRequest)
	if err != nil || replayOld.Revision.RevisionID != weatherSaved.Revision.RevisionID || replayOld.HeadID != restored.HeadID {
		t.Fatalf("real old command replay after head advance: %+v, %v", replayOld, err)
	}

	// Cierre y reapertura reales: revisión cargada completa igual a la
	// guardada, proyección histórica completa igual a la previa al cierre
	// (normalizando solo GeneratedAt), cabeza restaurada y metadatos
	// originales intactos.
	if err := svc.CloseSession(opened.SessionID); err != nil {
		t.Fatal(err)
	}
	reopened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidateID, UserApproved: true})
	if err != nil {
		t.Fatalf("real classification reopen: %v", err)
	}
	if !reflect.DeepEqual(reopened.Session.Metadata, opened.Session.Metadata) {
		t.Fatal("real original metadata changed after classification revisions and reopen")
	}
	headLoaded, err = svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: reopened.SessionID, Base: base})
	if err != nil || headLoaded.HeadID != restored.HeadID || !reflect.DeepEqual(headLoaded.Revision, restored.Revision) {
		t.Fatalf("real restored head lost after reopen: %+v, %v", headLoaded, err)
	}
	history := []struct {
		name   string
		saved  telemetryanalysis.CorrectionStoreResult
		before strategyprojection.StrategyInputProjectionV2
	}{
		{"weather", weatherSaved, weatherProjection},
		{"type", typeSaved, typeProjection},
		{"restore", restored, restoredProjection},
	}
	for _, want := range history {
		loaded, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: reopened.SessionID, Base: base, RevisionID: want.saved.Revision.RevisionID})
		if err != nil || loaded.HeadID != restored.HeadID || !reflect.DeepEqual(loaded.Revision, want.saved.Revision) {
			t.Fatalf("real historical revision %s changed after reopen: %+v, %v", want.name, loaded, err)
		}
		again := recordedRealClassificationProject(t, ctx, svc, reopened.SessionID, base, want.saved.Revision.RevisionID)
		again.GeneratedAt = want.before.GeneratedAt
		if !reflect.DeepEqual(again, want.before) {
			t.Fatalf("real historical projection %s changed after reopen", want.name)
		}
	}
	t.Logf("real classification roundtrip verified: weather %s, type %s, explicit restore %s, exact history after reopen", weatherSaved.Revision.RevisionID, typeSaved.Revision.RevisionID, restored.Revision.RevisionID)
	return reopened.SessionID, restored.HeadID
}

// verifyRecordedRealIdentityRevision retargets only the native identity fields
// that differ from a second, authorized LMU combination. The target tuple and
// ID come from the shared Analysis catalog; neither is supplied as free text.
func verifyRecordedRealIdentityRevision(t *testing.T, ctx context.Context, svc *TelemetryAnalysisService, opened TelemetryAnalysisOpenedSession, base telemetryanalysis.SourceAnalysisRef, head, candidateID string, target telemetryanalysis.CombinationIdentity) (string, string) {
	t.Helper()
	if target.SimID != telemetryanalysis.SimIDLMU {
		t.Skipf("real target simulator %q is outside the LMU identity bank", target.SimID)
	}
	baseLoaded, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: opened.SessionID, Base: base, RevisionID: head})
	if err != nil {
		t.Fatalf("real identity base load: %v", err)
	}
	baseProjection := recordedRealClassificationProject(t, ctx, svc, opened.SessionID, base, head)
	baseDigest, err := base.Digest()
	if err != nil {
		t.Fatalf("real identity base digest: %v", err)
	}
	assertRecordedRealProjectionRef(t, "identity base", baseProjection, base, baseDigest, head, baseLoaded.Revision.Snapshot.SnapshotID)
	if baseProjection.CombinationID == target.ID {
		t.Skip("real primary and target sources have the same canonical combination; identity bank needs two distinct combinations")
	}

	type identityField struct {
		field        telemetryanalysis.ClassificationField
		key, display string
		replacement  string
	}
	fields := []identityField{
		{telemetryanalysis.ClassificationFieldTrackName, "trackname", "TrackName", target.TrackName},
		{telemetryanalysis.ClassificationFieldTrackLayout, "tracklayout", "TrackLayout", target.TrackLayout},
		{telemetryanalysis.ClassificationFieldCarName, "carname", "CarName", target.CarName},
		{telemetryanalysis.ClassificationFieldCarClass, "carclass", "CarClass", target.CarClass},
	}
	const reason = "retarget real recorded identity to an authorized LMU combination"
	corrections := make([]telemetryanalysis.ClassificationCorrection, 0, len(fields))
	for _, field := range fields {
		original := recordedRealClassificationOriginal(t, opened.Session.Metadata, field.key, field.display)
		if strings.TrimSpace(original) == field.replacement {
			continue
		}
		corrections = append(corrections, telemetryanalysis.ClassificationCorrection{
			Base: base, Field: field.field, ExpectedOriginal: original, Replacement: field.replacement,
			Reason: reason, Provenance: telemetryanalysis.ClassificationProvenanceManual, CanonicalCombinationID: target.ID,
		})
	}
	if len(corrections) == 0 {
		t.Skip("real primary and target sources expose no differing identity fields")
	}

	request := TelemetryAnalysisCorrectionSaveRequest{
		SessionID: opened.SessionID, Base: base,
		Corrections: []telemetryanalysis.SampleValueCorrection{}, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{}, Classifications: corrections,
		Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: head, CommandID: "real-classification-identity", Reason: reason, LocalAuthorID: "local-validation"},
	}
	saved := recordedRealClassificationSave(t, ctx, svc, request, "analysis.mixed-snapshot.v4")
	if saved.HeadID == head || saved.Revision.Snapshot.CanonicalCombination == nil || !reflect.DeepEqual(*saved.Revision.Snapshot.CanonicalCombination, target) {
		t.Fatalf("real identity save lost exact canonical target: %+v", saved.Revision.Snapshot.CanonicalCombination)
	}
	if len(saved.Revision.Snapshot.Classifications) != len(corrections) {
		t.Fatalf("real identity save retained %d decisions, want %d", len(saved.Revision.Snapshot.Classifications), len(corrections))
	}
	resolved, err := svc.ResolveCorrectionCommand(ctx, request)
	if err != nil || !resolved.Found || resolved.Revision == nil || !reflect.DeepEqual(*resolved.Revision, saved.Revision) {
		t.Fatalf("real identity resolve: %+v, %v", resolved, err)
	}
	replayed, err := svc.SaveCorrections(ctx, request)
	if err != nil || !reflect.DeepEqual(replayed, saved) {
		t.Fatalf("real identity replay: %+v, %v", replayed, err)
	}
	projected := recordedRealClassificationProject(t, ctx, svc, opened.SessionID, base, saved.Revision.RevisionID)
	assertRecordedRealProjectionRef(t, "identity", projected, base, baseDigest, saved.Revision.RevisionID, saved.Revision.Snapshot.SnapshotID)
	if projected.CombinationID != target.ID || projected.SessionClassification.TrackName != target.TrackName || projected.SessionClassification.TrackLayout != target.TrackLayout || projected.SessionClassification.CarName != target.CarName || projected.SessionClassification.CarClass != target.CarClass {
		t.Fatalf("real identity projection is not the exact target: %+v", projected.SessionClassification)
	}
	assertRecordedRealIdentityProjectionEqual(t, "identity", baseProjection, projected)

	if err := svc.CloseSession(opened.SessionID); err != nil {
		t.Fatal(err)
	}
	reopened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidateID, UserApproved: true})
	if err != nil {
		t.Fatalf("real identity reopen: %v", err)
	}
	if !reflect.DeepEqual(reopened.Session.Metadata, opened.Session.Metadata) {
		t.Fatal("real original metadata changed after identity revision and reopen")
	}
	loaded, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: reopened.SessionID, Base: base, RevisionID: saved.Revision.RevisionID})
	if err != nil || loaded.HeadID != saved.HeadID || !reflect.DeepEqual(loaded.Revision, saved.Revision) {
		t.Fatalf("real identity history changed after reopen: %+v, %v", loaded, err)
	}
	again := recordedRealClassificationProject(t, ctx, svc, reopened.SessionID, base, saved.Revision.RevisionID)
	again.GeneratedAt = projected.GeneratedAt
	if !reflect.DeepEqual(again, projected) {
		t.Fatal("real identity historical projection changed after reopen")
	}

	restoreRequest := TelemetryAnalysisCorrectionSaveRequest{
		SessionID: reopened.SessionID, Base: base,
		Corrections: []telemetryanalysis.SampleValueCorrection{}, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{}, Classifications: []telemetryanalysis.ClassificationCorrection{},
		Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "real-classification-identity-restore", Reason: "restore original recorded identity", LocalAuthorID: "local-validation"},
	}
	restored := recordedRealClassificationSave(t, ctx, svc, restoreRequest, "analysis.sample-snapshot.v1")
	if restored.HeadID == saved.HeadID || restored.Revision.Snapshot.CanonicalCombination != nil || len(restored.Revision.Snapshot.Classifications) != 0 {
		t.Fatalf("real identity restore retained identity state: %+v", restored.Revision.Snapshot)
	}
	restoredProjection := recordedRealClassificationProject(t, ctx, svc, reopened.SessionID, base, restored.Revision.RevisionID)
	assertRecordedRealProjectionRef(t, "identity restore", restoredProjection, base, baseDigest, restored.Revision.RevisionID, restored.Revision.Snapshot.SnapshotID)
	assertRecordedRealClassificationPreserved(t, "identity restore", baseProjection, restoredProjection)
	assertRecordedRealClassificationProjectionEqual(t, "identity restore", baseProjection, restoredProjection, false, false)
	historic, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: reopened.SessionID, Base: base, RevisionID: saved.Revision.RevisionID})
	if err != nil || historic.HeadID != restored.HeadID || !reflect.DeepEqual(historic.Revision, saved.Revision) {
		t.Fatalf("real identity v4 history lost after restore: %+v, %v", historic, err)
	}
	t.Logf("real identity v4 roundtrip verified: target %s, revision %s, restore %s", target.ID, saved.Revision.RevisionID, restored.Revision.RevisionID)
	return reopened.SessionID, restored.HeadID
}

// recordedRealClassificationOriginal consulta el original nativo exacto de un
// campo: una sola entrada válida, no sensible ni redactada, con valor en bruto
// sin recortar. Si la fuente no ofrece esa condición, expone el límite sin
// fabricar ni sustituir el dato.
func recordedRealClassificationOriginal(t *testing.T, metadata []telemetryanalysis.HistoricalMetadata, key, display string) string {
	t.Helper()
	raw := ""
	found := 0
	for _, entry := range metadata {
		if strings.ToLower(strings.TrimSpace(entry.Key)) != key {
			continue
		}
		found++
		raw = entry.Value
		if !entry.Present || entry.Sensitive || entry.Redacted || entry.Quality != telemetryanalysis.QualityValid || !utf8.ValidString(entry.Value) || strings.TrimSpace(entry.Value) == "" {
			t.Skipf("real source %s precondition unavailable; bank limit without fabricated data", display)
		}
	}
	if found != 1 {
		t.Skipf("real source has %d %s originals, need exactly one; bank limit without fabricated data", found, display)
	}
	return raw
}

func recordedRealClassificationProject(t *testing.T, ctx context.Context, svc *TelemetryAnalysisService, sessionID string, base telemetryanalysis.SourceAnalysisRef, revisionID string) strategyprojection.StrategyInputProjectionV2 {
	t.Helper()
	projection, err := svc.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: sessionID, Base: base, RevisionID: revisionID})
	if err != nil {
		t.Fatalf("real classification projection: %v", err)
	}
	if err := projection.Validate(); err != nil {
		t.Fatalf("real classification projection invalid: %v", err)
	}
	return projection
}

// recordedRealClassificationSave guarda y exige la versión de representación
// esperada por llamada (weather/type v3; restore v1), sin debilitar el gate.
func recordedRealClassificationSave(t *testing.T, ctx context.Context, svc *TelemetryAnalysisService, request TelemetryAnalysisCorrectionSaveRequest, wantVersion string) telemetryanalysis.CorrectionStoreResult {
	t.Helper()
	saved, err := svc.SaveCorrections(ctx, request)
	if err != nil {
		t.Fatalf("real classification save: %v", err)
	}
	if saved.Revision.Snapshot.ContractVersion != wantVersion {
		t.Fatalf("real classification save version %v, want %v", saved.Revision.Snapshot.ContractVersion, wantVersion)
	}
	return saved
}

// assertRecordedRealProjectionRef comprueba la referencia completa esperada
// (SessionID, BaseDigest, RevisionID, SnapshotID) con el contrato existente,
// antes de omitir SourceRevisions en la comparación.
func assertRecordedRealProjectionRef(t *testing.T, stage string, got strategyprojection.StrategyInputProjectionV2, base telemetryanalysis.SourceAnalysisRef, baseDigest, revisionID, snapshotID string) {
	t.Helper()
	if len(got.SourceRevisions) != 1 {
		t.Fatalf("real %s projection lost exact source revision", stage)
	}
	want := strategyprojection.AnalysisRevisionRef{SessionID: base.SessionID, BaseDigest: baseDigest, RevisionID: revisionID, SnapshotID: snapshotID}
	if got.SourceRevisions[0] != want {
		t.Fatalf("real %s projection reference mismatch: %+v", stage, got.SourceRevisions[0])
	}
}

func withoutObservedStrategy(families []string) []string {
	rest := make([]string, 0, len(families))
	for _, family := range families {
		if family == string(telemetryanalysis.FamilyObservedStrategy) {
			continue
		}
		rest = append(rest, family)
	}
	return rest
}

// assertRecordedRealClassificationPreserved compara cada familia física. La
// igualdad de ausencia es preservación, no señal útil: nunca se omite una
// familia para obtener PASS y SessionClassification se comprueba aparte.
func assertRecordedRealClassificationPreserved(t *testing.T, stage string, base, got strategyprojection.StrategyInputProjectionV2) {
	t.Helper()
	families := []struct {
		name          string
		before, after any
	}{
		{"lapValidity", base.LapValidity, got.LapValidity},
		{"fuelConsumption", base.FuelConsumption, got.FuelConsumption},
		{"virtualEnergyConsumption", base.VirtualEnergyConsumption, got.VirtualEnergyConsumption},
		{"representativePaceByClimateBucket", base.RepresentativePaceByClimateBucket, got.RepresentativePaceByClimateBucket},
		{"classPace", base.ClassPace, got.ClassPace},
		{"combinedStintPaceCurve", base.CombinedStintPaceCurve, got.CombinedStintPaceCurve},
		{"fuelWeightCurve", base.FuelWeightCurve, got.FuelWeightCurve},
		{"tyreAgeCurve", base.TyreAgeCurve, got.TyreAgeCurve},
		{"tyreDegradation", base.TyreDegradation, got.TyreDegradation},
		{"pit", base.Pit, got.Pit},
		{"savingCost", base.SavingCost, got.SavingCost},
		{"climateBuckets", base.ClimateBuckets, got.ClimateBuckets},
		{"temporal", base.Temporal, got.Temporal},
	}
	for _, family := range families {
		if !reflect.DeepEqual(family.before, family.after) {
			t.Fatalf("real %s revision changed physical family %s", stage, family.name)
		}
	}
}

// assertRecordedRealClassificationProjectionEqual compara la proyección íntegra
// sobre copias: solo se omiten GeneratedAt/SourceRevisions (referencia
// completa verificada por separado) y los campos de clasificación
// intencionalmente modificados (también verificados por separado: etiqueta
// climática y, en la revisión de tipo, SessionType; de UsableForFamilies solo
// puede entrar/salir observed_strategy y el resto se compara exacto). La base
// nunca se muta y SessionClassification se compara por valor, sin clon JSON.
func assertRecordedRealClassificationProjectionEqual(t *testing.T, stage string, base, got strategyprojection.StrategyInputProjectionV2, weatherChanged, typeChanged bool) {
	t.Helper()
	baseCopy, gotCopy := base, got
	gotCopy.GeneratedAt = baseCopy.GeneratedAt
	gotCopy.SourceRevisions = baseCopy.SourceRevisions
	if weatherChanged {
		gotCopy.SessionClassification.WeatherConditions = baseCopy.SessionClassification.WeatherConditions
	}
	if typeChanged {
		gotCopy.SessionClassification.SessionType = baseCopy.SessionClassification.SessionType
		gotCopy.SessionClassification.UsableForFamilies = withoutObservedStrategy(gotCopy.SessionClassification.UsableForFamilies)
		baseCopy.SessionClassification.UsableForFamilies = withoutObservedStrategy(baseCopy.SessionClassification.UsableForFamilies)
	}
	if !reflect.DeepEqual(baseCopy, gotCopy) {
		t.Fatalf("real %s projection differs outside the intended classification change", stage)
	}
}

func assertRecordedRealIdentityProjectionEqual(t *testing.T, stage string, base, got strategyprojection.StrategyInputProjectionV2) {
	t.Helper()
	baseCopy, gotCopy := base, got
	baseAggregate, gotAggregate := "aggregate:"+baseCopy.CombinationID, "aggregate:"+gotCopy.CombinationID
	gotCopy.GeneratedAt = baseCopy.GeneratedAt
	gotCopy.SourceRevisions = baseCopy.SourceRevisions
	gotCopy.CombinationID = baseCopy.CombinationID
	gotCopy.SessionClassification.TrackName = baseCopy.SessionClassification.TrackName
	gotCopy.SessionClassification.TrackLayout = baseCopy.SessionClassification.TrackLayout
	gotCopy.SessionClassification.CarName = baseCopy.SessionClassification.CarName
	gotCopy.SessionClassification.CarClass = baseCopy.SessionClassification.CarClass
	baseJSON, baseErr := json.Marshal(baseCopy)
	gotJSON, gotErr := json.Marshal(gotCopy)
	if baseErr != nil || gotErr != nil {
		t.Fatalf("real %s projection comparison encoding: %v", stage, errors.Join(baseErr, gotErr))
	}
	gotJSON = []byte(strings.ReplaceAll(string(gotJSON), gotAggregate, baseAggregate))
	if string(baseJSON) != string(gotJSON) {
		t.Fatalf("real %s projection differs outside the intended identity change", stage)
	}
}
