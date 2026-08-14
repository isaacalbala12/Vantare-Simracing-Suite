package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
)

const screenshotDigest = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

func validScreenshotBatch() ScreenshotEvidenceBatch {
	return ScreenshotEvidenceBatch{
		ContractVersion: ScreenshotEvidenceVersionV1,
		BatchID:         "batch-opaque-1",
		Channel:         ChannelNightly,
		State:           ScreenshotBatchReady,
		Screenshots: []ScreenshotEvidence{{
			EvidenceID: "evidence-opaque-1",
			Position:   1,
			MediaType:  ScreenshotMediaPNG,
			ByteSize:   1024,
			SHA256:     screenshotDigest,
			Width:      1280,
			Height:     720,
			State:      ScreenshotEvidenceReady,
		}},
	}
}

func TestScreenshotEvidenceBatchRoundTrip(t *testing.T) {
	t.Parallel()

	want := validScreenshotBatch()
	document, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeScreenshotEvidenceBatch(document)
	if err != nil {
		t.Fatalf("DecodeScreenshotEvidenceBatch() error = %v", err)
	}
	if got.BatchID != want.BatchID || len(got.Screenshots) != 1 || got.Screenshots[0] != want.Screenshots[0] {
		t.Fatalf("DecodeScreenshotEvidenceBatch() = %#v, want %#v", got, want)
	}
}

func TestScreenshotEvidenceBatchValidation(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		mutate func(*ScreenshotEvidenceBatch)
	}{
		{name: "version", mutate: func(batch *ScreenshotEvidenceBatch) { batch.ContractVersion = "testing-center.screenshot-evidence.v2" }},
		{name: "empty batch id", mutate: func(batch *ScreenshotEvidenceBatch) { batch.BatchID = "" }},
		{name: "padded batch id", mutate: func(batch *ScreenshotEvidenceBatch) { batch.BatchID = " batch-1" }},
		{name: "master channel", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Channel = ChannelMaster }},
		{name: "unknown batch state", mutate: func(batch *ScreenshotEvidenceBatch) { batch.State = "unknown" }},
		{name: "zero screenshots", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots = nil }},
		{name: "eleven screenshots", mutate: func(batch *ScreenshotEvidenceBatch) {
			batch.Screenshots = make([]ScreenshotEvidence, 11)
			for index := range batch.Screenshots {
				batch.Screenshots[index] = validScreenshotBatch().Screenshots[0]
				batch.Screenshots[index].EvidenceID = fmt.Sprintf("evidence-%d", index+1)
				batch.Screenshots[index].Position = index + 1
			}
		}},
		{name: "empty evidence id", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].EvidenceID = "" }},
		{name: "noncontiguous position", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].Position = 2 }},
		{name: "unknown media type", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].MediaType = "image/gif" }},
		{name: "zero bytes", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].ByteSize = 0 }},
		{name: "over ten MiB", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].ByteSize = 10*1024*1024 + 1 }},
		{name: "uppercase digest", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].SHA256 = strings.ToUpper(screenshotDigest) }},
		{name: "short digest", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].SHA256 = screenshotDigest[:63] }},
		{name: "zero width", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].Width = 0 }},
		{name: "oversized height", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].Height = 16385 }},
		{name: "over forty megapixels", mutate: func(batch *ScreenshotEvidenceBatch) {
			batch.Screenshots[0].Width = 10000
			batch.Screenshots[0].Height = 4001
		}},
		{name: "unknown evidence state", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].State = "unknown" }},
		{name: "failure outside rejected", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].FailureCode = ScreenshotFailureInvalidSize }},
		{name: "rejected without failure", mutate: func(batch *ScreenshotEvidenceBatch) { batch.Screenshots[0].State = ScreenshotEvidenceRejected }},
		{name: "unknown failure", mutate: func(batch *ScreenshotEvidenceBatch) {
			batch.Screenshots[0].State = ScreenshotEvidenceRejected
			batch.Screenshots[0].FailureCode = "unknown"
		}},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			batch := validScreenshotBatch()
			test.mutate(&batch)
			if err := batch.Validate(); err == nil {
				t.Fatal("Validate() error = nil, want error")
			}
		})
	}
}

