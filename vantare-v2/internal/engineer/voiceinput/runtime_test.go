package voiceinput

import (
	"context"
	gort "runtime"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/commands"
	"github.com/vantare/overlays/v2/internal/engineer/ptt"
)

func waitRuntimeState(t *testing.T, voiceRuntime *Runtime, state State) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if voiceRuntime.Health().State == state {
			return
		}
		gort.Gosched()
	}
	t.Fatalf("runtime state = %q, want %q", voiceRuntime.Health().State, state)
}

func waitControllerState(t *testing.T, controller *ptt.Controller, state ptt.State) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if controller.Snapshot().State == state {
			return
		}
		gort.Gosched()
	}
	t.Fatalf("controller state = %q, want %q", controller.Snapshot().State, state)
}

type fakeHost struct {
	mu         sync.Mutex
	transcript []byte
	wake       chan string
	started    bool
	active     bool
	startedCh  chan struct{}
	startOnce  sync.Once
	finish     chan struct{}
	finishOnce sync.Once
}

func newFakeHost(text string) *fakeHost {
	return &fakeHost{transcript: []byte(text), wake: make(chan string, 1), startedCh: make(chan struct{}), finish: make(chan struct{})}
}

func (host *fakeHost) Start(context.Context) error {
	host.mu.Lock()
	host.started = true
	host.mu.Unlock()
	host.startOnce.Do(func() { close(host.startedCh) })
	return nil
}
func (host *fakeHost) Begin(context.Context, Capture) error {
	host.mu.Lock()
	host.active = true
	host.mu.Unlock()
	return nil
}
func (host *fakeHost) Finish(context.Context, Capture) ([]byte, error) {
	host.mu.Lock()
	host.active = false
	transcript := host.transcript
	host.mu.Unlock()
	host.finishOnce.Do(func() { close(host.finish) })
	return transcript, nil
}

