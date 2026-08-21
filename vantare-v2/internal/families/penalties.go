package families

import "github.com/vantare/overlays/v2/internal/radio"

type penaltiesState struct {
	initialized    bool
	observedCount  int
	announcedCount int
}

func (state *penaltiesState) Reset() { *state = penaltiesState{} }

func (state *penaltiesState) Started(message radio.RadioMessage) {
	if message.Intent == IntentPenaltyCountIncreased && int(message.CoalesceRevision) > state.announcedCount {
		state.announcedCount = int(message.CoalesceRevision)
	}
}

type penaltiesFamily struct{}

func (penaltiesFamily) Evaluate(e Evidence, raw State) []radio.RadioMessage {
	state := raw.(*penaltiesState)
	if !e.PenaltyKnown {
		return nil
	}
	if !state.initialized {
		state.initialized, state.observedCount, state.announcedCount = true, e.PenaltyCount, e.PenaltyCount
		return nil
	}
	if e.PenaltyCount < state.observedCount {
		state.announcedCount = e.PenaltyCount
	}
	state.observedCount = e.PenaltyCount
	if e.PenaltyCount > state.announcedCount {
		result := message(IntentPenaltyCountIncreased, e)
		result.CoalesceRevision = uint64(e.PenaltyCount)
		return []radio.RadioMessage{result}
	}
	return nil
}
