package calendar

import (
	"os"
	"path/filepath"
	"strings"
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

func TestService_FollowValidPersistsAndAppearsAfterReload(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}

	cal, err := svc.Follow("ev-1")
	if err != nil {
		t.Fatalf("Follow: %v", err)
	}
	if len(cal.FollowedEventIDs) != 1 || cal.FollowedEventIDs[0] != "ev-1" {
		t.Fatalf("FollowedEventIDs=%v, want [ev-1]", cal.FollowedEventIDs)
	}
	if !svc.IsFollowed("ev-1") {
		t.Error("IsFollowed should be true after Follow")
	}

	// Reload from disk.
	svc2 := NewService(filepath.Dir(svc.Path()), fixedClock(now))
	if err := svc2.Load(); err != nil {
		t.Fatalf("svc2.Load: %v", err)
	}
	if !svc2.IsFollowed("ev-1") {
		t.Error("IsFollowed should survive reload")
	}
}

func TestService_FollowInvalidReturnsErrorAndDoesNotChangeCalendar(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	// No events exist, so "nonexistent" is invalid.
	_, err := svc.Follow("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent event, got nil")
	}
	cal := svc.Calendar()
	if len(cal.FollowedEventIDs) != 0 {
		t.Errorf("FollowedEventIDs=%v, want empty after failed follow", cal.FollowedEventIDs)
	}
}

func TestService_UnfollowRemovesIDAndPersists(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}

	cal, err := svc.Unfollow("ev-1")
	if err != nil {
		t.Fatalf("Unfollow: %v", err)
	}
	if len(cal.FollowedEventIDs) != 0 {
		t.Errorf("FollowedEventIDs=%v after unfollow, want empty", cal.FollowedEventIDs)
	}
	if svc.IsFollowed("ev-1") {
		t.Error("IsFollowed should be false after Unfollow")
	}

	// Reload from disk.
	svc2 := NewService(filepath.Dir(svc.Path()), fixedClock(now))
	if err := svc2.Load(); err != nil {
		t.Fatalf("svc2.Load: %v", err)
	}
	if svc2.IsFollowed("ev-1") {
		t.Error("IsFollowed should be false after reload")
	}
}

func TestService_ClearEmptiesFollowedIDs(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}

	if err := svc.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	cal := svc.Calendar()
	if len(cal.FollowedEventIDs) != 0 {
		t.Errorf("FollowedEventIDs=%v after clear, want empty", cal.FollowedEventIDs)
	}
	if len(cal.Events) != 0 {
		t.Errorf("Events=%d after clear, want 0", len(cal.Events))
	}
}

func TestService_ReplacePreservesFollowedIDsForExistingEvents(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}

	// Replace with the same event (dedupe keeps it).
	ev2 := ev
	ev2.DurationMin = 90
	if _, err := svc.Replace([]RaceEvent{ev2}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if !svc.IsFollowed("ev-1") {
		t.Error("IsFollowed should be true after replace that keeps the event")
	}
}

func TestService_ReplaceKeepsFollowedIDsAcrossMerge(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev1 := eventAt(t, "Race", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60)
	ev1.ID = "ev-1"
	ev2 := eventAt(t, "Qualy", time.Date(2026, time.July, 2, 18, 0, 0, 0, time.UTC), 30)
	ev2.ID = "ev-2"
	if _, err := svc.Replace([]RaceEvent{ev1, ev2}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow ev-1: %v", err)
	}
	if _, err := svc.Follow("ev-2"); err != nil {
		t.Fatalf("Follow ev-2: %v", err)
	}

	// Replace with only ev2 — dedupe keeps ev1 (merge semantics), so ev-1 stays followed.
	if _, err := svc.Replace([]RaceEvent{ev2}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if !svc.IsFollowed("ev-1") {
		t.Error("IsFollowed should remain true for ev-1 (dedupe merge keeps it)")
	}
	if !svc.IsFollowed("ev-2") {
		t.Error("IsFollowed should be true for ev-2")
	}
}

func TestService_FollowIdempotent(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}

	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("first Follow: %v", err)
	}
	cal, err := svc.Follow("ev-1")
	if err != nil {
		t.Fatalf("second Follow: %v", err)
	}
	if len(cal.FollowedEventIDs) != 1 {
		t.Fatalf("FollowedEventIDs=%v after second follow, want [ev-1]", cal.FollowedEventIDs)
	}
}