func TestRuntimeClearsTranscriptBufferAfterPublishing(t *testing.T) {
	host := newFakeHost("dime el combustible")
	publisher := recordingPublisher{turns: make(chan commands.Turn, 1)}
	runtime, err := New(testConfig(host, &readyReader{ready: make(chan struct{})}, publisher))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	<-host.startedCh
	binding := runtime.config.Binding
	if _, err := runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputDeviceConnected, Device: ptt.Device{Kind: binding.DeviceKind, ID: binding.DeviceID}}); err != nil {
		t.Fatal(err)
	}
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputPressed, Binding: binding, Focused: true})
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputReleased, Binding: binding})
	select {
	case <-publisher.turns:
	case <-time.After(time.Second):
		t.Fatal("turn was not published")
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
	host.mu.Lock()
	defer host.mu.Unlock()
	for index, value := range host.transcript {
		if value != 0 {
			t.Fatalf("transcript byte %d retained value %d", index, value)
		}
	}
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

type blockingStartHost struct {
	startEntered chan struct{}
	releaseStart chan struct{}
}

type deadlineHost struct {
	*fakeHost
	deadline chan bool
}

type timeoutFinishHost struct {
	*fakeHost
	finishEntered  chan struct{}
	finishReturned chan struct{}
}

func (host *timeoutFinishHost) Finish(ctx context.Context, _ Capture) ([]byte, error) {
	close(host.finishEntered)
	<-ctx.Done()
	close(host.finishReturned)
	return nil, ctx.Err()
}

func (host *deadlineHost) Finish(ctx context.Context, capture Capture) ([]byte, error) {
	_, ok := ctx.Deadline()
	host.deadline <- ok
	return host.fakeHost.Finish(ctx, capture)
}

func (host *blockingStartHost) Start(context.Context) error {
	close(host.startEntered)
	<-host.releaseStart
	return ErrHostUnavailable
}
func (*blockingStartHost) Begin(context.Context, Capture) error { return ErrHostUnavailable }
func (*blockingStartHost) Finish(context.Context, Capture) ([]byte, error) {
	return nil, ErrHostUnavailable
}
func (*blockingStartHost) Cancel(context.Context, Capture) error { return nil }
func (*blockingStartHost) Stop(context.Context) error            { return nil }
func (*blockingStartHost) WakeEvents() <-chan string             { return nil }

func TestRuntimeStartNeverWaitsForHostAndStartsPTTPoller(t *testing.T) {
	host := &blockingStartHost{startEntered: make(chan struct{}), releaseStart: make(chan struct{})}
	reader := &readyReader{ready: make(chan struct{})}
	runtime, err := New(testConfig(host, reader, recordingPublisher{turns: make(chan commands.Turn, 1)}))
	if err != nil {
		t.Fatal(err)
	}
	startDone := make(chan error, 1)
	go func() { startDone <- runtime.Start(context.Background()) }()
	select {
	case err := <-startDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(50 * time.Millisecond):
		close(host.releaseStart)
		<-startDone
		t.Fatal("Runtime.Start blocked on host readiness")
	}
	select {
	case <-reader.ready:
	case <-time.After(50 * time.Millisecond):
		close(host.releaseStart)
		t.Fatal("PTT poller did not start while host readiness was pending")
	}
	close(host.releaseStart)
	select {
	case <-host.startEntered:
	case <-time.After(time.Second):
		t.Fatal("host start was not attempted asynchronously")
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestRuntimeFinishAlwaysCarriesTranscriptionDeadline(t *testing.T) {
	host := &deadlineHost{fakeHost: newFakeHost("dime el combustible"), deadline: make(chan bool, 1)}
	config := testConfig(host, &readyReader{ready: make(chan struct{})}, recordingPublisher{turns: make(chan commands.Turn, 1)})
	config.TranscriptionTimeout = 25 * time.Millisecond
	runtime, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	<-host.startedCh
	binding := runtime.config.Binding
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputDeviceConnected, Device: ptt.Device{Kind: binding.DeviceKind, ID: binding.DeviceID}})
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputPressed, Binding: binding, Focused: true})
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputReleased, Binding: binding})
	select {
	case bounded := <-host.deadline:
		if !bounded {
			t.Fatal("Host.Finish received an unbounded context")
		}
	case <-time.After(time.Second):
		t.Fatal("Host.Finish was not called")
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestRuntimeTranscriptionDeadlineReleasesPTTOwnership(t *testing.T) {
	host := &timeoutFinishHost{fakeHost: newFakeHost("unused"), finishEntered: make(chan struct{}), finishReturned: make(chan struct{})}
	config := testConfig(host, &readyReader{ready: make(chan struct{})}, recordingPublisher{turns: make(chan commands.Turn, 1)})
	config.TranscriptionTimeout = 20 * time.Millisecond
	runtime, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	<-host.startedCh
	binding := runtime.config.Binding
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputDeviceConnected, Device: ptt.Device{Kind: binding.DeviceKind, ID: binding.DeviceID}})
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputPressed, Binding: binding, Focused: true})
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputReleased, Binding: binding})
	select {
	case <-host.finishEntered:
	case <-time.After(time.Second):
		t.Fatal("Host.Finish was not called")
	}
	select {
	case <-host.finishReturned:
	case <-time.After(time.Second):
		t.Fatal("Host.Finish did not stop at its transcription deadline")
	}
	waitControllerState(t, runtime.controller, ptt.StateListening)
	if health := runtime.Health(); health.State != StateError || health.Errors == 0 {
		t.Fatalf("health after STT timeout = %+v", health)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
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
	if runtime.detector.Match("Engineer") {
		t.Fatal("disabled runtime constructed the wake detector")
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

func TestRuntimePTTTimeoutBeforeReleaseCompletesControllerCycle(t *testing.T) {
	host := newFakeHost("dime el combustible")
	reader := &readyReader{ready: make(chan struct{})}
	publisher := recordingPublisher{turns: make(chan commands.Turn, 2)}
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
	<-host.startedCh
	binding := runtime.config.Binding
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputDeviceConnected, Device: ptt.Device{Kind: binding.DeviceKind, ID: binding.DeviceID}})
	_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputPressed, Binding: binding, Focused: true})
	select {
	case <-publisher.turns:
	case <-time.After(time.Second):
		t.Fatal("timed capture was not transcribed")
	}
	waitRuntimeState(t, runtime, StateIdle)
	if _, err := runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputReleased, Binding: binding}); err != nil {
		t.Fatal(err)
	}
	waitControllerState(t, runtime.controller, ptt.StateListening)
	if _, err := runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputPressed, Binding: binding, Focused: true}); err != nil {
		t.Fatal(err)
	}
	if runtime.Health().PTTCaptures != 2 {
		t.Fatalf("PTT captures = %d, want a second capture after timeout/release", runtime.Health().PTTCaptures)
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
