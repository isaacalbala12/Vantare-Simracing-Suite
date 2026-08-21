package voiceinput

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/commands"
	"github.com/vantare/overlays/v2/internal/engineer/ptt"
)

type Config struct {
	Enabled      bool
	Locale       commands.Locale
	Binding      ptt.Binding
	Reader       ptt.Reader
	Host         Host
	QueryPort    commands.QueryPort
	Publisher    TurnPublisher
	Lifecycle    LifecycleProvider
	MaxWindow    time.Duration
	PollInterval time.Duration
}

type Runtime struct {
	mu         sync.Mutex
	config     Config
	health     Health
	router     *commands.Router
	harness    *commands.TextHarness
	controller *ptt.Controller
	poller     *ptt.Poller
	detector   KeywordDetector
	ctx        context.Context
	cancel     context.CancelFunc
	wg         sync.WaitGroup
	next       uint64
	active     *Capture
	timer      *time.Timer
}

func New(config Config) (*Runtime, error) {
	if config.Locale == "" {
		config.Locale = commands.LocaleSpanish
	}
	if config.MaxWindow <= 0 || config.MaxWindow > DefaultMaxWindow {
		config.MaxWindow = DefaultMaxWindow
	}
	runtime := &Runtime{config: config, health: Health{Experimental: true, Enabled: config.Enabled, State: StateDisabled}, detector: NewKeywordDetector(commands.DefaultCatalogV1())}
	if !config.Enabled {
		return runtime, nil
	}
	if config.Host == nil || config.Reader == nil || config.QueryPort == nil || config.Publisher == nil || config.Lifecycle == nil {
		return nil, errors.New("engineer voice-input dependencies are incomplete")
	}
	router, err := commands.NewRouter(commands.DefaultCatalogV1(), config.QueryPort, DisabledActionPort{}, 10_000)
	if err != nil {
		return nil, fmt.Errorf("create voice-input dialogue router: %w", err)
	}
	runtime.router = router
	harness, err := commands.NewTextHarness(commands.DefaultCatalogV1())
	if err != nil {
		return nil, fmt.Errorf("create voice-input command classifier: %w", err)
	}
	runtime.harness = harness
	port := &capturePort{runtime: runtime}
	controller, err := ptt.NewController(ptt.Config{Binding: config.Binding, Enabled: true, PermissionGranted: true}, port)
	if err != nil {
		return nil, fmt.Errorf("create voice-input PTT controller: %w", err)
	}
	poller, err := ptt.NewPoller(config.Binding, config.Reader, controller, config.PollInterval)
	if err != nil {
		return nil, fmt.Errorf("create voice-input PTT poller: %w", err)
	}
	runtime.controller = controller
	runtime.poller = poller
	return runtime, nil
}

func (runtime *Runtime) Start(parent context.Context) error {
	if runtime == nil || parent == nil {
		return errors.New("invalid voice-input runtime")
	}
	runtime.mu.Lock()
	if !runtime.config.Enabled {
		runtime.mu.Unlock()
		return nil
	}
	if runtime.cancel != nil {
		runtime.mu.Unlock()
		return errors.New("engineer voice-input runtime is already started")
	}
	runtime.mu.Unlock()
	if err := runtime.config.Host.Start(parent); err != nil {
		runtime.mu.Lock()
		runtime.health.State = StateUnavailable
		runtime.health.Errors++
		runtime.mu.Unlock()
		return err
	}
	ctx, cancel := context.WithCancel(parent)
	runtime.mu.Lock()
	runtime.ctx = ctx
	runtime.cancel = cancel
	runtime.health.State = StateIdle
	runtime.mu.Unlock()
	runtime.wg.Add(1)
	go func() {
		defer runtime.wg.Done()
		if err := runtime.poller.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
			runtime.recordError()
		}
	}()
	if wake := runtime.config.Host.WakeEvents(); wake != nil {
		runtime.wg.Add(1)
		go runtime.runWake(ctx, wake)
	}
	return nil
}

func (runtime *Runtime) runWake(ctx context.Context, events <-chan string) {
	defer runtime.wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case keyword, ok := <-events:
			if !ok {
				return
			}
			if runtime.detector.Match(keyword) {
				_ = runtime.begin(ctx, true, "")
			}
		}
	}
}

func (runtime *Runtime) Stop(ctx context.Context) error {
	if runtime == nil || ctx == nil {
		return errors.New("invalid voice-input shutdown")
	}
	runtime.mu.Lock()
	if !runtime.config.Enabled {
		runtime.health.State = StateDisabled
		runtime.mu.Unlock()
		return nil
	}
	if runtime.cancel != nil {
		runtime.cancel()
		runtime.cancel = nil
	}
	if runtime.timer != nil {
		runtime.timer.Stop()
		runtime.timer = nil
	}
	runtime.mu.Unlock()
	err := runtime.config.Host.Stop(ctx)
	runtime.wg.Wait()
	if runtime.controller != nil {
		_, _ = runtime.controller.Shutdown(ctx)
	}
	runtime.mu.Lock()
	runtime.active = nil
	runtime.health.State = StateDisabled
	runtime.mu.Unlock()
	return err
}

