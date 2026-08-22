package overlayv2

import (
	"testing"
	"time"
)

var cadenceOrigin = time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)

func TestDefaultCadenceRebuildsEverySectionEveryTick(t *testing.T) {
	t.Parallel()

	// Zero cadence sigue sin regular (identidad).
	zero := SectionCadence{}
	if zero.regulates() {
		t.Fatalf("zero cadence must not regulate")
	}
	zeroScheduler := NewSectionScheduler(zero)
	for tick := range 240 {
		plan := zeroScheduler.Plan(cadenceOrigin.Add(time.Duration(tick)*(time.Second/60)), 0)
		if plan.Count() != sectionCount {
			t.Fatalf("tick %d rebuilt %d sections, want %d", tick, plan.Count(), sectionCount)
		}
	}
	// Defaults ahora sí regulan (ISA-707 activado).
	if !DefaultSectionCadence().regulates() {
		t.Fatalf("defaults must regulate after ISA-707")
	}
	if DefaultSectionCadence().Interval(TierSlow) == 0 || DefaultSectionCadence().DirtyCeiling == 0 {
		t.Fatalf("regulated defaults must have Slow and DirtyCeiling")
	}
}

func TestSchedulerFirstPlanIsAlwaysComplete(t *testing.T) {
	t.Parallel()

	scheduler := NewSectionScheduler(SectionCadence{Fast: time.Second, Mid: time.Second, Slow: time.Second, DirtyCeiling: time.Hour})
	if plan := scheduler.Plan(cadenceOrigin, 0); plan.Count() != sectionCount {
		t.Fatalf("first plan rebuilt %d sections, want %d", plan.Count(), sectionCount)
	}
}

func TestSchedulerHonoursTierIntervals(t *testing.T) {
	t.Parallel()

	cadence := SectionCadence{Fast: 50 * time.Millisecond, Mid: 200 * time.Millisecond, Slow: time.Second}
	scheduler := NewSectionScheduler(cadence)
	scheduler.Plan(cadenceOrigin, 0)

	cases := []struct {
		section Section
		elapsed time.Duration
		want    bool
	}{
		{SectionPlayer, 49 * time.Millisecond, false},
		{SectionPlayer, 50 * time.Millisecond, true},
		{SectionRelative, 200 * time.Millisecond, false},
		{SectionRelative, time.Second, true},
		{SectionStandings, 200 * time.Millisecond, false},
		{SectionStandings, time.Second, true},
	}
	for _, current := range cases {
		fresh := NewSectionScheduler(cadence)
		fresh.Plan(cadenceOrigin, 0)
		plan := fresh.Plan(cadenceOrigin.Add(current.elapsed), 0)
		if got := plan.Rebuild(current.section); got != current.want {
			t.Fatalf("%s after %s: rebuild=%v want %v", current.section, current.elapsed, got, current.want)
		}
	}
}

func TestDirtyTriggerHasCeiling(t *testing.T) {
	t.Parallel()

	cadence := SectionCadence{Fast: 20 * time.Millisecond, Mid: 50 * time.Millisecond, Slow: 250 * time.Millisecond, DirtyCeiling: time.Second}
	scheduler := NewSectionScheduler(cadence)
	scheduler.Plan(cadenceOrigin, 0)

	// Inside the interval a dirty section still waits for its minimum spacing.
	if scheduler.Plan(cadenceOrigin.Add(100*time.Millisecond), AllDirty()).Rebuild(SectionStandings) {
		t.Fatalf("dirty must not break the minimum spacing of a slow section")
	}
	// Once the interval elapsed, dirty publishes early (before the ceiling).
	if !scheduler.Plan(cadenceOrigin.Add(250*time.Millisecond), DirtySet(0).Mark(SectionStandings)).Rebuild(SectionStandings) {
		t.Fatalf("dirty section must rebuild once its interval elapsed")
	}
	// Nothing dirty: the section waits, but never longer than the ceiling.
	quiet := NewSectionScheduler(cadence)
	quiet.Plan(cadenceOrigin, 0)
	for _, elapsed := range []time.Duration{250 * time.Millisecond, 500 * time.Millisecond, 999 * time.Millisecond} {
		if quiet.Plan(cadenceOrigin.Add(elapsed), 0).Rebuild(SectionStandings) {
			t.Fatalf("clean section rebuilt at %s, before the ceiling", elapsed)
		}
	}
	if !quiet.Plan(cadenceOrigin.Add(time.Second), 0).Rebuild(SectionStandings) {
		t.Fatalf("ceiling must force a rebuild even with nothing dirty")
	}
}

