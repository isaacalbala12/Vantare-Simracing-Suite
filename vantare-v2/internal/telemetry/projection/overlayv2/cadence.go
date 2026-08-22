package overlayv2

import (
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

// Section names the parts of FrameV2 that can be regulated independently.
// "gaps" lives inside Standings: the wire contract has no separate field for
// it, so it inherits that tier.
type Section uint8

const (
	SectionPlayer Section = iota
	SectionControls
	SectionDelta
	SectionRelative
	SectionSpotter
	SectionSession
	SectionStandings
	SectionFuel
	SectionCapabilities

	sectionCount = 9
)

var sectionNames = [sectionCount]string{
	SectionPlayer:       "player",
	SectionControls:     "controls",
	SectionDelta:        "delta",
	SectionRelative:     "relative",
	SectionSpotter:      "spotter",
	SectionSession:      "session",
	SectionStandings:    "standings",
	SectionFuel:         "fuel",
	SectionCapabilities: "capabilities",
}

func (section Section) String() string {
	if int(section) >= sectionCount {
		return "unknown"
	}
	return sectionNames[section]
}

// AllSections is ordered by tier and then by declaration so every traversal is
// deterministic; tests and metrics depend on that order.
func AllSections() []Section {
	return []Section{
		SectionPlayer, SectionControls, SectionDelta, SectionRelative, SectionSpotter,
		SectionSession, SectionStandings, SectionFuel, SectionCapabilities,
	}
}

// SectionTier groups sections that share one cadence budget.
type SectionTier uint8

const (
	TierFast SectionTier = iota
	TierMid
	TierSlow
)

// TierOf maps a section to its tier. player/controls/delta are fast,
// spotter is mid, session/standings/relative/gaps/fuel/capabilities are
// slow. Standings y relative viven en slow para que su dirty fino (ISA-695)
// regule sin riesgo de rancio; spotter permanece mid por su frescura
// espacial de alta frecuencia.
func TierOf(section Section) SectionTier {
	switch section {
	case SectionPlayer, SectionControls, SectionDelta:
		return TierFast
	case SectionSpotter:
		return TierMid
	default:
		return TierSlow
	}
}

// SectionCadence configures the regulation. Every duration is a *minimum*
// spacing between rebuilds of a section; zero means "rebuild on every tick",
// which is the current unregulated behaviour and therefore the default.
//
// DirtyCeiling only applies to the slow tier and is the maximum staleness
// accepted there: once its interval elapsed a slow section rebuilds if it was
// marked dirty, and rebuilds unconditionally once the ceiling elapses. With
// DirtyCeiling zero the dirty flag is irrelevant and every section simply
// rebuilds whenever its interval has elapsed. Fast and mid sections always
// follow their plain interval.
type SectionCadence struct {
	Fast         time.Duration
	Mid          time.Duration
	Slow         time.Duration
	DirtyCeiling time.Duration
}

// DefaultSectionCadence es la cadencia regulada productiva (ISA-707).
// Con firmas finas para standings y relative (ISA-695) el tier slow puede
// regular sin servir rancio: mid 100 ms, slow 250 ms, techo 1 s.
// Medición @104 (Ryzen 7 3700X, -benchtime 100x, projección+marshal 60 Hz):
// plana 219.444 ns/op, 480 builds/s, 234.765 B/op, 65 allocs;
// regulada 134.811 ns/op, 78 builds/s, 127.002 B/op, 38 allocs (-38% CPU,
// -46% bytes/op, -26 allocs, B/s idéntico por contrato completo).
func DefaultSectionCadence() SectionCadence {
	return SectionCadence{
		Fast:         50 * time.Millisecond,
		Mid:          100 * time.Millisecond,
		Slow:         250 * time.Millisecond,
		DirtyCeiling: time.Second,
	}
}

// Interval returns the minimum spacing configured for a tier.
func (cadence SectionCadence) Interval(tier SectionTier) time.Duration {
	var value time.Duration
	switch tier {
	case TierFast:
		value = cadence.Fast
	case TierMid:
		value = cadence.Mid
	default:
		value = cadence.Slow
	}
	if value < 0 {
		return 0
	}
	return value
}

// regulates reports whether the cadence can ever skip a rebuild.
func (cadence SectionCadence) regulates() bool {
	return cadence.Interval(TierFast) > 0 || cadence.Interval(TierMid) > 0 || cadence.Interval(TierSlow) > 0
}

// DirtySet marks the sections whose inputs changed materially on this tick.
// It is a bitmask so building one allocates nothing.
type DirtySet uint16

func (set DirtySet) Mark(section Section) DirtySet { return set | (1 << section) }
func (set DirtySet) Has(section Section) bool      { return set&(1<<section) != 0 }

// AllDirty marks every section, which is what a stream discontinuity means.
func AllDirty() DirtySet { return DirtySet(1<<sectionCount - 1) }

// SectionPlan is the scheduler decision for one tick.
type SectionPlan uint16

func (plan SectionPlan) Rebuild(section Section) bool { return plan&(1<<section) != 0 }

func (plan SectionPlan) with(section Section) SectionPlan { return plan | (1 << section) }

// Count returns how many sections this plan rebuilds.
func (plan SectionPlan) Count() int {
	total := 0
	for section := range sectionCount {
		if plan.Rebuild(Section(section)) {
			total++
		}
	}
	return total
}

// SectionScheduler decides, per tick, which sections must be rebuilt. It is
// pure and deterministic: it holds no wall clock, no timers and no
// concurrency; the caller injects `now`. Equal inputs always yield the same
// plan.
type SectionScheduler struct {
	cadence SectionCadence
	built   [sectionCount]bool
	last    [sectionCount]time.Time
}

// NewSectionScheduler builds a scheduler that has never emitted a frame, so
// its first plan rebuilds every section regardless of cadence.
func NewSectionScheduler(cadence SectionCadence) *SectionScheduler {
	return &SectionScheduler{cadence: cadence}
}

// Cadence returns the configuration in use.
func (scheduler *SectionScheduler) Cadence() SectionCadence { return scheduler.cadence }

// Plan decides the sections to rebuild at `now` and records the decision. A
// section rebuilds when any of these holds:
//
//  1. it has never been built (first frame is always complete);
//  2. its tier interval is zero (no regulation, the default);
//  3. it is fast or mid and its interval elapsed;
//  4. it is slow, its interval elapsed and either no ceiling is configured or
//     the section is dirty;
//  5. it is slow and the configured ceiling elapsed, so nothing stays stale
//     for longer than DirtyCeiling even if nothing changed.
//
// A non-monotonic clock (now before the last build) is treated as a
// discontinuity and rebuilds the section.
func (scheduler *SectionScheduler) Plan(now time.Time, dirty DirtySet) SectionPlan {
	var plan SectionPlan
	ceiling := scheduler.cadence.DirtyCeiling
	for _, section := range AllSections() {
		if scheduler.decide(section, now, dirty, ceiling) {
			plan = plan.with(section)
			scheduler.built[section] = true
			scheduler.last[section] = now
		}
	}
	return plan
}

func (scheduler *SectionScheduler) decide(section Section, now time.Time, dirty DirtySet, ceiling time.Duration) bool {
	if !scheduler.built[section] {
		return true
	}
	interval := scheduler.cadence.Interval(TierOf(section))
	if interval <= 0 {
		return true
	}
	elapsed := now.Sub(scheduler.last[section])
	if elapsed < 0 {
		return true
	}
	// Dirty gating and the staleness ceiling only apply to the slow tier: fast
	// and mid sections exist to move and follow a plain interval.
	if TierOf(section) != TierSlow {
		return elapsed >= interval
	}
	if ceiling > 0 && elapsed >= ceiling {
		return true
	}
	if elapsed < interval {
		return false
	}
	return ceiling <= 0 || dirty.Has(section)
}

// --- Regulated projection -------------------------------------------------
//
// The published frame stays FULL: a section that is not rebuilt on a tick
// reuses the value memoized from its last build. This is memoization per
// section, never a patch, so the v2 wire contract is untouched.

// SectionBuilders holds one constructor per regulated section. Splitting the
// frame assembly this way is what lets the scheduler skip real work: a skipped
// section never invokes its builder. The defaults reproduce ProjectV2 exactly;
// TestCachedProjectorMatchesProjectV2ByteForByte guards that equivalence.
type SectionBuilders struct {
	Player       func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) PlayerInstrumentsV2
	Controls     func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) ControlsV2
	Delta        func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) DeltaViewV2
	Relative     func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) []RelativeRowV2
	Spotter      func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) SpotterViewV2
	Session      func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) SessionV2
	Standings    func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) []StandingRowV2
	Fuel         func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) FuelViewV2
	Capabilities func(final derive.FinalState, preferences PreferencesV2, source SourceContextV2) CapabilitiesV2
}

