package spotter

const (
	EventCarLeft    = "car_left"
	EventCarRight   = "car_right"
	EventStillThere = "still_there"
	EventClearLeft  = "clear_left"
	EventClearRight = "clear_right"
	EventAllClear   = "all_clear"
	EventThreeWide  = "three_wide"
)

type Event struct {
	Type      string
	Priority  int
	ExpiresAt int64
	TextKey   string
}

type State string

const (
	StateNone  State = "none"
	StateLeft  State = "left"
	StateRight State = "right"
	StateBoth  State = "both"
)

type Machine struct {
	state              State
	lastEventTimes     map[string]int64
	lastSeenLeft       int64 // last frame timestamp where a left zone was detected
	lastSeenRight      int64 // last frame timestamp where a right zone was detected
	seenLeft           bool
	seenRight          bool
	stillThereRepeatMS int64
	detectionHoldMS    int64
	// clearDelayMS is the CrewChief clear scheduling delay. It is kept separate
	// from detectionHoldMS; queue-level delayed playback is a follow-up.
	clearDelayMS      int64
	messageExpiryMS   int64  // expiry for car_left/car_right/still_there/three_wide
	clearExpiryMS     int64  // expiry for clear messages (CC: 2000ms)
	pendingClearAt    int64
	pendingClearEvent string
}

func NewMachine() *Machine {
	return &Machine{
		state:              StateNone,
		lastEventTimes:     make(map[string]int64),
		stillThereRepeatMS: 3000, // CC: repeatHoldFrequency default 3s (road)
		detectionHoldMS:    350,
		clearDelayMS:       150,
		messageExpiryMS:    1000, // CC: holdMessageExpiresAfter=1000, inTheMiddleMessageExpiresAfter=1000
		clearExpiryMS:      2000, // CC: clearMessageExpiresAfter=2000, clearAllRoundMessageExpiresAfter=2000
	}
}

func (m *Machine) ActiveSides() ActiveSides {
	return ActiveSides{
		Left:  m.state == StateLeft || m.state == StateBoth,
		Right: m.state == StateRight || m.state == StateBoth,
	}
}

func (m *Machine) event(eventType string, nowMS int64, expiryMS int64) Event {
	return Event{
		Type:      eventType,
		Priority:  100,
		ExpiresAt: nowMS + expiryMS,
		TextKey:   eventType,
	}
}

// clearEvent creates an event with clearExpiryMS expiry (2000ms in CC).
func (m *Machine) clearEvent(eventType string, nowMS int64) Event {
	return m.event(eventType, nowMS, m.clearExpiryMS)
}

// entryEventsForStateTransition emits car_left / car_right / three_wide when
// entering a side state that was not already active. It avoids re-emitting a
// warning for a side that was already tracked (e.g. StateBoth -> StateLeft).
//
// This helper is intentionally separate from the main state switch: it is used
// when a pending clear fires in the same frame that a different side is present.
// In that moment we have already emitted the clear and must move to the new
// state without re-running the full transition logic, which would reschedule
// the clear we just fired.
func (m *Machine) entryEventsForStateTransition(nowMS int64, oldState, newState State) []Event {
	var events []Event
	switch newState {
	case StateLeft:
		if oldState != StateLeft && oldState != StateBoth {
			events = append(events, m.event(EventCarLeft, nowMS, m.messageExpiryMS))
			m.lastEventTimes["left"] = nowMS
		}
	case StateRight:
		if oldState != StateRight && oldState != StateBoth {
			events = append(events, m.event(EventCarRight, nowMS, m.messageExpiryMS))
			m.lastEventTimes["right"] = nowMS
		}
	case StateBoth:
		if oldState != StateBoth {
			events = append(events, m.event(EventThreeWide, nowMS, m.messageExpiryMS))
			m.lastEventTimes["left"] = nowMS
			m.lastEventTimes["right"] = nowMS
		}
	}
	return events
}

func (m *Machine) scheduleClear(eventType string, nowMS int64) {
	if m.pendingClearEvent == eventType {
		return
	}
	m.pendingClearEvent = eventType
	m.pendingClearAt = nowMS + m.clearDelayMS
}

func (m *Machine) clearPendingClear() {
	m.pendingClearEvent = ""
	m.pendingClearAt = 0
}

func (m *Machine) resetSeen() {
	m.lastSeenLeft = 0
	m.lastSeenRight = 0
	m.seenLeft = false
	m.seenRight = false
}

func clearEventForState(state State) string {
	switch state {
	case StateLeft:
		return EventClearLeft
	case StateRight:
		return EventClearRight
	case StateBoth:
		return EventAllClear
	default:
		return ""
	}
}

