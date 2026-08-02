package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"runtime"
	"sync"
	"testing"
	"time"
)

type testingCenterDiagnosticEventSpy struct {
	mu     sync.Mutex
	events []reportDraftEvent
}

func (s *testingCenterDiagnosticEventSpy) Emit(name string, data any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, reportDraftEvent{name: name, data: data})
}

func (s *testingCenterDiagnosticEventSpy) last(t *testing.T) reportDraftEvent {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.events) == 0 {
		t.Fatal("no Testing Center diagnostic event emitted")
	}
	return s.events[len(s.events)-1]
}

func TestTestingCenterDiagnosticBridgeReturnsExactSanitizedPreview(t *testing.T) {
	spy := &testingCenterDiagnosticEventSpy{}
	bridge := NewTestingCenterDiagnosticBridge("v0.1.0.5", "nightly", spy)
	bridge.now = func() time.Time { return time.Date(2026, 8, 2, 20, 0, 0, 0, time.UTC) }

	bridge.HandlePrepare(map[string]any{
		"requestId":   "request-valid-1",
		"module":      "launcher",
		"includeLogs": true,
	})

	event := spy.last(t)
	if event.name != TestingCenterDiagnosticEventPrepared {
		t.Fatalf("event = %q", event.name)
	}
	response := event.data.(TestingCenterDiagnosticPreparedResponse)
	wantDigest := sha256.Sum256([]byte(response.Preview.Payload))
	if response.Preview.SHA256 != hex.EncodeToString(wantDigest[:]) ||
		response.Preview.ByteSize != len([]byte(response.Preview.Payload)) {
		t.Fatal("preview bytes, size and digest do not match")
	}
	if response.Environment.AvailableLogCount != 0 || response.Environment.AppVersion != "v0.1.0.5" ||
		response.Environment.Channel != "nightly" {
		t.Fatalf("environment = %#v", response.Environment)
	}
	var payload struct {
		Application struct {
			Version string `json:"version"`
			Channel string `json:"channel"`
			OS      string `json:"os"`
			Arch    string `json:"arch"`
		} `json:"application"`
		Module string `json:"module"`
		Logs   []any  `json:"logs"`
	}
	if err := json.Unmarshal([]byte(response.Preview.Payload), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Application.Version != "v0.1.0.5" || payload.Application.Channel != "nightly" ||
		payload.Application.OS != runtime.GOOS || payload.Application.Arch != runtime.GOARCH ||
		payload.Module != "launcher" || len(payload.Logs) != 0 {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestTestingCenterDiagnosticBridgeRejectsUntrustedAuthorityFields(t *testing.T) {
	for name, request := range map[string]map[string]any{
		"client channel": {
			"requestId": "request-channel-1", "channel": "testers", "module": "hub", "includeLogs": false,
		},
		"unknown module": {
			"requestId": "request-module-1", "module": "filesystem", "includeLogs": false,
		},
		"unknown field": {
			"requestId": "request-field-1", "module": "hub", "includeLogs": false, "token": "secret",
		},
	} {
		t.Run(name, func(t *testing.T) {
			spy := &testingCenterDiagnosticEventSpy{}
			NewTestingCenterDiagnosticBridge("v0.1.0.5", "testers", spy).HandlePrepare(request)
			event := spy.last(t)
			if event.name != TestingCenterDiagnosticEventError ||
				event.data.(TestingCenterDiagnosticErrorResponse).Code != TestingCenterDiagnosticErrorInvalidRequest {
				t.Fatalf("event = %#v", event)
			}
		})
	}
}

func TestTestingCenterDiagnosticBridgeClosesInvalidBuildVersion(t *testing.T) {
	spy := &testingCenterDiagnosticEventSpy{}
	bridge := NewTestingCenterDiagnosticBridge("invalid version with spaces", "testers", spy)
	bridge.HandlePrepare(map[string]any{
		"requestId": "request-version-1", "module": "hub", "includeLogs": false,
	})
	response := spy.last(t).data.(TestingCenterDiagnosticPreparedResponse)
	if response.Environment.AppVersion != "unknown" {
		t.Fatalf("app version = %q", response.Environment.AppVersion)
	}
}

func TestTestingCenterDiagnosticBridgeFailsClosedOutsideInternalBuilds(t *testing.T) {
	for _, channel := range []string{"master", "stable", "NIGHTLY", ""} {
		t.Run(channel, func(t *testing.T) {
			spy := &testingCenterDiagnosticEventSpy{}
			NewTestingCenterDiagnosticBridge("v0.1.0.5", channel, spy).HandlePrepare(map[string]any{
				"requestId": "request-closed-1", "module": "hub", "includeLogs": false,
			})
			event := spy.last(t)
			if event.name != TestingCenterDiagnosticEventError ||
				event.data.(TestingCenterDiagnosticErrorResponse).Code != TestingCenterDiagnosticErrorInvalidRequest {
				t.Fatalf("event = %#v", event)
			}
		})
	}
}

func TestTestingCenterBuildChannelIsClosed(t *testing.T) {
	for input, want := range map[string]string{
		"nightly": "nightly", "testers": "testers", "master": "master", "stable": "master", "": "master",
	} {
		if got := string(TestingCenterBuildChannel(input)); got != want {
			t.Fatalf("TestingCenterBuildChannel(%q) = %q, want %q", input, got, want)
		}
	}
}
