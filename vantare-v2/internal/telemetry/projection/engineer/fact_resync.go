package engineer

import (
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
)

var ErrFactResyncRequired = errors.New("engineer fact subscriber requires a full snapshot resync")

// FactResyncRequiredError is the explicit loss strategy for an Engineer facts
// consumer that fell behind bounded retention. Previous is the last fact it
// accepted; Next is the first still retained fact. The consumer must fetch a
// full snapshot before resuming.
type FactResyncRequiredError struct {
	Previous core.FactSequence
	Next     core.FactSequence
}

func (err *FactResyncRequiredError) Error() string {
	return fmt.Sprintf("%v: fact %d followed by retained fact %d",
		ErrFactResyncRequired, err.Previous, err.Next)
}

func (err *FactResyncRequiredError) Unwrap() error { return ErrFactResyncRequired }

// boundedFactRetention preserves the ordered facts contract needed by the
// Engineer port without reviving core.Fanout. The future F7 delivery boundary
// owns synchronization; this helper only owns a fixed-size ring.
type boundedFactRetention struct {
	facts []FactEnvelopeV1
	head  int
	len   int
}

func newBoundedFactRetention(capacity int) boundedFactRetention {
	if capacity < 1 {
		capacity = 1
	}
	return boundedFactRetention{facts: make([]FactEnvelopeV1, capacity)}
}

func (retention *boundedFactRetention) append(fact FactEnvelopeV1) {
	if retention.len < len(retention.facts) {
		index := (retention.head + retention.len) % len(retention.facts)
		retention.facts[index] = fact
		retention.len++
		return
	}
	retention.facts[retention.head] = fact
	retention.head = (retention.head + 1) % len(retention.facts)
}

func (retention *boundedFactRetention) requireResyncAfter(previous core.FactSequence) error {
	if retention.len == 0 {
		return nil
	}
	next := retention.facts[retention.head].Fact.Sequence
	if previous >= next-1 {
		return nil
	}
	return &FactResyncRequiredError{Previous: previous, Next: next}
}

// F7 delivery uses a channel with capacity one and a non-blocking send: drain
// the pending snapshot before sending the newest one. That cap-1 + drop-oldest
// pattern is intentionally the one formerly implemented by core.Fanout at
// fanout.go:210-217; ordered facts use this bounded ring and explicit resync.
