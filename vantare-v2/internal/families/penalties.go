package families

import "github.com/vantare/overlays/v2/internal/radio"

type penaltiesState struct {
	initialized    bool
	observedCount  int
	announcedCount int
	generation     uint64
	intentRevision uint64
	resetIntent    bool
}

func (state *penaltiesState) Reset() {
	state.generation++
	*state = penaltiesState{generation: state.generation, intentRevision: state.generation}
}

func (state *penaltiesState) InvalidateIntents(intents ...string) {
	for _, intent := range intents {
		if intent == IntentPenaltyCountIncreased {
			state.generation++
			state.intentRevision = state.generation
			state.resetIntent = true
			return
		}
	}
}

func (state *penaltiesState) TakeResetIntents() []string {
	if !state.resetIntent {
		return nil
	}
	state.resetIntent = false
	return []string{IntentPenaltyCountIncreased}
}

func (state *penaltiesState) Started(message radio.RadioMessage) {
	if message.Intent == IntentPenaltyCountIncreased && message.ProducerRevision == state.intentRevision && int(message.CoalesceRevision) > state.announcedCount {
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
		state.InvalidateIntents(IntentPenaltyCountIncreased)
		state.announcedCount = e.PenaltyCount
	}
	state.observedCount = e.PenaltyCount
	if e.PenaltyCount > state.announcedCount {
		result := message(IntentPenaltyCountIncreased, e)
		result.CoalesceRevision = uint64(e.PenaltyCount)
		result.ProducerRevision = state.intentRevision
		return []radio.RadioMessage{result}
	}
	return nil
}
