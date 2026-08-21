package spotter

const (
	detectionHoldMS    int64 = 350
	clearDelayMS       int64 = 150
	stillThereRepeatMS int64 = 3_000
)

type Situation uint8

const (
	SituationUnknown Situation = iota
	SituationAllClear
	SituationLeft
	SituationRight
	SituationThreeWide
)

type pendingClear struct {
	intent string
	dueMS  int64
}

// Policy owns Spotter transition and delivery context. Only Started records
// communication; selecting or queueing a message cannot authorize a clear.
type Policy struct {
	observed          bool
	situation         Situation
	generation        uint64
	startedSituation  Situation
	startedGeneration uint64
	startedUntilMS    int64
	clearLeftFrom     Situation
	clearRightFrom    Situation
	clearLeftGen      uint64
	clearRightGen     uint64
	clearLeftUntilMS  int64
	clearRightUntilMS int64

	seenLeft, seenRight         bool
	lastSeenLeft, lastSeenRight int64
	lastReminderMS              int64
	pending                     pendingClear
}

func (policy *Policy) Reset() { *policy = Policy{} }

func (policy *Policy) ActiveSides() (left, right bool) {
	return hasLeft(policy.situation), hasRight(policy.situation)
}

// Evaluate returns at most one intent for the proven situation at nowMS.
func (policy *Policy) Evaluate(nowMS int64, currentLeft, currentRight bool) (string, bool) {
	if currentLeft {
		policy.seenLeft, policy.lastSeenLeft = true, nowMS
	}
	if currentRight {
		policy.seenRight, policy.lastSeenRight = true, nowMS
	}
	left, right := currentLeft, currentRight
	if !left && !currentRight && hasLeft(policy.situation) && policy.seenLeft && nowMS-policy.lastSeenLeft <= detectionHoldMS {
		left = true
	}
	if !right && !currentLeft && hasRight(policy.situation) && policy.seenRight && nowMS-policy.lastSeenRight <= detectionHoldMS {
		right = true
	}
	target := situationFor(left, right)

	if (policy.pending.intent == IntentClearLeft && left) ||
		(policy.pending.intent == IntentClearRight && right) ||
		(policy.pending.intent == IntentAllClear && (left || right)) {
		policy.pending = pendingClear{}
	}
	if policy.pending.intent != "" && nowMS >= policy.pending.dueMS {
		clearIntent := policy.pending.intent
		policy.pending = pendingClear{}
		policy.transition(target, nowMS)
		return policy.safeIntent(clearIntent, nowMS)
	}

	if !policy.observed {
		policy.transition(target, nowMS)
		if target == SituationAllClear {
			return "", false
		}
		return selfContainedIntent(target)
	}
	if target == policy.situation {
		if target != SituationAllClear && nowMS-policy.lastReminderMS >= stillThereRepeatMS {
			policy.lastReminderMS = nowMS
			return IntentStillThere, true
		}
		return "", false
	}

	previous := policy.situation
	switch {
	case target == SituationAllClear:
		policy.schedule(clearIntentFor(previous), nowMS)
		return "", false
	case previous == SituationLeft && target == SituationRight:
		policy.transition(target, nowMS)
		policy.schedule(IntentClearLeft, nowMS)
		return IntentCarRight, true
	case previous == SituationRight && target == SituationLeft:
		policy.transition(target, nowMS)
		policy.schedule(IntentClearRight, nowMS)
		return IntentCarLeft, true
	case previous == SituationThreeWide && target == SituationLeft:
		policy.transition(target, nowMS)
		policy.schedule(IntentClearRight, nowMS)
		return "", false
	case previous == SituationThreeWide && target == SituationRight:
		policy.transition(target, nowMS)
		policy.schedule(IntentClearLeft, nowMS)
		return "", false
	default:
		policy.transition(target, nowMS)
		return selfContainedIntent(target)
	}
}

