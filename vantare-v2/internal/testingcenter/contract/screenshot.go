package contract

import (
	"bytes"
	"encoding/json"
	"fmt"
)

const (
	ScreenshotEvidenceVersionV1       = "testing-center.screenshot-evidence.v1"
	maxScreenshotsPerBatch            = 10
	maxScreenshotBytes          int64 = 10 * 1024 * 1024
	maxScreenshotBatchBytes           = 100 * 1024 * 1024
	maxScreenshotDimension            = 16384
	maxScreenshotPixels         int64 = 40_000_000
)

type ScreenshotBatchState string

const (
	ScreenshotBatchPrepared   ScreenshotBatchState = "prepared"
	ScreenshotBatchUploading  ScreenshotBatchState = "uploading"
	ScreenshotBatchValidating ScreenshotBatchState = "validating"
	ScreenshotBatchReady      ScreenshotBatchState = "ready"
	ScreenshotBatchAttached   ScreenshotBatchState = "attached"
	ScreenshotBatchExpired    ScreenshotBatchState = "expired"
)

type ScreenshotEvidenceState string

const (
	ScreenshotEvidencePrepared   ScreenshotEvidenceState = "prepared"
	ScreenshotEvidenceUploading  ScreenshotEvidenceState = "uploading"
	ScreenshotEvidenceUploaded   ScreenshotEvidenceState = "uploaded"
	ScreenshotEvidenceValidating ScreenshotEvidenceState = "validating"
	ScreenshotEvidenceReady      ScreenshotEvidenceState = "ready"
	ScreenshotEvidenceRejected   ScreenshotEvidenceState = "rejected"
	ScreenshotEvidenceRemoved    ScreenshotEvidenceState = "removed"
	ScreenshotEvidenceExpired    ScreenshotEvidenceState = "expired"
)

type ScreenshotMediaType string

const (
	ScreenshotMediaPNG  ScreenshotMediaType = "image/png"
	ScreenshotMediaJPEG ScreenshotMediaType = "image/jpeg"
)

type ScreenshotFailureCode string

const (
	ScreenshotFailureInvalidSize       ScreenshotFailureCode = "invalid_size"
	ScreenshotFailureInvalidMediaType  ScreenshotFailureCode = "invalid_media_type"
	ScreenshotFailureDigestMismatch    ScreenshotFailureCode = "digest_mismatch"
	ScreenshotFailureInvalidSignature  ScreenshotFailureCode = "invalid_signature"
	ScreenshotFailureInvalidDimensions ScreenshotFailureCode = "invalid_dimensions"
	ScreenshotFailureObjectMissing     ScreenshotFailureCode = "object_missing"
	ScreenshotFailureValidationFailed  ScreenshotFailureCode = "validation_failed"
)

type ScreenshotEvidence struct {
	EvidenceID  string                  `json:"evidenceId"`
	Position    int                     `json:"position"`
	MediaType   ScreenshotMediaType     `json:"mediaType"`
	ByteSize    int64                   `json:"byteSize"`
	SHA256      string                  `json:"sha256"`
	Width       int                     `json:"width"`
	Height      int                     `json:"height"`
	State       ScreenshotEvidenceState `json:"state"`
	FailureCode ScreenshotFailureCode   `json:"failureCode,omitempty"`
}

type ScreenshotEvidenceBatch struct {
	ContractVersion string               `json:"contractVersion"`
	BatchID         string               `json:"batchId"`
	Channel         Channel              `json:"channel"`
	State           ScreenshotBatchState `json:"state"`
	Screenshots     []ScreenshotEvidence `json:"screenshots"`
}

func (batch ScreenshotEvidenceBatch) Validate() error {
	if batch.ContractVersion != ScreenshotEvidenceVersionV1 {
		return ErrUnsupportedVersion
	}
	if err := validateID("batchId", batch.BatchID); err != nil {
		return err
	}
	if batch.Channel != ChannelNightly && batch.Channel != ChannelTesters {
		return fmt.Errorf("channel: %w", ErrUnknownChannel)
	}
	switch batch.State {
	case ScreenshotBatchPrepared, ScreenshotBatchUploading, ScreenshotBatchValidating,
		ScreenshotBatchReady, ScreenshotBatchAttached, ScreenshotBatchExpired:
	default:
		return fmt.Errorf("state: %w", ErrUnknownState)
	}
	if len(batch.Screenshots) < 1 || len(batch.Screenshots) > maxScreenshotsPerBatch {
		return fmt.Errorf("screenshots: %w", ErrInvalidDocument)
	}
	var totalBytes int64
	for index, screenshot := range batch.Screenshots {
		if screenshot.Position != index+1 {
			return fmt.Errorf("screenshots[%d].position: %w", index, ErrInvalidDocument)
		}
		if err := screenshot.validate(index); err != nil {
			return err
		}
		totalBytes += screenshot.ByteSize
	}
	if totalBytes > maxScreenshotBatchBytes {
		return fmt.Errorf("screenshots byte total: %w", ErrInvalidDocument)
	}
	return nil
}

