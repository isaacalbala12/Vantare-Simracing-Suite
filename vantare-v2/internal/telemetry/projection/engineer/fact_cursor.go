package engineer

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

// FactCursor owns the ordered Engineer fact stream and its bounded resync
// window. Facts never coalesce: a gap is an explicit resync boundary.
type FactCursor struct {
	mu        sync.Mutex
	epoch     schema.Epoch
	sequence  core.FactSequence
	retention boundedFactRetention
	boundary  error
}

func NewFactCursor(capacity int) *FactCursor {
	return &FactCursor{retention: newBoundedFactRetention(capacity)}
}

func (cursor *FactCursor) Append(fact FactEnvelopeV1) error {
	if cursor == nil {
		return &FactResyncRequiredError{Next: fact.Fact.Sequence}
	}
	cursor.mu.Lock()
	defer cursor.mu.Unlock()
	epoch := fact.Epoch
	sequence := fact.Fact.Sequence
	if epoch == 0 || sequence == 0 || epoch < cursor.epoch {
		cursor.boundary = &FactResyncRequiredError{Previous: cursor.sequence, Next: sequence}
		return cursor.boundary
	}
	if epoch > cursor.epoch {
		cursor.epoch = epoch
		cursor.sequence = 0
		cursor.retention.reset()
		cursor.boundary = nil
	} else if cursor.sequence != 0 && sequence != cursor.sequence+1 {
		cursor.boundary = &FactResyncRequiredError{Previous: cursor.sequence, Next: sequence}
		return cursor.boundary
	}
	cursor.sequence = sequence
	cursor.retention.append(fact)
	return nil
}

// ResyncFacts returns the retained suffix strictly after from. If bounded
// retention can no longer prove continuity, it returns FactResyncRequiredError.
func (cursor *FactCursor) ResyncFacts(from core.FactSequence) ([]FactEnvelopeV1, error) {
	if cursor == nil {
		return nil, &FactResyncRequiredError{Previous: from}
	}
	cursor.mu.Lock()
	defer cursor.mu.Unlock()
	if cursor.boundary != nil {
		return nil, cursor.boundary
	}
	if err := cursor.retention.requireResyncAfter(from); err != nil {
		return nil, err
	}
	return cursor.retention.after(from), nil
}

func (cursor *FactCursor) Current() (schema.Epoch, core.FactSequence) {
	if cursor == nil {
		return 0, 0
	}
	cursor.mu.Lock()
	defer cursor.mu.Unlock()
	return cursor.epoch, cursor.sequence
}