func TestService_UnfollowIdempotent(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 2, 20, 0, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}

	// Unfollow when not followed — no-op.
	cal, err := svc.Unfollow("ev-1")
	if err != nil {
		t.Fatalf("first Unfollow: %v", err)
	}
	if len(cal.FollowedEventIDs) != 0 {
		t.Errorf("FollowedEventIDs=%v after first unfollow, want empty", cal.FollowedEventIDs)
	}
	// Unfollow again — still no-op.
	cal, err = svc.Unfollow("ev-1")
	if err != nil {
		t.Fatalf("second Unfollow: %v", err)
	}
	if len(cal.FollowedEventIDs) != 0 {
		t.Errorf("FollowedEventIDs=%v after second unfollow, want empty", cal.FollowedEventIDs)
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

func TestDueReminders_NoFollowedEvents(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 30, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	reminders := svc.DueReminders(now)
	if len(reminders) != 0 {
		t.Errorf("DueReminders = %d, want 0 (no followed events)", len(reminders))
	}
}

func TestDueReminders_EventNotFollowed(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev1 := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 30, 0, 0, time.UTC), 60)
	ev1.ID = "ev-1"
	ev2 := eventAt(t, "Qualy", time.Date(2026, time.July, 1, 13, 0, 0, 0, time.UTC), 30)
	ev2.ID = "ev-2"
	if _, err := svc.Replace([]RaceEvent{ev1, ev2}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-2"); err != nil {
		t.Fatalf("Follow ev-2: %v", err)
	}
	// ev-1 is not followed — should not produce a reminder.
	reminders := svc.DueReminders(now)
	if len(reminders) != 0 {
		t.Errorf("DueReminders = %d, want 0 (ev-1 not followed)", len(reminders))
	}
}

func TestDueReminders_FollowedEventWithinThreshold(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 30, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}
	// 30 minutes before start — DefaultReminderMinutes includes 30.
	reminders := svc.DueReminders(now)
	if len(reminders) != 1 {
		t.Fatalf("DueReminders = %d, want 1", len(reminders))
	}
	if reminders[0].EventID != "ev-1" {
		t.Errorf("EventID = %q, want ev-1", reminders[0].EventID)
	}
	if reminders[0].MinutesLeft != 30 {
		t.Errorf("MinutesLeft = %d, want 30", reminders[0].MinutesLeft)
	}
}

func TestDueReminders_FollowedEventOutsideThreshold(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	// Event starts in 45 minutes — no threshold matches (30 < 45 <= 15 is false).
	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 45, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}
	reminders := svc.DueReminders(now)
	if len(reminders) != 0 {
		t.Errorf("DueReminders = %d, want 0 (45 min > 30 threshold)", len(reminders))
	}
}

func TestDueReminders_PastEvent(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 11, 0, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}
	reminders := svc.DueReminders(now)
	if len(reminders) != 0 {
		t.Errorf("DueReminders = %d, want 0 (past event)", len(reminders))
	}
}

func TestDueReminders_CustomReminderMinutes(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	// Set custom reminder minutes.
	svc.mu.Lock()
	svc.cal.ReminderMinutes = []int{45, 20}
	svc.mu.Unlock()

	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 20, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}
	// 20 minutes before start — custom threshold 20 matches.
	reminders := svc.DueReminders(now)
	if len(reminders) != 1 {
		t.Fatalf("DueReminders = %d, want 1", len(reminders))
	}
	if reminders[0].MinutesLeft != 20 {
		t.Errorf("MinutesLeft = %d, want 20", reminders[0].MinutesLeft)
	}
}

