package delivery

import (
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
)

type testClock struct{ now int64 }

func (clock *testClock) NowMS() int64 { return clock.now }

func TestSessionAcknowledgementLifecycle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		states []State
		reason Reason
	}{
		{name: "completed", states: []State{StateQueued, StateStarted, StateCompleted}},
		{name: "interrupted", states: []State{StateQueued, StateStarted, StateInterrupted}, reason: ReasonPreemptedBySpotter},
		{name: "failed before start", states: []State{StateQueued, StateFailed}, reason: ReasonTransportError},
		{name: "cancelled before start", states: []State{StateQueued, StateCancelled}, reason: ReasonLifecycleBoundary},
		{name: "cancelled after start", states: []State{StateQueued, StateStarted, StateCancelled}, reason: ReasonLifecycleBoundary},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			clock := &testClock{now: 1_010}
			metrics := NewMetrics(8)
			var got []Acknowledgement
			session, err := NewSession(requestFixture(), clock, metrics, func(ack Acknowledgement) error {
				got = append(got, ack)
				return nil
			})
			if err != nil {
				t.Fatalf("NewSession() error = %v", err)
			}
			for _, state := range tt.states {
				reason := ReasonNone
				if terminal(state) {
					reason = tt.reason
				}
				if err := session.Acknowledge(state, reason); err != nil {
					t.Fatalf("Acknowledge(%s) error = %v", state, err)
				}
				clock.now++
			}
			if len(got) != len(tt.states) || got[len(got)-1].State != tt.states[len(tt.states)-1] {
				t.Fatalf("acknowledgements = %+v", got)
			}
			if !session.Terminal() {
				t.Fatal("session did not reach a terminal state")
			}
		})
	}
}

func TestSessionRejectsInvalidTransitionsAndUnboundedReasons(t *testing.T) {
	t.Parallel()

	session, err := NewSession(requestFixture(), &testClock{now: 1_010}, NewMetrics(4), nil)
	if err != nil {
		t.Fatalf("NewSession() error = %v", err)
	}
	if err := session.Acknowledge(StateStarted, ReasonNone); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("started before queued error = %v", err)
	}
	if err := session.Acknowledge(StateQueued, Reason("raw-user-or-device-payload")); !errors.Is(err, ErrInvalidReason) {
		t.Fatalf("unbounded reason error = %v", err)
	}
	if err := session.Acknowledge(StateQueued, ReasonTransportError); !errors.Is(err, ErrInvalidReason) {
		t.Fatalf("queued with failure reason error = %v", err)
	}
	if err := session.Acknowledge(StateQueued, ReasonNone); err != nil {
		t.Fatalf("queued error = %v", err)
	}
	if err := session.Acknowledge(StateStarted, ReasonNone); err != nil {
		t.Fatalf("started error = %v", err)
	}
	if err := session.Acknowledge(StateCompleted, ReasonNone); err != nil {
		t.Fatalf("completed error = %v", err)
	}
	if err := session.Acknowledge(StateStarted, ReasonNone); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("transition after terminal error = %v", err)
	}
}

func TestSessionGuardCanRejectStartBeforeTransportBegins(t *testing.T) {
	t.Parallel()

	guardErr := errors.New("decision became stale")
	session, err := NewSession(requestFixture(), &testClock{now: 1_010}, NewMetrics(4), func(ack Acknowledgement) error {
		if ack.State == StateStarted {
			return guardErr
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := session.Acknowledge(StateQueued, ReasonNone); err != nil {
		t.Fatal(err)
	}
	if err := session.Acknowledge(StateStarted, ReasonNone); !errors.Is(err, guardErr) {
		t.Fatalf("start guard error = %v", err)
	}
	if session.Terminal() {
		t.Fatal("rejected start changed the session to terminal")
	}
	if err := session.Acknowledge(StateCancelled, ReasonDeadlineElapsed); err != nil {
		t.Fatalf("cancel after rejected start error = %v", err)
	}
}

func TestMetricsAreBoundedAndContainNoPayload(t *testing.T) {
	t.Parallel()

	clock := &testClock{now: 1_010}
	metrics := NewMetrics(2)
	for index := 0; index < 3; index++ {
		request := requestFixture()
		request.DeliveryID = string(rune('a' + index))
		session, err := NewSession(request, clock, metrics, nil)
		if err != nil {
			t.Fatalf("NewSession() error = %v", err)
		}
		if err := session.Acknowledge(StateQueued, ReasonNone); err != nil {
			t.Fatal(err)
		}
		clock.now += int64(index + 1)
		if err := session.Acknowledge(StateStarted, ReasonNone); err != nil {
			t.Fatal(err)
		}
		if err := session.Acknowledge(StateCompleted, ReasonNone); err != nil {
			t.Fatal(err)
		}
		clock.now++
	}

	snapshot := metrics.Snapshot()
	if snapshot.Started != 3 || snapshot.Completed != 3 {
		t.Fatalf("metrics = %+v", snapshot)
	}
	if snapshot.DecisionToStartSamples != 2 {
		t.Fatalf("bounded samples = %d, want 2", snapshot.DecisionToStartSamples)
	}
	if snapshot.DecisionToStartP95MS <= 0 {
		t.Fatalf("p95 = %d, want positive", snapshot.DecisionToStartP95MS)
	}
	if snapshot.DecisionToStartMaximumMS != 18 {
		t.Fatalf("decision-to-start max = %d, want 18", snapshot.DecisionToStartMaximumMS)
	}
}

func requestFixture() Request {
	return Request{
		Version:     ContractVersionV1,
		DeliveryID:  "delivery-1",
		DecidedAtMS: 1_000,
		Decision: messagepolicy.Decision{
			Version:     messagepolicy.ContractVersionV1,
			CandidateID: "candidate-1",
			Family:      messagepolicy.FamilySpotter,
			Intent:      messagepolicy.IntentSpotterCarLeft,
			Subject:     "player",
			Priority:    messagepolicy.PrioritySpotter,
			CreatedAtMS: 900,
			ExpiresAtMS: 2_000,
		},
	}
}
