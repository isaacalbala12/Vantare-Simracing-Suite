package v1

import (
	"fmt"
	"time"
)

type Liveness string

const (
	LivenessWaiting Liveness = "waiting"
	LivenessLive    Liveness = "live"
	LivenessStale   Liveness = "stale"
)

// Receiver validates continuity without retaining payloads. receivedAt must
// come from the caller's local monotonic clock; CapturedAt is never consulted.
type Receiver struct {
	initialized bool
	epoch       uint64
	revision    uint64
	sessionID   string
	receivedAt  time.Time
}

func (receiver *Receiver) Accept(update RemoteCanonicalUpdateV1, receivedAt time.Time) error {
	if err := Validate(update); err != nil {
		return err
	}
	if receivedAt.IsZero() {
		return ErrInvalidReceivedAt
	}
	if receiver.initialized {
		if receivedAt.Before(receiver.receivedAt) {
			return ErrReceivedAtRegression
		}
		switch {
		case update.StreamEpoch < receiver.epoch:
			return fmt.Errorf("%w: %d < %d", ErrEpochRegression, update.StreamEpoch, receiver.epoch)
		case update.StreamEpoch == receiver.epoch:
			if update.SessionID != receiver.sessionID {
				return ErrSessionChangedWithinEpoch
			}
			if update.Revision <= receiver.revision {
				return fmt.Errorf("%w: %d <= %d", ErrRevisionNotIncreasing, update.Revision, receiver.revision)
			}
		}
	}
	receiver.initialized = true
	receiver.epoch = update.StreamEpoch
	receiver.revision = update.Revision
	receiver.sessionID = update.SessionID
	receiver.receivedAt = receivedAt
	return nil
}

func (receiver Receiver) Liveness(now time.Time, staleAfter time.Duration) Liveness {
	if !receiver.initialized || now.IsZero() || staleAfter <= 0 {
		return LivenessWaiting
	}
	if now.Before(receiver.receivedAt) {
		return LivenessWaiting
	}
	age := now.Sub(receiver.receivedAt)
	if age >= staleAfter {
		return LivenessStale
	}
	return LivenessLive
}
