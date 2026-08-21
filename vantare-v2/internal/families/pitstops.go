package families

import "github.com/vantare/overlays/v2/internal/radio"

type pitstopsState struct {
	initialized bool
	inPit       bool
	generation  uint64
	announced   uint64
}

func (state *pitstopsState) Reset() { *state = pitstopsState{} }

func (state *pitstopsState) Started(message radio.RadioMessage) {
	if message.CoalesceRevision > state.announced {
		state.announced = message.CoalesceRevision
	}
}

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
	if state.inPit != e.InPit {
		state.inPit = e.InPit
		state.generation++
	}
	if state.announced < state.generation {
		intent := IntentPitExit
		if state.inPit {
			intent = IntentPitEntry
		}
		result := message(intent, e)
		result.CoalesceRevision = state.generation
		return []radio.RadioMessage{result}
	}
	return nil
}
