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
	got := intents(family.Evaluate(e, state))
	for _, want := range []string{IntentFuelTwoLitres, IntentFuelOneLitre, IntentFuelHalfTank} {
		if !got[want] {
			t.Fatalf("legacy threshold case missing %s: %v", want, got)
		}
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
		e.FuelCapacityKnown = false
		for intent := range intents(family.Evaluate(e, state)) {
			seen[intent] = true
		}
	}
	e = baseEvidence(155_000)
	e.Lap, e.FuelLitres, e.FuelCapacityKnown = 4, 19, false
	got = intents(family.Evaluate(e, state))
	if !got[IntentFuelLapsTwo] || !seen[IntentFuelPitNow] {
		t.Fatalf("legacy consumption/range case = current %v seen %v", got, seen)
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
	if duplicate := family.Evaluate(e, state); len(duplicate) != 0 {
		t.Fatalf("duplicate = %#v", duplicate)
	}
}

func TestLapParityRisingEdgeAndReset(t *testing.T) {
	state := &lapsState{}
	family := lapsFamily{}
	e := baseEvidence(1_000)
	family.Evaluate(e, state)
	e.NowMS, e.Lap = 2_000, 2
	if got := family.Evaluate(e, state); len(got) != 1 || got[0].Intent != IntentLapCompleted {
		t.Fatalf("lap edge = %#v", got)
	}
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("lap duplicate = %#v", got)
	}
	state.Reset()
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("reset must seed fail-closed, got %#v", got)
	}
}

func TestTimingsParityCadenceAndReadableGaps(t *testing.T) {
	state := &timingsState{}
	family := timingsFamily{}
	e := baseEvidence(1_000)
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("first sample = %#v", got)
	}
	e.NowMS = 60_999
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("before cadence = %#v", got)
	}
	e.NowMS = 61_000
	if got := family.Evaluate(e, state); len(got) != 1 || got[0].Intent != IntentTimingGapReport {
		t.Fatalf("cadence = %#v", got)
	}
	e.NowMS, e.GapLeader, e.GapNext = 121_000, 0.2, 30
	if got := family.Evaluate(e, state); len(got) != 0 {
		t.Fatalf("unreadable gaps = %#v", got)
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
	if intentTable[IntentPitEntry].Priority != radio.PriorityP2 || intentTable[IntentPenaltyCountIncreased].Priority != radio.PriorityP3 {
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
