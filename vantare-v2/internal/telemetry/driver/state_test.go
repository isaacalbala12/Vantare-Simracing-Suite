package driver

import "testing"

func TestAllStatesAreKnownAndNamed(t *testing.T) {
	t.Parallel()

	states := []State{
		StateStopped,
		StateDetecting,
		StateConnecting,
		StateLive,
		StateDegraded,
		StateStale,
		StateError,
		StateStopping,
	}
	for _, state := range states {
		if !state.Known() {
			t.Fatalf("state %d is not known", state)
		}
		if state.String() == "unknown" {
			t.Fatalf("state %d has no stable name", state)
		}
	}
	if State(255).Known() {
		t.Fatal("unknown state reported as known")
	}
}

func TestLifecycleTransitions(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		from State
		to   State
		want bool
	}{
		{name: "start detection", from: StateStopped, to: StateDetecting, want: true},
		{name: "connect after detection", from: StateDetecting, to: StateConnecting, want: true},
		{name: "become live", from: StateConnecting, to: StateLive, want: true},
		{name: "live degrades", from: StateLive, to: StateDegraded, want: true},
		{name: "degraded recovers", from: StateDegraded, to: StateLive, want: true},
		{name: "stale reconnects", from: StateStale, to: StateConnecting, want: true},
		{name: "shutdown starts", from: StateLive, to: StateStopping, want: true},
		{name: "shutdown completes", from: StateStopping, to: StateStopped, want: true},
		{name: "error may stop", from: StateError, to: StateStopped, want: true},
		{name: "cannot skip detection", from: StateStopped, to: StateLive},
		{name: "cannot leave stopping for live", from: StateStopping, to: StateLive},
		{name: "same state is not a transition", from: StateLive, to: StateLive},
		{name: "unknown source rejected", from: State(255), to: StateStopped},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.from.CanTransitionTo(tt.to); got != tt.want {
				t.Fatalf("%s -> %s = %v, want %v", tt.from, tt.to, got, tt.want)
			}
		})
	}
}
