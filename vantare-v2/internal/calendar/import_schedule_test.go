package calendar

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func importFixture(t *testing.T) OfficialSchedule {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "daily-schedule-2026-08-04.txt"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	sched, err := ImportDailySchedule(string(data))
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	return sched
}

func importAug25Fixture(t *testing.T) OfficialSchedule {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "daily-schedule-2026-08-25.txt"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	sched, err := ImportDailySchedule(string(data))
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	return sched
}

func importSep22Fixture(t *testing.T) OfficialSchedule {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "daily-schedule-2026-09-22.txt"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	sched, err := ImportDailySchedule(string(data))
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	return sched
}

func TestImportDailyScheduleSep22Slots(t *testing.T) {
	sched := importSep22Fixture(t)
	if got := len(sched.Series); got != 12 {
		t.Fatalf("series=%d, want 12", got)
	}
	weekly := seriesByID(t, sched, "weekly-2-4h-road-atlanta")
	if got, want := weekly.Recurrence.Days, []string{"Wed", "Tue", "Thu", "Mon"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("weekly days=%v, want %v", got, want)
	}
	if got, want := weekly.Recurrence.TimesUTC, []string{"00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("weekly times=%v, want %v", got, want)
	}
	leMans := seriesByID(t, sched, "weekly-community-test-12-hours-of-le-mans")
	if got, want := leMans.Recurrence.TimesUTC, []string{"08:00"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("Le Mans times=%v, want %v", got, want)
	}
	if len(leMans.Notes) != 3 || !leMans.FairShare || leMans.RaceDurationMin != 720 {
		t.Fatalf("Le Mans details: notes=%d fairShare=%v duration=%d", len(leMans.Notes), leMans.FairShare, leMans.RaceDurationMin)
	}
	longBeach := seriesByID(t, sched, "weekly-grand-prix-of-long-beach")
	if got, want := longBeach.Recurrence.TimesUTC, []string{"02:00", "06:00", "10:00", "14:00", "18:00", "22:00"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("Long Beach times=%v, want %v", got, want)
	}
	if !reflect.DeepEqual(longBeach.Recurrence.Days, []string{"Sat", "Sun"}) {
		t.Fatalf("Long Beach days=%v", longBeach.Recurrence.Days)
	}
	if got := seriesByID(t, sched, "beginner-papaya-rules").RaceDurationMin; got != 15 {
		t.Fatalf("Papaya Rules duration=%d, want 15", got)
	}
	if got := seriesByID(t, sched, "advanced-wec-xperience").VELimit; got != 65 {
		t.Fatalf("WEC-Xperience VE limit=%d, want 65", got)
	}
	super60 := seriesByID(t, sched, "advanced-elms-super-60")
	if len(super60.Classes) != 3 || super60.Classes[0].Name != "LMP2" || super60.Classes[0].Qualifier != "ELMS, 70L fuel tank" || super60.Classes[1].Qualifier != "70L fuel tank" || super60.Classes[2].Qualifier != "70% VE/NRG" {
		t.Fatalf("Super 60 classes=%+v", super60.Classes)
	}
	if super60.VELimit != 0 {
		t.Fatalf("Super 60 series VE limit=%d, want 0; only LMGT3 has the restriction", super60.VELimit)
	}
	if got := seriesByID(t, sched, "advanced-one-stint-sprint").VehicleClass; got != "Hypercar & LMGT3 Classes" {
		t.Fatalf("One Stint classes=%q", got)
	}
}

func TestImportDailyScheduleSep22DiscordMarkup(t *testing.T) {
	text := "## 🇺🇸 Daily Race Schedule from: 22nd September 2026 🇺🇸\n" +
		"## **Advanced [Gold SR]**\n" +
		"starts every 30min, 38 car splits, no assists allowed, no tyre warmers, tyres: 10\n" +
		"**One Stint Sprint**: Daytona (RC), Hypercar & LMGT3 Classes, 40m races, open setup, [RUDP enabled](https://lemansultimate.com/community-update-september-2026/)\n"
	sched, err := ImportDailySchedule(text)
	if err != nil {
		t.Fatal(err)
	}
	series := seriesByID(t, sched, "advanced-one-stint-sprint")
	if series.Name != "One Stint Sprint" || series.VehicleClass != "Hypercar & LMGT3 Classes" || !reflect.DeepEqual(series.Notes, []string{"RUDP enabled"}) {
		t.Fatalf("markup lost meaning: %+v", series)
	}
}

