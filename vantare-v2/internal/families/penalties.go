package families

import "github.com/vantare/overlays/v2/internal/radio"

type penaltiesState struct {
	initialized bool
	count       int
}

func (state *penaltiesState) Reset() { *state = penaltiesState{} }

type penaltiesFamily struct{}

func (penaltiesFamily) Evaluate(e Evidence, raw State) []radio.RadioMessage {
	state := raw.(*penaltiesState)
	if !e.PenaltyKnown {
		return nil
	}
	if !state.initialized {
		state.initialized, state.count = true, e.PenaltyCount
		return nil
	}
	previous := state.count
	state.count = e.PenaltyCount
	if e.PenaltyCount > previous {
		return []radio.RadioMessage{message(IntentPenaltyCountIncreased, e)}
	}
	return nil
}
