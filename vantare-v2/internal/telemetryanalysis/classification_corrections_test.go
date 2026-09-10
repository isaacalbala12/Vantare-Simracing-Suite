package telemetryanalysis

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

const classificationTestFingerprint = "schema-fingerprint-t12a"

func classificationCorrectionBase() SourceAnalysisRef {
	return SourceAnalysisRef{
		SessionID:          "session-t12a",
		ContentSHA256:      strings.Repeat("ab", 32),
		SizeBytes:          1234,
		ParserID:           LMUDuckDBParserID,
		ParserVersion:      LMUDuckDBParserVersion,
		SchemaFingerprint:  classificationTestFingerprint,
		AnalysisVersion:    "analysis-t12a",
		SegmentationDigest: strings.Repeat("cd", 32),
	}
}

func classificationCorrectionMetadata() []HistoricalMetadata {
	valid := func(key, value string) HistoricalMetadata {
		return HistoricalMetadata{Key: key, Present: true, Value: value, Quality: QualityValid}
	}
	return []HistoricalMetadata{
		valid("TrackName", "Imola"),
		valid("TrackLayout", "GP"),
		valid("CarName", "Oreca 07"),
		valid("CarClass", "LMP2"),
		valid("SessionType", "race"),
		valid("WeatherConditions", "Dry"),
	}
}

func classificationCorrectionSession() HistoricalSession {
	return HistoricalSession{
		SchemaVersion: HistoricalSchemaVersion,
		ID:            "session-t12a",
		Provenance: HistoricalProvenance{
			Source:            ManifestSource{Kind: SourceLMU, Format: LMUDuckDBParserID},
			Parser:            ParserRef{ID: LMUDuckDBParserID, Version: LMUDuckDBParserVersion},
			SchemaFingerprint: classificationTestFingerprint,
		},
		Metadata: classificationCorrectionMetadata(),
	}
}

func classificationCorrectionRequest(base SourceAnalysisRef, field ClassificationField, expected, replacement string) ClassificationCorrection {
	return ClassificationCorrection{
		Base:             base,
		Field:            field,
		ExpectedOriginal: expected,
		Replacement:      replacement,
		Reason:           "revisión de comisarios",
		Provenance:       ClassificationProvenanceManual,
	}
}

func TestPrepareClassificationCorrection_AcceptsValidFields(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	requests := []ClassificationCorrection{
		classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify"),
		classificationCorrectionRequest(base, ClassificationFieldWeatherConditions, "Dry", "  Light rain  "),
	}
	prepared, err := PrepareClassificationCorrectionSet(base, session, requests)
	if err != nil {
		t.Fatalf("conjunto válido rechazado: %v", err)
	}
	if len(prepared) != 2 {
		t.Fatalf("se esperaban 2 preparadas, llegaron %d", len(prepared))
	}
	wantBaseID, err := base.Digest()
	if err != nil {
		t.Fatalf("base de prueba inválida: %v", err)
	}
	for _, p := range prepared {
		if p.BaseID != wantBaseID || p.CorrectionID == "" {
			t.Fatalf("identidades incompletas: %+v", p)
		}
		if p.Request.Base != base {
			t.Fatalf("la petición no conserva la base exacta: %+v", p)
		}
	}
	if prepared[0].Request.Field != ClassificationFieldSessionType || prepared[1].Request.Field != ClassificationFieldWeatherConditions {
		t.Fatalf("orden canónico roto: %q, %q", prepared[0].Request.Field, prepared[1].Request.Field)
	}
	if prepared[0].Original != "race" || prepared[0].Corrected != "qualify" {
		t.Fatalf("sesión sin canonicalizar: %+v", prepared[0])
	}
	if prepared[1].Original != "Dry" || prepared[1].Corrected != "Light rain" {
		t.Fatalf("etiqueta sin recortar: %+v", prepared[1])
	}
}

func TestPrepareClassificationCorrection_DoesNotMutateInputs(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	request := classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "race")
	wantBase, wantSession, wantRequest := base, classificationCorrectionSession(), request
	if _, err := PrepareClassificationCorrection(base, session, request); err != nil {
		t.Fatalf("corrección idéntica al original rechazada: %v", err)
	}
	if !reflect.DeepEqual(base, wantBase) || !reflect.DeepEqual(session, wantSession) || !reflect.DeepEqual(request, wantRequest) {
		t.Fatal("la preparación mutó base, sesión o petición")
	}
}

