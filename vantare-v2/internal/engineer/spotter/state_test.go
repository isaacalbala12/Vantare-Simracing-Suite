package spotter

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/simulator"
)

func TestMachine_LeftScenario(t *testing.T) {
	m := NewMachine()

	// 1. Initial State: None -> Left at T = 0
	zones := []Zone{{Side: SideLeft, VehicleID: 2}}
	events := m.Process(0, zones)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Type != EventCarLeft {
		t.Errorf("expected EventCarLeft, got %s", events[0].Type)
	}
	if events[0].ExpiresAt != 1000 { // CC: holdMessageExpiresAfter=1000
		t.Errorf("expected ExpiresAt 1000, got %d", events[0].ExpiresAt)
	}
	if m.state != StateLeft {
		t.Errorf("expected state to be StateLeft, got %s", m.state)
	}

	// 2. Stay in Left at T = 500 (less than repeat interval 3000ms)
	events = m.Process(500, zones)
	if len(events) != 0 {
		t.Errorf("expected 0 events (anti-spam), got %d: %v", len(events), events)
	}

	// 3. Stay in Left at T = 2500 (less than repeat interval 3000ms)
	events = m.Process(2500, zones)
	if len(events) != 0 {
		t.Errorf("expected 0 events (2500 < 3000 repeat), got %d: %v", len(events), events)
	}

	// 3b. Stay in Left at T = 3000 (exactly repeat interval)
	events = m.Process(3000, zones)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Type != EventStillThere {
		t.Errorf("expected EventStillThere, got %s", events[0].Type)
	}
	if events[0].ExpiresAt != 4000 { // 3000 + 1000 (messageExpiryMS)
		t.Errorf("expected ExpiresAt 4000, got %d", events[0].ExpiresAt)
	}

	// 4. Transition attempt at T = 3200 — debounce holds (200ms < 350ms holdExpiry)
	events = m.Process(3200, nil)
	if len(events) != 0 {
		t.Errorf("expected 0 events (debounce holds), got %d: %v", len(events), events)
	}
	if m.state != StateLeft {
		t.Errorf("expected state StateLeft (debounce), got %s", m.state)
	}

	// 5. At T = 3351, debounce expires (351ms > 350ms) → Left→None, clear_left scheduled
	events = m.Process(3351, nil)
	if len(events) != 0 {
		t.Fatalf("expected 0 events (clear_left scheduled), got %d: %v", len(events), events)
	}
	if m.state != StateLeft {
		t.Errorf("expected state to remain StateLeft while clear is pending, got %s", m.state)
	}

	// 6. At T = 3501 (hold 350 + clearDelay 150), pending clear fires.
	events = m.Process(3501, nil)
	if len(events) != 1 {
		t.Fatalf("expected 1 event (clear_left), got %d: %v", len(events), events)
	}
	if events[0].Type != EventClearLeft {
		t.Errorf("expected EventClearLeft, got %s", events[0].Type)
	}
	if events[0].ExpiresAt != 5501 { // 3501 + 2000 (clearExpiryMS)
		t.Errorf("expected ExpiresAt 5501, got %d", events[0].ExpiresAt)
	}
	if m.state != StateNone {
		t.Errorf("expected state to be StateNone after clear, got %s", m.state)
	}
}

