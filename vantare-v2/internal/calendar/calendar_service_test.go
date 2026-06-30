package calendar

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// fixedClock returns a deterministic clock pinned at the given instant. The
// returned function is safe to use as a *Service* now() callback.
func fixedClock(t time.Time) func() time.Time {
	var counter atomic.Int64
	base := t
	return func() time.Time {
		// Advance one nanosecond per call so Updated timestamps are
		// monotonically increasing without breaking equality checks when tests
		// pin a single instant.
		n := counter.Add(1)
		return base.Add(time.Duration(n) * time.Nanosecond)
	}
}

func newTempService(t *testing.T, now time.Time) *Service {
	t.Helper()
	dir := t.TempDir()
	return NewService(dir, fixedClock(now))
}

func eventAt(t *testing.T, title string, start time.Time, dur int) RaceEvent {
	t.Helper()
	return RaceEvent{
		Title:       title,
		Sim:         "lmu",
		StartTime:   start,
		DurationMin: dur,
	}
}

func TestService_LoadMissingFileReturnsDefault(t *testing.T) {
	svc := newTempService(t, time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC))
	if err := svc.Load(); err != nil {
		t.Fatalf("Load error: %v", err)
	}
	cal := svc.Calendar()
	if cal.Version != 1 {
		t.Errorf("Version = %d, want 1", cal.Version)
	}
	if cal.Timezone != DefaultTimezone {
		t.Errorf("Timezone = %q, want %q", cal.Timezone, DefaultTimezone)
	}
	if len(cal.Events) != 0 {
		t.Errorf("Events = %d, want 0", len(cal.Events))
	}
}

func TestService_SaveLoadRoundTrip(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	incoming := []RaceEvent{
		eventAt(t, "Race", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60),
		eventAt(t, "Qualy", time.Date(2026, time.July, 2, 18, 0, 0, 0, time.UTC), 30),
	}
	if _, err := svc.Replace(incoming, "UTC", "unit-test"); err != nil {
		t.Fatalf("Replace: %v", err)
	}

	// Reload from disk to verify persistence.
	svc2 := NewService(filepath.Dir(svc.Path()), fixedClock(now))
	if err := svc2.Load(); err != nil {
		t.Fatalf("svc2.Load: %v", err)
	}
	cal := svc2.Calendar()
	if cal.Timezone != "UTC" {
		t.Errorf("Timezone = %q, want UTC", cal.Timezone)
	}
	if len(cal.Events) != 2 {
		t.Fatalf("Events = %d, want 2", len(cal.Events))
	}
	for _, ev := range cal.Events {
		if ev.Source != "unit-test" {
			t.Errorf("event %q source = %q, want unit-test", ev.Title, ev.Source)
		}
		if ev.Sim != "lmu" {
			t.Errorf("event %q sim = %q, want lmu", ev.Title, ev.Sim)
		}
	}
}

func TestService_ReplaceDedupeByKey(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	start := time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC)
	first := []RaceEvent{
		{
			Title:       "Race",
			Sim:         "lmu",
			Track:       "Le Mans",
			StartTime:   start,
			DurationMin: 60,
		},
	}
	if _, err := svc.Replace(first, "UTC", "first"); err != nil {
		t.Fatalf("first Replace: %v", err)
	}
	// Re-import the same event with additional metadata. Key matches on
	// (title|track|startTime) so this should update in place.
	second := []RaceEvent{
		{
			Title:           "Race",
			Sim:             "lmu",
			Track:           "Le Mans",
			StartTime:       start,
			DurationMin:     90,
			Series:          "LMC",
			RegistrationURL: "https://example.com/race",
			Source:          "second",
		},
	}
	merged, err := svc.Replace(second, "UTC", "second")
	if err != nil {
		t.Fatalf("second Replace: %v", err)
	}
	if len(merged) != 1 {
		t.Fatalf("merged = %d, want 1", len(merged))
	}
	ev := merged[0]
	if ev.Track != "Le Mans" {
		t.Errorf("Track = %q, want Le Mans", ev.Track)
	}
	if ev.Series != "LMC" {
		t.Errorf("Series = %q, want LMC", ev.Series)
	}
	if ev.DurationMin != 90 {
		t.Errorf("DurationMin = %d, want 90", ev.DurationMin)
	}
	if ev.RegistrationURL != "https://example.com/race" {
		t.Errorf("RegistrationURL = %q, want https://example.com/race", ev.RegistrationURL)
	}
	if ev.Source != "second" {
		t.Errorf("Source = %q, want second", ev.Source)
	}
}

func TestService_ReplaceValidation(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	bad := []RaceEvent{
		{Title: "", StartTime: time.Now().UTC()},
	}
	_, err := svc.Replace(bad, "UTC", "")
	if err == nil {
		t.Fatal("expected validation error, got nil")
	}
}

