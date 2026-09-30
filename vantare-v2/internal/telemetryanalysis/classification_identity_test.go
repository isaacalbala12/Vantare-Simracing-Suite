package telemetryanalysis

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

// T12j1 — preparación pura de identidad canónica. Fixtures unitarios, sin
// banco, catálogo, custodia ni autorización real.

func canonicalTestTarget(track, layout, car, class string) *CombinationIdentity {
	target := &CombinationIdentity{SimID: SimIDLMU, TrackName: track, TrackLayout: layout, CarName: car, CarClass: class}
	target.ID = combinationID(CombinationIdentity{SimID: target.SimID, TrackName: track, TrackLayout: layout, CarName: car, CarClass: class})
	return target
}

func canonicalTestRequest(base SourceAnalysisRef, target *CombinationIdentity, field ClassificationField, expected, replacement string) ClassificationCorrection {
	request := classificationCorrectionRequest(base, field, expected, replacement)
	request.CanonicalCombinationID = target.ID
	return request
}

func TestPrepareCanonicalSet_AcceptsFourIdentityFields(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	target := canonicalTestTarget("Autodromo Nazionale Monza", "Autodromo Nazionale Monza", "Ferrari 499P", "Hypercar")
	requests := []ClassificationCorrection{
		canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Autodromo Nazionale Monza"),
		canonicalTestRequest(base, target, ClassificationFieldTrackLayout, "GP", "Autodromo Nazionale Monza"),
		canonicalTestRequest(base, target, ClassificationFieldCarName, "Oreca 07", "Ferrari 499P"),
		canonicalTestRequest(base, target, ClassificationFieldCarClass, "LMP2", "Hypercar"),
	}
	prepared, err := PrepareCanonicalClassificationCorrectionSet(base, session, requests, target)
	if err != nil {
		t.Fatalf("conjunto coherente rechazado: %v", err)
	}
	if len(prepared) != 4 {
		t.Fatalf("se esperaban 4 preparadas, llegaron %d", len(prepared))
	}
	wantBaseID, err := base.Digest()
	if err != nil {
		t.Fatalf("base de prueba inválida: %v", err)
	}
	wantOrder := []ClassificationField{ClassificationFieldCarClass, ClassificationFieldCarName, ClassificationFieldTrackLayout, ClassificationFieldTrackName}
	wantCorrected := map[ClassificationField]string{
		ClassificationFieldTrackName: "Autodromo Nazionale Monza", ClassificationFieldTrackLayout: "Autodromo Nazionale Monza",
		ClassificationFieldCarName: "Ferrari 499P", ClassificationFieldCarClass: "Hypercar",
	}
	for i, p := range prepared {
		if p.Request.Field != wantOrder[i] {
			t.Fatalf("orden canónico roto en %d: %q", i, p.Request.Field)
		}
		if p.BaseID != wantBaseID || p.CorrectionID == "" {
			t.Fatalf("identidades incompletas: %+v", p)
		}
		if p.Request.CanonicalCombinationID != target.ID {
			t.Fatalf("referencia perdida: %+v", p)
		}
		if p.Corrected != wantCorrected[p.Request.Field] {
			t.Fatalf("corregido no idéntico al target: %+v", p)
		}
	}
}