func TestMachine_RightScenario(t *testing.T) {
	m := NewMachine()
	base := int64(100000)

	// 1. Initial State: None -> Right at T = 0
	zones := []Zone{{Side: SideRight, VehicleID: 2}}
	events := m.Process(base, zones)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Type != EventCarRight {
		t.Errorf("expected EventCarRight, got %s", events[0].Type)
	}
	if events[0].ExpiresAt != base+1000 { // CC: holdMessageExpiresAfter=1000
		t.Errorf("expected ExpiresAt %d, got %d", base+1000, events[0].ExpiresAt)
	}
	if m.state != StateRight {
		t.Errorf("expected state to be StateRight, got %s", m.state)
	}

	// 2. Stay in Right at T = 500
	events = m.Process(base+500, zones)
	if len(events) != 0 {
		t.Errorf("expected 0 events, got %d", len(events))
	}

	// 3. Stay in Right at T = 2500 (less than repeat interval 3000ms)
	events = m.Process(base+2500, zones)
	if len(events) != 0 {
		t.Errorf("expected 0 events (2500 < 3000 repeat), got %d", len(events))
	}

	// 3b. Stay in Right at T = 3000 (exactly repeat interval)
	events = m.Process(base+3000, zones)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Type != EventStillThere {
		t.Errorf("expected EventStillThere, got %s", events[0].Type)
	}
	if events[0].ExpiresAt != base+4000 { // 3000 + 1000 (messageExpiryMS)
		t.Errorf("expected ExpiresAt %d, got %d", base+4000, events[0].ExpiresAt)
	}

	// 4. Transition attempt at T = 3200 — debounce holds (200ms < 350ms)
	events = m.Process(base+3200, nil)
	if len(events) != 0 {
		t.Errorf("expected 0 events (debounce holds), got %d: %v", len(events), events)
	}

	// 5. At T = 3351, debounce expires → Right→None, clear_right scheduled
	events = m.Process(base+3351, nil)
	if len(events) != 0 {
		t.Fatalf("expected 0 events (clear_right scheduled), got %d: %v", len(events), events)
	}
	if m.state != StateRight {
		t.Errorf("expected state to remain StateRight while clear is pending, got %s", m.state)
	}

	// 6. At T = base+3501 (hold 350 + clearDelay 150), pending clear fires.
	events = m.Process(base+3501, nil)
	if len(events) != 1 {
		t.Fatalf("expected 1 event (clear_right), got %d: %v", len(events), events)
	}
	if events[0].Type != EventClearRight {
		t.Errorf("expected EventClearRight, got %s", events[0].Type)
	}
	if m.state != StateNone {
		t.Errorf("expected state to be StateNone after clear, got %s", m.state)
	}
}

func TestMachine_DebounceWorksAtZeroTimestamp(t *testing.T) {
	m := NewMachine()

	events := m.Process(0, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %v", events)
	}

	events = m.Process(350, nil)
	if len(events) != 0 {
		t.Fatalf("expected no clear while right side is held from zero timestamp, got %v", events)
	}
	if m.state != StateRight {
		t.Fatalf("expected state to remain right, got %s", m.state)
	}
}

func TestMachine_HeldSideDoesNotCreateFalseThreeWide(t *testing.T) {
	m := NewMachine()
	base := int64(100000)

	events := m.Process(base, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %v", events)
	}

	events = m.Process(base+250, nil)
	if len(events) != 0 {
		t.Fatalf("expected no clear during brief right-side miss, got %v", events)
	}

	events = m.Process(base+500, []Zone{{Side: SideLeft, VehicleID: 3}})
	if len(events) != 1 || events[0].Type != EventCarLeft {
		t.Fatalf("expected immediate car_left only (clear_right scheduled), got %v", events)
	}
	if m.state != StateLeft {
		t.Fatalf("expected state left, got %s", m.state)
	}
}

func TestMachine_HoldsIntermittentRightThroughOneSecondBoundary(t *testing.T) {
	m := NewMachine()
	base := int64(100000)

	events := m.Process(base, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %v", events)
	}

	for _, offset := range []int64{100, 200, 300, 350} {
		events = m.Process(base+offset, nil)
		if len(events) != 0 {
			t.Fatalf("expected no clear at offset %d while within hold boundary, got %v", offset, events)
		}
		if m.state != StateRight {
			t.Fatalf("expected state right at offset %d, got %s", offset, m.state)
		}
	}

	events = m.Process(base+351, nil)
	if len(events) != 0 {
		t.Fatalf("expected clear_right scheduled first, got %v", events)
	}

	events = m.Process(base+501, nil)
	if len(events) != 1 || events[0].Type != EventClearRight {
		t.Fatalf("expected clear_right after hold + clear delay, got %v", events)
	}
}

