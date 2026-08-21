package voiceinput

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/commands"
	"github.com/vantare/overlays/v2/internal/engineer/ptt"
)

type fakeHost struct {
	mu         sync.Mutex
	text       string
	wake       chan string
	started    bool
	active     bool
	finish     chan struct{}
	finishOnce sync.Once
}

func newFakeHost(text string) *fakeHost {
	return &fakeHost{text: text, wake: make(chan string, 1), finish: make(chan struct{})}
}

func (host *fakeHost) Start(context.Context) error {
	host.mu.Lock()
	host.started = true
	host.mu.Unlock()
	return nil
}
func (host *fakeHost) Begin(context.Context, Capture) error {
	host.mu.Lock()
	host.active = true
	host.mu.Unlock()
	return nil
}
func (host *fakeHost) Finish(context.Context, Capture) (string, error) {
	host.mu.Lock()
	host.active = false
	host.mu.Unlock()
	host.finishOnce.Do(func() { close(host.finish) })
	return host.text, nil
}
func (host *fakeHost) Cancel(context.Context, Capture) error {
	host.mu.Lock()
	host.active = false
	host.mu.Unlock()
	return nil
}
func (host *fakeHost) Stop(context.Context) error {
	host.mu.Lock()
	host.started = false
	host.mu.Unlock()
	return nil
}
func (host *fakeHost) WakeEvents() <-chan string { return host.wake }

type readyReader struct {
	ready chan struct{}
	once  sync.Once
}

func (reader *readyReader) Read(context.Context, ptt.Binding) (ptt.DeviceSample, error) {
	reader.once.Do(func() { close(reader.ready) })
	return ptt.DeviceSample{Connected: true, Focused: true}, nil
}

type freshQueryPort struct{}

func (freshQueryPort) ResolveQuery(_ context.Context, request commands.QueryRequest) (commands.QueryResult, error) {
	return commands.QueryResult{State: commands.QueryFresh, ResponseKey: "response.fuel", Values: map[string]string{"litres": "12"}, Evidence: commands.CommandEvidence{Lifecycle: request.Lifecycle, Sequence: 1, FreshUntilMS: request.AtMS + 5_000}}, nil
}

type recordingPublisher struct{ turns chan commands.Turn }

func (publisher recordingPublisher) PublishVoiceTurn(_ context.Context, turn commands.Turn, _ commands.Locale) error {
	publisher.turns <- turn
	return nil
}

func testConfig(host Host, reader ptt.Reader, publisher TurnPublisher) Config {
	return Config{
		Enabled: true, Locale: commands.LocaleSpanish,
		Binding: ptt.Binding{DeviceKind: ptt.DeviceKeyboard, DeviceID: "keyboard-0", Control: "f24", Scope: ptt.ScopeGlobal},
		Reader:  reader, Host: host, QueryPort: freshQueryPort{}, Publisher: publisher,
		MaxWindow: DefaultMaxWindow, PollInterval: time.Hour,
		Lifecycle: func() commands.DialogueLifecycle {
			return commands.DialogueLifecycle{SessionID: "session", DriverID: "driver", SourceID: "source", Epoch: 1}
		},
	}
}

func TestRuntimeDefaultOffDoesNotStartHost(t *testing.T) {
	host := newFakeHost("dime el combustible")
	runtime, err := New(Config{Enabled: false, Host: host})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if health := runtime.Health(); health.State != StateDisabled || health.Enabled {
		t.Fatalf("health = %+v", health)
	}
	host.mu.Lock()
	defer host.mu.Unlock()
	if host.started {
		t.Fatal("disabled runtime started the child host")
	}
}

func TestRuntimePTTTranscribesQueryAndPublishesOnlyRouterTurn(t *testing.T) {
	host := newFakeHost("dime el combustible")
	reader := &readyReader{ready: make(chan struct{})}
	publisher := recordingPublisher{turns: make(chan commands.Turn, 1)}
	runtime, err := New(testConfig(host, reader, publisher))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	<-reader.ready
	binding := runtime.config.Binding
	if _, err := runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputDeviceConnected, Binding: binding, Device: ptt.Device{Kind: binding.DeviceKind, ID: binding.DeviceID}}); err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputPressed, Binding: binding, Focused: true}); err != nil {
		t.Fatal(err)
	}
	if state := runtime.Health().State; state != StateCapturing {
		t.Fatalf("state after press = %q", state)
	}
	if _, err := runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputReleased, Binding: binding}); err != nil {
		t.Fatal(err)
	}
	select {
	case turn := <-publisher.turns:
		if turn.Outcome != commands.OutcomeQueryAnswered || turn.IntentID != "query.fuel" || turn.Values["litres"] != "12" {
			t.Fatalf("turn = %+v", turn)
		}
	case <-time.After(time.Second):
		t.Fatal("query turn was not published")
	}
	health := runtime.Health()
	if health.PTTCaptures != 1 || health.Transcriptions != 1 || health.Queries != 1 || health.State != StateIdle {
		t.Fatalf("health = %+v", health)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestRuntimeWakePlaceholderAndMaximumWindowAreBounded(t *testing.T) {
	host := newFakeHost("dime el combustible")
	reader := &readyReader{ready: make(chan struct{})}
	publisher := recordingPublisher{turns: make(chan commands.Turn, 1)}
	config := testConfig(host, reader, publisher)
	config.MaxWindow = 10 * time.Millisecond
	runtime, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	host.wake <- "  INGENIERO "
	select {
	case <-host.finish:
	case <-time.After(time.Second):
		t.Fatal("wake capture did not close at its maximum window")
	}
	select {
	case <-publisher.turns:
	case <-time.After(time.Second):
		t.Fatal("wake query turn was not published")
	}
	if health := runtime.Health(); health.WakeCaptures != 1 || health.Transcriptions != 1 {
		t.Fatalf("health = %+v", health)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestRuntimeRoutesActionsButKeepsThemDisabled(t *testing.T) {
	host := newFakeHost("solicita la parada en boxes")
	reader := &readyReader{ready: make(chan struct{})}
	publisher := recordingPublisher{turns: make(chan commands.Turn, 1)}
	runtime, err := New(testConfig(host, reader, publisher))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	<-reader.ready
	binding := runtime.config.Binding
	if _, err := runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputDeviceConnected, Binding: binding, Device: ptt.Device{Kind: binding.DeviceKind, ID: binding.DeviceID}}); err != nil {
		t.Fatal(err)
	}
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputPressed, Binding: binding, Focused: true})
	if _, err := runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputReleased, Binding: binding}); err != nil {
		t.Fatal(err)
	}
	select {
	case turn := <-publisher.turns:
		if turn.IntentID != "action.pit.request" || turn.Outcome != commands.OutcomeUnavailable || turn.Reason != commands.ReasonActionUnavailable {
			t.Fatalf("action turn = %+v", turn)
		}
	case <-time.After(time.Second):
		t.Fatal("disabled action result was not published")
	}
	if health := runtime.Health(); health.RejectedActions != 1 {
		t.Fatalf("health = %+v", health)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestKeywordDetectorIsExactPlaceholderNotAcousticClaim(t *testing.T) {
	detector := NewKeywordDetector(commands.DefaultCatalogV1())
	for _, word := range []string{"Ingeniero", "Engineer", "Ingegnere", "Engenheiro"} {
		if !detector.Match(word) {
			t.Fatalf("wake word %q was not recognized", word)
		}
	}
	if detector.Match("hola ingeniero") || detector.Match("engine") {
		t.Fatal("placeholder accepted a non-exact wake word")
	}
}
