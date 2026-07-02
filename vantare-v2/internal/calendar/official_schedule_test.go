package calendar

import (
	"strings"
	"testing"
	"time"
)

// validSchedule returns a minimal valid schedule for use in tests that need a
// baseline. It has one interval series.
func validSchedule() OfficialSchedule {
	return OfficialSchedule{
		Version:    1,
		Timezone:   "UTC",
		ValidFrom:  time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC),
		ValidUntil: time.Date(2026, time.July, 7, 0, 0, 0, 0, time.UTC),
		Series: []RaceSeries{
			{
				ID:           "test-series",
				Name:         "Test Series",
				Tier:         "beginner",
				LicenseLabel: "Bronze SR",
				Track:        "Test Track",
				VehicleClass: "Test Class",
				Setup:        "fixed",
				DurationMin:  20,
				Splits:       20,
				Assists:      "High assists allowed",
				TyreWarmers:  true,
				Tyres:        8,
				Recurrence: Recurrence{
					Kind:            "interval",
					IntervalMinutes: 15,
				},
			},
		},
	}
}

// --- LoadWeeklySchedule ---

func TestLoadWeeklySchedule_Valid(t *testing.T) {
	sched, err := LoadWeeklySchedule()
	if err != nil {
		t.Fatalf("LoadWeeklySchedule: %v", err)
	}
	if sched.Version != 1 {
		t.Errorf("Version = %d, want 1", sched.Version)
	}
	if sched.Timezone != "UTC" {
		t.Errorf("Timezone = %q, want UTC", sched.Timezone)
	}
	if sched.ValidFrom.IsZero() {
		t.Error("ValidFrom is zero")
	}
	if sched.ValidUntil.IsZero() {
		t.Error("ValidUntil is zero")
	}
	if len(sched.Series) == 0 {
		t.Fatal("Series is empty")
	}
	// Verify all 10 series from the real schedule.
	expectedIDs := []string{
		"beginner-lmgt3-fixed",
		"beginner-mclaren-challenge",
		"beginner-lmp3-fixed",
		"intermediate-lmgt3-sprint",
		"intermediate-prototype-fixed",
		"intermediate-elms-sprint",
		"advanced-one-stint-sprint",
		"advanced-elms-super-60",
		"advanced-wec-xperience",
		"weekly-wec-weekly",
	}
	if len(sched.Series) != len(expectedIDs) {
		t.Fatalf("Series count = %d, want %d", len(sched.Series), len(expectedIDs))
	}
	for i, s := range sched.Series {
		if s.ID != expectedIDs[i] {
			t.Errorf("Series[%d].ID = %q, want %q", i, s.ID, expectedIDs[i])
		}
	}
}

// --- validateSchedule ---

func TestValidateSchedule_RejectsZeroVersion(t *testing.T) {
	s := validSchedule()
	s.Version = 0
	err := validateSchedule(s)
	if err == nil || !strings.Contains(err.Error(), "version") {
		t.Errorf("expected version error, got %v", err)
	}
}

func TestValidateSchedule_RejectsEmptyTimezone(t *testing.T) {
	s := validSchedule()
	s.Timezone = ""
	err := validateSchedule(s)
	if err == nil || !strings.Contains(err.Error(), "timezone") {
		t.Errorf("expected timezone error, got %v", err)
	}
}

func TestValidateSchedule_RejectsInvalidTimezone(t *testing.T) {
	s := validSchedule()
	s.Timezone = "Mars/Olympus"
	err := validateSchedule(s)
	if err == nil || !strings.Contains(err.Error(), "Mars/Olympus") {
		t.Errorf("expected timezone error mentioning Mars/Olympus, got %v", err)
	}
}

func TestValidateSchedule_RejectsZeroValidFrom(t *testing.T) {
	s := validSchedule()
	s.ValidFrom = time.Time{}
	err := validateSchedule(s)
	if err == nil || !strings.Contains(err.Error(), "validFrom") {
		t.Errorf("expected validFrom error, got %v", err)
	}
}

func TestValidateSchedule_RejectsZeroValidUntil(t *testing.T) {
	s := validSchedule()
	s.ValidUntil = time.Time{}
	err := validateSchedule(s)
	if err == nil || !strings.Contains(err.Error(), "validUntil") {
		t.Errorf("expected validUntil error, got %v", err)
	}
}