func TestPrepareCanonicalSet_UnicodeCaseSpaces(t *testing.T) {
	base := classificationCorrectionBase()
	t.Run("mayúsculas y Unicode se conservan", func(t *testing.T) {
		session := classificationCorrectionSession()
		target := canonicalTestTarget("Autódromo José Carlos Pace", "GP", "ORECA 07", "LMP2")
		requests := []ClassificationCorrection{
			canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "  Autódromo José Carlos Pace  "),
			canonicalTestRequest(base, target, ClassificationFieldCarName, "Oreca 07", "ORECA 07"),
		}
		prepared, err := PrepareCanonicalClassificationCorrectionSet(base, session, requests, target)
		if err != nil {
			t.Fatalf("nombres con case/Unicode/espacios rechazados: %v", err)
		}
		if prepared[0].Corrected != "ORECA 07" || prepared[1].Corrected != "Autódromo José Carlos Pace" {
			t.Fatalf("case o recorte alterados: %+v", prepared)
		}
	})
	t.Run("el ID conserva case", func(t *testing.T) {
		lower := combinationID(CombinationIdentity{SimID: SimIDLMU, TrackName: "imola", TrackLayout: "GP", CarName: "Oreca 07", CarClass: "LMP2"})
		upper := combinationID(CombinationIdentity{SimID: SimIDLMU, TrackName: "IMOLA", TrackLayout: "GP", CarName: "Oreca 07", CarClass: "LMP2"})
		if lower == upper {
			t.Fatal("el algoritmo perdió case en el ID")
		}
	})
	t.Run("reemplazo con case distinto se rechaza", func(t *testing.T) {
		session := classificationCorrectionSession()
		target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
		request := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "monza")
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{request}, target); !errors.Is(err, ErrCorrectionValue) {
			t.Fatalf("se esperaba ErrCorrectionValue, llegó %v", err)
		}
	})
	t.Run("reemplazo vacío tras recorte se rechaza", func(t *testing.T) {
		session := classificationCorrectionSession()
		target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
		request := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "   ")
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{request}, target); !errors.Is(err, ErrCorrectionValue) {
			t.Fatalf("se esperaba ErrCorrectionValue, llegó %v", err)
		}
	})
}

func TestPrepareCanonicalSet_TargetGates(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	other := canonicalTestTarget("IMOLA", "GP", "Oreca 07", "LMP2")
	track := func() ClassificationCorrection {
		return canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	}
	forged := *target
	forged.ID = other.ID
	nonLMU := *target
	nonLMU.SimID = "otro-simulador"
	nonLMU.ID = combinationID(CombinationIdentity{SimID: nonLMU.SimID, TrackName: nonLMU.TrackName, TrackLayout: nonLMU.TrackLayout, CarName: nonLMU.CarName, CarClass: nonLMU.CarClass})
	emptyField := *target
	emptyField.CarClass = ""
	emptyField.ID = combinationID(CombinationIdentity{SimID: emptyField.SimID, TrackName: emptyField.TrackName, TrackLayout: emptyField.TrackLayout, CarName: emptyField.CarName, CarClass: emptyField.CarClass})
	missingRef := classificationCorrectionRequest(base, ClassificationFieldTrackName, "Imola", "Monza")
	divergent := track()
	divergent.CanonicalCombinationID = other.ID
	withOldRef := classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify")
	withOldRef.CanonicalCombinationID = target.ID
	oldOnly := classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify")
	tests := []struct {
		name     string
		requests []ClassificationCorrection
		target   *CombinationIdentity
		want     error
	}{
		{"target ausente", []ClassificationCorrection{track()}, nil, ErrCorrectionTarget},
		{"target forjado", []ClassificationCorrection{canonicalTestRequest(base, &forged, ClassificationFieldTrackName, "Imola", "Monza")}, &forged, ErrCorrectionTarget},
		{"target no LMU", []ClassificationCorrection{track()}, &nonLMU, ErrCorrectionTarget},
		{"target incompleto", []ClassificationCorrection{track()}, &emptyField, ErrCorrectionTarget},
		{"referencia ausente", []ClassificationCorrection{missingRef}, target, ErrInvalidCorrection},
		{"referencia divergente", []ClassificationCorrection{divergent}, target, ErrCorrectionTarget},
		{"referencia en campo antiguo", []ClassificationCorrection{withOldRef}, target, ErrCorrectionTarget},
		{"target inerte sin identidad", []ClassificationCorrection{oldOnly}, target, ErrInvalidCorrection},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, tc.requests, tc.target); !errors.Is(err, tc.want) {
				t.Fatalf("se esperaba %v, llegó %v", tc.want, err)
			}
		})
	}
}

