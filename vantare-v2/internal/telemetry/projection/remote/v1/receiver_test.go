package v1

import (
	"errors"
	"testing"
	"time"
)

func TestReceiverAcceptsFirstFullGapsAndNewEpoch(t *testing.T) {
	receiver := Receiver{}
	update := mustProject(t, representativeSnapshot(t))
	receivedAt := time.Unix(100, 0)

	if got := receiver.Liveness(receivedAt, time.Second); got != LivenessWaiting {
		t.Fatalf("initial liveness = %q, want %q", got, LivenessWaiting)
	}
	if err := receiver.Accept(update, receivedAt); err != nil {
		t.Fatalf("accept first full: %v", err)
	}

	update.Revision += 8
	if err := receiver.Accept(update, receivedAt.Add(time.Second)); err != nil {
		t.Fatalf("accept latest-wins gap: %v", err)
	}
	if err := receiver.Accept(update, receivedAt.Add(2*time.Second)); !errors.Is(err, ErrRevisionNotIncreasing) {
		t.Fatalf("accept duplicate error = %v", err)
	}
	update.Revision--
	if err := receiver.Accept(update, receivedAt.Add(2*time.Second)); !errors.Is(err, ErrRevisionNotIncreasing) {
		t.Fatalf("accept rollback error = %v", err)
	}

	update.StreamEpoch++
	update.Revision = 3
	update.SessionID = "remote-session-after-restart"
	if err := receiver.Accept(update, receivedAt.Add(2*time.Second)); err != nil {
		t.Fatalf("accept new epoch with a different session and skipped revisions: %v", err)
	}
	update.StreamEpoch--
	update.Revision = 100
	if err := receiver.Accept(update, receivedAt.Add(3*time.Second)); !errors.Is(err, ErrEpochRegression) {
		t.Fatalf("accept old epoch error = %v", err)
	}
}

func TestReceiverRejectsSessionChangeWithinEpochWithoutAdvancing(t *testing.T) {
	receiver := Receiver{}
	update := mustProject(t, representativeSnapshot(t))
	receivedAt := time.Unix(100, 0)
	if err := receiver.Accept(update, receivedAt); err != nil {
		t.Fatal(err)
	}

	originalSessionID := update.SessionID
	update.SessionID = "different-session"
	update.Revision++
	if err := receiver.Accept(update, receivedAt.Add(time.Second)); !errors.Is(err, ErrSessionChangedWithinEpoch) {
		t.Fatalf("Accept(session change in same epoch) error = %v, want %v", err, ErrSessionChangedWithinEpoch)
	}

	update.SessionID = originalSessionID
	update.Revision++
	if err := receiver.Accept(update, receivedAt.Add(2*time.Second)); err != nil {
		t.Fatalf("accept original session after rejected change: %v", err)
	}
}

func TestReceiverRequiresAValidFullBeforeChangingState(t *testing.T) {
	receiver := Receiver{}
	update := mustProject(t, representativeSnapshot(t))
	update.Kind = "delta"
	if err := receiver.Accept(update, time.Unix(100, 0)); !errors.Is(err, ErrUnsupportedKind) {
		t.Fatalf("Accept(delta) error = %v", err)
	}
	if got := receiver.Liveness(time.Unix(101, 0), time.Second); got != LivenessWaiting {
		t.Fatalf("liveness after rejected first update = %q", got)
	}
}

func TestReceiverLivenessUsesOnlyLocalReceiptTime(t *testing.T) {
	receiver := Receiver{}
	update := mustProject(t, representativeSnapshot(t))
	update.CapturedAt = "2126-08-27T02:03:04Z"
	receivedAt := time.Unix(1_000, 0)
	if err := receiver.Accept(update, receivedAt); err != nil {
		t.Fatal(err)
	}
	if got := receiver.Liveness(receivedAt.Add(999*time.Millisecond), time.Second); got != LivenessLive {
		t.Fatalf("liveness before threshold = %q, want %q", got, LivenessLive)
	}
	if got := receiver.Liveness(receivedAt.Add(time.Second), time.Second); got != LivenessStale {
		t.Fatalf("liveness at threshold = %q, want %q", got, LivenessStale)
	}
	if got := receiver.Liveness(receivedAt.Add(-time.Nanosecond), time.Second); got != LivenessWaiting {
		t.Fatalf("liveness before local receipt = %q, want fail-safe %q", got, LivenessWaiting)
	}
}

func TestReceiverRejectsLocalReceiptTimeRegression(t *testing.T) {
	receiver := Receiver{}
	update := mustProject(t, representativeSnapshot(t))
	if err := receiver.Accept(update, time.Unix(100, 0)); err != nil {
		t.Fatal(err)
	}
	update.Revision++
	if err := receiver.Accept(update, time.Unix(99, 0)); !errors.Is(err, ErrReceivedAtRegression) {
		t.Fatalf("Accept(regressed receipt time) error = %v", err)
	}
}