func TestValidateSchedule_RejectsValidUntilBeforeValidFrom(t *testing.T) {
	s := validSchedule()
	s.ValidFrom = time.Date(2026, time.July, 7, 0, 0, 0, 0, time.UTC)
	s.ValidUntil = time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	err := validateSchedule(s)
	if err == nil || !strings.Contains(err.Error(), "validUntil must be after validFrom") {
		t.Errorf("expected validUntil after validFrom error, got %v", err)
	}
}

func TestValidateSchedule_RejectsEmptySeries(t *testing.T) {
	s := validSchedule()
	s.Series = []RaceSeries{}
	err := validateSchedule(s)
	if err == nil || !strings.Contains(err.Error(), "at least one series") {
		t.Errorf("expected empty series error, got %v", err)
	}
}

func TestValidateSchedule_RejectsDuplicateSeriesIDs(t *testing.T) {
	s := validSchedule()
	s.Series = append(s.Series, s.Series[0])
	err := validateSchedule(s)
	if err == nil || !strings.Contains(err.Error(), "duplicate series ID") {
		t.Errorf("expected duplicate series ID error, got %v", err)
	}
}

// --- validateSeries ---

func TestValidateSeries_RejectsEmptyID(t *testing.T) {
	s := validSchedule().Series[0]
	s.ID = ""
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "id is required") {
		t.Errorf("expected id required error, got %v", err)
	}
}

func TestValidateSeries_RejectsEmptyName(t *testing.T) {
	s := validSchedule().Series[0]
	s.Name = ""
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "name is required") {
		t.Errorf("expected name required error, got %v", err)
	}
}

func TestValidateSeries_RejectsInvalidTier(t *testing.T) {
	s := validSchedule().Series[0]
	s.Tier = "platinum"
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "invalid tier") {
		t.Errorf("expected invalid tier error, got %v", err)
	}
}

func TestValidateSeries_RejectsZeroDuration(t *testing.T) {
	s := validSchedule().Series[0]
	s.DurationMin = 0
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "durationMin") {
		t.Errorf("expected durationMin error, got %v", err)
	}
}

func TestValidateSeries_RejectsNegativeDuration(t *testing.T) {
	s := validSchedule().Series[0]
	s.DurationMin = -5
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "durationMin") {
		t.Errorf("expected durationMin error, got %v", err)
	}
}

func TestValidateSeries_RejectsZeroSplits(t *testing.T) {
	s := validSchedule().Series[0]
	s.Splits = 0
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "splits") {
		t.Errorf("expected splits error, got %v", err)
	}
}

func TestValidateSeries_RejectsInvalidRecurrenceKind(t *testing.T) {
	s := validSchedule().Series[0]
	s.Recurrence.Kind = "monthly"
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "invalid recurrence kind") {
		t.Errorf("expected invalid recurrence kind error, got %v", err)
	}
}

func TestValidateSeries_RejectsIntervalWithZeroInterval(t *testing.T) {
	s := validSchedule().Series[0]
	s.Recurrence.IntervalMinutes = 0
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "intervalMinutes") {
		t.Errorf("expected intervalMinutes error, got %v", err)
	}
}

func TestValidateSeries_RejectsWeeklySlotsWithNoDays(t *testing.T) {
	s := validSchedule().Series[0]
	s.Recurrence.Kind = "weekly-slots"
	s.Recurrence.IntervalMinutes = 0
	s.Recurrence.Days = []string{}
	s.Recurrence.TimesUTC = []string{"20:00"}
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "at least one day") {
		t.Errorf("expected days required error, got %v", err)
	}
}

func TestValidateSeries_RejectsWeeklySlotsWithInvalidDay(t *testing.T) {
	s := validSchedule().Series[0]
	s.Recurrence.Kind = "weekly-slots"
	s.Recurrence.IntervalMinutes = 0
	s.Recurrence.Days = []string{"Funday"}
	s.Recurrence.TimesUTC = []string{"20:00"}
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "invalid day") {
		t.Errorf("expected invalid day error, got %v", err)
	}
}

func TestValidateSeries_RejectsWeeklySlotsWithNoTimes(t *testing.T) {
	s := validSchedule().Series[0]
	s.Recurrence.Kind = "weekly-slots"
	s.Recurrence.IntervalMinutes = 0
	s.Recurrence.Days = []string{"Mon"}
	s.Recurrence.TimesUTC = []string{}
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "at least one time") {
		t.Errorf("expected times required error, got %v", err)
	}
}