func TestPrepareCanonicalSet_UncorrectedCoherence(t *testing.T) {
	base := classificationCorrectionBase()
	coherent := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := canonicalTestRequest(base, coherent, ClassificationFieldTrackName, "Imola", "Monza")
	mutateMetadata := func(mutate func(*HistoricalMetadata)) HistoricalSession {
		session := classificationCorrectionSession()
		for i := range session.Metadata {
			mutate(&session.Metadata[i])
		}
		return session
	}
	t.Run("no corregido utilizable debe concordar", func(t *testing.T) {
		session := classificationCorrectionSession()
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{track}, coherent); err != nil {
			t.Fatalf("conjunto coherente rechazado: %v", err)
		}
		shifted := canonicalTestTarget("Monza", "GP", "Oreca 07", "Hypercar")
		shiftedTrack := canonicalTestRequest(base, shifted, ClassificationFieldTrackName, "Imola", "Monza")
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{shiftedTrack}, shifted); !errors.Is(err, ErrCorrectionPrecondition) {
			t.Fatalf("se esperaba ErrCorrectionPrecondition, llegó %v", err)
		}
	})
	t.Run("no corregido ausente o privado no bloquea", func(t *testing.T) {
		shifted := canonicalTestTarget("Monza", "GP", "Oreca 07", "Hypercar")
		shiftedTrack := canonicalTestRequest(base, shifted, ClassificationFieldTrackName, "Imola", "Monza")
		withoutClass := mutateMetadata(func(e *HistoricalMetadata) {})
		kept := withoutClass.Metadata[:0]
		for _, e := range withoutClass.Metadata {
			if !strings.EqualFold(strings.TrimSpace(e.Key), "carclass") {
				kept = append(kept, e)
			}
		}
		withoutClass.Metadata = kept
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, withoutClass, []ClassificationCorrection{shiftedTrack}, shifted); err != nil {
			t.Fatalf("ausente bloqueó otro campo válido: %v", err)
		}
		sensitive := mutateMetadata(func(e *HistoricalMetadata) {
			if strings.EqualFold(strings.TrimSpace(e.Key), "carclass") {
				e.Sensitive = true
			}
		})
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, sensitive, []ClassificationCorrection{shiftedTrack}, shifted); err != nil {
			t.Fatalf("privado bloqueó otro campo válido: %v", err)
		}
		duplicated := mutateMetadata(func(e *HistoricalMetadata) {})
		duplicated.Metadata = append(duplicated.Metadata, HistoricalMetadata{Key: "CarClass", Present: true, Value: "LMP2", Quality: QualityValid})
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, duplicated, []ClassificationCorrection{shiftedTrack}, shifted); err != nil {
			t.Fatalf("duplicado bloqueó otro campo válido: %v", err)
		}
		// La parcialidad no declara validez global: sin CarClass la sesión no clasifica.
		if _, err := ClassifyHistoricalSession(withoutClass); !errors.Is(err, ErrInvalidSessionClassification) {
			t.Fatalf("la ausencia dejó de bloquear la clasificación global: %v", err)
		}
	})
	t.Run("mezcla identidad y campo antiguo", func(t *testing.T) {
		session := classificationCorrectionSession()
		mixed := []ClassificationCorrection{track, classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify")}
		prepared, err := PrepareCanonicalClassificationCorrectionSet(base, session, mixed, coherent)
		if err != nil {
			t.Fatalf("mezcla válida rechazada: %v", err)
		}
		if len(prepared) != 2 || prepared[0].Request.Field != ClassificationFieldSessionType || prepared[1].Request.Field != ClassificationFieldTrackName {
			t.Fatalf("orden o contenido inesperados: %+v", prepared)
		}
	})
}

