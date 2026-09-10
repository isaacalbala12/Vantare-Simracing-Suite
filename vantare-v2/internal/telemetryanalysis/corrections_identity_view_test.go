package telemetryanalysis

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

// T12j4 — vista efectiva de identidad canónica. Un snapshot v4 reconstruye el
// conjunto canónico J1 con el target persistido y el combinador J2, valida
// igualdad completa antes de aplicar y cambia sólo los campos explícitos
// sobre una copia de metadata. La vista nunca porta el target.

func identityViewExample(t *testing.T) (SourceAnalysisRef, []HistoricalPage, LapValidityAnalysis, HistoricalSession, *CombinationIdentity, PreparedSampleCorrectionSnapshot) {
	t.Helper()
	base, validity, family := lapFamilyCorrectionExample(t)
	_, channel, sample, request := correctionExample()
	request.Base = base
	pages := []HistoricalPage{{ChannelID: channel.ID, Samples: []HistoricalSample{sample}}}
	session := mixedSnapshotSession(base)
	session.Channels = []HistoricalChannel{channel}
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base,
		[]SampleCorrectionInput{{Channel: channel, Sample: sample, Request: request}},
		validity, []LapFamilyUseCorrection{family}, session,
		[]ClassificationCorrection{track}, target)
	if err != nil {
		t.Fatal(err)
	}
	return base, pages, validity, session, target, snapshot
}

func identityMetadataByKey(entries []HistoricalMetadata) map[string]HistoricalMetadata {
	got := make(map[string]HistoricalMetadata, len(entries))
	for _, entry := range entries {
		got[entry.Key] = entry
	}
	return got
}

func TestIdentityViewAppliesCanonicalIdentity(t *testing.T) {
	base, pages, validity, session, _, snapshot := identityViewExample(t)
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || snapshot.CanonicalCombination == nil {
		t.Fatalf("fixture v4 inválido: %+v", snapshot)
	}
	before := append([]HistoricalMetadata(nil), session.Metadata...)
	view, err := ApplyMixedCorrectionSnapshot(base, pages, validity, session, snapshot)
	if err != nil {
		t.Fatalf("snapshot v4 válido rechazado: %v", err)
	}
	if view.Base != base || view.SnapshotID != snapshot.SnapshotID {
		t.Fatal("la vista perdió base o identidad de revisión")
	}
	if len(view.Corrections) != 1 || len(view.FamilyUses) != 1 || len(view.Classifications) != 1 || len(view.Metadata) != len(session.Metadata) {
		t.Fatalf("forma de vista v4 incorrecta: %d/%d/%d/%d", len(view.Corrections), len(view.FamilyUses), len(view.Classifications), len(view.Metadata))
	}
	if view.Pages[0].Samples[0].Values[0] != snapshot.Corrections[0].Corrected {
		t.Fatal("escalar no aplicado a las páginas")
	}
	got := identityMetadataByKey(view.Metadata)
	if got["TrackName"].Value != "Monza" {
		t.Fatalf("identidad no aplicada: %+v", got)
	}
	if got["TrackLayout"].Value != "GP" || got["CarName"].Value != "Oreca 07" || got["CarClass"].Value != "LMP2" || got["SessionType"].Value != "race" || got["WeatherConditions"].Value != "Dry" {
		t.Fatalf("metadata no corregida cambió: %+v", got)
	}
	if !got["TrackName"].Present || got["TrackName"].Quality != QualityValid || got["TrackName"].Sensitive || got["TrackName"].Redacted {
		t.Fatalf("el campo corregido perdió calidad/presencia: %+v", got["TrackName"])
	}
	if !reflect.DeepEqual(session.Metadata, before) {
		t.Fatal("la vista mutó la metadata original")
	}
}

func TestIdentityViewAppliesAllFourIdentityFields(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	target := canonicalTestTarget("Autodromo Nazionale Monza", "Autodromo Nazionale Monza", "Ferrari 499P", "Hypercar")
	requests := []ClassificationCorrection{
		canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Autodromo Nazionale Monza"),
		canonicalTestRequest(base, target, ClassificationFieldTrackLayout, "GP", "Autodromo Nazionale Monza"),
		canonicalTestRequest(base, target, ClassificationFieldCarName, "Oreca 07", "Ferrari 499P"),
		canonicalTestRequest(base, target, ClassificationFieldCarClass, "LMP2", "Hypercar"),
	}
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, requests, target)
	if err != nil {
		t.Fatal(err)
	}
	view, err := ApplyMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, session, snapshot)
	if err != nil {
		t.Fatalf("v4 de cuatro campos rechazado: %v", err)
	}
	got := identityMetadataByKey(view.Metadata)
	if got["TrackName"].Value != "Autodromo Nazionale Monza" || got["TrackLayout"].Value != "Autodromo Nazionale Monza" || got["CarName"].Value != "Ferrari 499P" || got["CarClass"].Value != "Hypercar" {
		t.Fatalf("cuatro campos no aplicados: %+v", got)
	}
	if got["SessionType"].Value != "race" || got["WeatherConditions"].Value != "Dry" || len(view.Metadata) != len(session.Metadata) {
		t.Fatal("campos ajenos cambiaron o metadata creció")
	}
	if len(view.Classifications) != 4 || view.SnapshotID != snapshot.SnapshotID {
		t.Fatal("la vista perdió decisiones o identidad")
	}
}