func TestValidateSeries_RejectsWeeklySlotsWithInvalidTime(t *testing.T) {
	s := validSchedule().Series[0]
	s.Recurrence.Kind = "weekly-slots"
	s.Recurrence.IntervalMinutes = 0
	s.Recurrence.Days = []string{"Mon"}
	s.Recurrence.TimesUTC = []string{"25:00"}
	err := validateSeries(s)
	if err == nil || !strings.Contains(err.Error(), "invalid time") {
		t.Errorf("expected invalid time error, got %v", err)
	}
}

// --- ExpandSeries: interval ---

func TestExpandSeries_Interval_Beginner15min(t *testing.T) {
	sched := validSchedule()
	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := from.Add(1 * time.Hour)

	events, err := ExpandSeries(sched.Series[0], sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSeries: %v", err)
	}
	// 15 min interval over 1 hour = 4 events (00:00, 00:15, 00:30, 00:45)
	if len(events) != 4 {
		t.Fatalf("events = %d, want 4", len(events))
	}
	for i, ev := range events {
		if ev.Sim != "lmu" {
			t.Errorf("events[%d].Sim = %q, want lmu", i, ev.Sim)
		}
		if ev.Source != BundledSource {
			t.Errorf("events[%d].Source = %q, want %q", i, ev.Source, BundledSource)
		}
		if ev.DurationMin != 20 {
			t.Errorf("events[%d].DurationMin = %d, want 20", i, ev.DurationMin)
		}
		if ev.Track != "Test Track" {
			t.Errorf("events[%d].Track = %q, want Test Track", i, ev.Track)
		}
	}
	// Verify sorted order.
	for i := 1; i < len(events); i++ {
		if !events[i].StartTime.After(events[i-1].StartTime) {
			t.Errorf("events[%d].StartTime (%s) not after events[%d] (%s)", i, events[i].StartTime, i-1, events[i-1].StartTime)
		}
	}
	// Verify deterministic IDs.
	expectedIDs := []string{
		"test-series-20260630T000000Z",
		"test-series-20260630T001500Z",
		"test-series-20260630T003000Z",
		"test-series-20260630T004500Z",
	}
	for i, ev := range events {
		if ev.ID != expectedIDs[i] {
			t.Errorf("events[%d].ID = %q, want %q", i, ev.ID, expectedIDs[i])
		}
	}
}

func TestExpandSeries_Interval_Intermediate20min(t *testing.T) {
	sched := validSchedule()
	series := sched.Series[0]
	series.Recurrence.IntervalMinutes = 20
	series.DurationMin = 30

	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := from.Add(1 * time.Hour)

	events, err := ExpandSeries(series, sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSeries: %v", err)
	}
	// 20 min interval over 1 hour = 3 events (00:00, 00:20, 00:40)
	if len(events) != 3 {
		t.Fatalf("events = %d, want 3", len(events))
	}
}

func TestExpandSeries_Interval_Advanced30min(t *testing.T) {
	sched := validSchedule()
	series := sched.Series[0]
	series.Recurrence.IntervalMinutes = 30
	series.DurationMin = 60

	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := from.Add(2 * time.Hour)

	events, err := ExpandSeries(series, sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSeries: %v", err)
	}
	// 30 min interval over 2 hours = 4 events (00:00, 00:30, 01:00, 01:30)
	if len(events) != 4 {
		t.Fatalf("events = %d, want 4", len(events))
	}
}

func TestExpandSeries_Interval_ClippedToValidWindow(t *testing.T) {
	sched := validSchedule()
	// Window starts before validFrom and ends after validUntil.
	from := time.Date(2026, time.June, 28, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 10, 0, 0, 0, 0, time.UTC)

	events, err := ExpandSeries(sched.Series[0], sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSeries: %v", err)
	}
	// Should be clipped to [June 30 00:00, July 7 00:00).
	// 15 min interval over 7 days = 672 events.
	if len(events) != 672 {
		t.Fatalf("events = %d, want 672 (7 days at 15 min intervals)", len(events))
	}
	// First event should be at validFrom.
	if !events[0].StartTime.Equal(sched.ValidFrom) {
		t.Errorf("first event StartTime = %s, want %s", events[0].StartTime, sched.ValidFrom)
	}
	// Last event should start before validUntil (duration may extend past it).
	lastStart := events[len(events)-1].StartTime
	if !lastStart.Before(sched.ValidUntil) {
		t.Errorf("last event start = %s, should be before %s", lastStart, sched.ValidUntil)
	}
}