// DefaultSectionBuilders mirrors the section values ProjectV2 assembles today.
func DefaultSectionBuilders() SectionBuilders {
	return SectionBuilders{
		Player: func(final derive.FinalState, preferences PreferencesV2, _ SourceContextV2) PlayerInstrumentsV2 {
			return BuildPlayerInstruments(final, preferences)
		},
		Controls: func(final derive.FinalState, _ PreferencesV2, _ SourceContextV2) ControlsV2 {
			return BuildControls(final)
		},
		Session: func(final derive.FinalState, _ PreferencesV2, _ SourceContextV2) SessionV2 {
			return BuildSession(final)
		},
		Capabilities: func(final derive.FinalState, _ PreferencesV2, source SourceContextV2) CapabilitiesV2 {
			return BuildCapabilities(final, source)
		},
		Delta: func(final derive.FinalState, preferences PreferencesV2, _ SourceContextV2) DeltaViewV2 {
			return BuildDelta(final, preferences)
		},
		Relative: func(final derive.FinalState, _ PreferencesV2, _ SourceContextV2) []RelativeRowV2 {
			return BuildRelative(final)
		},
		Spotter: func(final derive.FinalState, _ PreferencesV2, _ SourceContextV2) SpotterViewV2 {
			return BuildSpotter(final)
		},
		Standings: func(final derive.FinalState, _ PreferencesV2, _ SourceContextV2) []StandingRowV2 {
			return BuildStandings(final)
		},
		Fuel: func(final derive.FinalState, preferences PreferencesV2, _ SourceContextV2) FuelViewV2 {
			return BuildFuel(final, preferences)
		},
	}
}