func TestImportDailyScheduleSep22SpecialStarts(t *testing.T) {
	sched := importSep22Fixture(t)
	cases := []struct {
		id    string
		want  int
		first time.Time
		last  time.Time
	}{
		{"weekly-2-4h-road-atlanta", 32, time.Date(2026, time.September, 22, 0, 0, 0, 0, time.UTC), time.Date(2026, time.September, 28, 21, 0, 0, 0, time.UTC)},
		{"weekly-community-test-12-hours-of-le-mans", 1, time.Date(2026, time.September, 25, 8, 0, 0, 0, time.UTC), time.Date(2026, time.September, 25, 8, 0, 0, 0, time.UTC)},
		{"weekly-grand-prix-of-long-beach", 12, time.Date(2026, time.September, 26, 2, 0, 0, 0, time.UTC), time.Date(2026, time.September, 27, 22, 0, 0, 0, time.UTC)},
	}
	for _, c := range cases {
		t.Run(c.id, func(t *testing.T) {
			events, err := ExpandSeries(seriesByID(t, sched, c.id), sched, sched.ValidFrom, sched.ValidUntil)
			if err != nil {
				t.Fatal(err)
			}
			if len(events) == 0 {
				t.Fatal("no starts in official week")
			}
			if len(events) != c.want || !events[0].StartTime.Equal(c.first) || !events[len(events)-1].StartTime.Equal(c.last) {
				t.Fatalf("starts: count=%d first=%s last=%s, want %d %s %s", len(events), events[0].StartTime, events[len(events)-1].StartTime, c.want, c.first, c.last)
			}
		})
	}
}

func TestImportDailyScheduleSep22RawDiscordText(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("testdata", "daily-schedule-2026-09-22-raw.txt"))
	if err != nil {
		t.Fatal(err)
	}
	sched, err := ImportDailySchedule(string(data))
	if err != nil {
		t.Fatal(err)
	}
	if len(sched.Series) != 12 {
		t.Fatalf("raw message produced %d series, want 12", len(sched.Series))
	}
	normalized := importSep22Fixture(t)
	for i := range sched.Series {
		rawSeries := sched.Series[i]
		plainSeries := normalized.Series[i]
		rawSeries.Notes = nil
		plainSeries.Notes = nil
		if !reflect.DeepEqual(rawSeries, plainSeries) {
			t.Fatalf("raw message changes parsed fields for series %q: raw=%+v plain=%+v", rawSeries.ID, rawSeries, plainSeries)
		}
	}
	if len(seriesByID(t, sched, "weekly-community-test-12-hours-of-le-mans").Notes) != 4 {
		t.Fatal("raw message lost the network test advisories")
	}
}

func seriesByID(t *testing.T, sched OfficialSchedule, id string) RaceSeries {
	t.Helper()
	for _, s := range sched.Series {
		if s.ID == id {
			return s
		}
	}
	t.Fatalf("series %q not found; got %d series", id, len(sched.Series))
	return RaceSeries{}
}

func TestImportDailyScheduleHeaderAndWindow(t *testing.T) {
	sched := importFixture(t)

	want := time.Date(2026, time.August, 4, 0, 0, 0, 0, time.UTC)
	if !sched.ValidFrom.Equal(want) {
		t.Fatalf("validFrom=%s, want %s", sched.ValidFrom, want)
	}
	if !sched.ValidUntil.Equal(want.AddDate(0, 0, 7)) {
		t.Fatalf("validUntil=%s, want a week after validFrom", sched.ValidUntil)
	}
	if len(sched.Series) != 11 {
		t.Fatalf("series=%d, want 11", len(sched.Series))
	}
}

