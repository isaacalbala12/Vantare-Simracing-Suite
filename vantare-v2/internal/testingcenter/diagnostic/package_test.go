package diagnostic

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/testingcenter/contract"
)

var fixedTime = time.Date(2026, 8, 2, 18, 0, 0, 123, time.UTC)

func validInput() Input {
	return Input{
		GeneratedAtUTC: fixedTime,
		AppVersion:     "v0.4.0-nightly",
		Channel:        contract.ChannelNightly,
		OS:             "windows",
		Arch:           "amd64",
		Module:         ModuleOverlayStudio,
		ErrorCode:      "canvas.render_failed",
		Logs: []LogInput{{
			OffsetMillis: 120,
			Source:       LogSourceFrontend,
			Level:        LogLevelError,
			Code:         "render.failed",
			Message:      "renderer stopped",
		}},
	}
}

func TestPrepareIsDeterministicAndClosed(t *testing.T) {
	input := validInput()
	input.Module = Module("private-module-name")
	input.Logs = append(input.Logs,
		LogInput{Source: LogSource("private-source"), Level: LogLevelError, Message: "must not cross"},
		LogInput{Source: LogSourceBackend, Level: LogLevel("debug"), Message: "must not cross either"},
	)

	first, err := Prepare(input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Prepare(input)
	if err != nil {
		t.Fatal(err)
	}
	firstPreview, _ := first.Preview()
	secondPreview, _ := second.Preview()
	if firstPreview != secondPreview {
		t.Fatalf("same input produced different packages")
	}

	var document document
	if err := json.Unmarshal([]byte(firstPreview.Payload), &document); err != nil {
		t.Fatal(err)
	}
	if document.ContractVersion != CurrentVersion || document.Module != ModuleUnknown {
		t.Fatalf("closed document = %#v", document)
	}
	if len(document.Logs) != 1 || document.Sanitization.OmittedLogs != 2 {
		t.Fatalf("log allowlist failed: %#v", document)
	}
	if strings.Contains(firstPreview.Payload, "private-") || strings.Contains(firstPreview.Payload, "must not cross") {
		t.Fatalf("unknown values crossed allowlist: %s", firstPreview.Payload)
	}
}

func TestAdversarialFixtureSecretsAndPathsNeverCross(t *testing.T) {
	data, err := os.ReadFile("testdata/adversarial.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			Name      string   `json:"name"`
			Message   string   `json:"message"`
			Forbidden []string `json:"forbidden"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, test := range fixture.Cases {
		t.Run(test.Name, func(t *testing.T) {
			input := validInput()
			input.Logs[0].Message = test.Message
			draft, err := Prepare(input)
			if err != nil {
				t.Fatal(err)
			}
			preview, _ := draft.Preview()
			for _, forbidden := range test.Forbidden {
				if strings.Contains(strings.ToLower(preview.Payload), strings.ToLower(forbidden)) {
					t.Fatalf("payload leaked %q:\n%s", forbidden, preview.Payload)
				}
			}
			if !strings.Contains(preview.Payload, "[REDACTED]") &&
				!strings.Contains(preview.Payload, "[PATH]") &&
				!strings.Contains(preview.Payload, "[URL]") &&
				!strings.Contains(preview.Payload, "[EMAIL]") &&
				!strings.Contains(preview.Payload, "[TOKEN]") {
				t.Fatalf("fixture did not exercise redaction: %s", preview.Payload)
			}
		})
	}
}

func TestPreviewMatchesTransportByteForByteAndDiscard(t *testing.T) {
	draft, err := Prepare(validInput())
	if err != nil {
		t.Fatal(err)
	}
	preview, err := draft.Preview()
	if err != nil {
		t.Fatal(err)
	}
	transport, err := draft.TransportPayload()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal([]byte(preview.Payload), transport) {
		t.Fatal("preview and transport payload differ")
	}
	if preview.ByteSize != len(transport) {
		t.Fatalf("byteSize=%d want=%d", preview.ByteSize, len(transport))
	}
	digest := sha256.Sum256(transport)
	if preview.SHA256 != hex.EncodeToString(digest[:]) {
		t.Fatalf("sha256=%q", preview.SHA256)
	}

	draft.Discard()
	if !draft.Discarded() {
		t.Fatal("draft was not marked discarded")
	}
	if _, err := draft.Preview(); !errors.Is(err, ErrDiscarded) {
		t.Fatalf("Preview() after discard error = %v", err)
	}
	if _, err := draft.TransportPayload(); !errors.Is(err, ErrDiscarded) {
		t.Fatalf("TransportPayload() after discard error = %v", err)
	}
}

func TestLimitsAreObservableAndPayloadRemainsBounded(t *testing.T) {
	input := validInput()
	input.Logs = make([]LogInput, MaxLogEntries+50)
	for index := range input.Logs {
		input.Logs[index] = LogInput{
			OffsetMillis: int64(index),
			Source:       LogSourceRuntime,
			Level:        LogLevelWarn,
			Code:         "runtime.warning",
			Message:      strings.Repeat(`quoted " diagnostic `, 200),
		}
	}
	draft, err := Prepare(input)
	if err != nil {
		t.Fatal(err)
	}
	preview, _ := draft.Preview()
	if preview.ByteSize > MaxPayloadBytes {
		t.Fatalf("payload has %d bytes", preview.ByteSize)
	}
	var document document
	if err := json.Unmarshal([]byte(preview.Payload), &document); err != nil {
		t.Fatal(err)
	}
	if document.Sanitization.InputLogs != len(input.Logs) ||
		document.Sanitization.IncludedLogs > MaxLogEntries ||
		document.Sanitization.OmittedLogs == 0 ||
		document.Sanitization.TruncatedMessages == 0 {
		t.Fatalf("limits were not observable: %#v", document.Sanitization)
	}
	for _, entry := range document.Logs {
		if len(entry.Message) > MaxLogMessageBytes {
			t.Fatalf("message has %d bytes", len(entry.Message))
		}
	}
}

