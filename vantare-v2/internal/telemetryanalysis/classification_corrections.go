package telemetryanalysis

import (
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

// T12a — preparación pura de correcciones de clasificación para SessionType y
// WeatherConditions. Sin custodia, wire, snapshot, catálogo ni manager.
// Preparar un campo nunca declara el éxito de una clasificación global
// parcial: los demás metadatos conservan su ausencia y la derivación que los
// necesite sigue bloqueada con causa.

// ClassificationField es el conjunto cerrado de campos corregibles en T12a,
// ampliado en T12j1 con identidad canónica (§5 del microplan T12, contrato
// cerrado). Este constructor y su key conservan sólo los 2 campos iniciales;
// los de identidad usan PrepareCanonicalClassificationCorrectionSet.
type ClassificationField string

const (
	ClassificationFieldSessionType       ClassificationField = "SessionType"
	ClassificationFieldWeatherConditions ClassificationField = "WeatherConditions"
	// T12j1 — conjunto cerrado de identidad canónica. Solo preparable con
	// referencia resuelta mediante PrepareCanonicalClassificationCorrectionSet.
	ClassificationFieldTrackName   ClassificationField = "TrackName"
	ClassificationFieldTrackLayout ClassificationField = "TrackLayout"
	ClassificationFieldCarName     ClassificationField = "CarName"
	ClassificationFieldCarClass    ClassificationField = "CarClass"
)

// ClassificationProvenance limita la procedencia admitida. Solo manual:
// corregir la clasificación no declara una medición física verificada.
type ClassificationProvenance string

const (
	// ClassificationProvenanceManual es la única procedencia válida en T12a.
	ClassificationProvenanceManual ClassificationProvenance = "manual"
)

// MaxClassificationWeatherLength acota la etiqueta climática opaca en
// caracteres Unicode (no bytes). No hay lista canónica (LMU varía) y la
// etiqueta no genera métricas físicas.
const MaxClassificationWeatherLength = 64

// ClassificationCorrection propone corregir un campo de clasificación sobre
// la base de análisis exacta. No crea metadatos ausentes ni repara parsers.
type ClassificationCorrection struct {
	Base             SourceAnalysisRef        `json:"base"`
	Field            ClassificationField      `json:"field"`
	ExpectedOriginal string                   `json:"expectedOriginal"`
	Replacement      string                   `json:"replacement"`
	Reason           string                   `json:"reason"`
	Provenance       ClassificationProvenance `json:"provenance"`
	// CanonicalCombinationID referencia la combinación destino resuelta por
	// el catálogo nativo. Solo en campos de identidad mediante el conjunto
	// canónico; prohibida en SessionType/WeatherConditions y en el camino
	// anterior. Vacía se omite para preservar JSON y digests antiguos.
	CanonicalCombinationID string `json:"canonicalCombinationId,omitempty"`
}

// PreparedClassificationCorrection es una vista validada en memoria, no una
// revisión guardada ni prueba de autorización. Sigue el patrón de
// PreparedSampleCorrection: BaseID, CorrectionID, petición, original y
// corregido canónicos.
type PreparedClassificationCorrection struct {
	BaseID       string                   `json:"baseId"`
	CorrectionID string                   `json:"correctionId"`
	Request      ClassificationCorrection `json:"request"`
	Original     string                   `json:"original"`
	Corrected    string                   `json:"corrected"`
}

// PrepareClassificationCorrection es pura. La base exacta es SourceAnalysisRef:
// verifica ambos digests, la base de la petición contra la vigente y la
// sesión contra la base (ID, parser, schema y fuente). El llamador obtiene
// base y sesión juntas del mismo análisis verificado. Ni la sesión ni la
// petición se mutan.
func PrepareClassificationCorrection(current SourceAnalysisRef, session HistoricalSession, request ClassificationCorrection) (PreparedClassificationCorrection, error) {
	var empty PreparedClassificationCorrection
	baseID, err := checkClassificationRequestBase(current, session, request)
	if err != nil {
		return empty, err
	}
	if request.Provenance != ClassificationProvenanceManual {
		return empty, fmt.Errorf("%w: provenance", ErrInvalidCorrection)
	}
	if !correctionText(request.Reason, 1024) {
		return empty, fmt.Errorf("%w: reason", ErrInvalidCorrection)
	}
	// El camino anterior no prepara identidad ni acepta referencias: esos
	// campos se conectan en cortes posteriores vía el conjunto canónico.
	if isIdentityClassificationField(request.Field) || request.CanonicalCombinationID != "" {
		return empty, fmt.Errorf("%w: canonical combination reference", ErrCorrectionTarget)
	}
	key, display, err := classificationCorrectionKey(request.Field)
	if err != nil {
		return empty, err
	}
	original, err := classificationCorrectionOriginal(session.Metadata, key, display)
	if err != nil {
		return empty, err
	}
	corrected, err := checkClassificationReplacement(request.Field, original, request.ExpectedOriginal, request.Replacement, display)
	if err != nil {
		return empty, err
	}
	id, err := correctionDigest("analysis.classification-correction.v1", request)
	if err != nil {
		return empty, err
	}
	return PreparedClassificationCorrection{BaseID: baseID, CorrectionID: id, Request: request, Original: original, Corrected: corrected}, nil
}

// PrepareClassificationCorrectionSet prepara un conjunto contra la misma base
// exacta. Es atómico: o todo el conjunto es válido o no devuelve nada.
// Valida base, sesión y cuota antes de preparar nada, con el mismo orden del
// patrón existente. Orden canónico por campo; dos decisiones sobre el mismo
// campo se rechazan como solape, sin precedencia implícita.
func PrepareClassificationCorrectionSet(current SourceAnalysisRef, session HistoricalSession, requests []ClassificationCorrection) ([]PreparedClassificationCorrection, error) {
	if len(requests) > MaxSampleCorrections {
		return nil, fmt.Errorf("%w: classification correction quota", ErrInvalidCorrection)
	}
	if _, err := validateClassificationBase(current, session); err != nil {
		return nil, err
	}
	result := make([]PreparedClassificationCorrection, 0, len(requests))
	for i, request := range requests {
		prepared, err := PrepareClassificationCorrection(current, session, request)
		if err != nil {
			return nil, fmt.Errorf("classification correction %d: %w", i, err)
		}
		result = append(result, prepared)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Request.Field < result[j].Request.Field })
	for i := 1; i < len(result); i++ {
		if result[i-1].Request.Field == result[i].Request.Field {
			return nil, ErrOverlappingCorrections
		}
	}
	return result, nil
}

