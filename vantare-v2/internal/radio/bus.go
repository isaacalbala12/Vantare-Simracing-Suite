package radio

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"
)

var ErrPreemptedBySpotter = errors.New("radio delivery preempted by spotter")

// Clock makes scheduling and expiry deterministic in tests.
type Clock interface{ NowMS() int64 }

type systemClock struct{}

func (systemClock) NowMS() int64 { return time.Now().UnixMilli() }

type queued struct {
	message RadioMessage
	seq     uint64
}

// SubmitResult explains queue pressure, coalescing and Spotter preemption.
type SubmitResult struct {
	Accepted        bool
	Coalesced       bool
	ActivePreempted bool
	Dropped         []RadioMessage
}

// Item is one selected delivery. Done must be called once its Port returns.
type Item struct {
	Message RadioMessage
	Context context.Context
	done    func()
}

// Done releases the active delivery slot. It is safe to call more than once.
func (item *Item) Done() {
	if item != nil && item.done != nil {
		item.done()
	}
}

// Bus is a bounded deterministic scheduler safe for concurrent submissions.
type Bus struct {
	mu          sync.Mutex
	limits      Limits
	clock       Clock
	pending     []queued
	cooldowns   map[string]int64
	seq         uint64
	priorityRun int
	activeSeq   uint64
	active      RadioMessage
	cancel      context.CancelCauseFunc
}

// NewBus creates an empty bus. Nil clock selects the system clock.
func NewBus(limits Limits, clock Clock) (*Bus, error) {
	if !limits.valid() {
		return nil, errors.New("radio limits are invalid")
	}
	if clock == nil {
		clock = systemClock{}
	}
	return &Bus{limits: limits, clock: clock, pending: make([]queued, 0, limits.MaxPending), cooldowns: make(map[string]int64)}, nil
}

// Submit validates and owns a copy of message before applying queue policy.
func (bus *Bus) Submit(message RadioMessage) (SubmitResult, error) {
	bus.mu.Lock()
	defer bus.mu.Unlock()
	now := bus.clock.NowMS()
	message, err := normalizeMessage(message, now, bus.limits)
	if err != nil {
		return SubmitResult{}, err
	}
	if duration := bus.limits.Cooldowns[message.Intent]; duration > 0 {
		if emitted, ok := bus.cooldowns[message.Intent]; ok && (now < emitted || now-emitted < duration.Milliseconds()) {
			return SubmitResult{}, nil
		}
	}
	result := SubmitResult{Accepted: true}
	key := dedupKey(message)
	for index := range bus.pending {
		if dedupKey(bus.pending[index].message) == key {
			result.Coalesced = true
			result.Dropped = append(result.Dropped, bus.remove(index).message)
			break
		}
	}
	if message.Priority == PriorityP0 {
		for index := 0; index < len(bus.pending); {
			if bus.pending[index].message.Priority < PriorityP0 {
				result.Dropped = append(result.Dropped, bus.remove(index).message)
				continue
			}
			index++
		}
		if bus.cancel != nil && bus.active.Priority < PriorityP0 {
			bus.cancel(ErrPreemptedBySpotter)
			result.ActivePreempted = true
		}
	}
	if len(bus.pending) == bus.limits.MaxPending {
		worst := bus.worstIndex()
		if bus.pending[worst].message.Priority >= message.Priority {
			result.Accepted = false
			return result, nil
		}
		result.Dropped = append(result.Dropped, bus.remove(worst).message)
	}
	bus.seq++
	bus.pending = append(bus.pending, queued{message: message, seq: bus.seq})
	return result, nil
}

// Next selects one non-expired message and marks it active.
func (bus *Bus) Next(parent context.Context) (*Item, bool) {
	bus.mu.Lock()
	defer bus.mu.Unlock()
	if bus.cancel != nil {
		return nil, false
	}
	now := bus.clock.NowMS()
	for index := 0; index < len(bus.pending); {
		if now >= bus.pending[index].message.ExpiresAtMS {
			bus.remove(index)
			continue
		}
		index++
	}
	if len(bus.pending) == 0 {
		return nil, false
	}
	sort.SliceStable(bus.pending, func(left, right int) bool {
		a, b := bus.pending[left], bus.pending[right]
		if a.message.Priority != b.message.Priority {
			return a.message.Priority > b.message.Priority
		}
		if a.message.CreatedAtMS != b.message.CreatedAtMS {
			return a.message.CreatedAtMS < b.message.CreatedAtMS
		}
		return a.seq < b.seq
	})
	index := bus.nextIndex()
	selected := bus.remove(index)
	bus.recordChoice(index, selected.message.Priority)
	bus.cooldowns[selected.message.Intent] = now
	ctx, cancel := context.WithCancelCause(parent)
	bus.activeSeq = selected.seq
	bus.active = selected.message
	bus.cancel = cancel
	var once sync.Once
	item := &Item{Message: selected.message, Context: ctx}
	item.done = func() { once.Do(func() { bus.finish(selected.seq) }) }
	return item, true
}

func (bus *Bus) finish(seq uint64) {
	bus.mu.Lock()
	defer bus.mu.Unlock()
	if bus.activeSeq == seq {
		bus.cancel = nil
		bus.active = RadioMessage{}
		bus.activeSeq = 0
	}
}

func (bus *Bus) nextIndex() int {
	if bus.pending[0].message.Priority == PriorityP0 || bus.priorityRun < bus.limits.MaxPriorityBurst {
		return 0
	}
	top, selected := bus.pending[0].message.Priority, -1
	for index := 1; index < len(bus.pending); index++ {
		candidate := bus.pending[index]
		if candidate.message.Priority >= top {
			continue
		}
		if selected < 0 || candidate.message.CreatedAtMS < bus.pending[selected].message.CreatedAtMS ||
			(candidate.message.CreatedAtMS == bus.pending[selected].message.CreatedAtMS && candidate.seq < bus.pending[selected].seq) {
			selected = index
		}
	}
	if selected >= 0 {
		return selected
	}
	return 0
}

func (bus *Bus) recordChoice(index int, priority Priority) {
	if priority == PriorityP0 || index > 0 {
		bus.priorityRun = 0
		return
	}
	for _, candidate := range bus.pending {
		if candidate.message.Priority < priority {
			bus.priorityRun++
			return
		}
	}
	bus.priorityRun = 0
}

func (bus *Bus) worstIndex() int {
	worst := 0
	for index := 1; index < len(bus.pending); index++ {
		candidate, current := bus.pending[index], bus.pending[worst]
		if candidate.message.Priority < current.message.Priority ||
			(candidate.message.Priority == current.message.Priority && candidate.seq > current.seq) {
			worst = index
		}
	}
	return worst
}

func (bus *Bus) remove(index int) queued {
	removed := bus.pending[index]
	copy(bus.pending[index:], bus.pending[index+1:])
	last := len(bus.pending) - 1
	bus.pending[last] = queued{}
	bus.pending = bus.pending[:last]
	return removed
}

func dedupKey(message RadioMessage) string { return message.Intent + "\x00" + message.Subject }