func TestIdentityViewMixesIdentityAndLegacyFields(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	classes := []ClassificationCorrection{
		canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza"),
		classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify"),
		classificationCorrectionRequest(base, ClassificationFieldWeatherConditions, "Dry", "Wet"),
	}
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, classes, target)
	if err != nil {
		t.Fatal(err)
	}
	view, err := ApplyMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, session, snapshot)
	if err != nil {
		t.Fatalf("mezcla identidad+legado rechazada: %v", err)
	}
	got := identityMetadataByKey(view.Metadata)
	if got["TrackName"].Value != "Monza" || got["SessionType"].Value != "qualify" || got["WeatherConditions"].Value != "Wet" {
		t.Fatalf("mezcla no aplicada por completo: %+v", got)
	}
	if got["CarName"].Value != "Oreca 07" || len(view.Classifications) != 3 {
		t.Fatal("campos no corregidos cambiaron o se perdieron decisiones")
	}
}

func TestIdentityViewDetachesViewSnapshotAndTarget(t *testing.T) {
	base, pages, validity, session, target, snapshot := identityViewExample(t)
	before := append([]HistoricalMetadata(nil), session.Metadata...)
	view, err := ApplyMixedCorrectionSnapshot(base, pages, validity, session, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	target.TrackName = "caller mutation"
	if snapshot.CanonicalCombination.TrackName == "caller mutation" {
		t.Fatal("el snapshot comparte el puntero del target del llamador")
	}
	view.Metadata[0].Value = "caller mutation"
	view.Classifications[0].Request.Reason = "caller mutation"
	view.Pages[0].Samples[0].Values[0].Scalar.Number = 999
	if !reflect.DeepEqual(session.Metadata, before) {
		t.Fatal("la vista alias la metadata de la sesión")
	}
	if pages[0].Samples[0].Values[0].Scalar.Number == 999 {
		t.Fatal("la vista alias las páginas originales")
	}
	if snapshot.Classifications[0].Request.Reason == "caller mutation" {
		t.Fatal("la vista alias las decisiones del snapshot")
	}
}

func TestIdentityViewRejectsTamperingAtomically(t *testing.T) {
	fresh := func(t *testing.T) (SourceAnalysisRef, []HistoricalPage, LapValidityAnalysis, HistoricalSession, PreparedSampleCorrectionSnapshot) {
		t.Helper()
		base, pages, validity, session, _, snapshot := identityViewExample(t)
		return base, pages, validity, session, snapshot
	}
	tests := []struct {
		name string
		edit func(*SourceAnalysisRef, *HistoricalSession, *PreparedSampleCorrectionSnapshot)
		want error
		ok   bool
	}{
		{"inalterado", nil, nil, true},
		{"snapshotID manipulado", func(_ *SourceAnalysisRef, _ *HistoricalSession, s *PreparedSampleCorrectionSnapshot) {
			s.SnapshotID = "wrong"
		}, ErrInvalidCorrection, false},
		{"tag rebajado a v3", func(_ *SourceAnalysisRef, _ *HistoricalSession, s *PreparedSampleCorrectionSnapshot) {
			s.ContractVersion = "analysis.mixed-snapshot.v3"
		}, ErrInvalidCorrection, false},
		{"corregido manipulado", func(_ *SourceAnalysisRef, _ *HistoricalSession, s *PreparedSampleCorrectionSnapshot) {
			s.Classifications[0].Corrected = "Otro"
		}, ErrInvalidCorrection, false},
		{"motivo manipulado", func(_ *SourceAnalysisRef, _ *HistoricalSession, s *PreparedSampleCorrectionSnapshot) {
			s.Classifications[0].Request.Reason = "forged"
		}, ErrInvalidCorrection, false},
		{"referencia divergente", func(_ *SourceAnalysisRef, _ *HistoricalSession, s *PreparedSampleCorrectionSnapshot) {
			s.Classifications[0].Request.CanonicalCombinationID = canonicalTestTarget("IMOLA", "GP", "Oreca 07", "LMP2").ID
		}, ErrCorrectionTarget, false},
		{"target ausente con identidad", func(_ *SourceAnalysisRef, _ *HistoricalSession, s *PreparedSampleCorrectionSnapshot) {
			s.CanonicalCombination = nil
		}, ErrCorrectionTarget, false},
		{"target con ID forjado", func(_ *SourceAnalysisRef, _ *HistoricalSession, s *PreparedSampleCorrectionSnapshot) {
			forged := *s.CanonicalCombination
			forged.ID = canonicalTestTarget("IMOLA", "GP", "Oreca 07", "LMP2").ID
			s.CanonicalCombination = &forged
		}, ErrCorrectionTarget, false},
		{"tuple del target alterado", func(_ *SourceAnalysisRef, _ *HistoricalSession, s *PreparedSampleCorrectionSnapshot) {
			mutated := *s.CanonicalCombination
			mutated.TrackName = "Otro"
			s.CanonicalCombination = &mutated
		}, ErrCorrectionTarget, false},
		{"original corregido movido", func(_ *SourceAnalysisRef, session *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			for i := range session.Metadata {
				if session.Metadata[i].Key == "TrackName" {
					session.Metadata[i].Value = "Otro"
				}
			}
		}, ErrCorrectionPrecondition, false},
		{"calidad no utilizable", func(_ *SourceAnalysisRef, session *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			for i := range session.Metadata {
				if session.Metadata[i].Key == "TrackName" {
					session.Metadata[i].Quality = QualityStale
				}
			}
		}, ErrInvalidSessionClassification, false},
		{"metadato sensible", func(_ *SourceAnalysisRef, session *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			for i := range session.Metadata {
				if session.Metadata[i].Key == "TrackName" {
					session.Metadata[i].Sensitive = true
				}
			}
		}, ErrInvalidSessionClassification, false},
		{"metadato duplicado", func(_ *SourceAnalysisRef, session *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			session.Metadata = append(session.Metadata, session.Metadata[0])
		}, ErrInvalidSessionClassification, false},
		{"base extranjera", func(base *SourceAnalysisRef, _ *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			base.ContentSHA256 = strings.Repeat("ef", 32)
		}, ErrCorrectionSourceChanged, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			base, pages, validity, session, snapshot := fresh(t)
			if tt.edit != nil {
				tt.edit(&base, &session, &snapshot)
			}
			view, err := ApplyMixedCorrectionSnapshot(base, pages, validity, session, snapshot)
			if tt.ok {
				if err != nil || view.SnapshotID != snapshot.SnapshotID || len(view.Classifications) != 1 {
					t.Fatalf("control positivo falló: %v", err)
				}
				return
			}
			if !errors.Is(err, tt.want) || !reflect.DeepEqual(view, EffectiveCorrectionView{}) {
				t.Fatalf("llegó %v, se esperaba %v", err, tt.want)
			}
		})
	}
	t.Run("target inerte sin identidad", func(t *testing.T) {
		base, validity, family := lapFamilyCorrectionExample(t)
		_, channel, sample, request := correctionExample()
		request.Base = base
		pages := []HistoricalPage{{ChannelID: channel.ID, Samples: []HistoricalSample{sample}}}
		session := mixedSnapshotSession(base)
		session.Channels = []HistoricalChannel{channel}
		v3, err := PrepareMixedCorrectionSnapshot(base,
			[]SampleCorrectionInput{{Channel: channel, Sample: sample, Request: request}},
			validity, []LapFamilyUseCorrection{family}, session, mixedSnapshotClassRequests(base))
		if err != nil {
			t.Fatal(err)
		}
		v3.CanonicalCombination = canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
		got, err := ApplyMixedCorrectionSnapshot(base, pages, validity, session, v3)
		if !errors.Is(err, ErrInvalidCorrection) || !reflect.DeepEqual(got, EffectiveCorrectionView{}) {
			t.Fatalf("target inerte aceptado: %v", err)
		}
	})
}