func TestMachine_ThreeWideScenario(t *testing.T) {
	m := NewMachine()

	// 1. None -> Both
	zones := []Zone{
		{Side: SideLeft, VehicleID: 2},
		{Side: SideRight, VehicleID: 3},
	}
	events := m.Process(0, zones)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Type != EventThreeWide {
		t.Errorf("expected EventThreeWide, got %s", events[0].Type)
	}
	if m.state != StateBoth {
		t.Errorf("expected state to be StateBoth, got %s", m.state)
	}

	// 2. Both -> Left (clear_right scheduled, no event)
	zones = []Zone{{Side: SideLeft, VehicleID: 2}}
	events = m.Process(500, zones)
	if len(events) != 0 {
		t.Fatalf("expected 0 events (clear_right scheduled), got %d: %v", len(events), events)
	}
	if m.state != StateLeft {
		t.Errorf("expected state to be StateLeft, got %s", m.state)
	}

	// 3. Left -> Both
	zones = []Zone{
		{Side: SideLeft, VehicleID: 2},
		{Side: SideRight, VehicleID: 3},
	}
	events = m.Process(1000, zones)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Type != EventThreeWide {
		t.Errorf("expected EventThreeWide, got %s", events[0].Type)
	}
	if m.state != StateBoth {
		t.Errorf("expected state to be StateBoth, got %s", m.state)
	}

	// 4. Both -> None attempt at T = 1300 — debounce holds (300ms < 350ms)
	events = m.Process(1300, nil)
	if len(events) != 0 {
		t.Errorf("expected 0 events (debounce holds), got %d: %v", len(events), events)
	}
	if m.state != StateBoth {
		t.Errorf("expected state StateBoth (debounce), got %s", m.state)
	}

	// 5. Both -> None at T = 1400 (400ms > 350ms holdExpiry) → all_clear scheduled
	events = m.Process(1400, nil)
	if len(events) != 0 {
		t.Fatalf("expected 0 events (all_clear scheduled), got %d: %v", len(events), events)
	}
	if m.state != StateBoth {
		t.Errorf("expected state to remain StateBoth while all_clear is pending, got %s", m.state)
	}

	// 6. At T = 1550 (hold 350 + clearDelay 150), pending all_clear fires.
	events = m.Process(1550, nil)
	if len(events) != 1 {
		t.Fatalf("expected 1 event (all_clear), got %d: %v", len(events), events)
	}
	if events[0].Type != EventAllClear {
		t.Errorf("expected EventAllClear, got %s", events[0].Type)
	}
	if m.state != StateNone {
		t.Errorf("expected state to be StateNone after all_clear, got %s", m.state)
	}
}

func TestMachine_SimulatorScenario(t *testing.T) {
	// Build left basic scenario
	frames := simulator.Build(simulator.ScenarioLeftBasic)
	if len(frames) == 0 {
		t.Fatalf("expected simulator frames, got 0")
	}

	m := NewMachine()
	var allEvents []Event

	// Process frames with 1000ms spacing.
	// Frame 0 (0ms): no overlap -> none, 0 events
	// Frame 1 (1000ms): left opponent -> car_left
	// Frame 2 (2000ms): left opponent -> no still_there (1000 < 2000ms repeat)
	// Frame 3 (3000ms): no overlap, debounce has expired with 350ms hold
	//   → clear_left emitted quickly.
	for i, frame := range frames {
		zones := Classify(&frame, SensitivityNormal)
		now := int64(i * 1000)
		events := m.Process(now, zones)
		allEvents = append(allEvents, events...)
	}

	// Frame 3 at T=3000 scheduled clear_left; fire it after delay.
	events := m.Process(3150, nil)
	allEvents = append(allEvents, events...)

	// Events: car_left (i=1), clear_left (after clear delay)
	if len(allEvents) != 2 {
		t.Fatalf("expected exactly 2 events, got %d: %v", len(allEvents), allEvents)
	}

	if allEvents[0].Type != EventCarLeft {
		t.Errorf("expected first event to be EventCarLeft, got %s", allEvents[0].Type)
	}
	if allEvents[1].Type != EventClearLeft {
		t.Errorf("expected second event to be EventClearLeft, got %s", allEvents[1].Type)
	}
}

