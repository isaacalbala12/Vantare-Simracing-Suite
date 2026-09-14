package telemetryanalysis

import (
	"fmt"
	"reflect"
	"sort"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const stintBoundaryCorrectionComputationVersion = "stint-boundary-correction.v1"

// StintBoundaryOperation is deliberately limited to existing boundaries.
type StintBoundaryOperation string

const (
	StintBoundarySet    StintBoundaryOperation = "set_stint_boundary"
	StintBoundaryRemove StintBoundaryOperation = "remove_stint_boundary"
)

type StintBoundaryTarget struct {
	StintNumber int                                   `json:"stintNumber"`
	Timestamp   time.Time                             `json:"timestamp"`
	Cause       strategyprojection.StintBoundaryCause `json:"cause"`
}

type StintBoundaryAnchor struct {
	LapNumber int       `json:"lapNumber"`
	Timestamp time.Time `json:"timestamp"`
}

type StintBoundaryReplacement struct {
	Anchor StintBoundaryAnchor                   `json:"anchor"`
	Cause  strategyprojection.StintBoundaryCause `json:"cause"`
}

// StintBoundaryCorrection describes a correction against the immutable base
// segmentation. A replacement is required for set and forbidden for remove.
type StintBoundaryCorrection struct {
	Operation   StintBoundaryOperation           `json:"operation"`
	Base        SourceAnalysisRef                `json:"base"`
	Target      StintBoundaryTarget              `json:"target"`
	Expected    strategyprojection.StintBoundary `json:"expected"`
	Replacement *StintBoundaryReplacement        `json:"replacement,omitempty"`
	Reason      string                           `json:"reason"`
}

// PreparedStintBoundaryCorrection is validated in memory. Effective
// provenance and confidence are derived later when applying the mixed view.
type PreparedStintBoundaryCorrection struct {
	BaseID       string                           `json:"baseId"`
	CorrectionID string                           `json:"correctionId"`
	Request      StintBoundaryCorrection          `json:"request"`
	Original     strategyprojection.StintBoundary `json:"original"`
}

// PrepareStintBoundaryCorrectionSet validates the complete set against one
// original temporal model and returns a canonical detached copy. It performs
// no I/O, persistence, authorization or derivation.
func PrepareStintBoundaryCorrectionSet(base SourceAnalysisRef, validity LapValidityAnalysis, requests []StintBoundaryCorrection) ([]PreparedStintBoundaryCorrection, error) {
	if len(requests) > MaxSampleCorrections {
		return nil, fmt.Errorf("%w: stint boundary correction quota", ErrInvalidCorrection)
	}
	baseID, err := validateLapFamilyBase(base, validity)
	if err != nil {
		return nil, err
	}
	if len(requests) == 0 {
		return []PreparedStintBoundaryCorrection{}, nil
	}

	prepared := make([]PreparedStintBoundaryCorrection, 0, len(requests))
	for index, request := range requests {
		item, err := prepareStintBoundaryCorrection(baseID, base, validity, request)
		if err != nil {
			return nil, fmt.Errorf("stint boundary correction %d: %w", index, err)
		}
		prepared = append(prepared, item)
	}
	sort.Slice(prepared, func(i, j int) bool {
		left, right := prepared[i].Request.Target, prepared[j].Request.Target
		if !left.Timestamp.Equal(right.Timestamp) {
			return left.Timestamp.Before(right.Timestamp)
		}
		if left.StintNumber != right.StintNumber {
			return left.StintNumber < right.StintNumber
		}
		return left.Cause < right.Cause
	})
	for index := 1; index < len(prepared); index++ {
		if prepared[index-1].Request.Target == prepared[index].Request.Target {
			return nil, ErrOverlappingCorrections
		}
	}
	if err := validateEffectiveStintBoundaries(validity.Temporal.StintBoundaries, prepared); err != nil {
		return nil, err
	}
	return prepared, nil
}

func prepareStintBoundaryCorrection(baseID string, base SourceAnalysisRef, validity LapValidityAnalysis, request StintBoundaryCorrection) (PreparedStintBoundaryCorrection, error) {
	var empty PreparedStintBoundaryCorrection
	original, matches := strategyprojection.StintBoundary{}, 0
	for _, boundary := range validity.Temporal.StintBoundaries {
		if boundary.StintNumber == request.Target.StintNumber && boundary.Timestamp.Equal(request.Target.Timestamp) && boundary.Cause == request.Target.Cause {
			original = cloneStintBoundary(boundary)
			matches++
		}
	}
	if matches != 1 {
		return empty, ErrCorrectionTarget
	}
	prepared, err := prepareStintBoundaryRepresentation(baseID, base, request, original)
	if err != nil {
		return empty, err
	}
	if prepared.Request.Operation == StintBoundarySet {
		if err := validateStintBoundaryAnchor(validity, *prepared.Request.Replacement); err != nil {
			return empty, err
		}
	}
	return prepared, nil
}

// prepareStintBoundaryRepresentation validates the self-contained stored
// representation. It does not prove that the original boundary or replacement
// anchor exists in current source telemetry; live preparation does that around
// this helper.
func prepareStintBoundaryRepresentation(baseID string, base SourceAnalysisRef, request StintBoundaryCorrection, original strategyprojection.StintBoundary) (PreparedStintBoundaryCorrection, error) {
	var empty PreparedStintBoundaryCorrection
	if _, err := request.Base.Digest(); err != nil {
		return empty, err
	}
	if base.SessionID != request.Base.SessionID || base.ContentSHA256 != request.Base.ContentSHA256 || base.SizeBytes != request.Base.SizeBytes {
		return empty, ErrCorrectionSourceChanged
	}
	if base != request.Base {
		return empty, ErrCorrectionInterpretationChanged
	}
	if !correctionText(request.Reason, 1024) {
		return empty, fmt.Errorf("%w: reason", ErrInvalidCorrection)
	}
	request.Target.Timestamp = canonicalStintTime(request.Target.Timestamp)
	request.Expected = cloneStintBoundary(request.Expected)
	request.Replacement = cloneStintBoundaryReplacement(request.Replacement)
	original = cloneStintBoundary(original)
	if request.Target.StintNumber < 2 || request.Target.Timestamp.IsZero() || !request.Target.Cause.Valid() {
		return empty, ErrCorrectionTarget
	}
	if err := original.Validate(); err != nil {
		return empty, fmt.Errorf("%w: original boundary: %v", ErrCorrectionPrecondition, err)
	}
	if stintBoundaryTargetFor(original) != request.Target {
		return empty, ErrCorrectionTarget
	}
	if !reflect.DeepEqual(original, request.Expected) {
		return empty, ErrCorrectionPrecondition
	}
	switch request.Operation {
	case StintBoundarySet:
		if request.Replacement == nil {
			return empty, fmt.Errorf("%w: replacement required", ErrInvalidCorrection)
		}
		if request.Replacement.Anchor.LapNumber < 0 || request.Replacement.Anchor.Timestamp.IsZero() || !request.Replacement.Cause.Valid() {
			return empty, fmt.Errorf("%w: replacement", ErrCorrectionValue)
		}
		if request.Replacement.Anchor.Timestamp.Equal(original.Timestamp) && request.Replacement.Cause == original.Cause {
			return empty, fmt.Errorf("%w: inert replacement", ErrCorrectionValue)
		}
	case StintBoundaryRemove:
		if request.Replacement != nil {
			return empty, fmt.Errorf("%w: remove cannot have replacement", ErrInvalidCorrection)
		}
	default:
		return empty, fmt.Errorf("%w: operation", ErrCorrectionValue)
	}
	id, err := correctionDigest("analysis.stint-boundary-correction.v1", request)
	if err != nil {
		return empty, err
	}
	return PreparedStintBoundaryCorrection{BaseID: baseID, CorrectionID: id, Request: request, Original: original}, nil
}

func prepareStoredStintBoundaryCorrections(base SourceAnalysisRef, requests []StintBoundaryCorrection) ([]PreparedStintBoundaryCorrection, error) {
	baseID, err := base.Digest()
	if err != nil {
		return nil, err
	}
	if len(requests) > MaxSampleCorrections {
		return nil, ErrInvalidCorrection
	}
	prepared := make([]PreparedStintBoundaryCorrection, 0, len(requests))
	for _, request := range requests {
		item, err := prepareStintBoundaryRepresentation(baseID, base, request, request.Expected)
		if err != nil {
			return nil, err
		}
		prepared = append(prepared, item)
	}
	sort.Slice(prepared, func(i, j int) bool {
		left, right := prepared[i].Request.Target, prepared[j].Request.Target
		if !left.Timestamp.Equal(right.Timestamp) {
			return left.Timestamp.Before(right.Timestamp)
		}
		if left.StintNumber != right.StintNumber {
			return left.StintNumber < right.StintNumber
		}
		return left.Cause < right.Cause
	})
	for index := 1; index < len(prepared); index++ {
		if prepared[index-1].Request.Target == prepared[index].Request.Target {
			return nil, ErrOverlappingCorrections
		}
	}
	return prepared, nil
}

func validateStintBoundaryAnchor(validity LapValidityAnalysis, replacement StintBoundaryReplacement) error {
	if replacement.Anchor.LapNumber < 0 || replacement.Anchor.Timestamp.IsZero() || !replacement.Cause.Valid() {
		return fmt.Errorf("%w: replacement", ErrCorrectionValue)
	}
	anchorTime := canonicalStintTime(replacement.Anchor.Timestamp)
	lapBoundaryMatches := 0
	var matchedBoundary strategyprojection.LapBoundary
	for _, boundary := range validity.Temporal.LapBoundaries {
		if boundary.LapNumber == replacement.Anchor.LapNumber && boundary.Timestamp.Equal(anchorTime) {
			matchedBoundary = boundary
			lapBoundaryMatches++
		}
	}
	if lapBoundaryMatches != 1 {
		return ErrCorrectionTarget
	}
	if matchedBoundary.Source != strategyprojection.LapBoundarySourceLapEvent {
		return fmt.Errorf("%w: anchor clock", ErrCorrectionValue)
	}

	lapMatches := 0
	for _, lap := range validity.Laps {
		if lap.Number == replacement.Anchor.LapNumber && lap.End.Equal(anchorTime) && lap.Start != nil && lap.Start.Before(lap.End) {
			lapMatches++
		}
	}
	if lapMatches != 1 {
		return ErrCorrectionTarget
	}
	presence, covered := lapSegmentPresence(anchorTime, anchorTime, validity.Temporal.Segments, validity.Temporal.Gaps)
	if !covered || (presence != strategyprojection.PresenceValid && presence != strategyprojection.PresenceStale) {
		return fmt.Errorf("%w: anchor coverage", ErrCorrectionValue)
	}
	return nil
}

func validateEffectiveStintBoundaries(original []strategyprojection.StintBoundary, prepared []PreparedStintBoundaryCorrection) error {
	_, err := effectiveStintBoundaries(original, prepared)
	return err
}

func effectiveStintBoundaries(original []strategyprojection.StintBoundary, prepared []PreparedStintBoundaryCorrection) ([]strategyprojection.StintBoundary, error) {
	corrections := make(map[StintBoundaryTarget]PreparedStintBoundaryCorrection, len(prepared))
	for _, item := range prepared {
		corrections[item.Request.Target] = item
	}
	effective := make([]strategyprojection.StintBoundary, 0, len(original))
	for _, boundary := range original {
		item, changed := corrections[stintBoundaryTargetFor(boundary)]
		if !changed {
			effective = append(effective, cloneStintBoundary(boundary))
			continue
		}
		request := item.Request
		if request.Operation == StintBoundaryRemove {
			continue
		}
		corrected := cloneStintBoundary(boundary)
		corrected.Timestamp = canonicalStintTime(request.Replacement.Anchor.Timestamp)
		corrected.Cause = request.Replacement.Cause
		corrected.Provenance = strategyprojection.Provenance{Kind: strategyprojection.ProvenanceCorrected, SourceID: item.CorrectionID}
		corrected.Confidence = strategyprojection.Confidence{ComputationVersion: stintBoundaryCorrectionComputationVersion}
		effective = append(effective, corrected)
	}
	sort.Slice(effective, func(i, j int) bool { return effective[i].Timestamp.Before(effective[j].Timestamp) })
	for index := 1; index < len(effective); index++ {
		previous, current := effective[index-1], effective[index]
		if !previous.Timestamp.Before(current.Timestamp) || previous.StintNumber >= current.StintNumber {
			return nil, fmt.Errorf("%w: boundary ordering", ErrCorrectionValue)
		}
	}
	for index := range effective {
		effective[index].StintNumber = index + 2
	}
	return effective, nil
}

// ApplyStintBoundaryCorrections applies a previously prepared complete set to
// an effective validity model. Preparation is repeated against the immutable
// original, then every target must still exist exactly in the effective model.
// The returned boundary slice is detached; neither input is mutated.
func ApplyStintBoundaryCorrections(base SourceAnalysisRef, original, effective LapValidityAnalysis, corrections []PreparedStintBoundaryCorrection) ([]strategyprojection.StintBoundary, error) {
	if effective.SessionID != base.SessionID || effective.ComputationVersion != base.AnalysisVersion {
		return nil, ErrCorrectionInterpretationChanged
	}
	if err := effective.Temporal.ContractVersion.ValidateTemporal(); err != nil {
		return nil, ErrCorrectionInterpretationChanged
	}
	if len(corrections) > MaxSampleCorrections {
		return nil, ErrInvalidCorrection
	}
	requests := make([]StintBoundaryCorrection, len(corrections))
	for i, correction := range corrections {
		requests[i] = correction.Request
	}
	checked, err := PrepareStintBoundaryCorrectionSet(base, original, requests)
	if err != nil {
		return nil, err
	}
	if len(checked) != 0 && !reflect.DeepEqual(checked, corrections) {
		return nil, fmt.Errorf("%w: stint boundary set integrity", ErrInvalidCorrection)
	}
	counts := make(map[StintBoundaryTarget]int, len(corrections))
	for _, boundary := range effective.Temporal.StintBoundaries {
		counts[stintBoundaryTargetFor(boundary)]++
	}
	for _, correction := range checked {
		if counts[correction.Request.Target] != 1 {
			return nil, ErrCorrectionTarget
		}
		if correction.Request.Operation == StintBoundarySet {
			if err := validateStintBoundaryAnchor(effective, *correction.Request.Replacement); err != nil {
				return nil, err
			}
		}
	}
	return effectiveStintBoundaries(effective.Temporal.StintBoundaries, checked)
}

func stintBoundaryTargetFor(boundary strategyprojection.StintBoundary) StintBoundaryTarget {
	return StintBoundaryTarget{StintNumber: boundary.StintNumber, Timestamp: canonicalStintTime(boundary.Timestamp), Cause: boundary.Cause}
}

func cloneStintBoundaryReplacement(value *StintBoundaryReplacement) *StintBoundaryReplacement {
	if value == nil {
		return nil
	}
	copy := *value
	copy.Anchor.Timestamp = canonicalStintTime(copy.Anchor.Timestamp)
	return &copy
}

func cloneStintBoundary(value strategyprojection.StintBoundary) strategyprojection.StintBoundary {
	copy := value
	copy.Timestamp = canonicalStintTime(value.Timestamp)
	copy.Provenance.ObservedAt = cloneStintTimePointer(value.Provenance.ObservedAt)
	copy.Confidence.RangeLower = cloneStintFloatPointer(value.Confidence.RangeLower)
	copy.Confidence.RangeUpper = cloneStintFloatPointer(value.Confidence.RangeUpper)
	copy.Confidence.Variance = cloneStintFloatPointer(value.Confidence.Variance)
	return copy
}

func canonicalStintTime(value time.Time) time.Time {
	if value.IsZero() {
		return time.Time{}
	}
	return value.Round(0).UTC()
}

func cloneStintTimePointer(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	copy := canonicalStintTime(*value)
	return &copy
}

func cloneStintFloatPointer(value *float64) *float64 {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
