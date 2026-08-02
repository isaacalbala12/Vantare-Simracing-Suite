// Package diagnostic builds the local, sanitized evidence package used by the
// Testing Center. It performs no persistence, networking, or UI work.
package diagnostic

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/testingcenter/contract"
)

const (
	CurrentVersion        = "testing-center.diagnostic.v1"
	MaxPayloadBytes       = 64 * 1024
	MaxInputLogEntries    = 1_000
	MaxLogEntries         = 100
	MaxRawLogMessageBytes = 4 * 1024
	MaxLogMessageBytes    = 512
	MaxLogOffsetMillis    = int64((24 * time.Hour) / time.Millisecond)
	unknownClosedValue    = "unknown"
	unavailableLogDetail  = "unavailable"
)

var (
	ErrInvalidInput = errors.New("testing center diagnostic input is invalid")
	ErrDiscarded    = errors.New("testing center diagnostic draft was discarded")
	closedToken     = regexp.MustCompile(`^[a-z0-9][a-z0-9._+-]{0,63}$`)
)

type Module string

const (
	ModuleUnknown           Module = unknownClosedValue
	ModuleHub               Module = "hub"
	ModuleLauncher          Module = "launcher"
	ModuleSettings          Module = "settings"
	ModuleOverlayStudio     Module = "overlay_studio"
	ModuleOverlayRuntime    Module = "overlay_runtime"
	ModuleTelemetry         Module = "telemetry"
	ModuleTelemetryAnalysis Module = "telemetry_analysis"
	ModuleEngineer          Module = "engineer"
	ModuleStrategy          Module = "strategy"
	ModuleCalendar          Module = "calendar"
	ModuleBilling           Module = "billing"
	ModuleAccount           Module = "account"
	ModuleUpdater           Module = "updater"
	ModuleTestingCenter     Module = "testing_center"
)

type LogSource string

const (
	LogSourceFrontend LogSource = "frontend"
	LogSourceBackend  LogSource = "backend"
	LogSourceWails    LogSource = "wails"
	LogSourceRuntime  LogSource = "runtime"
)

type LogLevel string