func TestImportDailyScheduleInheritsTierDefaults(t *testing.T) {
	sched := importFixture(t)

	s := seriesByID(t, sched, "beginner-lmgt3-fixed")
	if s.Tier != "beginner" || s.LicenseLabel != "Bronze SR" {
		t.Fatalf("tier=%q license=%q", s.Tier, s.LicenseLabel)
	}
	if s.Recurrence.Kind != "interval" || s.Recurrence.IntervalMinutes != 15 {
		t.Fatalf("recurrence=%+v, want interval every 15min", s.Recurrence)
	}
	if s.RaceDurationMin != 20 || s.Splits != 20 || s.Tyres != 8 {
		t.Fatalf("race=%d splits=%d tyres=%d, want 20/20/8", s.RaceDurationMin, s.Splits, s.Tyres)
	}
	if !s.TyreWarmers {
		t.Fatal("beginner tier enables tyre warmers")
	}
	if s.Assists != "High assists allowed" {
		t.Fatalf("assists=%q", s.Assists)
	}
	if s.Track != "Bahrain (Outer)" {
		t.Fatalf("track=%q", s.Track)
	}
	if s.Setup != "fixed" {
		t.Fatalf("setup=%q", s.Setup)
	}
}

func TestImportDailyScheduleSeriesOverridesTierDuration(t *testing.T) {
	sched := importFixture(t)

	// The Advanced header states no race length, so each series brings its own.
	sprint := seriesByID(t, sched, "advanced-one-stint-sprint")
	if sprint.RaceDurationMin != 40 {
		t.Fatalf("one-stint-sprint race=%d, want 40", sprint.RaceDurationMin)
	}
	super60 := seriesByID(t, sched, "advanced-elms-super-60")
	if super60.RaceDurationMin != 60 {
		t.Fatalf("elms-super-60 race=%d, want 60", super60.RaceDurationMin)
	}
	if super60.Splits != 38 || super60.TyreWarmers {
		t.Fatalf("advanced defaults not inherited: splits=%d warmers=%v", super60.Splits, super60.TyreWarmers)
	}
}

func TestImportDailyScheduleStructuresVehicleClasses(t *testing.T) {
	sched := importFixture(t)

	s := seriesByID(t, sched, "advanced-elms-super-60")
	want := []VehicleClass{
		{Name: "LMP2", Qualifier: "ELMS, full fuel tank", TelemetryClassName: "LMP2_ELMS"},
		{Name: "LMP3", Qualifier: "70L fuel tank", TelemetryClassName: "LMP3"},
		{Name: "LMGT3", Qualifier: "75% VE", TelemetryClassName: "GT3"},
	}
	if len(s.Classes) != len(want) {
		t.Fatalf("classes=%+v, want %d entries", s.Classes, len(want))
	}
	for i, w := range want {
		if s.Classes[i] != w {
			t.Fatalf("classes[%d]=%+v, want %+v", i, s.Classes[i], w)
		}
	}
	// A restriction on LMGT3 must not appear as a cap on LMP2 and LMP3.
	if s.VELimit != 0 {
		t.Fatalf("series veLimit=%d, want 0", s.VELimit)
	}
	// The prose is preserved verbatim alongside the structured reading.
	if s.VehicleClass == "" {
		t.Fatal("vehicleClass prose should be kept")
	}
}

func TestImportDailyScheduleReadsSeriesLevelVELimit(t *testing.T) {
	sched := importFixture(t)

	s := seriesByID(t, sched, "advanced-wec-xperience")
	if s.VELimit != 70 {
		t.Fatalf("veLimit=%d, want 70", s.VELimit)
	}
	if len(s.Classes) != 2 || s.Classes[0].Name != "Hypercar" || s.Classes[1].Name != "LMGT3" {
		t.Fatalf("classes=%+v, want Hypercar and LMGT3", s.Classes)
	}
}

