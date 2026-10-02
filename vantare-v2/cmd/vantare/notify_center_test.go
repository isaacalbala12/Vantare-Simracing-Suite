package main

import (
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/notify"
)

// A checksum-style error runs well past the dedupe bound: the record must
// still reach the center (hashed key, truncated cause), not vanish.
func TestPublishUpdaterErrorSurvivesLongMessages(t *testing.T) {
	center := notify.NewCenter(notify.CenterOptions{})
	long := "checksum mismatch: " + strings.Repeat("0123456789abcdef", 16)
	publishUpdaterError(center, long)

	snap := center.Snapshot()
	if len(snap.Records) != 1 {
		t.Fatalf("records=%d, want the long error stored", len(snap.Records))
	}
	if snap.Records[0].ConcreteCause == "" || len(snap.Records[0].DedupeKey) > 160 {
		t.Fatalf("bad record: %+v", snap.Records[0])
	}
}

// The same failure twice is one entry; a different failure is a second one.
func TestPublishUpdaterErrorDedupesByMessage(t *testing.T) {
	center := notify.NewCenter(notify.CenterOptions{})
	publishUpdaterError(center, "boom")
	publishUpdaterError(center, "boom")
	publishUpdaterError(center, "different boom")

	if got := len(center.Snapshot().Records); got != 2 {
		t.Fatalf("records=%d, want 2", got)
	}
}