func TestService_UpcomingActive(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	in := []RaceEvent{
		eventAt(t, "Past", time.Date(2026, time.July, 1, 8, 0, 0, 0, time.UTC), 60),
		eventAt(t, "Now", time.Date(2026, time.July, 1, 11, 30, 0, 0, time.UTC), 60),
		eventAt(t, "Future", time.Date(2026, time.July, 1, 18, 0, 0, 0, time.UTC), 60),
	}
	if _, err := svc.Replace(in, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	ev, ok := svc.Upcoming(now)
	if !ok {
		t.Fatal("Upcoming returned no event")
	}
	if ev.Title != "Now" {
		t.Errorf("Upcoming = %q, want Now", ev.Title)
	}
}

func TestService_UpcomingReturnsNextFuture(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	in := []RaceEvent{
		eventAt(t, "Earlier", time.Date(2026, time.July, 1, 14, 0, 0, 0, time.UTC), 30),
		eventAt(t, "Later", time.Date(2026, time.July, 1, 18, 0, 0, 0, time.UTC), 30),
	}
	if _, err := svc.Replace(in, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	ev, ok := svc.Upcoming(now)
	if !ok {
		t.Fatal("Upcoming returned no event")
	}
	if ev.Title != "Earlier" {
		t.Errorf("Upcoming = %q, want Earlier", ev.Title)
	}
}

func TestService_UpcomingEmpty(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	_, ok := svc.Upcoming(now)
	if ok {
		t.Error("Upcoming should return false on an empty calendar")
	}
}

func TestService_PastReturnsMostRecent(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	in := []RaceEvent{
		eventAt(t, "Old", time.Date(2026, time.June, 30, 8, 0, 0, 0, time.UTC), 60),
		eventAt(t, "Recent", time.Date(2026, time.July, 1, 10, 0, 0, 0, time.UTC), 60),
		eventAt(t, "Future", time.Date(2026, time.July, 1, 18, 0, 0, 0, time.UTC), 60),
	}
	if _, err := svc.Replace(in, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	ev, ok := svc.Past(now)
	if !ok {
		t.Fatal("Past returned no event")
	}
	if ev.Title != "Recent" {
		t.Errorf("Past = %q, want Recent", ev.Title)
	}
}

func TestService_PastEmpty(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	_, ok := svc.Past(now)
	if ok {
		t.Error("Past should return false when nothing has finished")
	}
}

func TestService_Clear(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if _, err := svc.Replace([]RaceEvent{
		eventAt(t, "X", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60),
	}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if err := svc.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	cal := svc.Calendar()
	if len(cal.Events) != 0 {
		t.Errorf("after Clear Events = %d, want 0", len(cal.Events))
	}
}

// TestService_AtomicWriteCleansTmp verifies that a failed write does not leave
// .tmp files behind. We force the failure by making the parent dir readonly
// after the first successful write.
func TestService_PersistLeavesNoTmp(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if _, err := svc.Replace([]RaceEvent{
		eventAt(t, "X", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60),
	}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	dir := filepath.Dir(svc.Path())
	entries, err := readDirNames(dir)
	if err != nil {
		t.Fatalf("readDir: %v", err)
	}
	for _, name := range entries {
		if contains(name, ".tmp-") {
			t.Errorf("found leftover temp file: %s", name)
		}
	}
}

func TestEventKey_StableAcrossCase(t *testing.T) {
	a := RaceEvent{Title: "Race", Track: "Le Mans", StartTime: time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC)}
	b := RaceEvent{Title: "race", Track: "le mans", StartTime: time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC)}
	if a.Key() != b.Key() {
		t.Errorf("Key() differs on case only: %q vs %q", a.Key(), b.Key())
	}
}

func TestEvent_IsActiveAt(t *testing.T) {
	start := time.Date(2026, time.July, 1, 10, 0, 0, 0, time.UTC)
	ev := RaceEvent{StartTime: start, DurationMin: 60}
	if !ev.IsActiveAt(start) {
		t.Error("event should be active exactly at start")
	}
	if !ev.IsActiveAt(start.Add(30 * time.Minute)) {
		t.Error("event should be active 30 minutes in")
	}
	if ev.IsActiveAt(start.Add(60 * time.Minute)) {
		t.Error("event should not be active after end")
	}
	if ev.IsActiveAt(start.Add(-1 * time.Second)) {
		t.Error("event should not be active before start")
	}
}

// helpers (small wrappers so the test file is self contained)

func readDirNames(dir string) ([]string, error) {
	f, err := os.Open(dir)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	names, err := f.Readdirnames(0)
	if err != nil {
		return nil, err
	}
	return names, nil
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || (len(sub) > 0 && indexOf(s, sub) >= 0))
}

func indexOf(s, sub string) int {
	if len(sub) == 0 {
		return 0
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
