package identity

import "testing"

func TestSlotTrackerGraceAndFingerprint(t *testing.T) {
	t.Parallel()
	fingerprint := SlotFingerprint{SourceKey: "7", Driver: "A", Class: "GT3"}
	tracker := NewSlotTracker[int](2)
	if got := tracker.Observe(7, fingerprint, 1); got.Generation != 1 || !got.Bumped {
		t.Fatalf("first Observe() = %+v", got)
	}
	if got := tracker.Observe(7, fingerprint, 3); got.Generation != 1 || !got.Reopened || got.Bumped {
		t.Fatalf("grace reopen = %+v", got)
	}
	changed := fingerprint
	changed.Driver = "B"
	if got := tracker.Observe(7, changed, 5); got.Generation != 2 || !got.Bumped {
		t.Fatalf("changed fingerprint = %+v", got)
	}
	if got := tracker.Observe(7, changed, 9); got.Generation != 3 || !got.Bumped {
		t.Fatalf("expired grace = %+v", got)
	}
}
