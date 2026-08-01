package messagepolicy

// spotterSituation is the complete state that policy can prove from the
// bounded Spotter evidence. It deliberately does not model geometry or infer
// a state that the projection did not provide.
type spotterSituation uint8

const (
	spotterSituationUnknown spotterSituation = iota
	spotterSituationAllClear
	spotterSituationLeft
	spotterSituationRight
	spotterSituationThreeWide
)

// spotterMessageKind removes string ordering from supersession decisions.
// Intent strings cross the Candidate contract once, through the explicit
// mapping below; the scheduler compares only these finite values.
type spotterMessageKind uint8

const (
	spotterMessageUnknown spotterMessageKind = iota
	spotterMessageCarLeft
	spotterMessageCarRight
	spotterMessageStillThere
	spotterMessageClearLeft
	spotterMessageClearRight
	spotterMessageAllClear
	spotterMessageThreeWide
	spotterMessageKindCount
)

type spotterMessageValue uint8

const (
	spotterMessageNotApplicable spotterMessageValue = iota
	spotterMessageReminder
	spotterMessageCompatible
	spotterMessageCurrent
)

// spotterDeliveryState records only handoff through Next. Pending candidates
// are not communication: a later contextual clear cannot rely on them.
// generation changes with every proven occupancy transition and prevents an
// older dispatched state from authorizing a clear after an unseen transition.
type spotterDeliveryState struct {
	observed             bool
	situation            spotterSituation
	generation           uint64
	dispatchedSituation  spotterSituation
	dispatchedGeneration uint64
	clearLeftGeneration  uint64
	clearRightGeneration uint64
	clearLeftFrom        spotterSituation
	clearRightFrom       spotterSituation
}

// spotterMessageValues is the auditable supersession contract. A larger value
// carries more useful information for the proven current situation. Equal
// values retain admission order; a later, less specific message never replaces
// a more valuable pending message while evidence remains unchanged.
var spotterMessageValues = [spotterSituationThreeWide + 1][spotterMessageKindCount]spotterMessageValue{
	spotterSituationAllClear: {
		spotterMessageClearLeft:  spotterMessageCompatible,
		spotterMessageClearRight: spotterMessageCompatible,
		spotterMessageAllClear:   spotterMessageCurrent,
	},
	spotterSituationLeft: {
		spotterMessageCarLeft:    spotterMessageCompatible,
		spotterMessageStillThere: spotterMessageReminder,
		spotterMessageClearRight: spotterMessageCurrent,
	},
	spotterSituationRight: {
		spotterMessageCarRight:   spotterMessageCompatible,
		spotterMessageStillThere: spotterMessageReminder,
		spotterMessageClearLeft:  spotterMessageCurrent,
	},
	spotterSituationThreeWide: {
		spotterMessageCarLeft:    spotterMessageCompatible,
		spotterMessageCarRight:   spotterMessageCompatible,
		spotterMessageStillThere: spotterMessageReminder,
		spotterMessageThreeWide:  spotterMessageCurrent,
	},
}

func currentSpotterSituation(evidence SemanticEvidence) spotterSituation {
	if !evidence.SpotterKnown {
		return spotterSituationUnknown
	}
	switch {
	case evidence.SpotterLeft && evidence.SpotterRight:
		return spotterSituationThreeWide
	case evidence.SpotterLeft:
		return spotterSituationLeft
	case evidence.SpotterRight:
		return spotterSituationRight
	default:
		return spotterSituationAllClear
	}
}

func spotterMessageKindForIntent(intent string) spotterMessageKind {
	switch intent {
	case IntentSpotterCarLeft:
		return spotterMessageCarLeft
	case IntentSpotterCarRight:
		return spotterMessageCarRight
	case IntentSpotterStillThere:
		return spotterMessageStillThere
	case IntentSpotterClearLeft:
		return spotterMessageClearLeft
	case IntentSpotterClearRight:
		return spotterMessageClearRight
	case IntentSpotterAllClear:
		return spotterMessageAllClear
	case IntentSpotterThreeWide:
		return spotterMessageThreeWide
	default:
		return spotterMessageUnknown
	}
}