func (runtime *Runtime) Health() Health {
	if runtime == nil {
		return Health{Experimental: true, State: StateUnavailable}
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return runtime.health
}

func (runtime *Runtime) begin(ctx context.Context, wake bool, pttID string) error {
	runtime.mu.Lock()
	if runtime.active != nil || (runtime.health.State != StateIdle && runtime.health.State != StateError) {
		runtime.mu.Unlock()
		return nil
	}
	runtime.next++
	capture := Capture{ID: fmt.Sprintf("voice-%d", runtime.next), PTTID: pttID, MaxWindow: runtime.config.MaxWindow}
	runtime.active = &capture
	runtime.health.State = StateCapturing
	runtime.mu.Unlock()
	if err := runtime.config.Host.Begin(ctx, capture); err != nil {
		runtime.mu.Lock()
		if runtime.active != nil && runtime.active.ID == capture.ID {
			runtime.active = nil
		}
		runtime.health.State = StateError
		runtime.health.Errors++
		runtime.mu.Unlock()
		return err
	}
	runtime.mu.Lock()
	if wake {
		runtime.health.WakeCaptures++
	} else {
		runtime.health.PTTCaptures++
	}
	finishCtx := runtime.ctx
	runtime.timer = time.AfterFunc(capture.MaxWindow, func() { runtime.finish(finishCtx, capture) })
	runtime.mu.Unlock()
	return nil
}

func (runtime *Runtime) finish(ctx context.Context, capture Capture) {
	runtime.mu.Lock()
	if runtime.active == nil || runtime.active.ID != capture.ID || runtime.health.State != StateCapturing {
		runtime.mu.Unlock()
		return
	}
	if runtime.timer != nil {
		runtime.timer.Stop()
		runtime.timer = nil
	}
	runtime.health.State = StateTranscribing
	runtime.mu.Unlock()

	text, err := runtime.config.Host.Finish(ctx, capture)
	if err != nil {
		runtime.complete(capture, false, err)
		return
	}
	text = strings.TrimSpace(text)
	if text == "" || len(text) > 1024 {
		runtime.complete(capture, false, errors.New("voice-input transcript is empty or oversized"))
		return
	}
	lifecycle := runtime.config.Lifecycle()
	match, matchErr := runtime.harness.Match(runtime.config.Locale, text)
	turn := runtime.router.Handle(ctx, commands.TurnInput{AtMS: time.Now().UnixMilli(), Locale: runtime.config.Locale, Text: text, Lifecycle: lifecycle})
	if matchErr == nil && match.Kind == commands.KindAction {
		turn.IntentID = match.IntentID
		turn.Reason = commands.ReasonActionUnavailable
		runtime.mu.Lock()
		runtime.health.RejectedActions++
		runtime.mu.Unlock()
	}
	if err := runtime.config.Publisher.PublishVoiceTurn(ctx, turn, runtime.config.Locale); err != nil {
		runtime.complete(capture, false, err)
		return
	}
	runtime.mu.Lock()
	runtime.health.Transcriptions++
	if turn.Outcome == commands.OutcomeQueryAnswered {
		runtime.health.Queries++
	}
	runtime.mu.Unlock()
	runtime.complete(capture, true, nil)
}

func (runtime *Runtime) complete(capture Capture, success bool, err error) {
	runtime.mu.Lock()
	if runtime.active != nil && runtime.active.ID == capture.ID {
		runtime.active = nil
	}
	if success {
		runtime.health.State = StateIdle
	} else {
		runtime.health.State = StateError
		runtime.health.Errors++
	}
	runtime.mu.Unlock()
	if runtime.controller != nil {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if capture.PTTID != "" {
			_, _ = runtime.controller.Handle(ctx, ptt.Input{Kind: ptt.InputProcessingComplete, CaptureID: capture.PTTID})
		}
	}
}

func (runtime *Runtime) cancelCapture(ctx context.Context, capture Capture) error {
	runtime.mu.Lock()
	if runtime.active == nil || runtime.active.ID != capture.ID {
		runtime.mu.Unlock()
		return nil
	}
	if runtime.timer != nil {
		runtime.timer.Stop()
		runtime.timer = nil
	}
	runtime.active = nil
	runtime.health.State = StateIdle
	runtime.mu.Unlock()
	return runtime.config.Host.Cancel(ctx, capture)
}

func (runtime *Runtime) recordError() {
	runtime.mu.Lock()
	runtime.health.State = StateError
	runtime.health.Errors++
	runtime.mu.Unlock()
}

type capturePort struct{ runtime *Runtime }

func (port *capturePort) Begin(ctx context.Context, capture ptt.Capture) error {
	return port.runtime.begin(ctx, false, capture.ID)
}

func (port *capturePort) Finish(ctx context.Context, _ ptt.Capture) error {
	port.runtime.mu.Lock()
	if port.runtime.active == nil {
		port.runtime.mu.Unlock()
		return nil
	}
	capture := *port.runtime.active
	if port.runtime.ctx != nil {
		ctx = port.runtime.ctx
	}
	port.runtime.mu.Unlock()
	port.runtime.wg.Add(1)
	go func() { defer port.runtime.wg.Done(); port.runtime.finish(ctx, capture) }()
	return nil
}

func (port *capturePort) Cancel(ctx context.Context, _ ptt.Capture, _ ptt.Reason) error {
	port.runtime.mu.Lock()
	if port.runtime.active == nil {
		port.runtime.mu.Unlock()
		return nil
	}
	capture := *port.runtime.active
	port.runtime.mu.Unlock()
	return port.runtime.cancelCapture(ctx, capture)
}