func TestPrepareCanonicalSet_TargetWhitespace(t *testing.T) {
	base := classificationCorrectionBase()
	rawTarget := func(track, layout, car, class string) *CombinationIdentity {
		target := &CombinationIdentity{SimID: SimIDLMU, TrackName: track, TrackLayout: layout, CarName: car, CarClass: class}
		target.ID = combinationID(CombinationIdentity{SimID: target.SimID, TrackName: track, TrackLayout: layout, CarName: car, CarClass: class})
		return target
	}
	t.Run("solo espacios con ID coherente se rechaza", func(t *testing.T) {
		target := rawTarget("   ", "GP", "Ferrari 499P", "LMP2")
		session := classificationCorrectionSession()
		filtered := make([]HistoricalMetadata, 0, len(session.Metadata))
		for _, e := range session.Metadata {
			if !strings.EqualFold(strings.TrimSpace(e.Key), "trackname") {
				filtered = append(filtered, e)
			}
		}
		session.Metadata = filtered
		car := classificationCorrectionRequest(base, ClassificationFieldCarName, "Oreca 07", "Ferrari 499P")
		car.CanonicalCombinationID = target.ID
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{car}, target); !errors.Is(err, ErrCorrectionTarget) {
			t.Fatalf("se esperaba ErrCorrectionTarget, llegó %v", err)
		}
	})
	t.Run("relleno con ID bruto se rechaza", func(t *testing.T) {
		padded := rawTarget("  Monza  ", "GP", "Oreca 07", "LMP2")
		session := classificationCorrectionSession()
		track := classificationCorrectionRequest(base, ClassificationFieldTrackName, "Imola", "Monza")
		track.CanonicalCombinationID = padded.ID
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{track}, padded); !errors.Is(err, ErrCorrectionTarget) {
			t.Fatalf("se esperaba ErrCorrectionTarget, llegó %v", err)
		}
	})
	t.Run("origen RAW con espacios y target recortado", func(t *testing.T) {
		session := classificationCorrectionSession()
		for i := range session.Metadata {
			if strings.EqualFold(strings.TrimSpace(session.Metadata[i].Key), "trackname") {
				session.Metadata[i].Value = "  Imola  "
			}
		}
		target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
		track := canonicalTestRequest(base, target, ClassificationFieldTrackName, "  Imola  ", "Monza")
		prepared, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{track}, target)
		if err != nil {
			t.Fatalf("origen con espacios legítimo rechazado: %v", err)
		}
		if len(prepared) != 1 || prepared[0].Original != "  Imola  " || prepared[0].Corrected != "Monza" {
			t.Fatalf("original RAW no preservado: %+v", prepared)
		}
	})
}

func TestPrepareCanonicalSet_CorrectedFieldGates(t *testing.T) {
	base := classificationCorrectionBase()
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	full := classificationCorrectionMetadata()
	mutate := func(mutate func(*HistoricalMetadata)) []HistoricalMetadata {
		result := make([]HistoricalMetadata, 0, len(full))
		for _, e := range full {
			if strings.EqualFold(strings.TrimSpace(e.Key), "trackname") {
				mutate(&e)
			}
			result = append(result, e)
		}
		return result
	}
	without := func() []HistoricalMetadata {
		result := make([]HistoricalMetadata, 0, len(full))
		for _, e := range full {
			if !strings.EqualFold(strings.TrimSpace(e.Key), "trackname") {
				result = append(result, e)
			}
		}
		return result
	}
	tests := []struct {
		name     string
		metadata []HistoricalMetadata
	}{
		{"ausente", without()},
		{"duplicado", append(append([]HistoricalMetadata{}, full...), HistoricalMetadata{Key: "TrackName", Present: true, Value: "Imola", Quality: QualityValid})},
		{"sensible", mutate(func(e *HistoricalMetadata) { e.Sensitive = true })},
		{"redactado", mutate(func(e *HistoricalMetadata) { e.Redacted = true })},
		{"stale", mutate(func(e *HistoricalMetadata) { e.Quality = QualityStale })},
		{"missing", mutate(func(e *HistoricalMetadata) { e.Quality = QualityMissing })},
		{"inválida", mutate(func(e *HistoricalMetadata) { e.Quality = QualityInvalid })},
		{"desconocida", mutate(func(e *HistoricalMetadata) { e.Quality = QualityUnknown })},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			session := classificationCorrectionSession()
			session.Metadata = tc.metadata
			request := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
			prepared, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{request}, target)
			if !errors.Is(err, ErrInvalidSessionClassification) || prepared != nil {
				t.Fatalf("se esperaba precondición atómica, llegó %+v, %v", prepared, err)
			}
		})
	}
}