func TestMachine_ClearRightWaitsForDetectionHold(t *testing.T) {
	m := NewMachine()
	events := m.Process(1000, []Zone{{Side: SideRight}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("events=%+v", events)
	}
	events = m.Process(1100, nil)
	if len(events) != 0 {
		t.Fatalf("clear should not fire before detection hold expires: %+v", events)
	}
	events = m.Process(1400, nil)
	if len(events) != 0 {
		t.Fatalf("clear should be scheduled but not emitted at 1400: %+v", events)
	}
	events = m.Process(1550, nil)
	if len(events) != 1 || events[0].Type != EventClearRight {
		t.Fatalf("expected clear_right at 1550 after clear delay, got %+v", events)
	}
}

func TestMachine_ClearIsCancelledWhenSideReappears(t *testing.T) {
	m := NewMachine()
	_ = m.Process(1000, []Zone{{Side: SideRight}})
	events := m.Process(1400, nil)
	if len(events) != 0 {
		t.Fatalf("expected 0 events (pending clear scheduled), got %+v", events)
	}
	events = m.Process(1450, []Zone{{Side: SideRight}})
	if len(events) != 0 {
		t.Fatalf("expected reappearance to cancel pending clear without events, got %+v", events)
	}
	events = m.Process(1550, []Zone{{Side: SideRight}})
	for _, e := range events {
		if e.Type == EventClearRight {
			t.Fatalf("stale clear should not be emitted after side reappears: %+v", events)
		}
	}
}

func TestMachine_ActiveSidesInitiallyNone(t *testing.T) {
	m := NewMachine()

	active := m.ActiveSides()

	if active.Left {
		t.Fatalf("expected left inactive initially, got %+v", active)
	}
	if active.Right {
		t.Fatalf("expected right inactive initially, got %+v", active)
	}
}

func TestMachine_ActiveSidesReflectsLeftState(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideLeft, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarLeft {
		t.Fatalf("expected initial car_left, got %+v", events)
	}

	active := m.ActiveSides()

	if !active.Left {
		t.Fatalf("expected left active, got %+v", active)
	}
	if active.Right {
		t.Fatalf("expected right inactive, got %+v", active)
	}
}

func TestMachine_ActiveSidesReflectsRightState(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %+v", events)
	}

	active := m.ActiveSides()

	if active.Left {
		t.Fatalf("expected left inactive, got %+v", active)
	}
	if !active.Right {
		t.Fatalf("expected right active, got %+v", active)
	}
}

func TestMachine_ActiveSidesReflectsBothState(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{
		{Side: SideLeft, VehicleID: 2},
		{Side: SideRight, VehicleID: 3},
	})
	if len(events) != 1 || events[0].Type != EventThreeWide {
		t.Fatalf("expected initial three_wide, got %+v", events)
	}

	active := m.ActiveSides()

	if !active.Left {
		t.Fatalf("expected left active, got %+v", active)
	}
	if !active.Right {
		t.Fatalf("expected right active, got %+v", active)
	}
}

func TestMachine_ClearRightWaitsForHoldThenDelay(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %+v", events)
	}

	events = m.Process(1350, nil)
	if len(events) != 0 {
		t.Fatalf("expected no clear while detection hold is active, got %+v", events)
	}
	if active := m.ActiveSides(); !active.Right || active.Left {
		t.Fatalf("expected right to remain active during hold, got %+v", active)
	}

	events = m.Process(1351, nil)
	if len(events) != 0 {
		t.Fatalf("expected no clear when pending clear is first scheduled, got %+v", events)
	}
	if active := m.ActiveSides(); !active.Right || active.Left {
		t.Fatalf("expected right to remain active while clear is pending, got %+v", active)
	}

	events = m.Process(1500, nil)
	if len(events) != 0 {
		t.Fatalf("expected no clear before pending timestamp, got %+v", events)
	}

	events = m.Process(1501, nil)
	if len(events) != 1 || events[0].Type != EventClearRight {
		t.Fatalf("expected delayed clear_right, got %+v", events)
	}
	if events[0].ExpiresAt != 3501 {
		t.Fatalf("expected clear expiry 3501, got %d", events[0].ExpiresAt)
	}
	if active := m.ActiveSides(); active.Right || active.Left {
		t.Fatalf("expected no active sides after clear, got %+v", active)
	}
}

