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
