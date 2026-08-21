package radio

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
)

func TestMetricsSnapshotJSONContract(t *testing.T) {
	payload, err := json.Marshal(MetricsSnapshot{Samples: 3, P95MS: 12, MaximumMS: 18})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"samples":3,"p95MS":12,"maximumMS":18}`
	if string(payload) != want {
		t.Fatalf("metrics JSON = %s, want %s", payload, want)
	}
}

type recordingUI struct {
	mu            sync.Mutex
	presentations []Presentation
	err           error
}

func (ui *recordingUI) PublishRadio(_ context.Context, p Presentation) error {
	ui.mu.Lock()
	defer ui.mu.Unlock()
	ui.presentations = append(ui.presentations, p)
	return ui.err
}

type fakeAudioResolver struct {
	path string
	err  error
}

func (resolver fakeAudioResolver) ResolveCached(context.Context, string, audio.Channel) (string, error) {
	return resolver.path, resolver.err
}

type fakePlayer struct {
	played int
	err    error
}

func (player *fakePlayer) PlayContext(context.Context, string) error {
	player.played++
	return player.err
}

func deliveryFixture(t testing.TB) (RadioMessage, *Resolver) {
	t.Helper()
	resolver := NewResolver()
	registerTestIntent(t, resolver)
	message := testMessage("message", "spotter.car", "car", PriorityP0, 100)
	message.Payload = map[string]string{"side": "left"}
	return message, resolver
}

func TestSessionTransitions(t *testing.T) {
	message, _ := deliveryFixture(t)
	clock := newFakeClock(100)
	metrics := NewMetrics(8)
	request := Request{Version: VersionV1, DeliveryID: "delivery", DecidedAtMS: 100, Message: message}
	session, err := NewSession(request, clock, metrics, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, step := range []struct {
		state  State
		reason Reason
	}{{StateQueued, ReasonNone}, {StateStarted, ReasonNone}, {StateCompleted, ReasonNone}} {
		if err := session.Acknowledge(step.state, step.reason); err != nil {
			t.Fatalf("Acknowledge(%s) = %v", step.state, err)
		}
	}
	if err := session.Acknowledge(StateFailed, ReasonTransportError); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("terminal transition = %v", err)
	}
	if snapshot := metrics.Snapshot(); snapshot.Samples != 1 || snapshot.P95MS != 0 {
		t.Fatalf("metrics = %+v", snapshot)
	}
}

func TestDualPortAlwaysPublishesUIAndUsesOptionalAudio(t *testing.T) {
	message, resolver := deliveryFixture(t)
	clock := newFakeClock(100)
	for _, test := range []struct {
		name, path string
		resolveErr error
		wantPlayed int
	}{{"cache hit", "cached.wav", nil, 1}, {"cache miss", "", nil, 0}, {"cache error degrades", "", errors.New("cache"), 0}} {
		t.Run(test.name, func(t *testing.T) {
			ui := &recordingUI{}
			player := &fakePlayer{}
			port := DualPort{Resolver: resolver, UI: ui, Audio: fakeAudioResolver{path: test.path, err: test.resolveErr}, Player: player, Clock: clock}
			var states []State
			session, err := NewSession(Request{Version: VersionV1, DeliveryID: "delivery", DecidedAtMS: 100, Message: message}, clock, NewMetrics(8), func(ack Acknowledgement) error { states = append(states, ack.State); return nil })
			if err != nil {
				t.Fatal(err)
			}
			if err := port.Deliver(context.Background(), session.request, session); err != nil {
				t.Fatalf("Deliver() error = %v", err)
			}
			if len(ui.presentations) != 1 || player.played != test.wantPlayed {
				t.Fatalf("UI=%d played=%d", len(ui.presentations), player.played)
			}
			want := []State{StateQueued, StateStarted, StateCompleted}
			for index := range want {
				if states[index] != want[index] {
					t.Fatalf("states = %v", states)
				}
			}
		})
	}
}

func TestDualPortCancellationBeforeStarted(t *testing.T) {
	message, resolver := deliveryFixture(t)
	cases := []struct {
		name       string
		context    func() context.Context
		now        int64
		wantReason Reason
	}{
		{"lifecycle", func() context.Context { ctx, cancel := context.WithCancel(context.Background()); cancel(); return ctx }, 100, ReasonLifecycleBoundary},
		{"deadline", context.Background, 1_100, ReasonDeadlineElapsed},
		{"spotter", func() context.Context {
			ctx, cancel := context.WithCancelCause(context.Background())
			cancel(ErrPreemptedBySpotter)
			return ctx
		}, 100, ReasonPreemptedBySpotter},
		{"source", func() context.Context {
			ctx, cancel := context.WithCancelCause(context.Background())
			cancel(ErrSourceUnavailable)
			return ctx
		}, 100, ReasonSourceUnavailable},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			clock := newFakeClock(test.now)
			var acks []Acknowledgement
			request := Request{Version: VersionV1, DeliveryID: "delivery", DecidedAtMS: 100, Message: message}
			session, err := NewSession(request, newFakeClock(100), NewMetrics(8), func(ack Acknowledgement) error { acks = append(acks, ack); return nil })
			if err != nil {
				t.Fatal(err)
			}
			port := DualPort{Resolver: resolver, UI: &recordingUI{}, Clock: clock}
			if err := port.Deliver(test.context(), request, session); err != nil {
				t.Fatalf("Deliver() error = %v", err)
			}
			if len(acks) != 2 || acks[0].State != StateQueued || acks[1].State != StateCancelled || acks[1].Reason != test.wantReason {
				t.Fatalf("acks = %+v", acks)
			}
		})
	}
}

type blockingPlayer struct{ started chan struct{} }

func (player blockingPlayer) PlayContext(ctx context.Context, _ string) error {
	close(player.started)
	<-ctx.Done()
	return ctx.Err()
}

func TestDeliveryIsInterruptedBySpotter(t *testing.T) {
	clock := newFakeClock(100)
	bus := newTestBus(t, DefaultLimits(), clock)
	message, resolver := deliveryFixture(t)
	message.ID = "active"
	message.Intent = "spotter.car"
	message.Priority = PriorityP1
	// Register a non-Spotter priority definition in a separate resolver.
	resolver = NewResolver()
	phrases := validPhrases()
	if err := resolver.Register("spotter.car", Definition{Family: "engineer", Priority: PriorityP1, Role: "advice", Channel: audio.ChannelEngineer, Severity: "info", ParamKeys: []string{"side"}}, phrases); err != nil {
		t.Fatal(err)
	}
	_, _ = bus.Submit(message)
	item, _ := bus.Next(context.Background())
	started := make(chan struct{})
	ui := &recordingUI{}
	port := DualPort{Resolver: resolver, UI: ui, Audio: fakeAudioResolver{path: "cached.wav"}, Player: blockingPlayer{started: started}, Clock: clock}
	var states []State
	session, _ := NewSession(Request{Version: VersionV1, DeliveryID: "active-delivery", DecidedAtMS: 100, Message: item.Message}, clock, NewMetrics(8), func(ack Acknowledgement) error { states = append(states, ack.State); return nil })
	done := make(chan error, 1)
	go func() { done <- port.Deliver(item.Context, session.request, session) }()
	<-started
	spotter := testMessage("spotter", "spotter.alert", "car", PriorityP0, 100)
	result, err := bus.Submit(spotter)
	if err != nil || !result.ActivePreempted {
		t.Fatalf("Submit spotter = %+v, %v", result, err)
	}
	if err := <-done; err != nil {
		t.Fatalf("Deliver returned %v", err)
	}
	item.Done()
	if got := states[len(states)-1]; got != StateInterrupted {
		t.Fatalf("states = %v", states)
	}
}
