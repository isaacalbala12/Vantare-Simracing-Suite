package app

import (
	"regexp"
	"runtime"
	"time"

	"github.com/vantare/overlays/v2/internal/testingcenter/contract"
	"github.com/vantare/overlays/v2/internal/testingcenter/diagnostic"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	TestingCenterDiagnosticEventPrepare  = "testing-center:diagnostic:prepare"
	TestingCenterDiagnosticEventPrepared = "testing-center:diagnostic:prepared"
	TestingCenterDiagnosticEventError    = "testing-center:diagnostic:error"
)

type TestingCenterDiagnosticErrorCode string

const (
	TestingCenterDiagnosticErrorInvalidRequest TestingCenterDiagnosticErrorCode = "invalid_request"
	TestingCenterDiagnosticErrorUnavailable    TestingCenterDiagnosticErrorCode = "unavailable"
)

var testingCenterAppVersionPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$`)

type TestingCenterDiagnosticPrepareRequest struct {
	RequestID   string            `json:"requestId"`
	Module      diagnostic.Module `json:"module"`
	IncludeLogs bool              `json:"includeLogs"`
}

type TestingCenterDiagnosticEnvironment struct {
	AppVersion        string `json:"appVersion"`
	OSFamily          string `json:"osFamily"`
	OSVersion         string `json:"osVersion"`
	Arch              string `json:"arch"`
	AvailableLogCount int    `json:"availableLogCount"`
	Channel           string `json:"channel"`
}

type TestingCenterDiagnosticPreparedResponse struct {
	RequestID   string                             `json:"requestId"`
	Preview     diagnostic.Preview                 `json:"preview"`
	Environment TestingCenterDiagnosticEnvironment `json:"environment"`
}

type TestingCenterDiagnosticErrorResponse struct {
	RequestID string                           `json:"requestId"`
	Code      TestingCenterDiagnosticErrorCode `json:"code"`
}

// TestingCenterDiagnosticBridge prepares one ephemeral, sanitized package.
// It owns no log collector and never persists or transports the preview.
type TestingCenterDiagnosticBridge struct {
	appVersion string
	channel    contract.Channel
	emitter    EventEmitter
	now        func() time.Time
}

func NewTestingCenterDiagnosticBridge(appVersion, buildChannel string, emitter EventEmitter) *TestingCenterDiagnosticBridge {
	if !testingCenterAppVersionPattern.MatchString(appVersion) {
		appVersion = "unknown"
	}
	return &TestingCenterDiagnosticBridge{
		appVersion: appVersion,
		channel:    TestingCenterBuildChannel(buildChannel),
		emitter:    emitter,
		now:        time.Now,
	}
}

func (b *TestingCenterDiagnosticBridge) RegisterHandlers(wailsApp *application.App) {
	if b == nil || wailsApp == nil {
		return
	}
	wailsApp.Event.On(TestingCenterDiagnosticEventPrepare, func(event *application.CustomEvent) {
		b.HandlePrepare(event.Data)
	})
}

func (b *TestingCenterDiagnosticBridge) HandlePrepare(data any) {
	if b == nil {
		return
	}
	var request TestingCenterDiagnosticPrepareRequest
	if err := decodeTestingCenterReportDraftInput(data, &request); err != nil ||
		!safeRequestID(request.RequestID) ||
		!testingCenterDiagnosticChannel(b.channel) ||
		!testingCenterDiagnosticModule(request.Module) {
		b.emitError(testingCenterReportDraftCorrelationID(data, request.RequestID), TestingCenterDiagnosticErrorInvalidRequest)
		return
	}

	draft, err := diagnostic.Prepare(diagnostic.Input{
		GeneratedAtUTC: b.now().UTC(),
		AppVersion:     b.appVersion,
		Channel:        b.channel,
		OS:             runtime.GOOS,
		Arch:           runtime.GOARCH,
		Module:         request.Module,
		ErrorCode:      "tester.report",
		// TAU-04C deliberately has no log collector. An empty list is the
		// truthful result even if an adversarial client asks for logs.
		Logs: nil,
	})
	if err != nil {
		b.emitError(request.RequestID, TestingCenterDiagnosticErrorUnavailable)
		return
	}
	defer draft.Discard()
	preview, err := draft.Preview()
	if err != nil {
		b.emitError(request.RequestID, TestingCenterDiagnosticErrorUnavailable)
		return
	}

	b.emit(TestingCenterDiagnosticEventPrepared, TestingCenterDiagnosticPreparedResponse{
		RequestID: request.RequestID,
		Preview:   preview,
		Environment: TestingCenterDiagnosticEnvironment{
			AppVersion:        b.appVersion,
			OSFamily:          runtime.GOOS,
			OSVersion:         testingCenterOSVersion(runtime.GOOS),
			Arch:              runtime.GOARCH,
			AvailableLogCount: 0,
			Channel:           string(b.channel),
		},
	})
}

// TestingCenterBuildChannel returns the closed release-channel identity used
// by both the diagnostic bridge and the app metadata event.
func TestingCenterBuildChannel(value string) contract.Channel {
	switch contract.Channel(value) {
	case contract.ChannelNightly:
		return contract.ChannelNightly
	case contract.ChannelTesters:
		return contract.ChannelTesters
	default:
		return contract.ChannelMaster
	}
}

func (b *TestingCenterDiagnosticBridge) emit(name string, payload any) {
	if b != nil && b.emitter != nil {
		b.emitter.Emit(name, payload)
	}
}

func (b *TestingCenterDiagnosticBridge) emitError(requestID string, code TestingCenterDiagnosticErrorCode) {
	b.emit(TestingCenterDiagnosticEventError, TestingCenterDiagnosticErrorResponse{
		RequestID: requestID,
		Code:      code,
	})
}

func testingCenterDiagnosticChannel(channel contract.Channel) bool {
	return channel == contract.ChannelNightly || channel == contract.ChannelTesters
}

func testingCenterDiagnosticModule(module diagnostic.Module) bool {
	switch module {
	case diagnostic.ModuleUnknown, diagnostic.ModuleHub, diagnostic.ModuleLauncher,
		diagnostic.ModuleSettings, diagnostic.ModuleOverlayStudio,
		diagnostic.ModuleOverlayRuntime, diagnostic.ModuleTelemetry,
		diagnostic.ModuleTelemetryAnalysis, diagnostic.ModuleEngineer,
		diagnostic.ModuleStrategy, diagnostic.ModuleCalendar, diagnostic.ModuleBilling,
		diagnostic.ModuleAccount, diagnostic.ModuleUpdater, diagnostic.ModuleTestingCenter:
		return true
	default:
		return false
	}
}
