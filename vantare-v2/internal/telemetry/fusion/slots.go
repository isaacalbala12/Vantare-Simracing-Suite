package fusion

// Entry is the last observation received through one slot.
type Entry[T any] struct {
	Value    T
	Received Stamp
	Sequence uint64
}

// Received reports whether the slot ever produced a value.
func (entry Entry[T]) Present() bool { return entry.Sequence != 0 }

// Slots is single-writer state owned by one driver run. It retains the latest
// value of every acquisition slot and the arrival order between them. Any
// number of slots is supported: a single-source driver uses one, LMU uses two.
type Slots[T any] struct {
	entries  map[SlotID]Entry[T]
	sequence uint64
}

// NewSlots preallocates the store for the declared slots.
func NewSlots[T any](slots ...SlotID) *Slots[T] {
	store := &Slots[T]{entries: make(map[SlotID]Entry[T], len(slots))}
	return store
}

// Put records one slot value with its monotonic arrival mark and advances the
// shared arrival sequence.
func (store *Slots[T]) Put(slot SlotID, value T, at Stamp) {
	if store == nil || slot == SlotUnknown {
		return
	}
	if store.entries == nil {
		store.entries = make(map[SlotID]Entry[T], 2)
	}
	store.sequence++
	store.entries[slot] = Entry[T]{Value: value, Received: at, Sequence: store.sequence}
}

// Get returns the retained entry of one slot. The zero entry is returned when
// the slot never produced a value.
func (store *Slots[T]) Get(slot SlotID) Entry[T] {
	if store == nil {
		return Entry[T]{}
	}
	return store.entries[slot]
}

// Sequence reports how many values the store has accepted.
func (store *Slots[T]) Sequence() uint64 {
	if store == nil {
		return 0
	}
	return store.sequence
}

// Count reports how many slots hold a value.
func (store *Slots[T]) Count() int {
	if store == nil {
		return 0
	}
	return len(store.entries)
}