func TestMachine_ClearPendingCancelledOnRightReappearance(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %+v", events)
	}

	events = m.Process(1351, nil)
	if len(events) != 0 {
		t.Fatalf("expected pending clear scheduling only, got %+v", events)
	}

	events = m.Process(1400, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 0 {
		t.Fatalf("expected reappearance to cancel pending clear without new event, got %+v", events)
	}

	events = m.Process(1501, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 0 {
		t.Fatalf("expected stale pending clear to be cancelled, got %+v", events)
	}
	if active := m.ActiveSides(); !active.Right || active.Left {
		t.Fatalf("expected right to remain active, got %+v", active)
	}
}

func TestMachine_AllClearWaitsForHoldThenDelay(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{
		{Side: SideLeft, VehicleID: 2},
		{Side: SideRight, VehicleID: 3},
	})
	if len(events) != 1 || events[0].Type != EventThreeWide {
		t.Fatalf("expected initial three_wide, got %+v", events)
	}

	events = m.Process(1350, nil)
	if len(events) != 0 {
		t.Fatalf("expected no all_clear while detection hold is active, got %+v", events)
	}

	events = m.Process(1351, nil)
	if len(events) != 0 {
		t.Fatalf("expected pending all_clear scheduling only, got %+v", events)
	}

	events = m.Process(1501, nil)
	if len(events) != 1 || events[0].Type != EventAllClear {
		t.Fatalf("expected delayed all_clear, got %+v", events)
	}
	if active := m.ActiveSides(); active.Left || active.Right {
		t.Fatalf("expected no active sides after all_clear, got %+v", active)
	}
}

func TestMachine_LateralClearRightIsDelayed(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %+v", events)
	}

	events = m.Process(1400, []Zone{{Side: SideLeft, VehicleID: 3}})
	if len(events) != 1 || events[0].Type != EventCarLeft {
		t.Fatalf("expected immediate car_left only, got %+v", events)
	}
	if active := m.ActiveSides(); !active.Left || active.Right {
		t.Fatalf("expected active side to move to left immediately, got %+v", active)
	}

	events = m.Process(1549, []Zone{{Side: SideLeft, VehicleID: 3}})
	if len(events) != 0 {
		t.Fatalf("expected no clear_right before lateral pending timestamp, got %+v", events)
	}

	events = m.Process(1550, []Zone{{Side: SideLeft, VehicleID: 3}})
	if len(events) != 1 || events[0].Type != EventClearRight {
		t.Fatalf("expected delayed lateral clear_right, got %+v", events)
	}
}