func TestPrepareClassificationCorrection_BaseBinding(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	valid := classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify")
	mutateBase := func(f func(*SourceAnalysisRef)) SourceAnalysisRef {
		other := base
		f(&other)
		return other
	}
	tests := []struct {
		name    string
		current SourceAnalysisRef
		session HistoricalSession
		request ClassificationCorrection
		want    error
	}{
		{"mismo SessionID con otro hash", mutateBase(func(b *SourceAnalysisRef) { b.ContentSHA256 = strings.Repeat("ef", 32) }), session, valid, ErrCorrectionSourceChanged},
		{"mismo SessionID con otro tamaño", mutateBase(func(b *SourceAnalysisRef) { b.SizeBytes = 9999 }), session, valid, ErrCorrectionSourceChanged},
		{"mismo SessionID con otro parser", mutateBase(func(b *SourceAnalysisRef) { b.ParserID = "otro-parser" }), session, valid, ErrCorrectionInterpretationChanged},
		{"mismo SessionID con otro schema", mutateBase(func(b *SourceAnalysisRef) { b.SchemaFingerprint = "otro-schema" }), session, valid, ErrCorrectionInterpretationChanged},
		{"mismo SessionID con otro análisis", mutateBase(func(b *SourceAnalysisRef) { b.AnalysisVersion = "otro-analisis" }), session, valid, ErrCorrectionInterpretationChanged},
		{"mismo SessionID con otra segmentación", mutateBase(func(b *SourceAnalysisRef) { b.SegmentationDigest = strings.Repeat("90", 32) }), session, valid, ErrCorrectionInterpretationChanged},
		{"sesión de otra base", base, HistoricalSession{ID: "otra-sesion"}, valid, ErrCorrectionSourceChanged},
		{"sesión con otro parser que la base", base, func() HistoricalSession { s := session; s.Provenance.Parser.Version = "2"; return s }(), valid, ErrCorrectionInterpretationChanged},
		{"sesión con otro schema que la base", base, func() HistoricalSession { s := session; s.SchemaVersion = 999; return s }(), valid, ErrCorrectionInterpretationChanged},
		{"sesión no LMU", base, func() HistoricalSession { s := session; s.Provenance.Source.Kind = "otro-simulador"; return s }(), valid, ErrUnsupportedSessionSimulator},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := PrepareClassificationCorrection(tc.current, tc.session, tc.request); !errors.Is(err, tc.want) {
				t.Fatalf("se esperaba %v, llegó %v", tc.want, err)
			}
		})
	}
}

func TestPrepareClassificationCorrection_RequestGates(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	tests := []struct {
		name    string
		request ClassificationCorrection
		want    error
	}{
		{"motivo ausente", ClassificationCorrection{Base: base, Field: ClassificationFieldSessionType, ExpectedOriginal: "race", Replacement: "qualify", Reason: "  ", Provenance: ClassificationProvenanceManual}, ErrInvalidCorrection},
		{"motivo demasiado largo", ClassificationCorrection{Base: base, Field: ClassificationFieldSessionType, ExpectedOriginal: "race", Replacement: "qualify", Reason: strings.Repeat("m", 1025), Provenance: ClassificationProvenanceManual}, ErrInvalidCorrection},
		{"motivo con UTF-8 inválido", ClassificationCorrection{Base: base, Field: ClassificationFieldSessionType, ExpectedOriginal: "race", Replacement: "qualify", Reason: "ok\xff", Provenance: ClassificationProvenanceManual}, ErrInvalidCorrection},
		{"procedencia no manual", ClassificationCorrection{Base: base, Field: ClassificationFieldSessionType, ExpectedOriginal: "race", Replacement: "qualify", Reason: "x", Provenance: "auto"}, ErrInvalidCorrection},
		{"campo prohibido de combinación", classificationCorrectionRequest(base, "TrackName", "Imola", "Monza"), ErrCorrectionTarget},
		{"campo prohibido vacío", classificationCorrectionRequest(base, "", "race", "qualify"), ErrCorrectionTarget},
		{"original esperado con recorte no cuela", classificationCorrectionRequest(base, ClassificationFieldSessionType, "race ", "qualify"), ErrCorrectionPrecondition},
		{"original esperado con UTF-8 inválido", classificationCorrectionRequest(base, ClassificationFieldSessionType, "ra\xffce", "qualify"), ErrCorrectionPrecondition},
		{"reemplazo en bruto sobredimensionado", classificationCorrectionRequest(base, ClassificationFieldWeatherConditions, "Dry", strings.Repeat(" ", 2000)+"Dry"), ErrCorrectionValue},
		{"reemplazo de sesión sobredimensionado", classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", strings.Repeat("q", 2000)), ErrCorrectionValue},
		{"valor original diferente", classificationCorrectionRequest(base, ClassificationFieldSessionType, "practice", "qualify"), ErrCorrectionPrecondition},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := PrepareClassificationCorrection(base, session, tc.request); !errors.Is(err, tc.want) {
				t.Fatalf("se esperaba %v, llegó %v", tc.want, err)
			}
		})
	}
}

