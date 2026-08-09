package notify

import (
	"errors"
	"strings"
	"testing"
)

type spyBackend struct {
	authorized  bool
	authorizeOK bool
	authErr     error
	sendErr     error
	sent        []string
	requests    int
}

func (b *spyBackend) RequestAuthorization() (bool, error) {
	b.requests++
	return b.authorizeOK, nil
}

func (b *spyBackend) Authorized() (bool, error) { return b.authorized, b.authErr }

func (b *spyBackend) Send(title, body string) error {
	if b.sendErr != nil {
		return b.sendErr
	}
	b.sent = append(b.sent, title+"|"+body)
	return nil
}

func always(value bool) func() bool { return func() bool { return value } }

func TestLaunchFinishedSendsWhenEverythingAgrees(t *testing.T) {
	backend := &spyBackend{authorized: true}
	service := New(backend, always(true), always(true))

	sent, err := service.LaunchFinished("Pro", true)

	if err != nil || !sent {
		t.Fatalf("sent=%v err=%v, want a notification", sent, err)
	}
	if len(backend.sent) != 1 || !strings.Contains(backend.sent[0], "Pro") {
		t.Fatalf("sent %v, want one mentioning the profile", backend.sent)
	}
}

func TestLaunchFinishedSaysWhenItWentBadly(t *testing.T) {
	backend := &spyBackend{authorized: true}
	service := New(backend, always(true), always(true))

	if _, err := service.LaunchFinished("Pro", false); err != nil {
		t.Fatalf("LaunchFinished: %v", err)
	}

	if !strings.Contains(backend.sent[0], "no se pudo") {
		t.Fatalf("a failed launch must say so, got %q", backend.sent[0])
	}
}

func TestLaunchFinishedStaysQuiet(t *testing.T) {
	cases := []struct {
		name       string
		authorized bool
		enabled    bool
		hidden     bool
	}{
		{"the user turned it off", true, false, true},
		{"the platform refuses", false, true, true},
		// A toast for something the user is already watching is just noise.
		{"the window is in front", true, true, false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			backend := &spyBackend{authorized: testCase.authorized}
			service := New(backend, always(testCase.enabled), always(testCase.hidden))

			sent, err := service.LaunchFinished("Pro", true)

			if err != nil {
				t.Fatalf("LaunchFinished: %v", err)
			}
			if sent || len(backend.sent) != 0 {
				t.Fatalf("expected silence, sent=%v %v", sent, backend.sent)
			}
		})
	}
}

// A build with no platform notifier must degrade to nothing happening, not to a
// crash, and must report itself as unsupported so the UI can say so.
func TestWithoutABackendEverythingIsANoOp(t *testing.T) {
	service := New(nil, always(true), always(true))

	if service.Supported() {
		t.Fatal("a service with no backend is not supported")
	}
	if sent, err := service.LaunchFinished("Pro", true); sent || err != nil {
		t.Fatalf("sent=%v err=%v, want a silent no-op", sent, err)
	}
	if granted, err := service.RequestAuthorization(); granted || err != nil {
		t.Fatalf("granted=%v err=%v, want a silent no", granted, err)
	}
}

func TestAuthorizationErrorsAreReportedNotSwallowed(t *testing.T) {
	backend := &spyBackend{authErr: errors.New("registry unavailable")}
	service := New(backend, always(true), always(true))

	if _, err := service.LaunchFinished("Pro", true); err == nil {
		t.Fatal("an authorization failure must surface")
	}
}

func TestRequestAuthorizationReachesThePlatform(t *testing.T) {
	backend := &spyBackend{authorizeOK: true}
	service := New(backend, always(true), always(true))

	granted, err := service.RequestAuthorization()

	if err != nil || !granted {
		t.Fatalf("granted=%v err=%v, want the platform's yes", granted, err)
	}
	if backend.requests != 1 {
		t.Fatalf("asked the platform %d times, want exactly 1", backend.requests)
	}
}

// SendTest deliberately ignores the preference and the window check: it exists
// to answer "is this reaching the desktop at all", which the user cannot
// otherwise find out.
func TestSendTestIgnoresThePreferenceAndTheWindow(t *testing.T) {
	backend := &spyBackend{authorized: false}
	service := New(backend, always(false), always(false))

	if err := service.SendTest(); err != nil {
		t.Fatalf("SendTest: %v", err)
	}
	if len(backend.sent) != 1 {
		t.Fatalf("sent %v, want exactly one notification", backend.sent)
	}
}

func TestSendTestReportsWhyItCouldNotSend(t *testing.T) {
	backend := &spyBackend{sendErr: errors.New("toast rejected by the shell")}
	service := New(backend, always(true), always(true))

	err := service.SendTest()

	if err == nil || !strings.Contains(err.Error(), "toast rejected") {
		t.Fatalf("err = %v, want the platform's reason", err)
	}
}

func TestSendTestSaysSoWithoutABackend(t *testing.T) {
	if err := New(nil, always(true), always(true)).SendTest(); err == nil {
		t.Fatal("an unsupported platform must report why, not pretend it sent")
	}
}
