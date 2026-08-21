package families

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/radio"
)

type testClock struct{ now int64 }

func (clock *testClock) NowMS() int64 { return clock.now }

func baseEvidence(now int64) Evidence {
	return Evidence{NowMS: now, Ready: true, Subject: "player", FuelKnown: true, FuelLitres: 100,
		FuelCapacityKnown: true, FuelCapacity: 100, LapKnown: true, Lap: 1,
		PenaltyKnown: true, GapLeaderKnown: true, GapLeader: 5, GapNextKnown: true, GapNext: 2,
		PitKnown: true}
}

func intents(messages []radio.RadioMessage) map[string]bool {
	result := make(map[string]bool, len(messages))
	for _, current := range messages {
		result[current.Intent] = true
	}
	return result
}

func TestFuelParityThresholdsCooldownRefuelAndRange(t *testing.T) {
	state := &fuelState{}
	family := fuelFamily{}
	e := baseEvidence(1_000)
	e.FuelLitres = 0.5
	first := family.Evaluate(e, state)
	got := intents(first)
	for _, want := range []string{IntentFuelTwoLitres, IntentFuelOneLitre, IntentFuelHalfTank} {
		if !got[want] {
			t.Fatalf("legacy threshold case missing %s: %v", want, got)
		}
	}
	for _, current := range first {
		state.Started(current)
	}
	e.NowMS = 32_000
	e.FuelLitres = 0.3
	if messages := family.Evaluate(e, state); len(messages) != 0 {
		t.Fatalf("legacy no-spam case emitted %#v", messages)
	}
	e.NowMS = 33_000
	e.FuelLitres = 15
	family.Evaluate(e, state)
	e.NowMS = 64_000
	e.FuelLitres = 0.5
	if got := intents(family.Evaluate(e, state)); !got[IntentFuelOneLitre] || !got[IntentFuelTwoLitres] {
		t.Fatalf("legacy refuel re-arm case = %v", got)
	}

	state.Reset()
	seen := map[string]bool{}
	for lap, fuel := range []float64{51, 41, 31, 21} {
		e = baseEvidence(int64(lap+1) * 31_000)
		e.Lap, e.FuelLitres = lap+1, fuel
		for intent := range intents(family.Evaluate(e, state)) {
			seen[intent] = true
		}
	}
	e = baseEvidence(155_000)
	e.Lap, e.FuelLitres = 4, 19
	got = intents(family.Evaluate(e, state))
	if !got[IntentFuelLapsTwo] || !seen[IntentFuelPitNow] {
		t.Fatalf("legacy consumption/range case = current %v seen %v", got, seen)
	}
}

func TestFuelParityUnknownCapacityNeverCalculatesRange(t *testing.T) {
	for _, capacity := range []struct {
		name  string
		known bool
		value float64
	}{
		{name: "missing"},
		{name: "zero", known: true},
		{name: "negative", known: true, value: -1},
	} {
		t.Run(capacity.name, func(t *testing.T) {
			state := &fuelState{}
			family := fuelFamily{}
			got := map[string]bool{}
			for lap, fuel := range []float64{100, 90, 80, 30} {
				e := baseEvidence(int64(lap+1) * 31_000)
				e.Lap, e.FuelLitres = lap+1, fuel
				e.FuelCapacityKnown, e.FuelCapacity = capacity.known, capacity.value
				for intent := range intents(family.Evaluate(e, state)) {
					got[intent] = true
				}
			}
			for _, intent := range []string{IntentFuelLapsFour, IntentFuelLapsThree, IntentFuelLapsTwo, IntentFuelLapsOne, IntentFuelPitNow} {
				if got[intent] {
					t.Fatalf("old monitor capacity guard emitted %s: %v", intent, got)
				}
			}
		})
	}
}

func TestFuelOneShotsRetryWhenSpotterDropsPendingBeforeStarted(t *testing.T) {
	clock := &testClock{now: 1_000}
	limits := radio.DefaultLimits()
	limits.Cooldowns = Cooldowns()
	bus, err := radio.NewBus(limits, clock)
	if err != nil {
		t.Fatal(err)
	}
	state := &fuelState{}
	e := baseEvidence(clock.now)
	e.FuelLitres = 0.5
	first := fuelFamily{}.Evaluate(e, state)
	if len(first) != 3 {
		t.Fatalf("first low-fuel batch = %#v, want 3", first)
	}
	for index := range first {
		first[index].ID, first[index].Locale = "fuel-"+first[index].Intent, radio.LocaleES
		if result, submitErr := bus.Submit(first[index]); submitErr != nil || !result.Accepted {
			t.Fatalf("submit %s = %#v, %v", first[index].Intent, result, submitErr)
		}
	}
	spotter := radio.RadioMessage{Version: radio.VersionV1, ID: "spotter", Source: "telemetry-core", Intent: "spotter.car_left", Subject: "player", Priority: radio.PriorityP0, CreatedAtMS: clock.now, ExpiresAtMS: clock.now + 3_000, Locale: radio.LocaleES, Payload: map[string]string{}}
	result, err := bus.Submit(spotter)
	if err != nil || len(result.Dropped) != 3 {
		t.Fatalf("spotter preemption = %#v, %v", result, err)
	}
	clock.now += 31_000
	e.NowMS = clock.now
	if retry := (fuelFamily{}).Evaluate(e, state); len(retry) != 3 {
		t.Fatalf("dropped pre-start one-shots retried = %#v, want 3", retry)
	}
}

