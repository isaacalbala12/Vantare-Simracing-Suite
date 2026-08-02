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

	states := []State{
		StateStopped, StateDetecting, StateConnecting, StateLive,
		StateDegraded, StateStale, StateError, StateStopping,
	}
	allowed := map[[2]State]bool{
		{StateStopped, StateDetecting}:    true,
		{StateDetecting, StateConnecting}: true,
		{StateDetecting, StateStopping}:   true,
		{StateDetecting, StateError}:      true,
		{StateConnecting, StateLive}:      true,
		{StateConnecting, StateDegraded}:  true,
		{StateConnecting, StateStale}:     true,
		{StateConnecting, StateStopping}:  true,
		{StateConnecting, StateError}:     true,
		{StateLive, StateDegraded}:        true,
		{StateLive, StateStale}:           true,
		{StateLive, StateStopping}:        true,
		{StateLive, StateError}:           true,
		{StateDegraded, StateLive}:        true,
		{StateDegraded, StateStale}:       true,
		{StateDegraded, StateStopping}:    true,
		{StateDegraded, StateError}:       true,
		{StateStale, StateConnecting}:     true,
		{StateStale, StateLive}:           true,
		{StateStale, StateDegraded}:       true,
		{StateStale, StateStopping}:       true,
		{StateStale, StateError}:          true,
		{StateError, StateStopped}:        true,
		{StateError, StateDetecting}:      true,
		{StateError, StateStopping}:       true,
		{StateStopping, StateStopped}:     true,
		{StateStopping, StateError}:       true,
	}

	for _, from := range states {
		for _, to := range states {
			want := allowed[[2]State{from, to}]
			if got := from.CanTransitionTo(to); got != want {
				t.Fatalf("%s -> %s = %v, want %v", from, to, got, want)
			}
		}
	}
	if State(255).CanTransitionTo(StateStopped) || StateStopped.CanTransitionTo(State(255)) {
		t.Fatal("unknown lifecycle state accepted")
	}
}