func TestMachine_LateralClearLeftIsDelayed(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideLeft, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarLeft {
		t.Fatalf("expected initial car_left, got %+v", events)
	}

	events = m.Process(1400, []Zone{{Side: SideRight, VehicleID: 3}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected immediate car_right only, got %+v", events)
	}
	if active := m.ActiveSides(); active.Left || !active.Right {
		t.Fatalf("expected active side to move to right immediately, got %+v", active)
	}

	events = m.Process(1549, []Zone{{Side: SideRight, VehicleID: 3}})
	if len(events) != 0 {
		t.Fatalf("expected no clear_left before lateral pending timestamp, got %+v", events)
	}

	events = m.Process(1550, []Zone{{Side: SideRight, VehicleID: 3}})
	if len(events) != 1 || events[0].Type != EventClearLeft {
		t.Fatalf("expected delayed lateral clear_left, got %+v", events)
	}
}

func TestMachine_StillThereRepeatsAfter3000MSLeft(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideLeft, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarLeft {
		t.Fatalf("expected initial car_left, got %+v", events)
	}

	// At T=3999ms (2999ms after initial), just before 3000ms repeat
	events = m.Process(3999, []Zone{{Side: SideLeft, VehicleID: 2}})
	if len(events) != 0 {
		t.Fatalf("expected no still_there before 3000ms repeat, got %+v", events)
	}

	// At T=4000ms (3000ms after initial), exactly repeat interval
	events = m.Process(4000, []Zone{{Side: SideLeft, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventStillThere {
		t.Fatalf("expected still_there at 3000ms repeat, got %+v", events)
	}
	if events[0].ExpiresAt != 5000 { // 4000 + 1000 (messageExpiryMS)
		t.Fatalf("expected still_there expiry 5000, got %d", events[0].ExpiresAt)
	}
}

func TestMachine_StillThereRepeatsAfter3000MSRight(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %+v", events)
	}

	events = m.Process(3999, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 0 {
		t.Fatalf("expected no still_there before 3000ms repeat, got %+v", events)
	}

	events = m.Process(4000, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventStillThere {
		t.Fatalf("expected still_there at 3000ms repeat, got %+v", events)
	}
	if events[0].ExpiresAt != 5000 { // 4000 + 1000 (messageExpiryMS)
		t.Fatalf("expected still_there expiry 5000, got %d", events[0].ExpiresAt)
	}
}

func TestMachine_CarLeftStillImmediateWhileRightClearPending(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %+v", events)
	}

	events = m.Process(1351, nil)
	if len(events) != 0 {
		t.Fatalf("expected pending clear scheduling only, got %+v", events)
	}

	events = m.Process(1400, []Zone{{Side: SideLeft, VehicleID: 3}})
	if len(events) != 1 || events[0].Type != EventCarLeft {
		t.Fatalf("expected car_left to remain immediate while clear_right is pending, got %+v", events)
	}
}

func TestMachine_ClearLeftExpiresExactlyWhenRightAppears(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideLeft, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarLeft {
		t.Fatalf("expected initial car_left, got %+v", events)
	}

	// Remove left side. debounce 350, clear delay 150 -> total 500 ms delay
	events = m.Process(1351, nil)
	// debounce expired, pending clear scheduled at 1501

	// exactly at 1501, right appears
	events = m.Process(1501, []Zone{{Side: SideRight, VehicleID: 3}})
	if len(events) != 2 {
		t.Fatalf("expected clear_left AND car_right, got %d: %+v", len(events), events)
	}
	if events[0].Type != EventClearLeft || events[1].Type != EventCarRight {
		t.Fatalf("expected clear_left then car_right, got %+v", events)
	}
	if m.state != StateRight {
		t.Fatalf("expected state to be right, got %s", m.state)
	}
}

func TestMachine_ClearRightExpiresExactlyWhenLeftAppears(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %+v", events)
	}

	events = m.Process(1351, nil)

	events = m.Process(1501, []Zone{{Side: SideLeft, VehicleID: 3}})
	if len(events) != 2 {
		t.Fatalf("expected clear_right AND car_left, got %d: %+v", len(events), events)
	}
	if events[0].Type != EventClearRight || events[1].Type != EventCarLeft {
		t.Fatalf("expected clear_right then car_left, got %+v", events)
	}
	if m.state != StateLeft {
		t.Fatalf("expected state to be left, got %s", m.state)
	}
}

func TestMachine_ClearLeftThenRightPreservesDebounce(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideLeft, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarLeft {
		t.Fatalf("expected initial car_left, got %+v", events)
	}

	// Left disappears; pending clear_left scheduled for 1501.
	events = m.Process(1351, nil)
	if len(events) != 0 {
		t.Fatalf("expected pending clear scheduling only, got %+v", events)
	}

	// Exactly when the pending clear expires, right appears.
	events = m.Process(1501, []Zone{{Side: SideRight, VehicleID: 3}})
	if len(events) != 2 {
		t.Fatalf("expected clear_left AND car_right, got %d: %+v", len(events), events)
	}
	if events[0].Type != EventClearLeft || events[1].Type != EventCarRight {
		t.Fatalf("expected clear_left then car_right, got %+v", events)
	}
	if m.state != StateRight {
		t.Fatalf("expected state right, got %s", m.state)
	}

	// Brief dropout: right was last seen at 1501, hold is 350ms.
	events = m.Process(1851, nil)
	if len(events) != 0 {
		t.Fatalf("expected right side to be held through brief dropout, got %+v", events)
	}
	if m.state != StateRight {
		t.Fatalf("expected state right during hold, got %s", m.state)
	}
	if m.pendingClearEvent != "" {
		t.Fatalf("expected no pending clear while right side is held, got %q", m.pendingClearEvent)
	}

	// After the hold expires, clear delay starts. With a correct fix the side
	// is still held at 1851; the next frame at 2001 detects absence and the
	// clear fires at 2151.
	events = m.Process(2001, nil)
	if len(events) != 0 {
		t.Fatalf("expected clear_right scheduling only, got %+v", events)
	}
	if m.state != StateRight {
		t.Fatalf("expected state right while clear is pending, got %s", m.state)
	}

	events = m.Process(2151, nil)
	if len(events) != 1 || events[0].Type != EventClearRight {
		t.Fatalf("expected delayed clear_right, got %+v", events)
	}
	if m.state != StateNone {
		t.Fatalf("expected state none after clear, got %s", m.state)
	}
}

func TestMachine_ClearRightThenLeftPreservesDebounce(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{{Side: SideRight, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventCarRight {
		t.Fatalf("expected initial car_right, got %+v", events)
	}

	// Right disappears; pending clear_right scheduled for 1501.
	events = m.Process(1351, nil)
	if len(events) != 0 {
		t.Fatalf("expected pending clear scheduling only, got %+v", events)
	}

	// Exactly when the pending clear expires, left appears.
	events = m.Process(1501, []Zone{{Side: SideLeft, VehicleID: 3}})
	if len(events) != 2 {
		t.Fatalf("expected clear_right AND car_left, got %d: %+v", len(events), events)
	}
	if events[0].Type != EventClearRight || events[1].Type != EventCarLeft {
		t.Fatalf("expected clear_right then car_left, got %+v", events)
	}
	if m.state != StateLeft {
		t.Fatalf("expected state left, got %s", m.state)
	}

	// Brief dropout: left was last seen at 1501, hold is 350ms.
	events = m.Process(1851, nil)
	if len(events) != 0 {
		t.Fatalf("expected left side to be held through brief dropout, got %+v", events)
	}
	if m.state != StateLeft {
		t.Fatalf("expected state left during hold, got %s", m.state)
	}
	if m.pendingClearEvent != "" {
		t.Fatalf("expected no pending clear while left side is held, got %q", m.pendingClearEvent)
	}

	// After the hold expires, clear delay starts.
	events = m.Process(2001, nil)
	if len(events) != 0 {
		t.Fatalf("expected clear_left scheduling only, got %+v", events)
	}
	if m.state != StateLeft {
		t.Fatalf("expected state left while clear is pending, got %s", m.state)
	}

	events = m.Process(2151, nil)
	if len(events) != 1 || events[0].Type != EventClearLeft {
		t.Fatalf("expected delayed clear_left, got %+v", events)
	}
	if m.state != StateNone {
		t.Fatalf("expected state none after clear, got %s", m.state)
	}
}

func TestMachine_BothToLeftPendingClearRightDoesNotReemitCarLeft(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{
		{Side: SideLeft, VehicleID: 2},
		{Side: SideRight, VehicleID: 3},
	})
	if len(events) != 1 || events[0].Type != EventThreeWide {
		t.Fatalf("expected initial three_wide, got %+v", events)
	}

	// Right drops; clear_right is scheduled for 1550.
	events = m.Process(1400, []Zone{{Side: SideLeft, VehicleID: 2}})
	if len(events) != 0 {
		t.Fatalf("expected clear_right scheduling only, got %+v", events)
	}
	if m.state != StateLeft {
		t.Fatalf("expected state left, got %s", m.state)
	}

	// When the pending clear fires, left is still active; car_left must NOT be re-emitted.
	events = m.Process(1550, []Zone{{Side: SideLeft, VehicleID: 2}})
	if len(events) != 1 || events[0].Type != EventClearRight {
		t.Fatalf("expected only clear_right, got %+v", events)
	}
	if m.state != StateLeft {
		t.Fatalf("expected state left after clear, got %s", m.state)
	}
}

func TestMachine_BothToRightPendingClearLeftDoesNotReemitCarRight(t *testing.T) {
	m := NewMachine()

	events := m.Process(1000, []Zone{
		{Side: SideLeft, VehicleID: 2},
		{Side: SideRight, VehicleID: 3},
	})
	if len(events) != 1 || events[0].Type != EventThreeWide {
		t.Fatalf("expected initial three_wide, got %+v", events)
	}

	// Left drops; clear_left is scheduled for 1550.
	events = m.Process(1400, []Zone{{Side: SideRight, VehicleID: 3}})
	if len(events) != 0 {
		t.Fatalf("expected clear_left scheduling only, got %+v", events)
	}
	if m.state != StateRight {
		t.Fatalf("expected state right, got %s", m.state)
	}

	// When the pending clear fires, right is still active; car_right must NOT be re-emitted.
	events = m.Process(1550, []Zone{{Side: SideRight, VehicleID: 3}})
	if len(events) != 1 || events[0].Type != EventClearLeft {
		t.Fatalf("expected only clear_left, got %+v", events)
	}
	if m.state != StateRight {
		t.Fatalf("expected state right after clear, got %s", m.state)
	}
}

