package identity

import "testing"

func TestRunIdentityContinuity(t *testing.T) {
	t.Parallel()

	base := RunIdentity{Event: "event-1", Session: "session-1", Vehicle: "car-7", Team: "team-a", Driver: "driver-a"}
	tests := []struct {
		name string
		next RunIdentity
		want bool
	}{
		{name: "same", next: base, want: true},
		{name: "driver change", next: RunIdentity{Event: base.Event, Session: base.Session, Vehicle: base.Vehicle, Team: base.Team, Driver: "driver-b"}, want: true},
		{name: "team change", next: RunIdentity{Event: base.Event, Session: base.Session, Vehicle: base.Vehicle, Team: "team-b", Driver: base.Driver}, want: true},
		{name: "event change", next: RunIdentity{Event: "event-2", Session: base.Session, Vehicle: base.Vehicle}},
		{name: "session change", next: RunIdentity{Event: base.Event, Session: "session-2", Vehicle: base.Vehicle}},
		{name: "vehicle change", next: RunIdentity{Event: base.Event, Session: base.Session, Vehicle: "car-8"}},
		{name: "incomplete identity", next: RunIdentity{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := base.SameRun(tt.next); got != tt.want {
				t.Fatalf("SameRun() = %v, want %v", got, tt.want)
			}
		})
	}
}