func TestPenaltyParityRisingEdgeIsNeutral(t *testing.T) {
	state := &penaltiesState{}
	family := penaltiesFamily{}
	e := baseEvidence(1_000)
	family.Evaluate(e, state)
	e.NowMS, e.PenaltyCount = 31_000, 1
	messages := family.Evaluate(e, state)
	if len(messages) != 1 || messages[0].Intent != IntentPenaltyCountIncreased {
		t.Fatalf("legacy rising edge = %#v", messages)
	}
	if messages[0].Intent == "penalties.new_drivethrough" || messages[0].Intent == "penalties.new_stopgo" {
		t.Fatal("family invented an unavailable penalty type")
	}
	state.Started(messages[0])
	if duplicate := family.Evaluate(e, state); len(duplicate) != 0 {
		t.Fatalf("duplicate = %#v", duplicate)
	}
}

func TestEdgeCursorsCommitOnlyWhenStarted(t *testing.T) {
	t.Run("penalties", func(t *testing.T) {
		state := &penaltiesState{}
		e := baseEvidence(1_000)
		penaltiesFamily{}.Evaluate(e, state)
		e.PenaltyCount = 1
		first := (penaltiesFamily{}).Evaluate(e, state)
		if retry := (penaltiesFamily{}).Evaluate(e, state); len(first) != 1 || len(retry) != 1 {
			t.Fatalf("pre-start penalty retry = first %#v retry %#v", first, retry)
		}
		state.Started(first[0])
		if duplicate := (penaltiesFamily{}).Evaluate(e, state); len(duplicate) != 0 {
			t.Fatalf("started penalty duplicated: %#v", duplicate)
		}
	})
	t.Run("laps", func(t *testing.T) {
		state := &lapsState{}
		e := baseEvidence(1_000)
		lapsFamily{}.Evaluate(e, state)
		e.Lap = 2
		first := (lapsFamily{}).Evaluate(e, state)
		if retry := (lapsFamily{}).Evaluate(e, state); len(first) != 1 || len(retry) != 1 {
			t.Fatalf("pre-start lap retry = first %#v retry %#v", first, retry)
		}
		state.Started(first[0])
		if duplicate := (lapsFamily{}).Evaluate(e, state); len(duplicate) != 0 {
			t.Fatalf("started lap duplicated: %#v", duplicate)
		}
	})
	t.Run("pitstops", func(t *testing.T) {
		state := &pitstopsState{}
		e := baseEvidence(1_000)
		pitstopsFamily{}.Evaluate(e, state)
		e.InPit = true
		first := (pitstopsFamily{}).Evaluate(e, state)
		if retry := (pitstopsFamily{}).Evaluate(e, state); len(first) != 1 || len(retry) != 1 {
			t.Fatalf("pre-start pit retry = first %#v retry %#v", first, retry)
		}
		state.Started(first[0])
		if duplicate := (pitstopsFamily{}).Evaluate(e, state); len(duplicate) != 0 {
			t.Fatalf("started pit duplicated: %#v", duplicate)
		}
	})
}

func TestLapParityRisingEdgeAndReset(t *testing.T) {
	state := &lapsState{}
	family := lapsFamily{}
	e := baseEvidence(1_000)
	family.Evaluate(e, state)
	e.NowMS, e.Lap = 2_000, 2
	if got := family.Evaluate(e, state); len(got) != 1 || got[0].Intent != IntentLapCompleted {
		t.Fatalf("lap edge = %#v", got)
	} else {
		state.Started(got[0])
	}
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("lap duplicate = %#v", got)
	}
	state.Reset()
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("reset must seed fail-closed, got %#v", got)
	}
}

func TestTimingsParityReadableGapsLeavesCadenceToBus(t *testing.T) {
	state := &timingsState{}
	family := timingsFamily{}
	e := baseEvidence(1_000)
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("first sample = %#v", got)
	}
	e.NowMS = 2_000
	if got := family.Evaluate(e, state); len(got) != 1 || got[0].Intent != IntentTimingGapReport {
		t.Fatalf("readable gaps = %#v", got)
	}
	e.NowMS, e.GapLeader, e.GapNext = 3_000, 0.2, 30
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("unreadable gaps = %#v", got)
	}
}