func TestRawMessageIsBoundedBeforeRedaction(t *testing.T) {
	input := validInput()
	input.Logs[0].Message = strings.Repeat("harmless ", MaxRawLogMessageBytes) +
		` C:\Users\SyntheticUser\private`
	draft, err := Prepare(input)
	if err != nil {
		t.Fatal(err)
	}
	preview, _ := draft.Preview()
	if strings.Contains(preview.Payload, "SyntheticUser") {
		t.Fatal("discarded raw suffix crossed into the payload")
	}
	var document document
	if err := json.Unmarshal([]byte(preview.Payload), &document); err != nil {
		t.Fatal(err)
	}
	if document.Sanitization.TruncatedMessages != 1 {
		t.Fatalf("truncatedMessages=%d", document.Sanitization.TruncatedMessages)
	}
}

func TestInputScanIsBounded(t *testing.T) {
	input := validInput()
	input.Logs = make([]LogInput, MaxInputLogEntries+25)
	for index := range input.Logs {
		input.Logs[index] = LogInput{
			OffsetMillis: int64(index),
			Source:       LogSourceBackend,
			Level:        LogLevelInfo,
			Code:         "bounded.input",
			Message:      "safe",
		}
	}
	draft, err := Prepare(input)
	if err != nil {
		t.Fatal(err)
	}
	preview, _ := draft.Preview()
	var document document
	if err := json.Unmarshal([]byte(preview.Payload), &document); err != nil {
		t.Fatal(err)
	}
	if document.Sanitization.InputLogs != len(input.Logs) ||
		document.Sanitization.OmittedLogs < len(input.Logs)-MaxInputLogEntries {
		t.Fatalf("input scan was not bounded: %#v", document.Sanitization)
	}
}

func TestInvalidAuthorityFieldsFailClosed(t *testing.T) {
	for _, mutate := range []func(*Input){
		func(input *Input) { input.GeneratedAtUTC = time.Time{} },
		func(input *Input) { input.Channel = contract.ChannelMaster },
		func(input *Input) { input.Channel = contract.Channel("preview") },
	} {
		input := validInput()
		mutate(&input)
		if _, err := Prepare(input); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("Prepare() error = %v", err)
		}
	}
}

func TestDraftConcurrentPreviewAndDiscardIsSafe(t *testing.T) {
	draft, err := Prepare(validInput())
	if err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	for range 32 {
		group.Add(1)
		go func() {
			defer group.Done()
			_, err := draft.TransportPayload()
			if err != nil && !errors.Is(err, ErrDiscarded) {
				t.Errorf("TransportPayload() error = %v", err)
			}
		}()
	}
	draft.Discard()
	group.Wait()
}

func FuzzSanitizeMessageBoundsUTF8(f *testing.F) {
	for _, seed := range []string{
		`token=synthetic-secret C:\Users\SyntheticUser\private`,
		`https://user:pass@example.invalid/private?token=secret`,
		"emoji 🏁 and invalid \xff bytes",
	} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, value string) {
		got, _ := sanitizeMessage(value)
		got, _ = truncateUTF8(got, MaxLogMessageBytes)
		if len(got) > MaxLogMessageBytes {
			t.Fatalf("sanitized value has %d bytes", len(got))
		}
		if strings.ToValidUTF8(got, "") != got {
			t.Fatal("sanitized value is not valid UTF-8")
		}
		for _, character := range got {
			if character < 0x20 || character == 0x7f {
				t.Fatalf("sanitized value retained control character %U", character)
			}
		}
	})
}
