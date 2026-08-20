package simx

import (
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/catalog"
	"github.com/vantare/overlays/v2/internal/telemetry/fusion"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

// freshnessLimit is the budget of the single synthetic slot.
const freshnessLimit = 500 * time.Millisecond

// authorityMatrix declares every signal SimX can answer, each from its single
// slot. A one-source driver used to need its own copy of the whole fusion
// machinery; with the shared package the entire declaration is this table.
var authorityMatrix = fusion.MustMatrix(singleSlotRules(
	catalog.SignalSessionSourceTime,
	catalog.SignalSessionTrackName,
	catalog.SignalSessionType,
	catalog.SignalSessionVehicleCount,
	catalog.SignalVehiclePlayerPresent,
	catalog.SignalIdentityDriverName,
	catalog.SignalVehicleName,
	catalog.SignalVehicleClass,
	catalog.SignalStandingsPosition,
	catalog.SignalStandingsCompletedLaps,
	catalog.SignalStandingsLapDistance,
	catalog.SignalStandingsBestLapTime,
	catalog.SignalStandingsLastLapTime,
	catalog.SignalStandingsTimeBehindLeader,
	catalog.SignalStandingsLapsBehindLeader,
	catalog.SignalStandingsTimeBehindNext,
	catalog.SignalStandingsLapsBehindNext,
	catalog.SignalPitInPit,
	catalog.SignalVehicleGear,
	catalog.SignalVehicleEngineRPM,
	catalog.SignalVehicleSpeedMPS,
	catalog.SignalControlsThrottle,
	catalog.SignalControlsBrake,
	catalog.SignalEnergyFuelAmount,
	catalog.SignalEnergyFuelCapacity,
))

func singleSlotRules(signals ...catalog.SignalID) []fusion.Rule {
	rules := make([]fusion.Rule, 0, len(signals))
	for _, signal := range signals {
		rules = append(rules, fusion.Rule{
			Signal:  signal,
			Sources: []fusion.Candidate{{Slot: SlotSynthetic, TTL: freshnessLimit}},
		})
	}
	return rules
}

// AuthorityMatrix exposes the declared rules for conformance tests and
// diagnostics.
func AuthorityMatrix() []fusion.Rule { return authorityMatrix.Rules() }

// Fusion ages the single synthetic slot and records one decision per declared
// signal. With one source there is nothing to arbitrate, but the TTL, the
// decision ledger and the exhaustive matrix are the same code LMU runs.
type Fusion struct {
	slots *fusion.Slots[Observation]
}

func (state *Fusion) store() *fusion.Slots[Observation] {
	if state.slots == nil {
		state.slots = fusion.NewSlots[Observation](SlotSynthetic)
	}
	return state.slots
}

// Merge returns the canonical observation and the fusion decisions behind it.
func (state *Fusion) Merge(elapsed time.Duration, inputs ...Observation) (Observation, []fusion.Decision) {
	slots := state.store()
	for _, input := range inputs {
		if input.Slot != slotSynthetic {
			continue
		}
		slots.Put(SlotSynthetic, input, fusion.Stamp{Elapsed: elapsed, Set: true})
	}
	entry := slots.Get(SlotSynthetic)
	result := entry.Value
	ledger := fusion.NewLedger(authorityMatrix.Len(), 1)
	for _, rule := range authorityMatrix.Rules() {
		ledger.Decide(rule.Signal, SlotSynthetic, slotFreshness(elapsed, entry, rule), false)
	}
	return result, ledger.Decisions()
}

func slotFreshness(elapsed time.Duration, entry fusion.Entry[Observation], rule fusion.Rule) schema.Freshness {
	if !entry.Present() {
		return schema.FreshnessMissing
	}
	aged := fusion.FieldAt(elapsed, entry.Received, rule.TTL(SlotSynthetic), entry.Value.SourceTime)
	return aged.Freshness()
}