func TestCeilingBoundsStalenessOverALongRun(t *testing.T) {
	t.Parallel()

	cadence := SectionCadence{Fast: time.Second / 20, Mid: time.Second / 10, Slow: time.Second / 4, DirtyCeiling: time.Second}
	scheduler := NewSectionScheduler(cadence)
	last := map[Section]time.Time{}
	for tick := range 600 {
		now := cadenceOrigin.Add(time.Duration(tick) * (time.Second / 60))
		plan := scheduler.Plan(now, 0)
		for _, section := range AllSections() {
			if plan.Rebuild(section) {
				last[section] = now
				continue
			}
			if now.Sub(last[section]) > cadence.DirtyCeiling {
				t.Fatalf("%s stale for %s, above the ceiling", section, now.Sub(last[section]))
			}
		}
	}
}

func TestSchedulerIsDeterministic(t *testing.T) {
	t.Parallel()

	cadence := SectionCadence{Fast: 30 * time.Millisecond, Mid: 90 * time.Millisecond, Slow: 300 * time.Millisecond, DirtyCeiling: 900 * time.Millisecond}
	run := func() []SectionPlan {
		scheduler := NewSectionScheduler(cadence)
		plans := make([]SectionPlan, 0, 300)
		for tick := range 300 {
			dirty := DirtySet(0)
			if tick%37 == 0 {
				dirty = dirty.Mark(SectionStandings)
			}
			plans = append(plans, scheduler.Plan(cadenceOrigin.Add(time.Duration(tick)*(time.Second/60)), dirty))
		}
		return plans
	}
	first, second := run(), run()
	for index := range first {
		if first[index] != second[index] {
			t.Fatalf("tick %d diverged: %v vs %v", index, first[index], second[index])
		}
	}
}

func TestSchedulerTreatsClockRegressionAsDiscontinuity(t *testing.T) {
	t.Parallel()

	scheduler := NewSectionScheduler(SectionCadence{Slow: time.Second})
	scheduler.Plan(cadenceOrigin, 0)
	if !scheduler.Plan(cadenceOrigin.Add(-time.Second), 0).Rebuild(SectionStandings) {
		t.Fatalf("a clock going backwards must rebuild instead of freezing the section")
	}
}

func TestTierMapCoversEverySection(t *testing.T) {
	t.Parallel()

	sections := AllSections()
	if len(sections) != sectionCount {
		t.Fatalf("AllSections has %d entries, want %d", len(sections), sectionCount)
	}
	want := map[Section]SectionTier{
		SectionPlayer: TierFast, SectionControls: TierFast, SectionDelta: TierFast,
		SectionSpotter: TierMid,
		SectionSession: TierSlow, SectionStandings: TierSlow, SectionRelative: TierSlow,
		SectionFuel: TierSlow, SectionDamage: TierSlow, SectionCapabilities: TierSlow,
		SectionFuel: TierSlow, SectionWeather: TierSlow, SectionCapabilities: TierSlow,
	}
	for _, section := range sections {
		if got := TierOf(section); got != want[section] {
			t.Fatalf("%s tier %d, want %d", section, got, want[section])
		}
		if section.String() == "unknown" {
			t.Fatalf("section %d has no name", section)
		}
	}
}