// Start revalidates a selected message at the transport started boundary.
// It records only self-contained/current or delivery-authorized context;
// still_there may start while occupied but never renews that context.
func (policy *Policy) Start(intent string, expiresAtMS, nowMS int64) bool {
	if nowMS >= expiresAtMS {
		return false
	}
	if intent == IntentStillThere {
		return policy.situation == SituationLeft || policy.situation == SituationRight || policy.situation == SituationThreeWide
	}
	current, ok := selfContainedIntent(policy.situation)
	contextualClear := policy.clearCanDeliver(intent, nowMS)
	if !contextualClear && (!ok || intent != current) {
		return false
	}
	policy.startedSituation = policy.situation
	policy.startedGeneration = policy.generation
	policy.startedUntilMS = expiresAtMS
	if intent == IntentClearLeft {
		policy.clearLeftGen, policy.clearLeftFrom, policy.clearLeftUntilMS = 0, SituationUnknown, 0
	}
	if intent == IntentClearRight {
		policy.clearRightGen, policy.clearRightFrom, policy.clearRightUntilMS = 0, SituationUnknown, 0
	}
	return true
}

func (policy *Policy) transition(next Situation, nowMS int64) {
	if policy.observed && policy.situation == next {
		return
	}
	previous, previousGeneration, previousUntil := policy.situation, policy.generation, policy.startedUntilMS
	policy.observed = true
	policy.generation++
	policy.situation = next
	policy.lastReminderMS = nowMS
	policy.clearLeftGen, policy.clearRightGen = 0, 0
	policy.clearLeftFrom, policy.clearRightFrom = SituationUnknown, SituationUnknown
	policy.clearLeftUntilMS, policy.clearRightUntilMS = 0, 0
	if policy.startedGeneration != previousGeneration || policy.startedSituation != previous || previousUntil <= nowMS {
		return
	}
	if hasLeft(previous) && !hasLeft(next) {
		policy.clearLeftGen, policy.clearLeftFrom, policy.clearLeftUntilMS = policy.generation, previous, previousUntil
	}
	if hasRight(previous) && !hasRight(next) {
		policy.clearRightGen, policy.clearRightFrom, policy.clearRightUntilMS = policy.generation, previous, previousUntil
	}
}

func (policy *Policy) safeIntent(intent string, nowMS int64) (string, bool) {
	if intent == IntentAllClear || policy.clearCanDeliver(intent, nowMS) {
		return intent, intent != ""
	}
	return selfContainedIntent(policy.situation)
}

func (policy *Policy) clearCanDeliver(intent string, nowMS int64) bool {
	currentStarted := policy.startedGeneration == policy.generation && policy.startedSituation == policy.situation && policy.startedUntilMS > nowMS
	switch intent {
	case IntentClearLeft:
		return policy.clearLeftGen == policy.generation && policy.clearLeftUntilMS > nowMS &&
			(currentStarted || (policy.clearLeftFrom == SituationLeft && policy.situation == SituationAllClear) ||
				(policy.clearLeftFrom == SituationThreeWide && policy.situation == SituationRight))
	case IntentClearRight:
		return policy.clearRightGen == policy.generation && policy.clearRightUntilMS > nowMS &&
			(currentStarted || (policy.clearRightFrom == SituationRight && policy.situation == SituationAllClear) ||
				(policy.clearRightFrom == SituationThreeWide && policy.situation == SituationLeft))
	default:
		return false
	}
}

func (policy *Policy) schedule(intent string, nowMS int64) {
	if intent != "" && policy.pending.intent != intent {
		policy.pending = pendingClear{intent: intent, dueMS: nowMS + clearDelayMS}
	}
}

func situationFor(left, right bool) Situation {
	switch {
	case left && right:
		return SituationThreeWide
	case left:
		return SituationLeft
	case right:
		return SituationRight
	default:
		return SituationAllClear
	}
}

func selfContainedIntent(situation Situation) (string, bool) {
	switch situation {
	case SituationAllClear:
		return IntentAllClear, true
	case SituationLeft:
		return IntentCarLeft, true
	case SituationRight:
		return IntentCarRight, true
	case SituationThreeWide:
		return IntentThreeWide, true
	default:
		return "", false
	}
}

func clearIntentFor(situation Situation) string {
	switch situation {
	case SituationLeft:
		return IntentClearLeft
	case SituationRight:
		return IntentClearRight
	case SituationThreeWide:
		return IntentAllClear
	default:
		return ""
	}
}

func hasLeft(situation Situation) bool {
	return situation == SituationLeft || situation == SituationThreeWide
}
func hasRight(situation Situation) bool {
	return situation == SituationRight || situation == SituationThreeWide
}
