package audio

import (
	"testing"
)

func TestQueue_Empty(t *testing.T) {
	q := NewQueue()
	if q.Len() != 0 {
		t.Errorf("expected len 0, got %d", q.Len())
	}
	_, ok := q.Next(1000)
	if ok {
		t.Error("expected ok to be false for empty queue")
	}
}

func TestQueue_ExpiredMessage(t *testing.T) {
	q := NewQueue()

	// Create an expired message
	expiredMsg := Message{
		ID:        "m1",
		TextKey:   "key1",
		Text:      "Expired Msg",
		Priority:  PriorityNormal,
		CreatedAt: 100,
		ExpiresAt: 200,
	}

	// Create a valid message
	validMsg := Message{
		ID:        "m2",
		TextKey:   "key2",
		Text:      "Valid Msg",
		Priority:  PriorityNormal,
		CreatedAt: 100,
		ExpiresAt: 500,
	}

	q.Enqueue(expiredMsg)
	q.Enqueue(validMsg)

	if q.Len() != 2 {
		t.Errorf("expected len 2, got %d", q.Len())
	}

	// At t = 300, m1 is expired, m2 is valid
	msg, ok := q.Next(300)
	if !ok {
		t.Error("expected to retrieve a message")
	}
	if msg.ID != "m2" {
		t.Errorf("expected to get m2, got %s", msg.ID)
	}

	// Queue should now be empty
	if q.Len() != 0 {
		t.Errorf("expected len 0, got %d", q.Len())
	}
}

func TestQueue_Priority(t *testing.T) {
	q := NewQueue()

	normalMsg := Message{
		ID:        "normal",
		Priority:  PriorityNormal,
		CreatedAt: 200,
	}
	spotterMsg := Message{
		ID:        "spotter",
		Priority:  PrioritySpotter,
		CreatedAt: 200,
	}

	// Enqueue normal first, then spotter
	q.Enqueue(normalMsg)
	q.Enqueue(spotterMsg)

	// Next should return spotter first
	msg1, ok := q.Next(300)
	if !ok || msg1.ID != "spotter" {
		t.Errorf("expected spotter first, got %v (ok: %t)", msg1, ok)
	}

	msg2, ok := q.Next(300)
	if !ok || msg2.ID != "normal" {
		t.Errorf("expected normal second, got %v (ok: %t)", msg2, ok)
	}
}

func TestQueue_FIFO(t *testing.T) {
	q := NewQueue()

	msg1 := Message{
		ID:        "msg1",
		Priority:  PrioritySpotter,
		CreatedAt: 100,
	}
	msg2 := Message{
		ID:        "msg2",
		Priority:  PrioritySpotter,
		CreatedAt: 105,
	}
	msg3 := Message{
		ID:        "msg3",
		Priority:  PrioritySpotter,
		CreatedAt: 110,
	}

	// Enqueue them out of order (createdAt-wise)
	q.Enqueue(msg3)
	q.Enqueue(msg1)
	q.Enqueue(msg2)

	// It should sort by CreatedAt ascending, so msg1 -> msg2 -> msg3
	res1, ok := q.Next(300)
	if !ok || res1.ID != "msg1" {
		t.Errorf("expected msg1, got %v", res1)
	}
	res2, ok := q.Next(300)
	if !ok || res2.ID != "msg2" {
		t.Errorf("expected msg2, got %v", res2)
	}
	res3, ok := q.Next(300)
	if !ok || res3.ID != "msg3" {
		t.Errorf("expected msg3, got %v", res3)
	}
}

func TestQueue_FIFO_SameTime(t *testing.T) {
	q := NewQueue()

	// Enqueuing messages with the exact same CreatedAt and Priority
	msg1 := Message{
		ID:        "msg1",
		Priority:  PriorityNormal,
		CreatedAt: 100,
	}
	msg2 := Message{
		ID:        "msg2",
		Priority:  PriorityNormal,
		CreatedAt: 100,
	}

	q.Enqueue(msg1)
	q.Enqueue(msg2)

	res1, ok := q.Next(300)
	if !ok || res1.ID != "msg1" {
		t.Errorf("expected msg1, got %v", res1)
	}
	res2, ok := q.Next(300)
	if !ok || res2.ID != "msg2" {
		t.Errorf("expected msg2, got %v", res2)
	}
}

func TestQueueClearDropsPendingMessages(t *testing.T) {
	q := NewQueue()
	q.Enqueue(Message{ID: "pending", Priority: PriorityNormal, CreatedAt: 1})
	q.Clear()
	if q.Len() != 0 {
		t.Fatalf("queue length = %d, want 0 after boundary reset", q.Len())
	}
	if message, ok := q.Next(2); ok {
		t.Fatalf("Next returned %+v after Clear", message)
	}
}
