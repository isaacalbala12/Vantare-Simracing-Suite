package identity

const DefaultSlotGraceFrames uint64 = 30

type SlotFingerprint struct {
	SourceKey string
	Driver    string
	Class     string
}

type SlotOutcome struct {
	Generation uint64
	Reopened   bool
	Bumped     bool
}

type slotEntry struct {
	generation  uint64
	fingerprint SlotFingerprint
	lastSeen    uint64
}

// SlotTracker preserves a source slot across bounded absence while keeping
// domain identity distinct from stream cursor continuity.
type SlotTracker[K comparable] struct {
	grace   uint64
	entries map[K]slotEntry
}

func NewSlotTracker[K comparable](grace uint64) *SlotTracker[K] {
	if grace == 0 {
		grace = DefaultSlotGraceFrames
	}
	return &SlotTracker[K]{grace: grace, entries: make(map[K]slotEntry)}
}

func (tracker *SlotTracker[K]) Clone() *SlotTracker[K] {
	if tracker == nil {
		return NewSlotTracker[K](DefaultSlotGraceFrames)
	}
	result := NewSlotTracker[K](tracker.grace)
	for key, entry := range tracker.entries {
		result.entries[key] = entry
	}
	return result
}

func (tracker *SlotTracker[K]) Observe(key K, fingerprint SlotFingerprint, frame uint64) SlotOutcome {
	entry, exists := tracker.entries[key]
	if !exists {
		entry.generation = 1
		entry.fingerprint = fingerprint
		entry.lastSeen = frame
		tracker.entries[key] = entry
		return SlotOutcome{Generation: entry.generation, Bumped: true}
	}

	gap := frame - entry.lastSeen
	continuous := gap <= 1
	reopened := !continuous && gap <= tracker.grace+1 && entry.fingerprint == fingerprint
	bumped := !continuous && !reopened
	if bumped {
		entry.generation++
	}
	entry.fingerprint = fingerprint
	entry.lastSeen = frame
	tracker.entries[key] = entry
	return SlotOutcome{Generation: entry.generation, Reopened: reopened, Bumped: bumped}
}