func TestTimingCooldownStartsOnlyAtDelayedACK(t *testing.T) {
	clock := &testClock{now: 1_000}
	limits := radio.DefaultLimits()
	limits.Cooldowns = Cooldowns()
	bus, err := radio.NewBus(limits, clock)
	if err != nil {
		t.Fatal(err)
	}
	state := &timingsState{}
	family := timingsFamily{}
	e := baseEvidence(clock.now)
	family.Evaluate(e, state)

	clock.now = 61_000
	e.NowMS = clock.now
	first := family.Evaluate(e, state)
	first[0].ID, first[0].Locale = "first", radio.LocaleES
	if result, submitErr := bus.Submit(first[0]); submitErr != nil || !result.Accepted {
		t.Fatalf("first submit = %#v, %v", result, submitErr)
	}
	item, ok := bus.Next(context.Background())
	if !ok {
		t.Fatal("first gap report was not selected")
	}
	clock.now = 111_000
	item.Started()
	item.Done()

	clock.now = 121_000
	e.NowMS = clock.now
	for _, current := range family.Evaluate(e, state) {
		current.ID, current.Locale = "inside", radio.LocaleES
		if result, submitErr := bus.Submit(current); submitErr != nil || result.Accepted {
			t.Fatalf("cooldown before delayed ACK deadline = %#v, %v", result, submitErr)
		}
	}
	clock.now = 171_000
	e.NowMS = clock.now
	after := family.Evaluate(e, state)
	if len(after) != 1 {
		t.Fatalf("evaluator suppressed bus-owned cooldown boundary: %#v", after)
	}
	after[0].ID, after[0].Locale = "after", radio.LocaleES
	if result, submitErr := bus.Submit(after[0]); submitErr != nil || !result.Accepted {
		t.Fatalf("post-ACK cooldown submit = %#v, %v", result, submitErr)
	}
}

func TestPitstopParityTransitions(t *testing.T) {
	state := &pitstopsState{}
	family := pitstopsFamily{}
	e := baseEvidence(1_000)
	family.Evaluate(e, state)
	e.NowMS, e.InPit = 2_000, true
	if got := family.Evaluate(e, state); len(got) != 1 || got[0].Intent != IntentPitEntry {
		t.Fatalf("entry = %#v", got)
	} else {
		state.Started(got[0])
	}
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("entry duplicate = %#v", got)
	}
	e.NowMS, e.InPit = 3_000, false
	if got := family.Evaluate(e, state); len(got) != 1 || got[0].Intent != IntentPitExit {
		t.Fatalf("exit = %#v", got)
	}
}

func TestIntentTableDrivesPriorityTTLSubjectCooldownAndCatalog(t *testing.T) {
	resolver := radio.NewResolver()
	if err := RegisterCatalog(resolver); err != nil {
		t.Fatal(err)
	}
	for intent, definition := range intentTable {
		e := baseEvidence(1_000)
		got := message(intent, e)
		got.ID, got.Locale = "id", radio.LocaleES
		if got.Priority != definition.Priority || got.ExpiresAtMS-got.CreatedAtMS != definition.TTL.Milliseconds() || got.Subject != "player" {
			t.Fatalf("%s metadata = %#v", intent, got)
		}
		if _, err := resolver.Resolve(got); err != nil {
			t.Fatalf("%s catalog: %v", intent, err)
		}
	}
	if intentTable[IntentPitEntry].Priority != radio.PriorityP3 || intentTable[IntentPitExit].Priority != radio.PriorityP3 ||
		intentTable[IntentPitEntry].Severity != "info" || intentTable[IntentPitExit].Severity != "info" ||
		intentTable[IntentPenaltyCountIncreased].Priority != radio.PriorityP3 {
		t.Fatal("family priority contract changed")
	}
}

func TestBusResetClearsFamilyCooldownFailClosed(t *testing.T) {
	clock := &testClock{now: 1_000}
	limits := radio.DefaultLimits()
	limits.Cooldowns = Cooldowns()
	bus, err := radio.NewBus(limits, clock)
	if err != nil {
		t.Fatal(err)
	}
	e := baseEvidence(clock.now)
	first := message(IntentTimingGapReport, e)
	first.ID, first.Locale = "first", radio.LocaleES
	if result, err := bus.Submit(first); err != nil || !result.Accepted {
		t.Fatalf("first submit: %#v %v", result, err)
	}
	item, ok := bus.Next(context.Background())
	if !ok {
		t.Fatal("missing first item")
	}
	item.Started()
	item.Done()
	clock.now += time.Second.Milliseconds()
	second := message(IntentTimingGapReport, Evidence{NowMS: clock.now, Subject: "player"})
	second.ID, second.Locale = "second", radio.LocaleES
	if result, err := bus.Submit(second); err != nil || result.Accepted {
		t.Fatalf("cooldown submit: %#v %v", result, err)
	}
	bus.Reset(radio.ErrLifecycleBoundary)
	if result, err := bus.Submit(second); err != nil || !result.Accepted {
		t.Fatalf("post-reset submit: %#v %v", result, err)
	}
}