func TestIdentityViewKeepsAbsentFieldsAbsent(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	kept := make([]HistoricalMetadata, 0, len(session.Metadata))
	for _, entry := range session.Metadata {
		if entry.Key != "CarClass" {
			kept = append(kept, entry)
		}
	}
	session.Metadata = kept
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "Hypercar")
	track := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, []ClassificationCorrection{track}, target)
	if err != nil {
		t.Fatalf("identidad válida con otra metadata ausente rechazada: %v", err)
	}
	view, err := ApplyMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, session, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	got := identityMetadataByKey(view.Metadata)
	if got["TrackName"].Value != "Monza" {
		t.Fatal("campo válido no aplicado")
	}
	if _, present := got["CarClass"]; present || len(view.Metadata) != len(session.Metadata) {
		t.Fatal("la vista inventó la metadata ausente")
	}
	if _, err := ClassifyHistoricalSession(session); !errors.Is(err, ErrInvalidSessionClassification) {
		t.Fatalf("la ausencia dejó de bloquear la clasificación global: %v", err)
	}
	effective := session
	effective.Metadata = view.Metadata
	if _, err := ClassifyHistoricalSession(effective); !errors.Is(err, ErrInvalidSessionClassification) {
		t.Fatalf("la vista parcial habilitó la clasificación global: %v", err)
	}
}