func TestImportDailyScheduleReadsWeeklySlots(t *testing.T) {
	sched := importFixture(t)

	s := seriesByID(t, sched, "weekly-wec-weekly")
	if s.Tier != "weekly" {
		t.Fatalf("tier=%q, want weekly", s.Tier)
	}
	if s.SafetyRating != "SR S2" {
		t.Fatalf("safetyRating=%q, want SR S2", s.SafetyRating)
	}
	if s.Name != "WEC Weekly" {
		t.Fatalf("name=%q, the SR bracket should be stripped", s.Name)
	}
	if s.Recurrence.Kind != "weekly-slots" {
		t.Fatalf("recurrence kind=%q", s.Recurrence.Kind)
	}
	if got, want := len(s.Recurrence.Days), 4; got != want {
		t.Fatalf("days=%v, want %d", s.Recurrence.Days, want)
	}
	if got, want := len(s.Recurrence.TimesUTC), 8; got != want {
		t.Fatalf("times=%v, want %d", s.Recurrence.TimesUTC, want)
	}
	if s.Splits != 44 || s.RaceDurationMin != 100 || s.Tyres != 10 {
		t.Fatalf("splits=%d race=%d tyres=%d, want 44/100/10", s.Splits, s.RaceDurationMin, s.Tyres)
	}
}

func TestImportDailyScheduleExpandsEveryNHoursShorthand(t *testing.T) {
	sched := importFixture(t)

	s := seriesByID(t, sched, "weekly-le-mans-24h-scaled")
	if s.TimeScale != 10 {
		t.Fatalf("timeScale=%d, want 10", s.TimeScale)
	}
	want := []string{"00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"}
	if len(s.Recurrence.TimesUTC) != len(want) {
		t.Fatalf("times=%v, want %v", s.Recurrence.TimesUTC, want)
	}
	for i, w := range want {
		if s.Recurrence.TimesUTC[i] != w {
			t.Fatalf("times[%d]=%q, want %q", i, s.Recurrence.TimesUTC[i], w)
		}
	}
	if len(s.Notes) != 1 {
		t.Fatalf("notes=%v, want the IMPORTANT advisory attached", s.Notes)
	}
}

func TestImportDailyScheduleRejectsBadInput(t *testing.T) {
	cases := map[string]string{
		"empty":       "",
		"no header":   "Beginner [Bronze SR]\nstarts every 15min, 20m races, 20 car splits\n",
		"no series":   "Daily Race Schedule from: 4th August 2026\n",
		"orphan line": "Daily Race Schedule from: 4th August 2026\nLMGT3 Fixed: Bahrain (Outer), LMGT3 Class, fixed setup\n",
	}
	for name, text := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := ImportDailySchedule(text); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestImportedScheduleExpandsIntoEvents(t *testing.T) {
	sched := importFixture(t)

	from := sched.ValidFrom
	to := from.Add(2 * time.Hour)
	events, err := ExpandSchedule(sched, from, to)
	if err != nil {
		t.Fatalf("expand: %v", err)
	}
	if len(events) == 0 {
		t.Fatal("expected the imported schedule to produce events")
	}
	for i := 1; i < len(events); i++ {
		if events[i].StartTime.Before(events[i-1].StartTime) {
			t.Fatal("events must come back sorted by start time")
		}
	}
}

func TestSplitKnownClassNames(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"Hypercar LMP2", []string{"Hypercar", "LMP2"}},
		{"Hypercar", []string{"Hypercar"}},
		{"LMGTE Am", []string{"LMGTE Am"}},
		// One-make entries are not runs of known classes and must stay whole.
		{"McLaren 720S LMGT3", []string{"McLaren 720S LMGT3"}},
		{"Ferrari 296 Challenge", []string{"Ferrari 296 Challenge"}},
	}
	for _, c := range cases {
		got := splitKnownClassNames(c.in)
		if len(got) != len(c.want) {
			t.Fatalf("split %q = %v, want %v", c.in, got, c.want)
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Fatalf("split %q = %v, want %v", c.in, got, c.want)
			}
		}
	}
}