func (m *Machine) Process(nowMS int64, zones []Zone) []Event {
	hasLeft := false
	hasRight := false
	for _, z := range zones {
		if z.Side == SideLeft {
			hasLeft = true
		} else if z.Side == SideRight {
			hasRight = true
		}
	}
	currentLeft := hasLeft
	currentRight := hasRight

	// Track when each side was last seen.
	if hasLeft {
		m.lastSeenLeft = nowMS
		m.seenLeft = true
	}
	if hasRight {
		m.lastSeenRight = nowMS
		m.seenRight = true
	}

	// Debounce: if a side was seen recently (within detectionHoldMS),
	// keep treating it as present even if the current frame doesn't
	// detect it. This prevents rapid clear/car flicker when a car
	// is on the edge of the detection zone.
	//
	// Only hold sides that belong to the current state, and do not hold
	// a missing side when the opposite side is currently detected. That
	// avoids false three-wide transitions from a stale held side.
	canHoldLeft := m.state == StateLeft || m.state == StateBoth
	canHoldRight := m.state == StateRight || m.state == StateBoth
	if !hasLeft && canHoldLeft && m.seenLeft && nowMS-m.lastSeenLeft <= m.detectionHoldMS && !currentRight {
		hasLeft = true
	}
	if !hasRight && canHoldRight && m.seenRight && nowMS-m.lastSeenRight <= m.detectionHoldMS && !currentLeft {
		hasRight = true
	}

	var targetState State
	if hasLeft && hasRight {
		targetState = StateBoth
	} else if hasLeft {
		targetState = StateLeft
	} else if hasRight {
		targetState = StateRight
	} else {
		targetState = StateNone
	}

	// Cancel pending clears when the relevant side reappears.
	switch m.pendingClearEvent {
	case EventClearLeft:
		if hasLeft {
			m.clearPendingClear()
		}
	case EventClearRight:
		if hasRight {
			m.clearPendingClear()
		}
	case EventAllClear:
		if hasLeft || hasRight {
			m.clearPendingClear()
		}
	}

	var events []Event
	if m.pendingClearEvent != "" && nowMS >= m.pendingClearAt {
		fired := m.pendingClearEvent
		events = append(events, m.event(fired, nowMS, m.clearExpiryMS))
		m.clearPendingClear()

		// If the side really stayed empty, finish in StateNone and forget
		// the old detection memory. Otherwise move directly to the new state
		// and emit any entry event that wasn't already emitted before the
		// clear was pending. Crucially, do NOT reset lastSeen* here: the new
		// side was detected in this frame and its debounce memory must be
		// preserved.
		if targetState == StateNone {
			m.state = StateNone
			m.resetSeen()
			return events
		}
		oldState := m.state
		m.state = targetState
		events = append(events, m.entryEventsForStateTransition(nowMS, oldState, targetState)...)
		return events
	}

	oldState := m.state

	switch oldState {
	case StateNone:
		switch targetState {
		case StateLeft:
			m.state = StateLeft
			events = append(events, m.event(EventCarLeft, nowMS, m.messageExpiryMS))
			m.lastEventTimes["left"] = nowMS
		case StateRight:
			m.state = StateRight
			events = append(events, m.event(EventCarRight, nowMS, m.messageExpiryMS))
			m.lastEventTimes["right"] = nowMS
		case StateBoth:
			m.state = StateBoth
			events = append(events, m.event(EventThreeWide, nowMS, m.messageExpiryMS))
			m.lastEventTimes["left"] = nowMS
			m.lastEventTimes["right"] = nowMS
		}

	case StateLeft:
		switch targetState {
		case StateNone:
			if eventType := clearEventForState(m.state); eventType != "" {
				m.scheduleClear(eventType, nowMS)
			}
		case StateLeft:
			// check still_there repeat
			if last, ok := m.lastEventTimes["left"]; !ok || nowMS-last >= m.stillThereRepeatMS {
				events = append(events, m.event(EventStillThere, nowMS, m.messageExpiryMS))
				m.lastEventTimes["left"] = nowMS
			}
		case StateRight:
			m.state = StateRight
			m.scheduleClear(EventClearLeft, nowMS)
			events = append(events, m.event(EventCarRight, nowMS, m.messageExpiryMS))
			m.lastEventTimes["right"] = nowMS
		case StateBoth:
			m.state = StateBoth
			events = append(events, m.event(EventThreeWide, nowMS, m.messageExpiryMS))
			m.lastEventTimes["left"] = nowMS
			m.lastEventTimes["right"] = nowMS
		}

	case StateRight:
		switch targetState {
		case StateNone:
			if eventType := clearEventForState(m.state); eventType != "" {
				m.scheduleClear(eventType, nowMS)
			}
		case StateRight:
			// check still_there repeat
			if last, ok := m.lastEventTimes["right"]; !ok || nowMS-last >= m.stillThereRepeatMS {
				events = append(events, m.event(EventStillThere, nowMS, m.messageExpiryMS))
				m.lastEventTimes["right"] = nowMS
			}
		case StateLeft:
			m.state = StateLeft
			m.scheduleClear(EventClearRight, nowMS)
			events = append(events, m.event(EventCarLeft, nowMS, m.messageExpiryMS))
			m.lastEventTimes["left"] = nowMS
		case StateBoth:
			m.state = StateBoth
			events = append(events, m.event(EventThreeWide, nowMS, m.messageExpiryMS))
			m.lastEventTimes["left"] = nowMS
			m.lastEventTimes["right"] = nowMS
		}

	case StateBoth:
		switch targetState {
		case StateNone:
			if eventType := clearEventForState(m.state); eventType != "" {
				m.scheduleClear(eventType, nowMS)
			}
		case StateLeft:
			m.state = StateLeft
			m.scheduleClear(EventClearRight, nowMS)
			m.lastEventTimes["left"] = nowMS
		case StateRight:
			m.state = StateRight
			m.scheduleClear(EventClearLeft, nowMS)
			m.lastEventTimes["right"] = nowMS
		}
	}

	if m.state == StateNone {
		m.resetSeen()
	}

	return events
}
