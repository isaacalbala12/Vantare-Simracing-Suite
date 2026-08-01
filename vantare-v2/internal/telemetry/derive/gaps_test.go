package derive

import (
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestDeriveSessionRemainingRequiresFreshFiniteOrderedInputsAndPreservesZero(t *testing.T) {
	tests := []struct {
		name      string
		current   schema.Field[time.Duration]
		end       schema.Field[session.EndTime]
		want      session.RemainingTime
		freshness schema.Freshness
		present   bool
	}{
		{name: "remaining", current: derivedInput(25*time.Second, schema.FreshnessFresh), end: derivedInput(session.EndTime(100), schema.FreshnessFresh), want: 75, freshness: schema.FreshnessFresh, present: true},
		{name: "zero", current: derivedInput(100*time.Second, schema.FreshnessFresh), end: derivedInput(session.EndTime(100), schema.FreshnessFresh), want: 0, freshness: schema.FreshnessFresh, present: true},
		{name: "stale current", current: derivedInput(25*time.Second, schema.FreshnessStale), end: derivedInput(session.EndTime(100), schema.FreshnessFresh), freshness: schema.FreshnessMissing},
		{name: "both stale", current: derivedInput(25*time.Second, schema.FreshnessStale), end: derivedInput(session.EndTime(100), schema.FreshnessStale), want: 75, freshness: schema.FreshnessStale, present: true},
		{name: "missing end", current: derivedInput(25*time.Second, schema.FreshnessFresh), end: schema.MissingField[session.EndTime](), freshness: schema.FreshnessMissing},
		{name: "end before current", current: derivedInput(101*time.Second, schema.FreshnessFresh), end: derivedInput(session.EndTime(100), schema.FreshnessFresh), freshness: schema.FreshnessInvalid, present: true},
		{name: "non finite end", current: derivedInput(25*time.Second, schema.FreshnessFresh), end: derivedInput(session.EndTime(math.Inf(1)), schema.FreshnessFresh), freshness: schema.FreshnessInvalid, present: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := deriveSessionRemaining(test.current, test.end)
			value, present := got.Value()
			if got.Freshness() != test.freshness || present != test.present || (present && (test.freshness == schema.FreshnessFresh || test.freshness == schema.FreshnessStale) && value != test.want) {
				t.Fatalf("remaining = (%v,%t,%v), want (%v,%t,%v)", value, present, got.Freshness(), test.want, test.present, test.freshness)
			}
			if present && got.Provenance() != schema.ProvenanceDerived {
				t.Fatalf("provenance = %v, want derived", got.Provenance())
			}
		})
	}
}

func TestDeriveRelativeGapsUsesDocumentedSignAndNeverInventsLappedSeconds(t *testing.T) {
	vehicles := []core.VehicleState{
		gapVehicle("leader", 0, 0, schema.FreshnessFresh),
		gapVehicle("player", 15, 0, schema.FreshnessFresh),
		gapVehicle("behind", 22, 0, schema.FreshnessFresh),
		gapVehicle("lapped-ahead", 3, 0, schema.FreshnessFresh),
		gapVehicle("lapped-behind", 0, 1, schema.FreshnessFresh),
	}
	vehicles[3].LapsBehindLeader = derivedInput(standings.LapGap(0), schema.FreshnessFresh)
	vehicles[1].LapsBehindLeader = derivedInput(standings.LapGap(1), schema.FreshnessFresh)
	vehicles[2].LapsBehindLeader = derivedInput(standings.LapGap(1), schema.FreshnessFresh)
	vehicles[4].LapsBehindLeader = derivedInput(standings.LapGap(2), schema.FreshnessFresh)

	gaps := deriveRelativeGaps("player", derivedInput(true, schema.FreshnessFresh), vehicles)
	if gaps.Freshness != schema.FreshnessFresh || len(gaps.Vehicles) != len(vehicles) {
		t.Fatalf("gap set = %+v", gaps)
	}
	assertGap(t, gaps, "leader", 0, false, 1)
	assertGap(t, gaps, "player", 0, true, 0)
	assertGap(t, gaps, "behind", -7, true, 0)
	assertGap(t, gaps, "lapped-ahead", 0, false, 1)
	assertGap(t, gaps, "lapped-behind", 0, false, -1)
}

