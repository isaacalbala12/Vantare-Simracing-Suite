package families

import "github.com/vantare/overlays/v2/internal/radio"

type timingsState struct {
	initialized bool
}

func (state *timingsState) Reset() { *state = timingsState{} }

func (state *timingsState) Started(radio.RadioMessage) {}

type timingsFamily struct{}

func (timingsFamily) Evaluate(e Evidence, raw State) []radio.RadioMessage {
	state := raw.(*timingsState)
	if (!e.GapLeaderKnown && !e.GapNextKnown) || (e.PitKnown && e.InPit) {
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
