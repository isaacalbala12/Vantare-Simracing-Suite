package telemetryanalysis

import (
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"
)

// T12j1 — preparación pura de correcciones de identidad canónica
// (TrackName, TrackLayout, CarName, CarClass). Sin custodia, snapshot,
// catálogo, resolución ni autorización: el target se valida por coherencia
// interna con el algoritmo Go existente y lo resolverá el catálogo nativo en
// otro corte. La pureza no prueba autorización ni equivalencias físicas.

// isIdentityClassificationField indica si el campo pertenece al conjunto
// cerrado de identidad canónica.
func isIdentityClassificationField(field ClassificationField) bool {
	switch field {
	case ClassificationFieldTrackName, ClassificationFieldTrackLayout, ClassificationFieldCarName, ClassificationFieldCarClass:
		return true
	default:
		return false
	}
}

// checkClassificationRequestBase liga petición y sesión a la base exacta:
// digest válido, base de la petición contra la vigente y sesión contra la
// base. Lo comparten el camino anterior y el conjunto canónico.
func checkClassificationRequestBase(current SourceAnalysisRef, session HistoricalSession, request ClassificationCorrection) (string, error) {
	baseID, err := validateClassificationBase(current, session)
	if err != nil {
		return "", err
	}
	if _, err := request.Base.Digest(); err != nil {
		return "", err
	}
	if current.SessionID != request.Base.SessionID || current.ContentSHA256 != request.Base.ContentSHA256 || current.SizeBytes != request.Base.SizeBytes {
		return "", ErrCorrectionSourceChanged
	}
	if current != request.Base {
		return "", ErrCorrectionInterpretationChanged
	}
	return baseID, nil
}

// identityTargetField resuelve clave de metadato, nombre visible y valor
// destino de un campo de identidad. Todo campo fuera del conjunto cerrado es
// un objetivo sin resolver.
func identityTargetField(target *CombinationIdentity, field ClassificationField) (key, display, value string, err error) {
	switch field {
	case ClassificationFieldTrackName:
		return "trackname", "TrackName", target.TrackName, nil
	case ClassificationFieldTrackLayout:
		return "tracklayout", "TrackLayout", target.TrackLayout, nil
	case ClassificationFieldCarName:
		return "carname", "CarName", target.CarName, nil
	case ClassificationFieldCarClass:
		return "carclass", "CarClass", target.CarClass, nil
	default:
		return "", string(field), "", fmt.Errorf("%w: field %s", ErrCorrectionTarget, field)
	}
}

// checkCanonicalCombinationTarget valida un target completo LMU coherente con
// el algoritmo Go existente: SimID lmu, cuatro campos no vacíos UTF-8 y un ID
// exactamente igual a combinationID de esos valores (longitudes en bytes más
// texto exacto, con case; sin minúsculas ni equivalencias de coches/equipos).
// El formato por sí solo no basta y no consulta ningún catálogo.
func checkCanonicalCombinationTarget(target *CombinationIdentity) error {
	if target == nil {
		return fmt.Errorf("%w: missing canonical combination target", ErrCorrectionTarget)
	}
	if target.SimID != SimIDLMU {
		return fmt.Errorf("%w: non-LMU canonical combination target", ErrCorrectionTarget)
	}
	// El catálogo real entrega valores ya recortados: cada campo debe ser
	// UTF-8, no vacío tras TrimSpace y exactamente igual a su recorte.
	for _, field := range []string{target.TrackName, target.TrackLayout, target.CarName, target.CarClass} {
		if !utf8.ValidString(field) || strings.TrimSpace(field) == "" || field != strings.TrimSpace(field) {
			return fmt.Errorf("%w: untrimmed canonical combination target", ErrCorrectionTarget)
		}
	}
	if target.ID != combinationID(CombinationIdentity{SimID: target.SimID, TrackName: target.TrackName, TrackLayout: target.TrackLayout, CarName: target.CarName, CarClass: target.CarClass}) {
		return fmt.Errorf("%w: forged canonical combination target", ErrCorrectionTarget)
	}
	return nil
}