func TestDueReminders_EdgeTMinusOne(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	// Event starts in 29 minutes — threshold 30 uses (T-1, T] = (29, 30].
	// 29 is NOT > 29, so no reminder for 30.
	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 29, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}
	reminders := svc.DueReminders(now)
	for _, r := range reminders {
		if r.MinutesLeft == 30 {
			t.Errorf("unexpected reminder for 30 at minutesUntil=29 (outside (29,30])")
		}
	}
}

func TestDueReminders_EmptyReminderMinutesUsesDefault(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	// Set empty reminder minutes.
	svc.mu.Lock()
	svc.cal.ReminderMinutes = []int{}
	svc.mu.Unlock()

	ev := eventAt(t, "Race", time.Date(2026, time.July, 1, 12, 30, 0, 0, time.UTC), 60)
	ev.ID = "ev-1"
	if _, err := svc.Replace([]RaceEvent{ev}, "UTC", ""); err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if _, err := svc.Follow("ev-1"); err != nil {
		t.Fatalf("Follow: %v", err)
	}
	// 30 minutes before start — DefaultReminderMinutes includes 30.
	reminders := svc.DueReminders(now)
	if len(reminders) != 1 {
		t.Fatalf("DueReminders = %d, want 1", len(reminders))
	}
	if reminders[0].MinutesLeft != 30 {
		t.Errorf("MinutesLeft = %d, want 30", reminders[0].MinutesLeft)
	}
}

