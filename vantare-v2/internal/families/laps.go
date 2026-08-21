package families

import "github.com/vantare/overlays/v2/internal/radio"

type lapsState struct {
	initialized  bool
	observedLap  int
	announcedLap int
}

func (state *lapsState) Reset() { *state = lapsState{} }

func (state *lapsState) Started(message radio.RadioMessage) {
	if message.Intent == IntentLapCompleted && int(message.CoalesceRevision) > state.announcedLap {
		state.announcedLap = int(message.CoalesceRevision)
	}
}

type lapsFamily struct{}

func (lapsFamily) Evaluate(e Evidence, raw State) []radio.RadioMessage {
	state := raw.(*lapsState)
	if !e.LapKnown {
		return nil
	}
	if !state.initialized {
		state.initialized, state.observedLap, state.announcedLap = true, e.Lap, e.Lap
		return nil
	}
	if e.Lap < state.observedLap {
		state.announcedLap = e.Lap
	}
	state.observedLap = e.Lap
	if e.Lap > state.announcedLap && e.Lap > 0 {
		result := message(IntentLapCompleted, e)
		result.CoalesceRevision = uint64(e.Lap)
		return []radio.RadioMessage{result}
	}
	return nil
}