func TestExpandSeries_Interval_EmptyWindow(t *testing.T) {
	sched := validSchedule()
	from := time.Date(2026, time.July, 10, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 10, 1, 0, 0, 0, time.UTC)

	events, err := ExpandSeries(sched.Series[0], sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSeries: %v", err)
	}
	if len(events) != 0 {
		t.Errorf("events = %d, want 0 (window outside validity)", len(events))
	}
}

func TestExpandSeries_Interval_FromAfterTo(t *testing.T) {
	sched := validSchedule()
	from := time.Date(2026, time.July, 5, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)

	events, err := ExpandSeries(sched.Series[0], sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSeries: %v", err)
	}
	if len(events) != 0 {
		t.Errorf("events = %d, want 0 (from after to)", len(events))
	}
}

// --- ExpandSeries: weekly-slots ---

func TestExpandSeries_WeeklySlots(t *testing.T) {
	sched := validSchedule()
	series := RaceSeries{
		ID:           "weekly-test",
		Name:         "Weekly Test",
		Tier:         "weekly",
		LicenseLabel: "SR S2",
		Track:        "Test Track",
		VehicleClass: "Test Class",
		Setup:        "open",
		DurationMin:  100,
		Splits:       44,
		Assists:      "No assists allowed",
		TyreWarmers:  false,
		Tyres:        10,
		Recurrence: Recurrence{
			Kind:     "weekly-slots",
			Days:     []string{"Wed", "Thu", "Fri", "Sat", "Sun", "Mon"},
			TimesUTC: []string{"02:00", "06:00", "09:00", "12:00", "15:00", "18:00", "20:00", "23:00"},
		},
	}

	// Window: June 30 (Tue) to July 7 (Tue) — covers Wed through Mon.
	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 7, 0, 0, 0, 0, time.UTC)

	events, err := ExpandSeries(series, sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSeries: %v", err)
	}

	// June 30 is Tuesday — no events that day.
	// July 1 (Wed) through July 6 (Mon) = 6 days × 8 slots = 48 events.
	if len(events) != 48 {
		t.Fatalf("events = %d, want 48 (6 days × 8 slots)", len(events))
	}

	// Verify all events are on Wed..Mon (not Tue).
	for _, ev := range events {
		wd := ev.StartTime.Weekday()
		if wd == time.Tuesday {
			t.Errorf("event on Tuesday: %s", ev.StartTime)
		}
	}

	// Verify deterministic IDs.
	for _, ev := range events {
		if !strings.HasPrefix(ev.ID, "weekly-test-") {
			t.Errorf("event ID %q does not start with weekly-test-", ev.ID)
		}
		if ev.Source != BundledSource {
			t.Errorf("event %q Source = %q, want %q", ev.ID, ev.Source, BundledSource)
		}
		if ev.DurationMin != 100 {
			t.Errorf("event %q DurationMin = %d, want 100", ev.ID, ev.DurationMin)
		}
	}
}

func TestExpandSeries_WeeklySlots_NoMatchingDays(t *testing.T) {
	sched := validSchedule()
	// Extend validUntil so July 7 (Tue) is included.
	sched.ValidUntil = time.Date(2026, time.July, 8, 0, 0, 0, 0, time.UTC)
	series := RaceSeries{
		ID:          "weekly-test",
		Name:        "Weekly Test",
		Tier:        "weekly",
		DurationMin: 100,
		Splits:      44,
		Recurrence: Recurrence{
			Kind:     "weekly-slots",
			Days:     []string{"Tue"},
			TimesUTC: []string{"20:00"},
		},
	}

	// Window: July 1 (Wed) to July 8 (Wed) — only July 7 (Tue) matches.
	from := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 8, 0, 0, 0, 0, time.UTC)

	events, err := ExpandSeries(series, sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSeries: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events = %d, want 1 (only July 7 is Tue)", len(events))
	}
}

// --- ExpandSchedule ---