func TestDeriveRelativeGapsRejectsIncompatibleQualityAndNonFiniteValues(t *testing.T) {
	player := gapVehicle("player", 10, 0, schema.FreshnessFresh)
	stale := gapVehicle("stale", 12, 0, schema.FreshnessStale)
	invalid := gapVehicle("invalid", standings.TimeGap(math.NaN()), 0, schema.FreshnessFresh)
	missing := gapVehicle("missing", 0, 0, schema.FreshnessFresh)
	missing.TimeBehindLeader = schema.MissingField[standings.TimeGap]()

	gaps := deriveRelativeGaps("player", derivedInput(true, schema.FreshnessFresh), []core.VehicleState{player, stale, invalid, missing})
	if gaps.Freshness != schema.FreshnessInvalid {
		t.Fatalf("gap set freshness = %v, want invalid", gaps.Freshness)
	}
	assertGapQuality(t, gaps, "stale", schema.FreshnessMissing)
	assertGapQuality(t, gaps, "invalid", schema.FreshnessInvalid)
	assertGapQuality(t, gaps, "missing", schema.FreshnessMissing)
}

func TestDeriveRelativeGapsWithoutActivePlayerIsMissing(t *testing.T) {
	gaps := deriveRelativeGaps("", derivedInput(false, schema.FreshnessFresh), []core.VehicleState{gapVehicle("other", 0, 0, schema.FreshnessFresh)})
	if gaps.Freshness != schema.FreshnessMissing || len(gaps.Vehicles) != 0 {
		t.Fatalf("gaps without player = %+v", gaps)
	}
}

func gapVehicle(id identity.VehicleID, seconds standings.TimeGap, laps standings.LapGap, freshness schema.Freshness) core.VehicleState {
	isPlayer := id == "player"
	return core.VehicleState{
		Identity:         identity.RunIdentity{Event: "event", Session: "session", Vehicle: id},
		Player:           derivedInput(isPlayer, freshness),
		TimeBehindLeader: derivedInput(seconds, freshness),
		LapsBehindLeader: derivedInput(laps, freshness),
	}
}

func derivedInput[T comparable](value T, freshness schema.Freshness) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, freshness)
	if err != nil {
		panic(err)
	}
	return field
}

func assertGap(t testing.TB, gaps GapSet, id identity.VehicleID, seconds standings.RelativeTime, secondsPresent bool, laps standings.RelativeLaps) {
	t.Helper()
	for _, gap := range gaps.Vehicles {
		if gap.Vehicle != id {
			continue
		}
		gotSeconds, present := gap.Time.Value()
		gotLaps, lapsPresent := gap.Laps.Value()
		if present != secondsPresent || (present && gotSeconds != seconds) || !lapsPresent || gotLaps != laps {
			t.Fatalf("gap %q = seconds(%v,%t) laps(%v,%t)", id, gotSeconds, present, gotLaps, lapsPresent)
		}
		return
	}
	t.Fatalf("gap %q not found", id)
}

func assertGapQuality(t testing.TB, gaps GapSet, id identity.VehicleID, freshness schema.Freshness) {
	t.Helper()
	for _, gap := range gaps.Vehicles {
		if gap.Vehicle == id {
			if gap.Time.Freshness() != freshness {
				t.Fatalf("gap %q freshness = %v, want %v", id, gap.Time.Freshness(), freshness)
			}
			return
		}
	}
	t.Fatalf("gap %q not found", id)
}

func FuzzGapDerivationNeverInventsSeconds(f *testing.F) {
	f.Add(10.0, 12.0, int32(0), int32(0))
	f.Add(10.0, 12.0, int32(1), int32(0))
	f.Fuzz(func(t *testing.T, playerSeconds, otherSeconds float64, playerLaps, otherLaps int32) {
		player := gapVehicle("player", standings.TimeGap(playerSeconds), standings.LapGap(playerLaps), schema.FreshnessFresh)
		other := gapVehicle("other", standings.TimeGap(otherSeconds), standings.LapGap(otherLaps), schema.FreshnessFresh)
		gaps := deriveRelativeGaps("player", derivedInput(true, schema.FreshnessFresh), []core.VehicleState{player, other})
		if len(gaps.Vehicles) != 2 {
			return
		}
		for _, gap := range gaps.Vehicles {
			if gap.Vehicle != "other" {
				continue
			}
			lapDelta := int64(playerLaps) - int64(otherLaps)
			_, secondsPresent := gap.Time.Value()
			if lapDelta != 0 && secondsPresent {
				t.Fatalf("invented seconds for lap delta %d", lapDelta)
			}
		}
	})
}

func BenchmarkGapDerivation44Vehicles(b *testing.B) {
	vehicles := make([]core.VehicleState, 44)
	for index := range vehicles {
		id := identity.VehicleID(fmt.Sprintf("vehicle-%02d", index))
		if index == 21 {
			id = "player"
		}
		vehicles[index] = gapVehicle(id, standings.TimeGap(index)*0.75, 0, schema.FreshnessFresh)
	}
	playerPresent := derivedInput(true, schema.FreshnessFresh)
	b.ReportAllocs()
	for index := 0; index < b.N; index++ {
		deriveRelativeGaps("player", playerPresent, vehicles)
	}
}
