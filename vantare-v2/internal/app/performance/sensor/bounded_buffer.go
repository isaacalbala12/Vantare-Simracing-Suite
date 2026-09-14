package sensor

import "sync"

type boundedBuffer struct {
	mu    sync.Mutex
	limit int
	data  []byte
}

func newBoundedBuffer(limit int) *boundedBuffer {
	return &boundedBuffer{limit: limit}
}

func (buffer *boundedBuffer) Write(value []byte) (int, error) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	written := len(value)
	if buffer.limit <= 0 {
		return written, nil
	}
	if len(value) >= buffer.limit {
		buffer.data = append(buffer.data[:0], value[len(value)-buffer.limit:]...)
		return written, nil
	}
	buffer.data = append(buffer.data, value...)
	if excess := len(buffer.data) - buffer.limit; excess > 0 {
		copy(buffer.data, buffer.data[excess:])
		buffer.data = buffer.data[:buffer.limit]
	}
	return written, nil
}

func (buffer *boundedBuffer) String() string {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return string(buffer.data)
}