// validateClassificationBase liga la sesión a su base exacta: digest válido,
// mismo ID de sesión, versión de schema, parser, huella de schema y fuente
// LMU. La sesión no porta reloj ni páginas: la clasificación no toca
// vueltas, canales ni segmentación temporal; esa unión vive en el modelo de
// validez derivado, fuera de T12a.
func validateClassificationBase(base SourceAnalysisRef, session HistoricalSession) (string, error) {
	baseID, err := base.Digest()
	if err != nil {
		return "", err
	}
	if session.ID != base.SessionID {
		return "", ErrCorrectionSourceChanged
	}
	if session.SchemaVersion != HistoricalSchemaVersion {
		return "", ErrCorrectionInterpretationChanged
	}
	if session.Provenance.Source.Kind != SourceLMU {
		return "", ErrUnsupportedSessionSimulator
	}
	if session.Provenance.Parser.ID != base.ParserID || session.Provenance.Parser.Version != base.ParserVersion {
		return "", ErrCorrectionInterpretationChanged
	}
	if session.Provenance.SchemaFingerprint != base.SchemaFingerprint {
		return "", ErrCorrectionInterpretationChanged
	}
	return baseID, nil
}

// classificationCorrectionKey resuelve la clave de metadato de un campo del
// camino anterior (solo los 2 iniciales). Todo campo fuera de ese conjunto es
// un objetivo sin resolver aquí, incluidos los de identidad, que usan
// identityTargetField en el conjunto canónico.
func classificationCorrectionKey(field ClassificationField) (key, display string, err error) {
	switch field {
	case ClassificationFieldSessionType:
		return "sessiontype", "SessionType", nil
	case ClassificationFieldWeatherConditions:
		return "weatherconditions", "WeatherConditions", nil
	default:
		return "", string(field), fmt.Errorf("%w: field %s", ErrCorrectionTarget, field)
	}
}

// classificationCorrectionOriginal aplica a una sola clave las mismas puertas
// que classificationMetadata: sin duplicados y con presencia, no
// sensible/redactado, calidad válida, UTF-8 válido y valor no vacío tras
// recortar. El original se preserva byte a byte sin recorte: la precondición
// exige el valor exacto y solo el reemplazo se normaliza.
func classificationCorrectionOriginal(entries []HistoricalMetadata, key, display string) (string, error) {
	var original string
	found := false
	for _, entry := range entries {
		if strings.ToLower(strings.TrimSpace(entry.Key)) != key {
			continue
		}
		if found {
			return "", fmt.Errorf("%w: duplicate %s", ErrInvalidSessionClassification, display)
		}
		found = true
		if !entry.Present || entry.Sensitive || entry.Redacted || entry.Quality != QualityValid || !utf8.ValidString(entry.Value) || strings.TrimSpace(entry.Value) == "" {
			return "", fmt.Errorf("%w: unusable %s", ErrInvalidSessionClassification, display)
		}
		original = entry.Value
	}
	if !found {
		return "", fmt.Errorf("%w: missing %s", ErrInvalidSessionClassification, display)
	}
	return original, nil
}

// checkClassificationReplacement valida precondición exacta y reemplazo. El
// original esperado debe coincidir byte a byte con el original preservado
// (UTF-8 válido): no se aceptan alteraciones por recorte en la precondición.
// El reemplazo en bruto se acota antes de normalizar para que ningún relleno
// evada los límites de lo hasheado y preservado; la normalización (enum
// canónico, etiqueta recortada) solo produce el valor corregido.
func checkClassificationReplacement(field ClassificationField, original, expected, replacement, display string) (string, error) {
	if !utf8.ValidString(expected) {
		return "", ErrCorrectionPrecondition
	}
	if len(replacement) > 1024 || !utf8.ValidString(replacement) {
		return "", fmt.Errorf("%w: oversized %s", ErrCorrectionValue, display)
	}
	if field == ClassificationFieldSessionType {
		if _, err := parseSessionType(original); err != nil {
			return "", err
		}
		if expected != original {
			return "", ErrCorrectionPrecondition
		}
		parsed, err := parseSessionType(replacement)
		if err != nil {
			return "", err
		}
		return string(parsed), nil
	}
	if expected != original {
		return "", ErrCorrectionPrecondition
	}
	value := strings.TrimSpace(replacement)
	if value == "" || !utf8.ValidString(value) {
		return "", fmt.Errorf("%w: empty %s", ErrCorrectionValue, display)
	}
	if utf8.RuneCountInString(value) > MaxClassificationWeatherLength {
		return "", fmt.Errorf("%w: %s exceeds %d characters", ErrCorrectionValue, display, MaxClassificationWeatherLength)
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return "", fmt.Errorf("%w: %s holds control characters", ErrCorrectionValue, display)
		}
	}
	return value, nil
}