const (
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

type Input struct {
	GeneratedAtUTC time.Time
	AppVersion     string
	Channel        contract.Channel
	OS             string
	Arch           string
	Module         Module
	ErrorCode      string
	Logs           []LogInput
}

type LogInput struct {
	OffsetMillis int64
	Source       LogSource
	Level        LogLevel
	Code         string
	Message      string
}

type document struct {
	ContractVersion string          `json:"contractVersion"`
	GeneratedAtUTC  time.Time       `json:"generatedAtUtc"`
	Application     application     `json:"application"`
	Module          Module          `json:"module"`
	ErrorCode       string          `json:"errorCode"`
	Logs            []logEntry      `json:"logs"`
	Sanitization    sanitizationLog `json:"sanitization"`
}

type application struct {
	Version string           `json:"version"`
	Channel contract.Channel `json:"channel"`
	OS      string           `json:"os"`
	Arch    string           `json:"arch"`
}

type logEntry struct {
	OffsetMillis int64     `json:"offsetMillis"`
	Source       LogSource `json:"source"`
	Level        LogLevel  `json:"level"`
	Code         string    `json:"code"`
	Message      string    `json:"message"`
}

type sanitizationLog struct {
	InputLogs         int `json:"inputLogs"`
	IncludedLogs      int `json:"includedLogs"`
	OmittedLogs       int `json:"omittedLogs"`
	RedactedValues    int `json:"redactedValues"`
	TruncatedMessages int `json:"truncatedMessages"`
}

type Preview struct {
	ContractVersion string `json:"contractVersion"`
	Payload         string `json:"payload"`
	SHA256          string `json:"sha256"`
	ByteSize        int    `json:"byteSize"`
}

// Draft owns the only package bytes until the caller previews, transports, or
// discards them. Discard removes and overwrites the owned copy; it cannot revoke
// copies that a caller already requested.
type Draft struct {
	mu        sync.RWMutex
	payload   []byte
	sha256    string
	discarded bool
}

func Prepare(input Input) (*Draft, error) {
	document, err := buildDocument(input)
	if err != nil {
		return nil, err
	}
	payload, err := marshalWithinLimit(&document)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(payload)
	return &Draft{
		payload: payload,
		sha256:  hex.EncodeToString(digest[:]),
	}, nil
}

func (draft *Draft) Preview() (Preview, error) {
	if draft == nil {
		return Preview{}, ErrDiscarded
	}
	draft.mu.RLock()
	defer draft.mu.RUnlock()
	if draft.discarded {
		return Preview{}, ErrDiscarded
	}
	return Preview{
		ContractVersion: CurrentVersion,
		Payload:         string(draft.payload),
		SHA256:          draft.sha256,
		ByteSize:        len(draft.payload),
	}, nil
}

func (draft *Draft) TransportPayload() ([]byte, error) {
	if draft == nil {
		return nil, ErrDiscarded
	}
	draft.mu.RLock()
	defer draft.mu.RUnlock()
	if draft.discarded {
		return nil, ErrDiscarded
	}
	return append([]byte(nil), draft.payload...), nil
}

func (draft *Draft) Discard() {
	if draft == nil {
		return
	}
	draft.mu.Lock()
	defer draft.mu.Unlock()
	for index := range draft.payload {
		draft.payload[index] = 0
	}
	draft.payload = nil
	draft.sha256 = ""
	draft.discarded = true
}

func (draft *Draft) Discarded() bool {
	if draft == nil {
		return true
	}
	draft.mu.RLock()
	defer draft.mu.RUnlock()
	return draft.discarded
}

func buildDocument(input Input) (document, error) {
	if input.GeneratedAtUTC.IsZero() {
		return document{}, fmt.Errorf("generatedAtUtc: %w", ErrInvalidInput)
	}
	if input.Channel != contract.ChannelNightly && input.Channel != contract.ChannelTesters {
		return document{}, fmt.Errorf("channel: %w", ErrInvalidInput)
	}
	document := document{
		ContractVersion: CurrentVersion,
		GeneratedAtUTC:  input.GeneratedAtUTC.Round(0).UTC(),
		Application: application{
			Version: closedVersion(input.AppVersion),
			Channel: input.Channel,
			OS:      closedOS(input.OS),
			Arch:    closedArch(input.Arch),
		},
		Module:    closedModule(input.Module),
		ErrorCode: closedCode(input.ErrorCode),
		Logs:      make([]logEntry, 0, min(len(input.Logs), MaxLogEntries)),
		Sanitization: sanitizationLog{
			InputLogs:   len(input.Logs),
			OmittedLogs: max(0, len(input.Logs)-MaxInputLogEntries),
		},
	}

	for _, raw := range input.Logs[:min(len(input.Logs), MaxInputLogEntries)] {
		if len(document.Logs) == MaxLogEntries {
			document.Sanitization.OmittedLogs++
			continue
		}
		if !validLogSource(raw.Source) || !validLogLevel(raw.Level) ||
			raw.OffsetMillis < 0 || raw.OffsetMillis > MaxLogOffsetMillis {
			document.Sanitization.OmittedLogs++
			continue
		}
		rawMessage, rawTruncated := truncateUTF8(
			strings.ToValidUTF8(raw.Message, "�"),
			MaxRawLogMessageBytes,
		)
		message, redacted := sanitizeMessage(rawMessage)
		message, sanitizedTruncated := truncateUTF8(message, MaxLogMessageBytes)
		if message == "" {
			message = unavailableLogDetail
		}
		document.Sanitization.RedactedValues += redacted
		if rawTruncated || sanitizedTruncated {
			document.Sanitization.TruncatedMessages++
		}
		document.Logs = append(document.Logs, logEntry{
			OffsetMillis: raw.OffsetMillis,
			Source:       raw.Source,
			Level:        raw.Level,
			Code:         closedCode(raw.Code),
			Message:      message,
		})
	}
	document.Sanitization.IncludedLogs = len(document.Logs)
	return document, nil
}

func marshalWithinLimit(document *document) ([]byte, error) {
	for {
		payload, err := json.MarshalIndent(document, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("marshal diagnostic: %w", err)
		}
		if len(payload) <= MaxPayloadBytes {
			return payload, nil
		}
		if len(document.Logs) == 0 {
			return nil, fmt.Errorf("payload: %w", ErrInvalidInput)
		}
		document.Logs = document.Logs[:len(document.Logs)-1]
		document.Sanitization.IncludedLogs--
		document.Sanitization.OmittedLogs++
	}
}

func closedVersion(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 32 || !closedToken.MatchString(strings.ToLower(value)) {
		return unknownClosedValue
	}
	return value
}

func closedCode(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if !closedToken.MatchString(value) {
		return unknownClosedValue
	}
	return value
}

func closedOS(value string) string {
	switch strings.ToLower(value) {
	case "windows", "linux", "darwin":
		return strings.ToLower(value)
	default:
		return unknownClosedValue
	}
}

func closedArch(value string) string {
	switch strings.ToLower(value) {
	case "amd64", "arm64":
		return strings.ToLower(value)
	default:
		return unknownClosedValue
	}
}

func closedModule(value Module) Module {
	switch value {
	case ModuleHub, ModuleLauncher, ModuleSettings, ModuleOverlayStudio,
		ModuleOverlayRuntime, ModuleTelemetry, ModuleTelemetryAnalysis,
		ModuleEngineer, ModuleStrategy, ModuleCalendar, ModuleBilling,
		ModuleAccount, ModuleUpdater, ModuleTestingCenter:
		return value
	default:
		return ModuleUnknown
	}
}

func validLogSource(value LogSource) bool {
	return value == LogSourceFrontend || value == LogSourceBackend ||
		value == LogSourceWails || value == LogSourceRuntime
}

func validLogLevel(value LogLevel) bool {
	return value == LogLevelInfo || value == LogLevelWarn || value == LogLevelError
}