func TestPrepareClassificationCorrection_MetadataGates(t *testing.T) {
	base := classificationCorrectionBase()
	full := classificationCorrectionMetadata()
	entry := func(key string, mutate func(*HistoricalMetadata)) []HistoricalMetadata {
		result := make([]HistoricalMetadata, 0, len(full))
		for _, e := range full {
			if strings.EqualFold(strings.TrimSpace(e.Key), key) {
				mutate(&e)
			}
			result = append(result, e)
		}
		return result
	}
	without := func(key string) []HistoricalMetadata {
		result := make([]HistoricalMetadata, 0, len(full))
		for _, e := range full {
			if !strings.EqualFold(strings.TrimSpace(e.Key), key) {
				result = append(result, e)
			}
		}
		return result
	}
	duplicated := append(append([]HistoricalMetadata{}, full...), HistoricalMetadata{Key: "sessiontype", Present: true, Value: "race", Quality: QualityValid})
	unknownType := entry("SessionType", func(e *HistoricalMetadata) { e.Value = "banana" })
	tests := []struct {
		name     string
		metadata []HistoricalMetadata
		field    ClassificationField
		expected string
		replace  string
	}{
		{"duplicado", duplicated, ClassificationFieldSessionType, "race", "qualify"},
		{"ausente", without("WeatherConditions"), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"stale", entry("WeatherConditions", func(e *HistoricalMetadata) { e.Quality = QualityStale }), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"missing", entry("WeatherConditions", func(e *HistoricalMetadata) { e.Quality = QualityMissing }), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"invalid", entry("WeatherConditions", func(e *HistoricalMetadata) { e.Quality = QualityInvalid }), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"unknown", entry("WeatherConditions", func(e *HistoricalMetadata) { e.Quality = QualityUnknown }), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"no presente", entry("WeatherConditions", func(e *HistoricalMetadata) { e.Present = false }), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"sensible", entry("WeatherConditions", func(e *HistoricalMetadata) { e.Sensitive = true }), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"redactado", entry("WeatherConditions", func(e *HistoricalMetadata) { e.Redacted = true }), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"vacío", entry("WeatherConditions", func(e *HistoricalMetadata) { e.Value = "  " }), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"UTF-8 inválido", entry("WeatherConditions", func(e *HistoricalMetadata) { e.Value = "Dr\xffy" }), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"tipo desconocido", unknownType, ClassificationFieldSessionType, "banana", "race"},
		{"reemplazo fuera del enum", full, ClassificationFieldSessionType, "race", "sprint"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			session := classificationCorrectionSession()
			session.Metadata = tc.metadata
			request := classificationCorrectionRequest(base, tc.field, tc.expected, tc.replace)
			if _, err := PrepareClassificationCorrection(base, session, request); !errors.Is(err, ErrInvalidSessionClassification) {
				t.Fatalf("se esperaba identidad ErrInvalidSessionClassification, llegó %v", err)
			}
		})
	}
}

func TestPrepareClassificationCorrection_WeatherLimits(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	good := strings.Repeat("é", MaxClassificationWeatherLength)
	request := classificationCorrectionRequest(base, ClassificationFieldWeatherConditions, "Dry", good)
	prepared, err := PrepareClassificationCorrection(base, session, request)
	if err != nil {
		t.Fatalf("64 caracteres multibyte rechazados: %v", err)
	}
	if prepared.Corrected != good {
		t.Fatalf("etiqueta multibyte alterada: %q", prepared.Corrected)
	}
	for name, replacement := range map[string]string{
		"65 caracteres":      strings.Repeat("é", MaxClassificationWeatherLength+1),
		"65 ascii":           strings.Repeat("w", MaxClassificationWeatherLength+1),
		"control interior":   "Dry\nWet",
		"tabulador interior": "Dry\tWet",
		"vacía":              "   ",
	} {
		t.Run(name, func(t *testing.T) {
			request := classificationCorrectionRequest(base, ClassificationFieldWeatherConditions, "Dry", replacement)
			if _, err := PrepareClassificationCorrection(base, session, request); !errors.Is(err, ErrCorrectionValue) {
				t.Fatalf("se esperaba ErrCorrectionValue, llegó %v", err)
			}
		})
	}
}

