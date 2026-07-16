//go:build windows

package audio

import (
	"testing"
	"time"
)

func TestQueuePlayerPipeline(t *testing.T) {
	rp := NewRecorderPlayer()
	q := NewQueue()

	now := time.Now().UnixMilli()
	msg1 := Message{
		ID:        "msg1",
		TextKey:   "spotter.car_left",
		Priority:  PrioritySpotter,
		CreatedAt: now,
		ExpiresAt: now + 30000,
	}
	msg2 := Message{
		ID:        "msg2",
		TextKey:   "spotter.clear_left",
		Priority:  PrioritySpotter,
		CreatedAt: now,
		ExpiresAt: now + 30000,
	}
	q.Enqueue(msg1)
	q.Enqueue(msg2)

	if q.Len() != 2 {
		t.Fatalf("expected queue len 2, got %d", q.Len())
	}

	processed := 0
	for q.Len() > 0 {
		msg, ok := q.Next(time.Now().UnixMilli())
		if !ok {
			break
		}
		processed++
		err := rp.Play(msg.TextKey + ".mp3")
		if err != nil {
			t.Errorf("Play failed for %s: %v", msg.TextKey, err)
		}
	}

	if processed != 2 {
		t.Errorf("expected 2 messages processed, got %d", processed)
	}

	if q.Len() != 0 {
		t.Errorf("expected empty queue, got %d", q.Len())
	}

	if len(rp.Played()) != 2 {
		t.Errorf("expected 2 plays recorded, got %d: %v", len(rp.Played()), rp.Played())
	}
}

func TestQueueExpiryBeforePlay(t *testing.T) {
	q := NewQueue()

	now := time.Now().UnixMilli()
	msg := Message{
		ID:        "expired",
		TextKey:   "spotter.car_left",
		Priority:  PrioritySpotter,
		CreatedAt: now - 5000,
		ExpiresAt: now - 1000,
	}
	q.Enqueue(msg)

	_, ok := q.Next(now)
	if ok {
		t.Error("expected expired message to be skipped, but it was returned")
	}

	if q.Len() != 0 {
		t.Errorf("expected empty queue after expiry, got %d", q.Len())
	}
}