// CachedProjectorMetrics counts regulation work. SectionPublishes is the
// number of builder invocations whose value reached the published frame fresh;
// DirtySkips is the number of ticks a section reused its memoized value
// because the scheduler judged it neither due nor dirty.
type CachedProjectorMetrics struct {
	Ticks            uint64
	FullRebuilds     uint64
	SectionPublishes map[string]uint64
	DirtySkips       map[string]uint64
}

// CachedProjector is a drop-in replacement for ProjectV2 that regulates
// section rebuilds before projecting and therefore before marshalling. With
// DefaultSectionCadence it rebuilds everything on every tick and produces
// frames byte-identical to ProjectV2.
type CachedProjector struct {
	builders  SectionBuilders
	scheduler *SectionScheduler

	previous dirtySignals
	hasPrev  bool
	memo     FrameV2

	ticks    uint64
	fullRuns uint64
	builds   [sectionCount]uint64
	skips    [sectionCount]uint64
}

// NewCachedProjector builds a projector for a cadence. A zero cadence keeps
// today's unregulated behaviour.
func NewCachedProjector(cadence SectionCadence) *CachedProjector {
	return NewCachedProjectorWithBuilders(cadence, DefaultSectionBuilders())
}

// NewCachedProjectorWithBuilders lets a caller (and the tests) substitute the
// per-section constructors, for instance to count invocations.
func NewCachedProjectorWithBuilders(cadence SectionCadence, builders SectionBuilders) *CachedProjector {
	defaults := DefaultSectionBuilders()
	if builders.Player == nil {
		builders.Player = defaults.Player
	}
	if builders.Controls == nil {
		builders.Controls = defaults.Controls
	}
	if builders.Delta == nil {
		builders.Delta = defaults.Delta
	}
	if builders.Relative == nil {
		builders.Relative = defaults.Relative
	}
	if builders.Spotter == nil {
		builders.Spotter = defaults.Spotter
	}
	if builders.Session == nil {
		builders.Session = defaults.Session
	}
	if builders.Standings == nil {
		builders.Standings = defaults.Standings
	}
	if builders.Fuel == nil {
		builders.Fuel = defaults.Fuel
	}
	if builders.Capabilities == nil {
		builders.Capabilities = defaults.Capabilities
	}
	return &CachedProjector{builders: builders, scheduler: NewSectionScheduler(cadence)}
}