func TestExpandSchedule_MultipleSeries(t *testing.T) {
	sched := validSchedule()
	// Add a second series.
	sched.Series = append(sched.Series, RaceSeries{
		ID:           "second-series",
		Name:         "Second Series",
		Tier:         "advanced",
		LicenseLabel: "Gold SR",
		Track:        "Second Track",
		VehicleClass: "Second Class",
		Setup:        "open",
		DurationMin:  60,
		Splits:       44,
		Assists:      "No assists allowed",
		TyreWarmers:  false,
		Tyres:        8,
		Recurrence: Recurrence{
			Kind:            "interval",
			IntervalMinutes: 30,
		},
	})

	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := from.Add(1 * time.Hour)

	events, err := ExpandSchedule(sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSchedule: %v", err)
	}
	// Series 1: 4 events (15 min), Series 2: 2 events (30 min) = 6 total.
	if len(events) != 6 {
		t.Fatalf("events = %d, want 6", len(events))
	}
	// Verify sorted by start time.
	for i := 1; i < len(events); i++ {
		if !events[i].StartTime.After(events[i-1].StartTime) && !events[i].StartTime.Equal(events[i-1].StartTime) {
			t.Errorf("events[%d].StartTime (%s) not >= events[%d] (%s)", i, events[i].StartTime, i-1, events[i-1].StartTime)
		}
	}
}

func TestExpandSchedule_EmptyWindow(t *testing.T) {
	sched := validSchedule()
	from := time.Date(2026, time.July, 10, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 10, 1, 0, 0, 0, time.UTC)

	events, err := ExpandSchedule(sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSchedule: %v", err)
	}
	if len(events) != 0 {
		t.Errorf("events = %d, want 0", len(events))
	}
}

// --- DefaultScheduleWindow ---

func TestDefaultScheduleWindow(t *testing.T) {
	now := time.Date(2026, time.July, 2, 12, 0, 0, 0, time.UTC)
	from, to := DefaultScheduleWindow(now)

	expectedFrom := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	expectedTo := time.Date(2026, time.July, 9, 12, 0, 0, 0, time.UTC)

	if !from.Equal(expectedFrom) {
		t.Errorf("from = %s, want %s", from, expectedFrom)
	}
	if !to.Equal(expectedTo) {
		t.Errorf("to = %s, want %s", to, expectedTo)
	}
}

// --- EstimateSeriesCount ---

func TestEstimateSeriesCount_Interval(t *testing.T) {
	s := validSchedule().Series[0]
	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 7, 0, 0, 0, 0, time.UTC)

	count := EstimateSeriesCount(s, from, to)
	// 7 days = 10080 min / 15 = 672
	if count != 672 {
		t.Errorf("count = %d, want 672", count)
	}
}

func TestEstimateSeriesCount_WeeklySlots(t *testing.T) {
	s := RaceSeries{
		Recurrence: Recurrence{
			Kind:     "weekly-slots",
			Days:     []string{"Wed", "Thu", "Fri", "Sat", "Sun", "Mon"},
			TimesUTC: []string{"02:00", "06:00", "09:00", "12:00", "15:00", "18:00", "20:00", "23:00"},
		},
	}
	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 7, 0, 0, 0, 0, time.UTC)

	count := EstimateSeriesCount(s, from, to)
	// 7 days, 6 matching days per week, 1 week = 6 × 8 = 48
	if count != 48 {
		t.Errorf("count = %d, want 48", count)
	}
}

func TestEstimateSeriesCount_ZeroDuration(t *testing.T) {
	s := validSchedule().Series[0]
	from := time.Date(2026, time.July, 5, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)

	count := EstimateSeriesCount(s, from, to)
	if count != 0 {
		t.Errorf("count = %d, want 0", count)
	}
}

// --- makeSeriesEvent ---

func TestMakeSeriesEvent_DeterministicID(t *testing.T) {
	s := validSchedule().Series[0]
	start := time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC)

	ev1 := makeSeriesEvent(s, start)
	ev2 := makeSeriesEvent(s, start)

	if ev1.ID != ev2.ID {
		t.Errorf("IDs differ: %q vs %q", ev1.ID, ev2.ID)
	}
	if ev1.ID != "test-series-20260704T200000Z" {
		t.Errorf("ID = %q, want test-series-20260704T200000Z", ev1.ID)
	}
}

