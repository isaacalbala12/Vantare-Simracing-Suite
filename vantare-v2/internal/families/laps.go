package families

import "github.com/vantare/overlays/v2/internal/radio"

type lapsState struct {
	initialized bool
	lap         int
}

func (state *lapsState) Reset() { *state = lapsState{} }

type lapsFamily struct{}

func (lapsFamily) Evaluate(e Evidence, raw State) []radio.RadioMessage {
	state := raw.(*lapsState)
	if !e.LapKnown {
		return nil
	}
	if !state.initialized {
		state.initialized, state.lap = true, e.Lap
		return nil
	}
	previous := state.lap
	state.lap = e.Lap
	if e.Lap > previous && e.Lap > 0 {
		return []radio.RadioMessage{message(IntentLapCompleted, e)}
	}
	return nil
}