// Cadence returns the configuration in use.
func (projector *CachedProjector) Cadence() SectionCadence { return projector.scheduler.Cadence() }

// Metrics returns a copy of the regulation counters.
func (projector *CachedProjector) Metrics() CachedProjectorMetrics {
	result := CachedProjectorMetrics{
		Ticks: projector.ticks, FullRebuilds: projector.fullRuns,
		SectionPublishes: make(map[string]uint64, sectionCount),
		DirtySkips:       make(map[string]uint64, sectionCount),
	}
	for _, section := range AllSections() {
		result.SectionPublishes[section.String()] = projector.builds[section]
		result.DirtySkips[section.String()] = projector.skips[section]
	}
	return result
}

// Project builds one UpdateV2 for now, rebuilding only the sections the
// scheduler selected and reusing the memoized value for the rest. It is not
// safe for concurrent use: the runtime publishes Overlay v2 from a single
// goroutine.
func (projector *CachedProjector) Project(
	snapshot envelope.Snapshot[derive.FinalState],
	source SourceContextV2,
	preferences PreferencesV2,
	deliveryRevision uint64,
	now time.Time,
) (UpdateV2, error) {
	final, ok := snapshot.Value()
	if !ok {
		return UpdateV2{}, envelope.ErrCloneRequired
	}
	preferences = normalizedPreferences(preferences)
	header := snapshot.Header()

	signals := observeDirtySignals(header, final, source)
	dirty := AllDirty()
	if projector.hasPrev {
		dirty = signals.diff(projector.previous)
	}
	projector.previous, projector.hasPrev = signals, true

	plan := projector.scheduler.Plan(now, dirty)
	projector.ticks++
	if plan.Count() == sectionCount {
		projector.fullRuns++
	}
	for _, section := range AllSections() {
		if plan.Rebuild(section) {
			projector.builds[section]++
			continue
		}
		projector.skips[section]++
	}

	// Header fields are per-tick metadata, never regulated: skipping them
	// would publish a stale cursor and break ordering downstream.
	frame := projector.memo
	frame.ContractVersion = ContractVersionV2
	frame.AlgorithmVersion = AlgorithmVersionV1
	frame.StreamEpoch = uint64(header.Cursor.Epoch)
	frame.SourceSequence = uint64(header.Cursor.Sequence)
	frame.SessionID = string(header.Identity.Session)
	frame.GeneratedAt = header.Clock.ReceivedUTC.Round(0).UTC().Format(time.RFC3339Nano)
	frame.Units = UnitsV2{
		Speed: preferences.Speed, Temperature: preferences.Temperature,
		Pressure: preferences.Pressure, Fuel: preferences.Fuel,
	}
	if plan.Rebuild(SectionPlayer) {
		frame.Player = projector.builders.Player(final, preferences, source)
	}
	if plan.Rebuild(SectionControls) {
		frame.Controls = projector.builders.Controls(final, preferences, source)
	}
	if plan.Rebuild(SectionDelta) {
		frame.Delta = projector.builders.Delta(final, preferences, source)
	}
	if plan.Rebuild(SectionRelative) {
		frame.Relative = projector.builders.Relative(final, preferences, source)
	}
	if plan.Rebuild(SectionSpotter) {
		frame.Spotter = projector.builders.Spotter(final, preferences, source)
	}
	if plan.Rebuild(SectionSession) {
		frame.Session = projector.builders.Session(final, preferences, source)
	}
	if plan.Rebuild(SectionStandings) {
		frame.Standings = projector.builders.Standings(final, preferences, source)
	}
	if plan.Rebuild(SectionFuel) {
		frame.Fuel = projector.builders.Fuel(final, preferences, source)
	}
	if plan.Rebuild(SectionCapabilities) {
		frame.Capabilities = projector.builders.Capabilities(final, preferences, source)
	}
	projector.memo = frame

	published := frame
	return UpdateV2{
		DeliveryRevision: deliveryRevision,
		Source: SourceStatusV2{
			State: source.State, ReconnectAttempt: uint32(max(source.ReconnectAttempt, 0)),
			LastFrameAgeMS: max(source.LastFrameAgeMS, 0), DegradedReason: source.DegradedReason,
		},
		Frame: &published,
	}, nil
}

