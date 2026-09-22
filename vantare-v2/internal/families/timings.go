package families

import "github.com/vantare/overlays/v2/internal/radio"

type timingsState struct {
	initialized bool
}

func (state *timingsState) Reset() { *state = timingsState{} }

func (state *timingsState) Started(radio.RadioMessage) {}

type timingsFamily struct{}

func timingsReady(e Evidence) bool {
	if !e.SessionTypeKnown || (e.SessionType != "race" && e.SessionType != "endurance") ||
		!e.PitKnown || e.InPit || (!e.GapLeaderKnown && !e.GapNextKnown) ||
		!e.EndTimeKnown || !(e.EndTime >= 0) {
		return false
	}
	// LMU/rF2 uses a positive session end time for fixed-time races, even
	// with a lap limit. Unusable end evidence must not reopen reports when
	// the source invalidates its elapsed clock; only an observed zero can
	// take the non-timed path.
	if e.EndTime > 0 {
		return e.RemainingKnown && e.Remaining >= 120
	}
	return true
}

func (timingsFamily) Evaluate(e Evidence, raw State) []radio.RadioMessage {
	state := raw.(*timingsState)
	if !timingsReady(e) {
		return nil
	}
	if !state.initialized {
		state.initialized = true
		return nil
	}
	readable := (e.GapLeaderKnown && e.GapLeader > 0.5 && e.GapLeader < 20) || (e.GapNextKnown && e.GapNext > 0.5 && e.GapNext < 20)
	if readable {
		return []radio.RadioMessage{message(IntentTimingGapReport, e)}
	}
	return nil
}
