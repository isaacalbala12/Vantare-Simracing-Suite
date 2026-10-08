package telemetryanalysis

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"unicode/utf8"
)

var (
	ErrInvalidCorrection               = errors.New("invalid observation correction")
	ErrCorrectionSourceChanged         = errors.New("correction source changed")
	ErrCorrectionInterpretationChanged = errors.New("correction interpretation changed")
	ErrCorrectionTarget                = errors.New("unresolved correction target")
	ErrCorrectionPrecondition          = errors.New("correction original value changed")
	ErrCorrectionValue                 = errors.New("incompatible correction value")
)

// SourceAnalysisRef identifies content and its interpretation, never a path or
// authorization. The producer must supply versions from the actual analysis.
type SourceAnalysisRef struct {
	SessionID          string `json:"sessionId"`
	ContentSHA256      string `json:"contentSha256"`
	SizeBytes          int64  `json:"sizeBytes"`
	ParserID           string `json:"parserId"`
	ParserVersion      string `json:"parserVersion"`
	SchemaFingerprint  string `json:"schemaFingerprint"`
	AnalysisVersion    string `json:"analysisVersion"`
	SegmentationDigest string `json:"segmentationDigest"`
}

// Digest uses the fixed field order of this versioned Go representation.
// Changing the representation requires a new domain version.
func (base SourceAnalysisRef) Digest() (string, error) {
	for _, value := range []string{base.SessionID, base.ParserID, base.ParserVersion, base.SchemaFingerprint, base.AnalysisVersion} {
		if !correctionText(value, 256) {
			return "", fmt.Errorf("%w: base identifier", ErrInvalidCorrection)
		}
	}
	if base.SizeBytes <= 0 || !correctionSHA256(base.ContentSHA256) || !correctionSHA256(base.SegmentationDigest) {
		return "", fmt.Errorf("%w: base content identity", ErrInvalidCorrection)
	}
	return correctionDigest("analysis.correction-base.v1", base)
}

type SampleCorrectionTarget struct {
	ChannelID   string `json:"channelId"`
	Column      string `json:"column"`
	SampleIndex int64  `json:"sampleIndex"`
}

// SampleValueCorrection is a request against one existing scalar. It cannot
// create samples, change units or declare a previously unknown clock aligned.
type SampleValueCorrection struct {
	Base        SourceAnalysisRef      `json:"base"`
	Target      SampleCorrectionTarget `json:"target"`
	Unit        HistoricalUnit         `json:"unit"`
	Expected    HistoricalValue        `json:"expected"`
	Replacement HistoricalScalar       `json:"replacement"`
	Reason      string                 `json:"reason"`
}

// PreparedSampleCorrection is an in-memory validated view, not a saved revision
// or proof of authorization. Quality remains that of the original observation.
type PreparedSampleCorrection struct {
	BaseID       string                `json:"baseId"`
	CorrectionID string                `json:"correctionId"`
	Request      SampleValueCorrection `json:"request"`
	Original     HistoricalValue       `json:"original"`
	Corrected    HistoricalValue       `json:"corrected"`
}

// PrepareSampleCorrection is pure. The caller owns authorization and must obtain
// current, channel and sample together from the same verified analysis base.
// The prepared value alone must never bypass integrity checks in derivation.
func PrepareSampleCorrection(current SourceAnalysisRef, channel HistoricalChannel, sample HistoricalSample, request SampleValueCorrection) (PreparedSampleCorrection, error) {
	var empty PreparedSampleCorrection
	baseID, err := current.Digest()
	if err != nil {
		return empty, err
	}
	if _, err := request.Base.Digest(); err != nil {
		return empty, err
	}
	if current.SessionID != request.Base.SessionID || current.ContentSHA256 != request.Base.ContentSHA256 || current.SizeBytes != request.Base.SizeBytes {
		return empty, ErrCorrectionSourceChanged
	}
	if current != request.Base {
		return empty, ErrCorrectionInterpretationChanged
	}
	if !correctionText(request.Reason, 1024) {
		return empty, fmt.Errorf("%w: reason", ErrInvalidCorrection)
	}
	target := request.Target
	if !correctionText(target.ChannelID, 256) || !correctionText(target.Column, 256) || target.SampleIndex < 0 || target.ChannelID != channel.ID || target.SampleIndex != sample.Index {
		return empty, ErrCorrectionTarget
	}
	var original HistoricalValue
	var kind ScalarKind
	values, columns := 0, 0
	for _, value := range sample.Values {
		if value.Column == target.Column {
			original = value
			values++
		}
	}
	for _, column := range channel.Columns {
		if column.Name == target.Column {
			kind = column.Type
			columns++
		}
	}
	if values != 1 || columns != 1 || !original.Present {
		return empty, ErrCorrectionTarget
	}
	if original != request.Expected {
		return empty, ErrCorrectionPrecondition
	}
	if channel.Unit != request.Unit || channel.Unit.Quality != QualityValid || len(channel.Unit.Symbol) > 256 || !utf8.ValidString(channel.Unit.Symbol) {
		return empty, fmt.Errorf("%w: unit", ErrCorrectionValue)
	}
	if !correctionScalar(original.Scalar, kind) || !correctionScalar(request.Replacement, kind) {
		return empty, fmt.Errorf("%w: scalar", ErrCorrectionValue)
	}
	switch original.Quality {
	case QualityValid, QualityStale, QualityMissing, QualityInvalid, QualityUnknown:
	default:
		return empty, fmt.Errorf("%w: quality", ErrCorrectionValue)
	}
	id, err := correctionDigest("analysis.sample-correction.v1", request)
	if err != nil {
		return empty, err
	}
	corrected := original
	corrected.Scalar = request.Replacement
	return PreparedSampleCorrection{BaseID: baseID, CorrectionID: id, Request: request, Original: original, Corrected: corrected}, nil
}

func correctionText(value string, limit int) bool {
	return len(value) <= limit && utf8.ValidString(value) && strings.TrimSpace(value) != ""
}

func correctionSHA256(value string) bool {
	if len(value) != 64 || value != strings.ToLower(value) {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func correctionScalar(value HistoricalScalar, kind ScalarKind) bool {
	if value.Kind != kind {
		return false
	}
	canonical := HistoricalScalar{Kind: kind}
	switch kind {
	case ScalarNumber:
		if math.IsNaN(value.Number) || math.IsInf(value.Number, 0) {
			return false
		}
		canonical.Number = value.Number
	case ScalarInteger:
		canonical.Integer = value.Integer
	case ScalarBoolean:
		canonical.Boolean = value.Boolean
	case ScalarText:
		if len(value.Text) > 4096 || !utf8.ValidString(value.Text) {
			return false
		}
		canonical.Text = value.Text
	default:
		return false
	}
	// Reject hidden/inactive fields: they must not create alternate identities
	// for an otherwise equal typed value.
	return value == canonical
}

func correctionDigest(domain string, value any) (string, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("%w: encode identity: %w", ErrInvalidCorrection, err)
	}
	digest := sha256.Sum256(append([]byte(domain+"\n"), payload...))
	return hex.EncodeToString(digest[:]), nil
}