// prepareCanonicalIdentityCorrection prepara un campo de identidad contra el
// target. Reusa base, procedencia, motivo y original del camino anterior. El
// original esperado es RAW byte a byte; el reemplazo en bruto se acota a 1024
// bytes UTF-8 y, tras TrimSpace, debe ser idéntico al campo del target.
func prepareCanonicalIdentityCorrection(current SourceAnalysisRef, session HistoricalSession, request ClassificationCorrection, target *CombinationIdentity) (PreparedClassificationCorrection, error) {
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
	key, display, targetValue, err := identityTargetField(target, request.Field)
	if err != nil {
		return empty, err
	}
	// Toda petición de identidad incorpora la misma referencia explícita.
	if request.CanonicalCombinationID == "" {
		return empty, fmt.Errorf("%w: canonical combination reference required", ErrInvalidCorrection)
	}
	if request.CanonicalCombinationID != target.ID {
		return empty, fmt.Errorf("%w: divergent canonical combination reference", ErrCorrectionTarget)
	}
	original, err := classificationCorrectionOriginal(session.Metadata, key, display)
	if err != nil {
		return empty, err
	}
	if !utf8.ValidString(request.ExpectedOriginal) {
		return empty, ErrCorrectionPrecondition
	}
	if request.ExpectedOriginal != original {
		return empty, ErrCorrectionPrecondition
	}
	if len(request.Replacement) > 1024 || !utf8.ValidString(request.Replacement) {
		return empty, fmt.Errorf("%w: oversized %s", ErrCorrectionValue, display)
	}
	corrected := strings.TrimSpace(request.Replacement)
	if corrected == "" {
		return empty, fmt.Errorf("%w: empty %s", ErrCorrectionValue, display)
	}
	if corrected != targetValue {
		return empty, fmt.Errorf("%w: %s out of canonical target", ErrCorrectionValue, display)
	}
	id, err := correctionDigest("analysis.classification-correction.v1", request)
	if err != nil {
		return empty, err
	}
	return PreparedClassificationCorrection{BaseID: baseID, CorrectionID: id, Request: request, Original: original, Corrected: corrected}, nil
}

// PrepareCanonicalClassificationCorrectionSet prepara un conjunto con destino
// canónico. Es atómico, con el mismo orden y cuota del camino anterior. Sin
// identidad activa no admite target inerte y delega con resultados anteriores
// exactos; los campos antiguos delegan sin target y prohíben referencia.
func PrepareCanonicalClassificationCorrectionSet(current SourceAnalysisRef, session HistoricalSession, requests []ClassificationCorrection, target *CombinationIdentity) ([]PreparedClassificationCorrection, error) {
	if len(requests) > MaxSampleCorrections {
		return nil, fmt.Errorf("%w: classification correction quota", ErrInvalidCorrection)
	}
	if _, err := validateClassificationBase(current, session); err != nil {
		return nil, err
	}
	identity := false
	for _, request := range requests {
		if isIdentityClassificationField(request.Field) || request.CanonicalCombinationID != "" {
			identity = true
			break
		}
	}
	if !identity {
		if target != nil {
			return nil, fmt.Errorf("%w: inert canonical combination target", ErrInvalidCorrection)
		}
		return PrepareClassificationCorrectionSet(current, session, requests)
	}
	if err := checkCanonicalCombinationTarget(target); err != nil {
		return nil, err
	}
	result := make([]PreparedClassificationCorrection, 0, len(requests))
	for i, request := range requests {
		var prepared PreparedClassificationCorrection
		var err error
		if isIdentityClassificationField(request.Field) {
			prepared, err = prepareCanonicalIdentityCorrection(current, session, request, target)
		} else {
			prepared, err = PrepareClassificationCorrection(current, session, request)
		}
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
	if err := checkCanonicalIdentityCoherence(session.Metadata, result, target); err != nil {
		return nil, err
	}
	return result, nil
}

// checkCanonicalIdentityCoherence exige que cada campo de identidad no
// corregido pero utilizable concuerde con el target tras TrimSpace; el
// conjunto incoherente se rechaza atómicamente. Cuando los cuatro son
// utilizables, la identidad efectiva debe producir exactamente el ID del
// target. No muta original, peticiones ni target.
func checkCanonicalIdentityCoherence(metadata []HistoricalMetadata, prepared []PreparedClassificationCorrection, target *CombinationIdentity) error {
	corrected := make(map[ClassificationField]bool, len(prepared))
	for _, p := range prepared {
		if isIdentityClassificationField(p.Request.Field) {
			corrected[p.Request.Field] = true
		}
	}
	effective := CombinationIdentity{SimID: target.SimID}
	set := func(field ClassificationField, value string) {
		switch field {
		case ClassificationFieldTrackName:
			effective.TrackName = value
		case ClassificationFieldTrackLayout:
			effective.TrackLayout = value
		case ClassificationFieldCarName:
			effective.CarName = value
		case ClassificationFieldCarClass:
			effective.CarClass = value
		}
	}
	usable := 0
	for _, field := range []ClassificationField{ClassificationFieldTrackName, ClassificationFieldTrackLayout, ClassificationFieldCarName, ClassificationFieldCarClass} {
		key, display, targetValue, err := identityTargetField(target, field)
		if err != nil {
			return err
		}
		if corrected[field] {
			set(field, targetValue)
			usable++
			continue
		}
		// Solo los no corregidos tratan el error como campo no utilizable;
		// el corregido ya propagó el suyo en su preparación.
		raw, err := classificationCorrectionOriginal(metadata, key, display)
		if err != nil {
			continue
		}
		if strings.TrimSpace(raw) != targetValue {
			return fmt.Errorf("%w: incoherent %s with canonical target", ErrCorrectionPrecondition, display)
		}
		set(field, strings.TrimSpace(raw))
		usable++
	}
	if usable == 4 && combinationID(effective) != target.ID {
		return fmt.Errorf("%w: effective identity out of canonical target", ErrCorrectionPrecondition)
	}
	return nil
}