func TestMakeSeriesEvent_Notes(t *testing.T) {
	s := validSchedule().Series[0]
	start := time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC)

	ev := makeSeriesEvent(s, start)
	if !strings.Contains(ev.Notes, "beginner") {
		t.Errorf("Notes = %q, want beginner info", ev.Notes)
	}
	if !strings.Contains(ev.Notes, "Bronze SR") {
		t.Errorf("Notes = %q, want Bronze SR info", ev.Notes)
	}
}

// --- Real schedule expansion sanity ---

func TestExpandRealSchedule_OneHour(t *testing.T) {
	sched, err := LoadWeeklySchedule()
	if err != nil {
		t.Fatalf("LoadWeeklySchedule: %v", err)
	}

	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := from.Add(1 * time.Hour)

	events, err := ExpandSchedule(sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSchedule: %v", err)
	}

	// 9 interval series × events in 1h:
	//   beginner (3 series × 15min = 4 each = 12)
	//   intermediate (3 series × 20min = 3 each = 9)
	//   advanced (3 series × 30min = 2 each = 6)
	//   weekly (no events on Tue) = 0
	// Total = 27
	if len(events) != 27 {
		t.Fatalf("events = %d, want 27", len(events))
	}

	// Verify all have BundledSource.
	for _, ev := range events {
		if ev.Source != BundledSource {
			t.Errorf("event %q Source = %q, want %q", ev.ID, ev.Source, BundledSource)
		}
	}
}

func TestExpandRealSchedule_OneWeek(t *testing.T) {
	sched, err := LoadWeeklySchedule()
	if err != nil {
		t.Fatalf("LoadWeeklySchedule: %v", err)
	}

	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.July, 7, 0, 0, 0, 0, time.UTC)

	events, err := ExpandSchedule(sched, from, to)
	if err != nil {
		t.Fatalf("ExpandSchedule: %v", err)
	}

	// 7 days of interval series + weekly slots.
	// beginner: 3 series × 672 events each = 2016
	// intermediate: 3 series × 504 events each = 1512
	// advanced: 3 series × 336 events each = 1008
	// weekly: 48 events
	// Total = 4584
	if len(events) != 4584 {
		t.Fatalf("events = %d, want 4584", len(events))
	}

	// Verify sorted.
	for i := 1; i < len(events); i++ {
		if events[i].StartTime.Before(events[i-1].StartTime) {
			t.Fatalf("events[%d].StartTime (%s) before events[%d] (%s)", i, events[i].StartTime, i-1, events[i-1].StartTime)
		}
	}
}

// --- Max events cap ---

func TestExpandSeries_MaxEventsCap(t *testing.T) {
	// Schedule with a wide valid window so clipping does not reduce the window.
	sched := OfficialSchedule{
		Version:    1,
		Timezone:   "UTC",
		ValidFrom:  time.Date(2026, time.June, 1, 0, 0, 0, 0, time.UTC),
		ValidUntil: time.Date(2026, time.December, 31, 0, 0, 0, 0, time.UTC),
		Series: []RaceSeries{
			{
				ID:          "cap-test",
				Name:        "Cap Test",
				Tier:        "beginner",
				DurationMin: 20,
				Splits:      20,
				Recurrence: Recurrence{
					Kind:            "interval",
					IntervalMinutes: 15,
				},
			},
		},
	}
	// 15 min interval over 105 days = 10080 events, which exceeds the 10000 cap.
	from := time.Date(2026, time.June, 30, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.October, 13, 0, 0, 0, 0, time.UTC)

	_, err := ExpandSeries(sched.Series[0], sched, from, to)
	if err == nil || !strings.Contains(err.Error(), "exceeded max events") {
		t.Errorf("expected max events error, got %v", err)
	}
}

// --- sortRaceEventsByStart ---

func TestSortRaceEventsByStart(t *testing.T) {
	t1 := time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, time.July, 4, 18, 0, 0, 0, time.UTC)
	t3 := time.Date(2026, time.July, 4, 22, 0, 0, 0, time.UTC)

	events := []RaceEvent{
		{ID: "c", StartTime: t3},
		{ID: "a", StartTime: t1},
		{ID: "b", StartTime: t2},
	}

	sortRaceEventsByStart(events)

	if events[0].ID != "b" || events[1].ID != "a" || events[2].ID != "c" {
		t.Errorf("order = %q %q %q, want b a c", events[0].ID, events[1].ID, events[2].ID)
	}
}
