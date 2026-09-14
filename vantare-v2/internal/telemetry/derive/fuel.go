package derive

import (
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

const (
	// MaxFuelUsageWindow bounds the moving average of per-lap consumption. The
	// window is small on purpose: fuel consumption tracks the current fuel load,
	// tyre state and traffic, so a long average lags the strategy it feeds.
	MaxFuelUsageWindow = 10
	// DefaultFuelUsageWindow is the canonical window: the last three valid laps.
	DefaultFuelUsageWindow = 3
	// MaxFuelHistory bounds the per-lap series, not the average: every measured
	// lap is kept up to this cap while PerLap still averages only the last
	// DefaultFuelUsageWindow of them. The two budgets are separate on purpose.
	MaxFuelHistory = 64
	// fuelRefuelEpsilon is the smallest amount increase, in litres, that counts
	// as a refuel instead of sensor noise around a monotonic drain.
	fuelRefuelEpsilon = 0.05
)

// FuelUsage is the canonical per-lap fuel consumption of the player.
//
// PerLap is the moving average over the last WindowLaps completed valid laps,
// in the canonical unit of energy.FuelAmount (litres). LastLap is the newest
// single observation behind that average. Both are derived, never observed:
// no simulator publishes them.
type FuelUsage struct {
	Freshness  schema.Freshness
	PerLap     schema.Field[energy.FuelAmount]
	LastLap    schema.Field[energy.FuelAmount]
	WindowLaps schema.Field[schema.Count]
	// History is the per-lap series behind the average: one entry per measured
	// lap, index-aligned by construction, in canonical litres. It never feeds
	// PerLap beyond the samples the window already keeps; it only exposes them.
	History FuelHistory
}

// FuelLapSample is one measured lap: the lap number it closed and the litres
// it consumed. Both fields are plain values, never sentinels: a lap with no
// measurement simply has no entry.
type FuelLapSample struct {
	Lap      session.LapNumber
	Consumed energy.FuelAmount
}

// FuelHistory is the canonical per-lap fuel series of the player, oldest
// first, capped at MaxFuelHistory. Only real tracker samples enter it: the
// same gate that publishes into the average window appends here.
type FuelHistory struct {
	Freshness schema.Freshness
	Samples   []FuelLapSample
}

func missingFuelUsage(freshness schema.Freshness) FuelUsage {
	return FuelUsage{
		Freshness:  freshness,
		PerLap:     schema.MissingField[energy.FuelAmount](),
		LastLap:    schema.MissingField[energy.FuelAmount](),
		WindowLaps: schema.MissingField[schema.Count](),
		History:    FuelHistory{Freshness: freshness},
	}
}

type fuelUsageTracker struct {
	window int

	initialized bool
	epoch       schema.Epoch
	session     identity.SessionID
	stint       identity.StintID

	// open describes the lap currently being measured: its number, the fuel
	// amount observed when it started, and whether anything invalidated it.
	open        bool
	openLap     session.LapNumber
	openFuel    energy.FuelAmount
	openInvalid bool

	lastFuel energy.FuelAmount
	samples  []energy.FuelAmount
	hasLast  bool
	lastLap  energy.FuelAmount
	// history mirrors every sample appended to samples, oldest first, capped
	// at MaxFuelHistory. It shares the same validity gate and the same reset,
	// but never the window bound: the average stays short while the series
	// stays long.
	history []FuelLapSample
}

func newFuelUsageTracker(window int) *fuelUsageTracker {
	if window <= 0 || window > MaxFuelUsageWindow {
		window = DefaultFuelUsageWindow
	}
	return &fuelUsageTracker{window: window}
}

func cloneFuelUsageTracker(input *fuelUsageTracker) *fuelUsageTracker {
	if input == nil {
		return newFuelUsageTracker(DefaultFuelUsageWindow)
	}
	result := *input
	// The committed tracker stays immutable while a candidate is prepared; the
	// window is at most MaxFuelUsageWindow entries, so an eager clone is
	// cheaper than the copy-on-write bookkeeping the delta history needs.
	result.samples = append([]energy.FuelAmount(nil), input.samples...)
	// The history is a plain slice of values: clone it the same eager way so
	// the candidate never shares backing storage with the committed tracker.
	result.history = append([]FuelLapSample(nil), input.history...)
	return &result
}

type fuelUsageInput struct {
	lap    session.LapNumber
	amount energy.FuelAmount
	inPit  bool
}

// Apply folds one batch into the tracker and returns the canonical usage.
//
// A lap only produces a sample when every condition holds: the lap number
// advanced by exactly one, the player stayed out of the pits for the whole lap,
// the fuel readings stayed fresh and observed, and the tank drained. Anything
// else invalidates the open lap instead of publishing a wrong number.
func (tracker *fuelUsageTracker) Apply(header envelope.Header, observed core.ObservedState) FuelUsage {
	if tracker.initialized && (tracker.epoch != header.Cursor.Epoch ||
		tracker.session != header.Identity.Session ||
		tracker.stint != header.Identity.Stint) {
		window := tracker.window
		*tracker = *newFuelUsageTracker(window)
	}
	if !tracker.initialized {
		tracker.initialized = true
		tracker.epoch = header.Cursor.Epoch
		tracker.session = header.Identity.Session
		tracker.stint = header.Identity.Stint
	}

	current, found := activeDeltaVehicle(header.Identity.Vehicle, observed.Vehicles)
	if header.Identity.Vehicle == "" || !found {
		tracker.invalidateOpenLap()
		return tracker.output(schema.FreshnessMissing)
	}
	input, quality := readFuelUsageInput(observed.PlayerPresent, current)
	if quality != schema.FreshnessFresh {
		tracker.invalidateOpenLap()
		return tracker.output(quality)
	}

	if !tracker.open {
		tracker.startLap(input)
		return tracker.output(schema.FreshnessFresh)
	}
	// A refuel breaks the drain the measurement is built on, on the open lap and
	// on the lap boundary alike.
	if float64(input.amount) > float64(tracker.lastFuel)+fuelRefuelEpsilon {
		tracker.openInvalid = true
	}
	if input.inPit {
		tracker.openInvalid = true
	}

	switch lapStep := int64(input.lap) - int64(tracker.openLap); {
	case lapStep == 0:
		tracker.lastFuel = input.amount
	case lapStep == 1:
		tracker.closeLap(input)
		tracker.startLap(input)
	default:
		// A regression or a jump means the lap boundary was not observed. The
		// consumption across it is unknown, so the open lap is dropped without a
		// sample and the next one is anchored here.
		tracker.startLap(input)
	}
	return tracker.output(schema.FreshnessFresh)
}

func (tracker *fuelUsageTracker) startLap(input fuelUsageInput) {
	tracker.open = true
	tracker.openLap = input.lap
	tracker.openFuel = input.amount
	tracker.openInvalid = input.inPit
	tracker.lastFuel = input.amount
}

func (tracker *fuelUsageTracker) closeLap(input fuelUsageInput) {
	defer func() { tracker.lastFuel = input.amount }()
	if tracker.openInvalid {
		return
	}
	consumed := float64(tracker.openFuel) - float64(input.amount)
	if !isFinite(consumed) || consumed <= 0 {
		return
	}
	tracker.hasLast = true
	tracker.lastLap = energy.FuelAmount(consumed)
	tracker.samples = append(tracker.samples, energy.FuelAmount(consumed))
	if overflow := len(tracker.samples) - tracker.window; overflow > 0 {
		tracker.samples = append([]energy.FuelAmount(nil), tracker.samples[overflow:]...)
	}
	tracker.history = append(tracker.history, FuelLapSample{Lap: tracker.openLap, Consumed: energy.FuelAmount(consumed)})
	if overflow := len(tracker.history) - MaxFuelHistory; overflow > 0 {
		tracker.history = append([]FuelLapSample(nil), tracker.history[overflow:]...)
	}
}

func (tracker *fuelUsageTracker) invalidateOpenLap() {
	tracker.open = false
	tracker.openInvalid = false
}

// output publishes the window with the freshness of the batch that produced it.
// A degraded batch cannot invent a new average, but the laps already measured
// stay valid, so the value survives and only its freshness drops. The history
// follows the same rule: measured laps survive a stale batch, only fresher.
func (tracker *fuelUsageTracker) output(freshness schema.Freshness) FuelUsage {
	history := FuelHistory{
		Freshness: freshness,
		Samples:   append([]FuelLapSample(nil), tracker.history...),
	}
	if len(tracker.samples) == 0 {
		return missingFuelUsage(freshness)
	}
	if freshness == schema.FreshnessMissing || freshness == schema.FreshnessInvalid {
		freshness = schema.FreshnessStale
		history.Freshness = schema.FreshnessStale
	}
	total := 0.0
	for _, sample := range tracker.samples {
		total += float64(sample)
	}
	average := total / float64(len(tracker.samples))
	if !isFinite(average) {
		return missingFuelUsage(schema.FreshnessInvalid)
	}
	result := FuelUsage{
		Freshness:  freshness,
		PerLap:     mustDerived(energy.FuelAmount(average), freshness),
		LastLap:    schema.MissingField[energy.FuelAmount](),
		WindowLaps: mustDerived(schema.Count(len(tracker.samples)), freshness),
		History:    history,
	}
	if tracker.hasLast {
		result.LastLap = mustDerived(tracker.lastLap, freshness)
	}
	return result
}

func readFuelUsageInput(
	playerPresent schema.Field[bool],
	vehicle core.VehicleState,
) (fuelUsageInput, schema.Freshness) {
	present, presentOK := observedBool(playerPresent)
	player, playerOK := observedBool(vehicle.Player)
	if !presentOK || !present || !playerOK || !player {
		return fuelUsageInput{}, schema.FreshnessMissing
	}
	fields := []fieldQuality{
		qualityOf(vehicle.LapNumber),
		qualityOf(vehicle.Fuel),
		qualityOf(vehicle.InPit),
	}
	quality := schema.FreshnessFresh
	for _, current := range fields {
		if current.freshness == schema.FreshnessInvalid ||
			(current.present && current.provenance != schema.ProvenanceObserved) {
			return fuelUsageInput{}, schema.FreshnessInvalid
		}
		if !current.present || current.freshness == schema.FreshnessMissing {
			quality = schema.FreshnessMissing
		} else if current.freshness == schema.FreshnessStale && quality == schema.FreshnessFresh {
			quality = schema.FreshnessStale
		}
	}
	if quality != schema.FreshnessFresh {
		return fuelUsageInput{}, quality
	}
	lap, _ := vehicle.LapNumber.Value()
	fuel, _ := vehicle.Fuel.Value()
	inPit, _ := vehicle.InPit.Value()
	if lap < 0 || !fuel.Valid() {
		return fuelUsageInput{}, schema.FreshnessInvalid
	}
	return fuelUsageInput{lap: lap, amount: fuel.Amount, inPit: bool(inPit)}, schema.FreshnessFresh
}