func currentSpotterMessageValue(intent string, evidence SemanticEvidence) spotterMessageValue {
	situation := currentSpotterSituation(evidence)
	kind := spotterMessageKindForIntent(intent)
	if situation == spotterSituationUnknown || kind == spotterMessageUnknown {
		return spotterMessageNotApplicable
	}
	return spotterMessageValues[situation][kind]
}

func (state *spotterDeliveryState) reset() {
	*state = spotterDeliveryState{}
}

func (state *spotterDeliveryState) observe(situation spotterSituation) {
	if situation == spotterSituationUnknown {
		state.reset()
		return
	}
	if !state.observed {
		state.observed = true
		state.situation = situation
		state.generation = 1
		return
	}
	if state.situation == situation {
		return
	}

	previous := state.situation
	previousGeneration := state.generation
	state.generation++
	state.situation = situation
	state.clearLeftGeneration = 0
	state.clearRightGeneration = 0
	state.clearLeftFrom = spotterSituationUnknown
	state.clearRightFrom = spotterSituationUnknown
	if state.dispatchedGeneration != previousGeneration || state.dispatchedSituation != previous {
		return
	}
	if spotterSituationHasLeft(previous) && !spotterSituationHasLeft(situation) {
		state.clearLeftGeneration = state.generation
		state.clearLeftFrom = previous
	}
	if spotterSituationHasRight(previous) && !spotterSituationHasRight(situation) {
		state.clearRightGeneration = state.generation
		state.clearRightFrom = previous
	}
}

func (state *spotterDeliveryState) clearCanDeliver(intent string) bool {
	if !state.observed {
		return false
	}
	switch intent {
	case IntentSpotterClearLeft:
		if state.clearLeftGeneration != state.generation {
			return false
		}
		return state.currentSituationDispatched() ||
			(state.clearLeftFrom == spotterSituationLeft && state.situation == spotterSituationAllClear) ||
			(state.clearLeftFrom == spotterSituationThreeWide && state.situation == spotterSituationRight)
	case IntentSpotterClearRight:
		if state.clearRightGeneration != state.generation {
			return false
		}
		return state.currentSituationDispatched() ||
			(state.clearRightFrom == spotterSituationRight && state.situation == spotterSituationAllClear) ||
			(state.clearRightFrom == spotterSituationThreeWide && state.situation == spotterSituationLeft)
	default:
		return true
	}
}

func (state *spotterDeliveryState) currentSituationDispatched() bool {
	return state.observed && state.dispatchedGeneration == state.generation &&
		state.dispatchedSituation == state.situation
}

func (state *spotterDeliveryState) recordDispatch(intent string) {
	if !state.observed {
		return
	}
	currentIntent, selfContained := selfContainedSpotterIntent(state.situation)
	contextualClear := isContextualSpotterClear(intent) && state.clearCanDeliver(intent)
	if !contextualClear && (!selfContained || intent != currentIntent) {
		return
	}
	state.dispatchedSituation = state.situation
	state.dispatchedGeneration = state.generation
	switch intent {
	case IntentSpotterClearLeft:
		state.clearLeftGeneration = 0
		state.clearLeftFrom = spotterSituationUnknown
	case IntentSpotterClearRight:
		state.clearRightGeneration = 0
		state.clearRightFrom = spotterSituationUnknown
	}
}

func spotterSituationHasLeft(situation spotterSituation) bool {
	return situation == spotterSituationLeft || situation == spotterSituationThreeWide
}

func spotterSituationHasRight(situation spotterSituation) bool {
	return situation == spotterSituationRight || situation == spotterSituationThreeWide
}

func selfContainedSpotterIntent(situation spotterSituation) (string, bool) {
	switch situation {
	case spotterSituationAllClear:
		return IntentSpotterAllClear, true
	case spotterSituationLeft:
		return IntentSpotterCarLeft, true
	case spotterSituationRight:
		return IntentSpotterCarRight, true
	case spotterSituationThreeWide:
		return IntentSpotterThreeWide, true
	default:
		return "", false
	}
}

func isContextualSpotterClear(intent string) bool {
	return intent == IntentSpotterClearLeft || intent == IntentSpotterClearRight
}
