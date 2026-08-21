package audio

import (
	"sort"
	"sync"
)

type Queue struct {
	mu       sync.Mutex
	messages []Message
}

func NewQueue() *Queue {
	return &Queue{
		messages: make([]Message, 0),
	}
}

func (q *Queue) Enqueue(msg Message) {
	q.mu.Lock()
	defer q.mu.Unlock()

	q.messages = append(q.messages, msg)

	// Sort by Priority descending, then CreatedAt ascending.
	// Since we want stable FIFO, sort.SliceStable is perfect.
	sort.SliceStable(q.messages, func(i, j int) bool {
		if q.messages[i].Priority != q.messages[j].Priority {
			return q.messages[i].Priority > q.messages[j].Priority
		}
		return q.messages[i].CreatedAt < q.messages[j].CreatedAt
	})
}

func (q *Queue) Next(nowMS int64) (Message, bool) {
	q.mu.Lock()
	defer q.mu.Unlock()

	for len(q.messages) > 0 {
		msg := q.messages[0]
		if msg.ExpiresAt > 0 && nowMS >= msg.ExpiresAt {
			q.messages[0] = Message{} // Avoid memory leak
			q.messages = q.messages[1:]
			continue
		}
		q.messages[0] = Message{} // Avoid memory leak
		q.messages = q.messages[1:]
		return msg, true
	}

	return Message{}, false
}

func (q *Queue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.messages)
}

// Clear removes pending messages at a session, vehicle or connection
// boundary. Already-playing audio is owned by the player and is unaffected.
func (q *Queue) Clear() {
	q.mu.Lock()
	defer q.mu.Unlock()
	clear(q.messages)
	q.messages = q.messages[:0]
}

// ClearCategory removes only pending work owned by one legacy producer.
func (q *Queue) ClearCategory(category Category) {
	q.mu.Lock()
	defer q.mu.Unlock()
	kept := q.messages[:0]
	for _, message := range q.messages {
		if message.Category == category {
			continue
		}
		kept = append(kept, message)
	}
	clear(q.messages[len(kept):])
	q.messages = kept
}
