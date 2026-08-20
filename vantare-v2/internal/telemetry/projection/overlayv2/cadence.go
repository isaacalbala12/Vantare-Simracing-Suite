package overlayv2

import "time"

// Section names the parts of FrameV2 that can be regulated independently.
// "controls" lives inside Player and "gaps" inside Standings: the wire
// contract has no separate field for either, so they inherit that tier.
type Section uint8

const (
	SectionPlayer Section = iota
	SectionDelta
	SectionRelative
	SectionSpotter
	SectionSession
	SectionStandings
	SectionFuel
	SectionCapabilities

	sectionCount = 8
)

var sectionNames = [sectionCount]string{
	SectionPlayer:       "player",
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
		SectionPlayer, SectionDelta, SectionRelative, SectionSpotter,
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
// relative/spotter are mid, session/standings/gaps/fuel/capabilities are slow.
func TierOf(section Section) SectionTier {
	switch section {
	case SectionPlayer, SectionDelta:
		return TierFast
	case SectionRelative, SectionSpotter:
		return TierMid
	default:
		return TierSlow
	}
}

// SectionCadence configures the regulation. Every duration is a *minimum*
// spacing between rebuilds of a section; zero means "rebuild on every tick",
// which is the current unregulated behaviour and therefore the default.
//
// DirtyCeiling is the maximum staleness accepted for a section: when it is
// greater than zero the section only rebuilds inside its interval window if it
// was marked dirty, and rebuilds unconditionally once the ceiling elapses.
// With DirtyCeiling zero the dirty flag is irrelevant and each section simply
// rebuilds whenever its interval has elapsed.
type SectionCadence struct {
	Fast         time.Duration
	Mid          time.Duration
	Slow         time.Duration
	DirtyCeiling time.Duration
}

// DefaultSectionCadence reproduces today's behaviour: no regulation at all.
// Lowering these defaults requires bytes/s measured in the real binary.
func DefaultSectionCadence() SectionCadence { return SectionCadence{} }

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

// Regulates reports whether the cadence can ever skip a rebuild.
func (cadence SectionCadence) Regulates() bool {
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
//  3. the interval elapsed and either no ceiling is configured or the section
//     is dirty;
//  4. the ceiling is configured and elapsed, so nothing can stay stale for
//     longer than DirtyCeiling even if nothing changed.
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
	if ceiling > 0 && elapsed >= ceiling {
		return true
	}
	if elapsed < interval {
		return false
	}
	return ceiling <= 0 || dirty.Has(section)
}