func TestScreenshotEvidenceBoundariesAndClosedEnums(t *testing.T) {
	t.Parallel()

	batchStates := []ScreenshotBatchState{
		ScreenshotBatchPrepared, ScreenshotBatchUploading, ScreenshotBatchValidating,
		ScreenshotBatchReady, ScreenshotBatchAttached, ScreenshotBatchExpired,
	}
	for _, state := range batchStates {
		batch := validScreenshotBatch()
		batch.State = state
		if err := batch.Validate(); err != nil {
			t.Errorf("batch state %q: %v", state, err)
		}
	}

	evidenceStates := []ScreenshotEvidenceState{
		ScreenshotEvidencePrepared, ScreenshotEvidenceUploading, ScreenshotEvidenceUploaded,
		ScreenshotEvidenceValidating, ScreenshotEvidenceReady, ScreenshotEvidenceRemoved,
		ScreenshotEvidenceExpired,
	}
	for _, state := range evidenceStates {
		batch := validScreenshotBatch()
		batch.Screenshots[0].State = state
		if err := batch.Validate(); err != nil {
			t.Errorf("evidence state %q: %v", state, err)
		}
	}

	failureCodes := []ScreenshotFailureCode{
		ScreenshotFailureInvalidSize, ScreenshotFailureInvalidMediaType,
		ScreenshotFailureDigestMismatch, ScreenshotFailureInvalidSignature,
		ScreenshotFailureInvalidDimensions, ScreenshotFailureObjectMissing,
		ScreenshotFailureValidationFailed,
	}
	for _, code := range failureCodes {
		batch := validScreenshotBatch()
		batch.Screenshots[0].State = ScreenshotEvidenceRejected
		batch.Screenshots[0].FailureCode = code
		if err := batch.Validate(); err != nil {
			t.Errorf("failure code %q: %v", code, err)
		}
	}

	batch := validScreenshotBatch()
	batch.Screenshots = make([]ScreenshotEvidence, 10)
	for index := range batch.Screenshots {
		batch.Screenshots[index] = validScreenshotBatch().Screenshots[0]
		batch.Screenshots[index].EvidenceID = fmt.Sprintf("evidence-%d", index+1)
		batch.Screenshots[index].Position = index + 1
		batch.Screenshots[index].MediaType = ScreenshotMediaType([]string{"image/png", "image/jpeg"}[index%2])
		batch.Screenshots[index].ByteSize = 10 * 1024 * 1024
		batch.Screenshots[index].Width = 16384
		batch.Screenshots[index].Height = 1
	}
	if err := batch.Validate(); err != nil {
		t.Fatalf("maximum valid batch rejected: %v", err)
	}
}

func TestDecodeScreenshotEvidenceBatchFailsClosed(t *testing.T) {
	t.Parallel()

	base := `{"contractVersion":"testing-center.screenshot-evidence.v1","batchId":"batch-1","channel":"nightly","state":"ready","screenshots":[{"evidenceId":"evidence-1","position":1,"mediaType":"image/png","byteSize":1,"sha256":"` + screenshotDigest + `","width":1,"height":1,"state":"ready"}]}`
	tests := []string{
		strings.TrimSuffix(base, "}") + `,"objectPath":"private"}`,
		strings.Replace(base, `"batchId":"batch-1"`, `"batchId":"batch-1","batchId":"batch-2"`, 1),
		strings.Replace(base, `"state":"ready"}]`, `"state":"ready","originalName":"secret.png"}]`, 1),
		strings.Replace(base, `"evidenceId":"evidence-1"`, `"evidenceId":"evidence-1","evidenceId":"evidence-2"`, 1),
		strings.Replace(base, `"state":"ready"}]`, `"state":"ready","failureCode":""}]`, 1),
		strings.Replace(base, `"state":"ready"}]`, `"state":"ready","failureCode":null}]`, 1),
		base + `{}`,
	}
	for _, document := range tests {
		if _, err := DecodeScreenshotEvidenceBatch([]byte(document)); !errors.Is(err, ErrInvalidDocument) {
			t.Errorf("DecodeScreenshotEvidenceBatch(%q) error = %v, want ErrInvalidDocument", document, err)
		}
	}
}

func TestEvidenceAcceptsScreenshotKind(t *testing.T) {
	t.Parallel()

	evidence := Evidence{CurrentVersion, "evidence-1", "report-1", EvidenceScreenshot, screenshotDigest}
	if err := evidence.Validate(); err != nil {
		t.Fatalf("screenshot evidence rejected: %v", err)
	}
}
