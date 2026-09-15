package notify

import (
	"errors"
	"strings"
	"testing"
)

func TestCalendarReminderUsesExistingNotificationGates(t *testing.T) {
	for _, test := range []struct {
		name                              string
		enabled, authorized, hidden, want bool
	}{
		{"accepted", true, true, true, true},
		{"disabled", false, true, true, false},
		{"denied", true, false, true, false},
		{"visible", true, true, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			backend := &spyBackend{authorized: test.authorized}
			service := New(backend, always(test.enabled), always(test.hidden))
			sent, err := service.CalendarReminder("LMGT3", "Fuji", 5)
			if err != nil || sent != test.want {
				t.Fatalf("sent=%v err=%v", sent, err)
			}
			if len(backend.sent) != 0 && (!strings.Contains(backend.sent[0], "LMGT3") || !strings.Contains(backend.sent[0], "Fuji") || !strings.Contains(backend.sent[0], "5 min")) {
				t.Fatalf("missing reminder context: %v", backend.sent)
			}
			if !test.want && len(backend.sent) != 0 {
				t.Fatal("sent while gated")
			}
			if backend.requests != 0 {
				t.Fatal("asked permission without user action")
			}
		})
	}
}

func TestCalendarReminderReportsErrorsAndUnsupportedPlatform(t *testing.T) {
	failure := errors.New("platform error")
	for _, backend := range []*spyBackend{{authErr: failure}, {authorized: true, sendErr: failure}} {
		service := New(backend, always(true), always(true))
		if sent, err := service.CalendarReminder("Race", "Track", 2); sent || !errors.Is(err, failure) {
			t.Fatalf("sent=%v err=%v", sent, err)
		}
	}
	if sent, err := New(nil, always(true), always(true)).CalendarReminder("Race", "Track", 2); sent || err != nil {
		t.Fatalf("sent=%v err=%v", sent, err)
	}
}
