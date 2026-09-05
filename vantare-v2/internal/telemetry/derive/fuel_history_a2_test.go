package derive

import (
	"math"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

// TestFuelHistoryKeepsRealPerLapSamplesUpTo64 is the A2 derive RED: the fuel
// history carries one entry per measured lap (lap number plus litres consumed,
// index-aligned), capped at MaxFuelHistory, fed only by real tracker samples.
func TestFuelHistoryKeepsRealPerLapSamplesUpTo64(t *testing.T) {
	t.Parallel()

	if MaxFuelHistory != 64 {
		t.Fatalf("MaxFuelHistory = %d, want 64", MaxFuelHistory)
	}
	tracker := newFuelUsageTracker(0)
	var usage FuelUsage
	const laps = MaxFuelHistory + 2
	for lap := 1; lap <= laps; lap++ {
		header, observed := fuelBatch(schema.Sequence(lap), fuelStep{
			lap:      session.LapNumber(lap),
			fuel:     200 - 2*float64(lap-1),
			capacity: 300,
		})
		usage = tracker.Apply(header, observed)
	}
	samples := usage.History.Samples
	if len(samples) != MaxFuelHistory {
		t.Fatalf("history samples = %d, want %d", len(samples), MaxFuelHistory)
	}
	// 66 observed laps close 65 (laps 1..65); the cap keeps the newest 64.
	for index, sample := range samples {
		wantLap := session.LapNumber(index + 2)
		if sample.Lap != wantLap {
			t.Fatalf("history[%d].lap = %v, want %v (oldest laps drop first)", index, sample.Lap, wantLap)
		}
		if math.Abs(float64(sample.Consumed)-2) > 1e-9 {
			t.Fatalf("history[%d].consumed = %v, want 2 litres", index, sample.Consumed)
		}
	}
	if usage.History.Freshness != schema.FreshnessFresh {
		t.Fatalf("history freshness = %v, want fresh", usage.History.Freshness)
	}
}

// TestFuelHistoryResetsOnTheCanonicalIdentityBoundary is the A2 derive RED
// for reset: a new epoch/session/stint restarts the series, like the window.
func TestFuelHistoryResetsOnTheCanonicalIdentityBoundary(t *testing.T) {
	t.Parallel()

	tracker := newFuelUsageTracker(0)
	var usage FuelUsage
	for lap := 1; lap <= 3; lap++ {
		header, observed := fuelBatch(schema.Sequence(lap), fuelStep{
			lap:  session.LapNumber(lap),
			fuel: 100 - 3*float64(lap-1),
		})
		usage = tracker.Apply(header, observed)
	}
	if len(usage.History.Samples) != 2 {
		t.Fatalf("history samples = %d, want 2 before the reset", len(usage.History.Samples))
	}
	header, observed := fuelBatch(4, fuelStep{lap: 1, fuel: 100, session: "other", epoch: 2})
	usage = tracker.Apply(header, observed)
	if len(usage.History.Samples) != 0 {
		t.Fatalf("history samples = %d after a session reset, want 0", len(usage.History.Samples))
	}
	if usage.History.Freshness != schema.FreshnessFresh {
		t.Fatalf("history freshness = %v after a reset, want fresh", usage.History.Freshness)
	}
}

// TestFuelHistoryCloneLeavesTheCommittedSeriesUntouched is the A2 derive RED
// for ownership: the candidate history is a deep copy, never shared.
func TestFuelHistoryCloneLeavesTheCommittedSeriesUntouched(t *testing.T) {
	t.Parallel()

	committed := newFuelUsageTracker(0)
	for lap := 1; lap <= 2; lap++ {
		header, observed := fuelBatch(schema.Sequence(lap), fuelStep{
			lap:  session.LapNumber(lap),
			fuel: 100 - 4*float64(lap-1),
		})
		committed.Apply(header, observed)
	}
	candidate := cloneFuelUsageTracker(committed)
	header, observed := fuelBatch(3, fuelStep{lap: 3, fuel: 88})
	candidate.Apply(header, observed)

	if len(committed.history) != 1 {
		t.Fatalf("committed history = %d samples, want the single lap it measured", len(committed.history))
	}
	if len(candidate.history) != 2 {
		t.Fatalf("candidate history = %d samples, want two laps", len(candidate.history))
	}
	candidate.history[0].Consumed = 999
	if committed.history[0].Consumed == 999 {
		t.Fatal("candidate history shares backing storage with the committed tracker")
	}
}

// TestFuelHistoryKeepsQualityWithoutSentinels is the A2 derive RED for
// quality: no samples stays missing, measured samples stay fresh, and a stale
// batch keeps the measured series with stale freshness instead of inventing.
func TestFuelHistoryKeepsQualityWithoutSentinels(t *testing.T) {
	t.Parallel()

	tracker := newFuelUsageTracker(0)
	header, observed := fuelBatch(1, fuelStep{lap: 1, fuel: 100})
	usage := tracker.Apply(header, observed)
	if len(usage.History.Samples) != 0 {
		t.Fatalf("history samples = %d without a measured lap, want 0", len(usage.History.Samples))
	}
	if usage.History.Freshness != schema.FreshnessFresh {
		t.Fatalf("history freshness = %v without a measured lap, want fresh", usage.History.Freshness)
	}

	header, observed = fuelBatch(2, fuelStep{lap: 2, fuel: 96})
	usage = tracker.Apply(header, observed)
	if len(usage.History.Samples) != 1 {
		t.Fatalf("history samples = %d, want 1 measured lap", len(usage.History.Samples))
	}

	header, observed = fuelBatch(3, fuelStep{lap: 2, fuel: 95, freshness: schema.FreshnessStale})
	usage = tracker.Apply(header, observed)
	if len(usage.History.Samples) != 1 {
		t.Fatalf("a stale batch must keep the measured series, got %d samples", len(usage.History.Samples))
	}
	if usage.History.Freshness != schema.FreshnessStale {
		t.Fatalf("history freshness = %v after a stale batch, want stale", usage.History.Freshness)
	}
}

// TestFuelAverageWindowStaysSeparateFromTheHistory is the A2 derive RED for
// the separation contract: DefaultFuelUsageWindow=3 and MaxFuelUsageWindow=10
// still bound only the PerLap moving average while the history grows to 64.
func TestFuelAverageWindowStaysSeparateFromTheHistory(t *testing.T) {
	t.Parallel()

	if DefaultFuelUsageWindow != 3 {
		t.Fatalf("DefaultFuelUsageWindow = %d, want 3", DefaultFuelUsageWindow)
	}
	if MaxFuelUsageWindow != 10 {
		t.Fatalf("MaxFuelUsageWindow = %d, want 10", MaxFuelUsageWindow)
	}
	tracker := newFuelUsageTracker(0)
	var usage FuelUsage
	for lap := 1; lap <= 11; lap++ {
		header, observed := fuelBatch(schema.Sequence(lap), fuelStep{
			lap:  session.LapNumber(lap),
			fuel: 100 - float64(lap-1),
		})
		usage = tracker.Apply(header, observed)
	}
	// Ten measured laps of exactly 1 litre: the window keeps the last three,
	// the history keeps all ten.
	perLap, present := usage.PerLap.Value()
	if !present || math.Abs(float64(perLap)-1) > 1e-9 {
		t.Fatalf("perLap = (%v,%t), want the 3-lap average 1", perLap, present)
	}
	window, _ := usage.WindowLaps.Value()
	if window != 3 {
		t.Fatalf("windowLaps = %v, want 3 while the history holds more", window)
	}
	if len(usage.History.Samples) != 10 {
		t.Fatalf("history samples = %d, want all 10 measured laps", len(usage.History.Samples))
	}
}