func TestPrepareCanonicalSet_RawReplacementLimits(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	t.Run("1024 bytes multibyte exactos", func(t *testing.T) {
		target := canonicalTestTarget(strings.Repeat("é", 512), "GP", "Oreca 07", "LMP2")
		request := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", strings.Repeat("é", 512))
		prepared, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{request}, target)
		if err != nil {
			t.Fatalf("1024 bytes exactos rechazados: %v", err)
		}
		if len(prepared) != 1 || prepared[0].Corrected != strings.Repeat("é", 512) {
			t.Fatalf("corregido alterado: %+v", prepared)
		}
	})
	t.Run("1026 bytes multibyte", func(t *testing.T) {
		target := canonicalTestTarget(strings.Repeat("é", 513), "GP", "Oreca 07", "LMP2")
		request := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", strings.Repeat("é", 513))
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{request}, target); !errors.Is(err, ErrCorrectionValue) {
			t.Fatalf("se esperaba ErrCorrectionValue, llegó %v", err)
		}
	})
	t.Run("precondición RAW mal recortada", func(t *testing.T) {
		target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
		request := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola ", "Monza")
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{request}, target); !errors.Is(err, ErrCorrectionPrecondition) {
			t.Fatalf("se esperaba ErrCorrectionPrecondition, llegó %v", err)
		}
	})
}

func TestPrepareCanonicalSet_DuplicatesQuotaAtomicity(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	good := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	t.Run("duplicados se rechazan", func(t *testing.T) {
		dupe := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{good, dupe}, target); !errors.Is(err, ErrOverlappingCorrections) {
			t.Fatalf("se esperaba ErrOverlappingCorrections, llegó %v", err)
		}
	})
	t.Run("cuota de clasificación", func(t *testing.T) {
		flood := make([]ClassificationCorrection, 0, MaxSampleCorrections+1)
		for i := 0; i <= MaxSampleCorrections; i++ {
			flood = append(flood, good)
		}
		if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, flood, target); !errors.Is(err, ErrInvalidCorrection) {
			t.Fatalf("se esperaba error de cuota, llegó %v", err)
		}
	})
	t.Run("atómico ante expected distinto", func(t *testing.T) {
		bad := canonicalTestRequest(base, target, ClassificationFieldCarName, "Ferrari", "Oreca 07")
		prepared, err := PrepareCanonicalClassificationCorrectionSet(base, session, []ClassificationCorrection{good, bad}, target)
		if !errors.Is(err, ErrCorrectionPrecondition) || prepared != nil {
			t.Fatalf("se esperaba precondición atómica, llegó %+v, %v", prepared, err)
		}
	})
}

func TestPrepareCanonicalSet_PreservesLegacyResults(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	requests := []ClassificationCorrection{
		classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify"),
		classificationCorrectionRequest(base, ClassificationFieldWeatherConditions, "Dry", "  Light rain  "),
	}
	legacy, err := PrepareClassificationCorrectionSet(base, session, requests)
	if err != nil {
		t.Fatalf("camino anterior rechazado: %v", err)
	}
	delegated, err := PrepareCanonicalClassificationCorrectionSet(base, session, requests, nil)
	if err != nil {
		t.Fatalf("delegación sin identidad rechazada: %v", err)
	}
	if !reflect.DeepEqual(legacy, delegated) {
		t.Fatalf("resultados anteriores alterados: %+v frente a %+v", legacy, delegated)
	}
	if empty, err := PrepareCanonicalClassificationCorrectionSet(base, session, nil, nil); err != nil || len(empty) != 0 {
		t.Fatalf("conjunto vacío debe delegar vacío: %v, %d", err, len(empty))
	}
}

func TestPrepareCanonicalSet_DoesNotMutateInputs(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	requests := []ClassificationCorrection{
		canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza"),
		classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify"),
	}
	wantBase, wantSession, wantRequests, wantTarget := base, classificationCorrectionSession(), append([]ClassificationCorrection(nil), requests...), *target
	if _, err := PrepareCanonicalClassificationCorrectionSet(base, session, requests, target); err != nil {
		t.Fatalf("conjunto válido rechazado: %v", err)
	}
	if !reflect.DeepEqual(base, wantBase) || !reflect.DeepEqual(session, wantSession) || !reflect.DeepEqual(requests, wantRequests) || !reflect.DeepEqual(*target, wantTarget) {
		t.Fatal("la preparación mutó base, sesión, peticiones o target")
	}
}