func TestService_ApplyBundledSeed_FirstRun(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	seed := Calendar{
		Version:         2,
		Timezone:        "Europe/Madrid",
		ReminderMinutes: []int{30, 15, 10, 5, 2},
		Events: []RaceEvent{
			{ID: "ev-1", Title: "Race 1", Sim: "lmu", StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
			{ID: "ev-2", Title: "Race 2", Sim: "lmu", StartTime: time.Date(2026, time.July, 5, 20, 0, 0, 0, time.UTC), DurationMin: 90},
		},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	if len(cal.Events) != 2 {
		t.Fatalf("Events = %d, want 2", len(cal.Events))
	}
	if cal.Version != 2 {
		t.Errorf("Version = %d, want 2", cal.Version)
	}
	if cal.Timezone != "Europe/Madrid" {
		t.Errorf("Timezone = %q, want Europe/Madrid", cal.Timezone)
	}
	for _, ev := range cal.Events {
		if ev.Source != BundledSource {
			t.Errorf("event %q Source = %q, want %q", ev.ID, ev.Source, BundledSource)
		}
	}
}

func TestService_ApplyBundledSeed_ReplacesOldBundled(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	// Add two bundled events via direct manipulation.
	svc.mu.Lock()
	svc.cal.Events = []RaceEvent{
		{ID: "ev-old-1", Title: "Old Race 1", Sim: "lmu", Source: BundledSource, StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		{ID: "ev-old-2", Title: "Old Race 2", Sim: "lmu", Source: BundledSource, StartTime: time.Date(2026, time.July, 5, 20, 0, 0, 0, time.UTC), DurationMin: 90},
	}
	svc.mu.Unlock()

	seed := Calendar{
		Version:  2,
		Timezone: "Europe/Madrid",
		Events: []RaceEvent{
			{ID: "ev-new-1", Title: "New Race", Sim: "lmu", StartTime: time.Date(2026, time.July, 6, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("Events = %d, want 1", len(cal.Events))
	}
	if cal.Events[0].ID != "ev-new-1" {
		t.Errorf("Event ID = %q, want ev-new-1", cal.Events[0].ID)
	}
	if cal.Events[0].Source != BundledSource {
		t.Errorf("Source = %q, want %q", cal.Events[0].Source, BundledSource)
	}
}

func TestService_ApplyBundledSeed_PreservesNonBundled(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	svc.mu.Lock()
	svc.cal.Events = []RaceEvent{
		{ID: "ev-bundled", Title: "Bundled", Sim: "lmu", Source: BundledSource, StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		{ID: "ev-custom", Title: "Custom", Sim: "lmu", Source: "custom", StartTime: time.Date(2026, time.July, 5, 20, 0, 0, 0, time.UTC), DurationMin: 60},
	}
	svc.mu.Unlock()

	// Apply empty seed (no events).
	seed := Calendar{
		Version:  2,
		Timezone: "Europe/Madrid",
		Events:   []RaceEvent{},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("Events = %d, want 1", len(cal.Events))
	}
	if cal.Events[0].ID != "ev-custom" {
		t.Errorf("Event ID = %q, want ev-custom", cal.Events[0].ID)
	}
	if cal.Events[0].Source != "custom" {
		t.Errorf("Source = %q, want custom", cal.Events[0].Source)
	}
}

func TestService_ApplyBundledSeed_PreservesFollowedIDs(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	svc.mu.Lock()
	svc.cal.Events = []RaceEvent{
		{ID: "ev-1", Title: "Race 1", Sim: "lmu", Source: BundledSource, StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		{ID: "ev-2", Title: "Race 2", Sim: "lmu", Source: BundledSource, StartTime: time.Date(2026, time.July, 5, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		{ID: "ev-3", Title: "Custom", Sim: "lmu", Source: "custom", StartTime: time.Date(2026, time.July, 6, 20, 0, 0, 0, time.UTC), DurationMin: 60},
	}
	svc.cal.FollowedEventIDs = []string{"ev-1", "ev-2", "ev-3"}
	svc.mu.Unlock()

	// Apply seed with only ev-1 (ev-2 should be pruned from follows).
	seed := Calendar{
		Version:  2,
		Timezone: "Europe/Madrid",
		Events: []RaceEvent{
			{ID: "ev-1", Title: "Race 1 Updated", Sim: "lmu", StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	// ev-1 (bundled, kept via seed), ev-3 (custom, preserved)
	if len(cal.Events) != 2 {
		t.Fatalf("Events = %d, want 2", len(cal.Events))
	}
	// ev-1 still followed, ev-2 pruned, ev-3 still followed
	if len(cal.FollowedEventIDs) != 2 {
		t.Fatalf("FollowedEventIDs = %v, want [ev-1 ev-3]", cal.FollowedEventIDs)
	}
	followed := make(map[string]bool)
	for _, id := range cal.FollowedEventIDs {
		followed[id] = true
	}
	if !followed["ev-1"] {
		t.Error("ev-1 should still be followed")
	}
	if followed["ev-2"] {
		t.Error("ev-2 should no longer be followed")
	}
	if !followed["ev-3"] {
		t.Error("ev-3 should still be followed")
	}
}

func TestService_ApplyBundledSeed_EmptySeed(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	svc.mu.Lock()
	svc.cal.Events = []RaceEvent{
		{ID: "ev-bundled", Title: "Bundled", Sim: "lmu", Source: BundledSource, StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		{ID: "ev-custom", Title: "Custom", Sim: "lmu", Source: "custom", StartTime: time.Date(2026, time.July, 5, 20, 0, 0, 0, time.UTC), DurationMin: 60},
	}
	svc.mu.Unlock()

	seed := Calendar{
		Version:  2,
		Timezone: "Europe/Madrid",
		Events:   []RaceEvent{},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("Events = %d, want 1", len(cal.Events))
	}
	if cal.Events[0].ID != "ev-custom" {
		t.Errorf("Event ID = %q, want ev-custom", cal.Events[0].ID)
	}
}

func TestService_ApplyBundledSeed_PrunesFollowedForRemovedBundled(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	svc.mu.Lock()
	svc.cal.Events = []RaceEvent{
		{ID: "ev-1", Title: "Race 1", Sim: "lmu", Source: BundledSource, StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
	}
	svc.cal.FollowedEventIDs = []string{"ev-1"}
	svc.mu.Unlock()

	// Apply empty seed — ev-1 is removed, so ev-1 should be pruned from follows.
	seed := Calendar{
		Version:  2,
		Timezone: "Europe/Madrid",
		Events:   []RaceEvent{},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	if len(cal.Events) != 0 {
		t.Fatalf("Events = %d, want 0", len(cal.Events))
	}
	if len(cal.FollowedEventIDs) != 0 {
		t.Errorf("FollowedEventIDs = %v, want empty", cal.FollowedEventIDs)
	}
}

func TestService_ApplyBundledSeed_InvalidSeedDoesNotMutate(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	// Add one bundled event so we can verify it is not removed.
	svc.mu.Lock()
	svc.cal.Events = []RaceEvent{
		{ID: "ev-1", Title: "Race", Sim: "lmu", Source: BundledSource, StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
	}
	svc.mu.Unlock()

	// Seed with an event that has an empty title (invalid).
	seed := Calendar{
		Version:  2,
		Timezone: "Europe/Madrid",
		Events: []RaceEvent{
			{ID: "ev-bad", Title: "", Sim: "lmu", StartTime: time.Date(2026, time.July, 5, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		},
	}

	err := svc.ApplyBundledSeed(seed)
	if err == nil {
		t.Fatal("expected validation error for empty title, got nil")
	}

	// Calendar must be unchanged.
	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("Events = %d, want 1 (unchanged)", len(cal.Events))
	}
	if cal.Events[0].ID != "ev-1" {
		t.Errorf("Event ID = %q, want ev-1", cal.Events[0].ID)
	}
	if cal.Events[0].Source != BundledSource {
		t.Errorf("Source = %q, want %q", cal.Events[0].Source, BundledSource)
	}
}

func TestService_ApplyBundledSeed_PreservesNonBundledWithSameKey(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	start := time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC)

	// Add one non-bundled event (Source="custom").
	svc.mu.Lock()
	svc.cal.Events = []RaceEvent{
		{ID: "ev-custom", Title: "Race", Sim: "lmu", Track: "Le Mans", Source: "custom", StartTime: start, DurationMin: 60},
	}
	svc.mu.Unlock()

	// Seed with an event that has the SAME Key() (same title, track, startTime)
	// but a different ID.
	seed := Calendar{
		Version:  2,
		Timezone: "Europe/Madrid",
		Events: []RaceEvent{
			{ID: "ev-seed", Title: "Race", Sim: "lmu", Track: "Le Mans", StartTime: start, DurationMin: 60},
		},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	// Non-bundled event must be preserved with its original ID and Source.
	if len(cal.Events) != 1 {
		t.Fatalf("Events = %d, want 1 (non-bundled preserved)", len(cal.Events))
	}
	if cal.Events[0].ID != "ev-custom" {
		t.Errorf("Event ID = %q, want ev-custom (original ID preserved)", cal.Events[0].ID)
	}
	if cal.Events[0].Source != "custom" {
		t.Errorf("Source = %q, want custom (original source preserved)", cal.Events[0].Source)
	}
}

func TestService_ApplyBundledSeed_PreservesNonBundledWithSameID(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	customStart := time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC)
	seedStart := time.Date(2026, time.July, 5, 20, 0, 0, 0, time.UTC)

	svc.mu.Lock()
	svc.cal.Events = []RaceEvent{
		{ID: "ev-shared", Title: "Custom Race", Sim: "lmu", Track: "Custom Track", Source: "custom", StartTime: customStart, DurationMin: 60},
	}
	svc.mu.Unlock()

	seed := Calendar{
		Version:  2,
		Timezone: "Europe/Madrid",
		Events: []RaceEvent{
			{ID: "ev-shared", Title: "Seed Race", Sim: "lmu", Track: "Seed Track", StartTime: seedStart, DurationMin: 90},
		},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("Events = %d, want 1 (non-bundled preserved)", len(cal.Events))
	}
	if cal.Events[0].ID != "ev-shared" {
		t.Errorf("Event ID = %q, want ev-shared", cal.Events[0].ID)
	}
	if cal.Events[0].Title != "Custom Race" {
		t.Errorf("Title = %q, want Custom Race", cal.Events[0].Title)
	}
	if cal.Events[0].Source != "custom" {
		t.Errorf("Source = %q, want custom", cal.Events[0].Source)
	}
	if !cal.Events[0].StartTime.Equal(customStart) {
		t.Errorf("StartTime = %s, want %s", cal.Events[0].StartTime, customStart)
	}
}

func TestService_ApplyBundledSeed_NormalisesReminderMinutes(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	seed := Calendar{
		Version:         2,
		Timezone:        "Europe/Madrid",
		ReminderMinutes: nil,
		Events: []RaceEvent{
			{ID: "ev-1", Title: "Race", Sim: "lmu", StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	if cal.ReminderMinutes == nil {
		t.Fatal("ReminderMinutes is nil after normalise")
	}
	if len(cal.ReminderMinutes) != len(DefaultReminderMinutes) {
		t.Fatalf("ReminderMinutes = %v, want %v", cal.ReminderMinutes, DefaultReminderMinutes)
	}
	for i, v := range cal.ReminderMinutes {
		if v != DefaultReminderMinutes[i] {
			t.Errorf("ReminderMinutes[%d] = %d, want %d", i, v, DefaultReminderMinutes[i])
		}
	}
}

func TestService_ApplyBundledSeed_NormalisesTimezone(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	seed := Calendar{
		Version:  2,
		Timezone: "",
		Events: []RaceEvent{
			{ID: "ev-1", Title: "Race", Sim: "lmu", StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		},
	}

	if err := svc.ApplyBundledSeed(seed); err != nil {
		t.Fatalf("ApplyBundledSeed: %v", err)
	}

	cal := svc.Calendar()
	if cal.Timezone != DefaultTimezone {
		t.Errorf("Timezone = %q, want %q", cal.Timezone, DefaultTimezone)
	}
}

func TestService_ApplyBundledSeed_RejectsInvalidTimezone(t *testing.T) {
	now := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	// Add one bundled event so we can verify it is not removed.
	svc.mu.Lock()
	svc.cal.Events = []RaceEvent{
		{ID: "ev-1", Title: "Race", Sim: "lmu", Source: BundledSource, StartTime: time.Date(2026, time.July, 4, 20, 0, 0, 0, time.UTC), DurationMin: 60},
	}
	svc.mu.Unlock()

	seed := Calendar{
		Version:  2,
		Timezone: "Mars/Olympus", // invalid timezone
		Events: []RaceEvent{
			{ID: "ev-2", Title: "Race 2", Sim: "lmu", StartTime: time.Date(2026, time.July, 5, 20, 0, 0, 0, time.UTC), DurationMin: 60},
		},
	}

	err := svc.ApplyBundledSeed(seed)
	if err == nil {
		t.Fatal("expected timezone error, got nil")
	}
	if !strings.Contains(err.Error(), "Mars/Olympus") {
		t.Errorf("error = %q, want mention of the invalid timezone", err.Error())
	}

	// Calendar must be unchanged.
	cal := svc.Calendar()
	if len(cal.Events) != 1 {
		t.Fatalf("Events = %d, want 1 (unchanged)", len(cal.Events))
	}
	if cal.Events[0].ID != "ev-1" {
		t.Errorf("Event ID = %q, want ev-1", cal.Events[0].ID)
	}
	if cal.Events[0].Source != BundledSource {
		t.Errorf("Source = %q, want %q", cal.Events[0].Source, BundledSource)
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
