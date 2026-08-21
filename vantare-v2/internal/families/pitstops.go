package families

import "github.com/vantare/overlays/v2/internal/radio"

type pitstopsState struct {
	initialized bool
	inPit       bool
}

func (state *pitstopsState) Reset() { *state = pitstopsState{} }

type pitstopsFamily struct{}

func (pitstopsFamily) Evaluate(e Evidence, raw State) []radio.RadioMessage {
	state := raw.(*pitstopsState)
	if !e.PitKnown {
		return nil
	}
	if !state.initialized {
		state.initialized, state.inPit = true, e.InPit
		return nil
	}
	previous := state.inPit
	state.inPit = e.InPit
	if !previous && e.InPit {
		return []radio.RadioMessage{message(IntentPitEntry, e)}
	}
	if previous && !e.InPit {
		return []radio.RadioMessage{message(IntentPitExit, e)}
	}
	return nil
}
