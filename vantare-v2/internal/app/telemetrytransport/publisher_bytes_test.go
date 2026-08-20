package telemetrytransport

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func bytesWindowPublisher(t *testing.T, window time.Duration, clock *time.Time) *Publisher {
	t.Helper()
	publisher, err := newPublisher(PublisherConfig{
		Product:     ProductOverlayV2,
		BytesWindow: window,
		Now:         func() time.Time { return *clock },
	})
	if err != nil {
		t.Fatalf("newPublisher: %v", err)
	}
	return publisher
}

func TestBytesPerSecondUsesAMovingWindow(t *testing.T) {
	t.Parallel()

	clock := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	publisher := bytesWindowPublisher(t, time.Second, &clock)
	payload := json.RawMessage(`{"pad":"` + strings.Repeat("x", 1000) + `"}`)
	size := len(payload)

	for tick := range 10 {
		clock = clock.Add(100 * time.Millisecond)
		if err := publisher.PublishSnapshot(uint64(tick+1), payload); err != nil {
			t.Fatalf("publish %d: %v", tick, err)
		}
	}
	metrics := publisher.Metrics()
	if metrics.SnapshotBytes != uint64(10*size) {
		t.Fatalf("SnapshotBytes=%d, want %d", metrics.SnapshotBytes, 10*size)
	}
	if metrics.BytesPerSecond != uint64(10*size) {
		t.Fatalf("BytesPerSecond=%d, want %d", metrics.BytesPerSecond, 10*size)
	}

	// Half the cadence: half the bytes per second, without touching the total.
	for tick := range 5 {
		clock = clock.Add(200 * time.Millisecond)
		if err := publisher.PublishSnapshot(uint64(11+tick), payload); err != nil {
			t.Fatalf("publish slow %d: %v", tick, err)
		}
	}
	metrics = publisher.Metrics()
	if metrics.BytesPerSecond != uint64(5*size) {
		t.Fatalf("regulated BytesPerSecond=%d, want %d", metrics.BytesPerSecond, 5*size)
	}
	if metrics.SnapshotBytes != uint64(15*size) {
		t.Fatalf("SnapshotBytes=%d, want %d", metrics.SnapshotBytes, 15*size)
	}

	// The window drains when nothing is published.
	clock = clock.Add(2 * time.Second)
	if rate := publisher.Metrics().BytesPerSecond; rate != 0 {
		t.Fatalf("idle BytesPerSecond=%d, want 0", rate)
	}
}

// TestBytesPerSecondIgnoresStatusEvents keeps the byte rate a measure of the
// regulated snapshot path. Status is published on change, never on a cadence.
func TestBytesPerSecondIgnoresStatusEvents(t *testing.T) {
	t.Parallel()

	clock := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	publisher := bytesWindowPublisher(t, time.Second, &clock)
	for tick := range 4 {
		clock = clock.Add(100 * time.Millisecond)
		if err := publisher.PublishStatus(uint64(tick+1), json.RawMessage(`{"state":"connected"}`)); err != nil {
			t.Fatalf("publish status %d: %v", tick, err)
		}
	}
	metrics := publisher.Metrics()
	if metrics.BytesPerSecond != 0 || metrics.SnapshotBytes != 0 {
		t.Fatalf("status must not count as regulated payload: %#v", metrics)
	}
	if metrics.StatusPublications != 4 {
		t.Fatalf("StatusPublications=%d, want 4", metrics.StatusPublications)
	}
}

func TestRejectedPayloadDoesNotCountBytes(t *testing.T) {
	t.Parallel()

	clock := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	publisher, err := newPublisher(PublisherConfig{
		Product: ProductOverlayV2, MaxPayloadBytes: 64,
		BytesWindow: time.Second, Now: func() time.Time { return clock },
	})
	if err != nil {
		t.Fatalf("newPublisher: %v", err)
	}
	oversized := json.RawMessage(`{"pad":"` + strings.Repeat("x", 512) + `"}`)
	if err := publisher.PublishSnapshot(1, oversized); err == nil {
		t.Fatalf("oversized payload must be rejected")
	}
	metrics := publisher.Metrics()
	if metrics.SnapshotBytes != 0 || metrics.BytesPerSecond != 0 {
		t.Fatalf("a dropped frame must not count bytes: %#v", metrics)
	}
	if metrics.DroppedFrames != 1 {
		t.Fatalf("DroppedFrames=%d, want 1", metrics.DroppedFrames)
	}
}