// dirtySignals are the cheap, allocation-free observations used to decide
// whether a slow section changed materially. They deliberately avoid invoking
// any builder: asking a builder would defeat the regulation.
type dirtySignals struct {
	session      string
	epoch        int64
	vehicles     int
	sourceState  string
	degraded     string
	capabilities int

	track       schema.Field[string]
	sessionType schema.Field[session.Type]
	maximumLaps schema.Field[session.MaximumLaps]
	remaining   schema.Field[session.RemainingTime]

	playerFuel schema.Field[energy.Fuel]
	fuelPerLap schema.Field[energy.FuelAmount]
	// standingsMark fingerprints exactly the fields BuildStandings projects
	// (see hashStandingsVehicle), so a signal the builder ignores never marks
	// the section dirty and any projected change always does.
	standingsMark  uint64
	relativeMark   uint64
	gapsFreshness  schema.Freshness
	deltaFreshness schema.Freshness
	spatialMark    schema.Freshness
}

func observeDirtySignals(header envelope.Header, final derive.FinalState, source SourceContextV2) dirtySignals {
	signals := dirtySignals{
		session:        string(header.Identity.Session),
		epoch:          int64(header.Cursor.Epoch),
		vehicles:       len(final.Observed.Vehicles),
		sourceState:    source.State,
		degraded:       source.DegradedReason,
		capabilities:   len(source.DescriptorCapabilities),
		track:          final.Observed.TrackName,
		sessionType:    final.Observed.SessionType,
		maximumLaps:    final.Observed.MaximumLaps,
		remaining:      final.Derived.SessionRemaining,
		gapsFreshness:  final.Derived.Gaps.Freshness,
		deltaFreshness: final.Derived.Delta.Freshness,
		fuelPerLap:     final.Derived.Fuel.PerLap,
		spatialMark:    schema.FreshnessMissing,
		standingsMark:  fnvOffset64,
	}
	for index := range final.Observed.Vehicles {
		current := &final.Observed.Vehicles[index]
		signals.standingsMark = hashStandingsVehicle(signals.standingsMark, current)
		if current.WorldPosition.Freshness() == schema.FreshnessFresh {
			signals.spatialMark = schema.FreshnessFresh
		}
		if player, present := current.Player.Value(); present && player {
			signals.playerFuel = current.Fuel
		}
	}
	signals.relativeMark = hashRelativeMark(final)
	return signals
}

// diff maps observed changes to the sections they invalidate. A stream
// discontinuity (new session or new epoch) invalidates everything.
func (signals dirtySignals) diff(previous dirtySignals) DirtySet {
	if signals.session != previous.session || signals.epoch != previous.epoch {
		return AllDirty()
	}
	dirty := DirtySet(0)
	if signals.track != previous.track || signals.sessionType != previous.sessionType ||
		signals.maximumLaps != previous.maximumLaps || signals.remaining != previous.remaining {
		dirty = dirty.Mark(SectionSession)
	}
	// Standings depends only on its own fingerprint: the derived gap set feeds
	// relative, not the classification rows.
	if signals.vehicles != previous.vehicles || signals.standingsMark != previous.standingsMark {
		dirty = dirty.Mark(SectionStandings)
	}
	if signals.relativeMark != previous.relativeMark {
		dirty = dirty.Mark(SectionRelative)
	}
	if signals.deltaFreshness != previous.deltaFreshness {
		dirty = dirty.Mark(SectionDelta)
	}
	if signals.spatialMark != previous.spatialMark {
		dirty = dirty.Mark(SectionSpotter)
	}
	if signals.playerFuel != previous.playerFuel || signals.fuelPerLap != previous.fuelPerLap {
		dirty = dirty.Mark(SectionFuel)
	}
	if signals.sourceState != previous.sourceState || signals.degraded != previous.degraded ||
		signals.capabilities != previous.capabilities || signals.vehicles != previous.vehicles {
		dirty = dirty.Mark(SectionCapabilities)
	}
	// Fast sections exist to move: they are never gated by dirtiness.
	return dirty.Mark(SectionPlayer).Mark(SectionControls)
}