func (screenshot ScreenshotEvidence) validate(index int) error {
	prefix := fmt.Sprintf("screenshots[%d]", index)
	if err := validateID(prefix+".evidenceId", screenshot.EvidenceID); err != nil {
		return err
	}
	if screenshot.MediaType != ScreenshotMediaPNG && screenshot.MediaType != ScreenshotMediaJPEG {
		return fmt.Errorf("%s.mediaType: %w", prefix, ErrInvalidDocument)
	}
	if screenshot.ByteSize < 1 || screenshot.ByteSize > maxScreenshotBytes {
		return fmt.Errorf("%s.byteSize: %w", prefix, ErrInvalidDocument)
	}
	if err := validateDigest(prefix+".sha256", screenshot.SHA256); err != nil {
		return err
	}
	if screenshot.Width < 1 || screenshot.Width > maxScreenshotDimension ||
		screenshot.Height < 1 || screenshot.Height > maxScreenshotDimension ||
		int64(screenshot.Width)*int64(screenshot.Height) > maxScreenshotPixels {
		return fmt.Errorf("%s dimensions: %w", prefix, ErrInvalidDocument)
	}
	switch screenshot.State {
	case ScreenshotEvidencePrepared, ScreenshotEvidenceUploading, ScreenshotEvidenceUploaded,
		ScreenshotEvidenceValidating, ScreenshotEvidenceReady, ScreenshotEvidenceRemoved,
		ScreenshotEvidenceExpired:
		if screenshot.FailureCode != "" {
			return fmt.Errorf("%s.failureCode: %w", prefix, ErrInvalidDocument)
		}
	case ScreenshotEvidenceRejected:
		if !validScreenshotFailureCode(screenshot.FailureCode) {
			return fmt.Errorf("%s.failureCode: %w", prefix, ErrInvalidDocument)
		}
	default:
		return fmt.Errorf("%s.state: %w", prefix, ErrUnknownState)
	}
	return nil
}

func validScreenshotFailureCode(code ScreenshotFailureCode) bool {
	switch code {
	case ScreenshotFailureInvalidSize, ScreenshotFailureInvalidMediaType,
		ScreenshotFailureDigestMismatch, ScreenshotFailureInvalidSignature,
		ScreenshotFailureInvalidDimensions, ScreenshotFailureObjectMissing,
		ScreenshotFailureValidationFailed:
		return true
	default:
		return false
	}
}

func DecodeScreenshotEvidenceBatch(document []byte) (ScreenshotEvidenceBatch, error) {
	var batch ScreenshotEvidenceBatch
	rootKeys := []string{"contractVersion", "batchId", "channel", "state", "screenshots"}
	if err := validateExactObjectKeys(document, rootKeys, nil); err != nil {
		return batch, err
	}
	var raw struct {
		Screenshots []json.RawMessage `json:"screenshots"`
	}
	if err := json.Unmarshal(document, &raw); err != nil {
		return batch, fmt.Errorf("%w: %v", ErrInvalidDocument, err)
	}
	for index, item := range raw.Screenshots {
		required := []string{"evidenceId", "position", "mediaType", "byteSize", "sha256", "width", "height", "state"}
		if err := validateExactObjectKeys(item, required, []string{"failureCode"}); err != nil {
			return batch, fmt.Errorf("screenshots[%d]: %w", index, err)
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(item, &fields); err != nil {
			return batch, fmt.Errorf("%w: %v", ErrInvalidDocument, err)
		}
		var state struct {
			State ScreenshotEvidenceState `json:"state"`
		}
		if err := json.Unmarshal(item, &state); err != nil {
			return batch, fmt.Errorf("%w: %v", ErrInvalidDocument, err)
		}
		if failure, exists := fields["failureCode"]; exists {
			failure = bytes.TrimSpace(failure)
			if len(failure) < 2 || failure[0] != '"' || failure[len(failure)-1] != '"' || state.State != ScreenshotEvidenceRejected {
				return batch, fmt.Errorf("screenshots[%d].failureCode: %w", index, ErrInvalidDocument)
			}
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&batch); err != nil {
		return batch, fmt.Errorf("%w: %v", ErrInvalidDocument, err)
	}
	if err := batch.Validate(); err != nil {
		return batch, err
	}
	return batch, nil
}