func TestPrepareClassificationCorrection_PreservesRawOriginal(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	for i, e := range session.Metadata {
		if strings.EqualFold(strings.TrimSpace(e.Key), "sessiontype") {
			session.Metadata[i].Value = "  Race  "
		}
	}
	exact := classificationCorrectionRequest(base, ClassificationFieldSessionType, "  Race  ", "qualify")
	prepared, err := PrepareClassificationCorrection(base, session, exact)
	if err != nil {
		t.Fatalf("original idéntico byte a byte rechazado: %v", err)
	}
	if prepared.Original != "  Race  " || prepared.Corrected != "qualify" {
		t.Fatalf("original no preservado o corregido no canónico: %+v", prepared)
	}
	trimmed := classificationCorrectionRequest(base, ClassificationFieldSessionType, "Race", "qualify")
	if _, err := PrepareClassificationCorrection(base, session, trimmed); !errors.Is(err, ErrCorrectionPrecondition) {
		t.Fatalf("se esperaba ErrCorrectionPrecondition, llegó %v", err)
	}
}

func TestPrepareClassificationCorrection_SetValidatesBaseAndQuota(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	bad := base
	bad.SizeBytes = 0
	if _, err := PrepareClassificationCorrectionSet(bad, session, nil); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatalf("conjunto vacío con base inválida debe fallar, llegó %v", err)
	}
	flood := make([]ClassificationCorrection, 0, MaxSampleCorrections+1)
	for i := 0; i <= MaxSampleCorrections; i++ {
		flood = append(flood, classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify"))
	}
	if _, err := PrepareClassificationCorrectionSet(base, session, flood); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatalf("se esperaba error de cuota, llegó %v", err)
	}
}

func TestPrepareClassificationCorrection_SetAtomicity(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	good := classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify")
	bad := classificationCorrectionRequest(base, ClassificationFieldWeatherConditions, "Dry", "   ")
	if _, err := PrepareClassificationCorrectionSet(base, session, []ClassificationCorrection{good, bad}); !errors.Is(err, ErrCorrectionValue) {
		t.Fatalf("se esperaba ErrCorrectionValue, llegó %v", err)
	}
	dupe := classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "practice")
	if _, err := PrepareClassificationCorrectionSet(base, session, []ClassificationCorrection{good, dupe}); !errors.Is(err, ErrOverlappingCorrections) {
		t.Fatalf("se esperaba ErrOverlappingCorrections, llegó %v", err)
	}
	if prepared, err := PrepareClassificationCorrectionSet(base, session, nil); err != nil || len(prepared) != 0 {
		t.Fatalf("conjunto vacío debe ser válido y vacío: %v, %d", err, len(prepared))
	}
}

func TestPrepareClassificationCorrection_ValidFieldWithWeatherMissing(t *testing.T) {
	base := classificationCorrectionBase()
	session := classificationCorrectionSession()
	kept := make([]HistoricalMetadata, 0, len(session.Metadata))
	for _, e := range session.Metadata {
		if !strings.EqualFold(strings.TrimSpace(e.Key), "weatherconditions") {
			kept = append(kept, e)
		}
	}
	session.Metadata = kept
	request := classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify")
	prepared, err := PrepareClassificationCorrection(base, session, request)
	if err != nil {
		t.Fatalf("campo válido con Weather ausente rechazado: %v", err)
	}
	if prepared.Original != "race" || prepared.Corrected != "qualify" {
		t.Fatalf("preparación incorrecta: %+v", prepared)
	}
	// Preparar el campo no declara el éxito de la clasificación global
	// parcial: la causa aplicable es la ausencia de WeatherConditions.
	if _, err := ClassifyHistoricalSession(session); !errors.Is(err, ErrInvalidSessionClassification) {
		t.Fatalf("la causa aplicable dejó de ser clasificación inválida: %v", err)
	}
}