func TestImportDailyScheduleSplitsSpaceSeparatedClasses(t *testing.T) {
	sched := importFixture(t)

	s := seriesByID(t, sched, "weekly-le-mans-24h-scaled")
	want := []VehicleClass{
		{Name: "Hypercar", TelemetryClassName: "Hyper"},
		{Name: "LMP2", Qualifier: "WEC", TelemetryClassName: "LMP2_ELMS"},
		{Name: "LMGT3", TelemetryClassName: "GT3"},
	}
	if len(s.Classes) != len(want) {
		t.Fatalf("classes=%+v, want %+v", s.Classes, want)
	}
	for i, w := range want {
		if s.Classes[i] != w {
			t.Fatalf("classes[%d]=%+v, want %+v", i, s.Classes[i], w)
		}
	}
}

func TestImportDailyScheduleAug25DiscordMessage(t *testing.T) {
	sched := importAug25Fixture(t)
	if got, want := len(sched.Series), 11; got != want {
		t.Fatalf("series=%d, want %d", got, want)
	}
	if got, want := len(sched.SourceNotes), 1; got != want {
		t.Fatalf("sourceNotes=%d, want %d", got, want)
	}
	for _, series := range sched.Series {
		if series.EventKind == "daily" && series.StartOffsetMinute != 0 {
			t.Errorf("daily series %q has an invented start offset %d", series.ID, series.StartOffsetMinute)
		}
	}

	weekly := seriesByID(t, sched, "weekly-wec-weekly")
	if weekly.EventKind != "weekly" || weekly.Format != "solo" {
		t.Fatalf("weekly metadata=%q/%q, want weekly/solo", weekly.EventKind, weekly.Format)
	}
	if got, want := weekly.Recurrence.TimesUTC, []string{"00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"}; !equalStrings(got, want) {
		t.Fatalf("weekly times=%v, want %v", got, want)
	}
	if weekly.RaceDurationMin != 90 {
		t.Fatalf("weekly race=%d, want 90", weekly.RaceDurationMin)
	}
	special := seriesByID(t, sched, "weekly-8-hours-of-daytona")
	if special.EventKind != "special" || special.Format != "team" {
		t.Fatalf("special metadata=%q/%q, want special/team", special.EventKind, special.Format)
	}
	if special.SafetyRating != "SR B2" {
		t.Fatalf("special safetyRating=%q, want SR B2", special.SafetyRating)
	}
	if !equalStrings(special.ForbiddenBadges, []string{"RookieDriver", "DangerousDriver"}) {
		t.Fatalf("forbiddenBadges=%v", special.ForbiddenBadges)
	}
	if !special.FairShare || special.TyreWarmers {
		t.Fatalf("special fairShare=%v tyreWarmers=%v, want true/false", special.FairShare, special.TyreWarmers)
	}
	if special.TimeScale != 3 || special.InGameStartTime != "1:00pm in-game time" {
		t.Fatalf("special timeScale=%d inGameStartTime=%q", special.TimeScale, special.InGameStartTime)
	}
	if got, want := special.Recurrence.TimesUTC, []string{"03:00", "08:00", "13:00", "20:00"}; !equalStrings(got, want) {
		t.Fatalf("special times=%v, want %v", got, want)
	}
	if len(special.Notes) != 1 {
		t.Fatalf("special notes=%d, want 1", len(special.Notes))
	}
}

func TestBundledSeedMatchesAug25DiscordMessage(t *testing.T) {
	parsed := importAug25Fixture(t)
	bundled, err := LoadWeeklySchedule()
	if err != nil {
		t.Fatalf("LoadWeeklySchedule: %v", err)
	}
	if !reflect.DeepEqual(bundled, parsed) {
		t.Fatalf("bundled seed differs from the source parser output")
	}
}

func equalStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
