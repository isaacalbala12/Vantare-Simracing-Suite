package service

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/delivery"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/presentation"
)

type cachedAudioResolver struct{}

type blockingStartedReporter struct {
	started chan struct{}
	release chan struct{}
	mu      sync.Mutex
	acks    []delivery.Acknowledgement
}

func (reporter *blockingStartedReporter) Acknowledge(state delivery.State, reason delivery.Reason) error {
	reporter.mu.Lock()
	reporter.acks = append(reporter.acks, delivery.Acknowledgement{State: state, Reason: reason})
	reporter.mu.Unlock()
	if state == delivery.StateStarted {
		close(reporter.started)
		<-reporter.release
	}
	return nil
}

func (reporter *blockingStartedReporter) snapshot() []delivery.Acknowledgement {
	reporter.mu.Lock()
	defer reporter.mu.Unlock()
	return append([]delivery.Acknowledgement(nil), reporter.acks...)
}

func (cachedAudioResolver) ResolvePresentationCached(context.Context, audio.PresentationRequest) (string, error) {
	return "cached.wav", nil
}

func TestEngineerOutputModesAreBoundedAndReported(t *testing.T) {
	service := NewEngineerService(nil)
	initialLifecycle := service.Status().PresentationLifecycle
	if got := service.OutputMode(messagepolicy.FamilyFuel); got != OutputBoth {
		t.Fatalf("default fuel output = %q, want both", got)
	}
	if err := service.SetOutputMode("future", "both"); err == nil {
		t.Fatal("unknown family accepted")
	}
	if err := service.SetOutputMode("fuel", "future"); err == nil {
		t.Fatal("unknown output mode accepted")
	}
	if err := service.SetOutputMode("fuel", "visual"); err != nil {
		t.Fatal(err)
	}
	if got := service.Status().OutputModes["fuel"]; got != OutputVisual {
		t.Fatalf("status fuel output = %q, want visual", got)
	}
	if got := service.Status().PresentationLifecycle; got != initialLifecycle {
		t.Fatalf("presentation lifecycle = %d, want unchanged while visual remains enabled", got)
	}
	if err := service.SetOutputMode("fuel", "visual"); err != nil {
		t.Fatal(err)
	}
	if got := service.Status().PresentationLifecycle; got != initialLifecycle {
		t.Fatalf("no-op routing change advanced lifecycle to %d", got)
	}
}

func TestDisabledSpotterNeverEntersSchedulerOrPreemptsEngineer(t *testing.T) {
	service := NewEngineerService(nil)
	activeCtx, cancel := context.WithCancelCause(context.Background())
	service.activeDelivery = &activeDelivery{
		id:       "engineer-active",
		decision: messagepolicy.Decision{Family: messagepolicy.FamilyLaps, Priority: messagepolicy.PriorityInformation},
		cancel:   cancel,
	}
	if err := service.SetOutputMode("spotter", "disabled"); err != nil {
		t.Fatal(err)
	}

	before := service.scheduler.State()
	service.mu.Lock()
	accepted, outcomes := service.submitCandidateLocked(messagepolicy.Candidate{
		Family: messagepolicy.FamilySpotter, Priority: messagepolicy.PrioritySpotter,
	})
	service.mu.Unlock()
	after := service.scheduler.State()

	if accepted || len(outcomes) != 0 {
		t.Fatalf("disabled spotter accepted=%v outcomes=%+v", accepted, outcomes)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatalf("disabled output mutated scheduler: before=%+v after=%+v", before, after)
	}
	if cause := context.Cause(activeCtx); cause != nil {
		t.Fatalf("disabled spotter preempted active Engineer: %v", cause)
	}
}

func TestDisablingFamilyCancelsOnlyMatchingActiveOutputs(t *testing.T) {
	service := NewEngineerService(nil)
	engineerCtx, cancelEngineer := context.WithCancelCause(context.Background())
	service.activeDelivery = &activeDelivery{
		id:       "engineer-active",
		decision: messagepolicy.Decision{Family: messagepolicy.FamilyLaps},
		cancel:   cancelEngineer,
	}
	service.activePresentation = &EngineerNotification{Category: "laps", ExpiresAt: service.policyClock.NowMS() + 10_000}

	if err := service.SetOutputMode("spotter", "disabled"); err != nil {
		t.Fatal(err)
	}
	if cause := context.Cause(engineerCtx); cause != nil {
		t.Fatalf("unrelated family cancelled active Engineer: %v", cause)
	}
	if service.activePresentation == nil {
		t.Fatal("unrelated family cleared active visual")
	}
	if err := service.SetOutputMode("laps", "disabled"); err != nil {
		t.Fatal(err)
	}
	if cause := context.Cause(engineerCtx); cause == nil {
		t.Fatal("matching active audio was not cancelled")
	}
	if service.activePresentation != nil {
		t.Fatal("matching active visual was not cleared")
	}
}

func TestStatusSubscriberReceivesLatestLifecycleInsteadOfStaleBufferedStatus(t *testing.T) {
	service := NewEngineerService(nil)
	statusCh, unsubscribe := service.SubscribeStatus()
	defer unsubscribe()

	if err := service.SetOutputMode("fuel", "visual"); err != nil {
		t.Fatal(err)
	}
	status := <-statusCh
	if status.PresentationLifecycle != 0 || status.OutputModes["fuel"] != OutputVisual {
		t.Fatalf("status = %+v, want latest lifecycle and output mode", status)
	}
}

func TestLifecycleBoundaryDrainsBufferedVisualNotification(t *testing.T) {
	service := NewEngineerService(nil)
	notifications, unsubscribe := service.Subscribe()
	defer unsubscribe()

	service.mu.Lock()
	service.subs[0] <- EngineerNotification{Version: 1, ID: "old-generation"}
	service.activePresentation = &EngineerNotification{Category: "fuel", ExpiresAt: service.policyClock.NowMS() + 10_000}
	service.mu.Unlock()
	if err := service.SetOutputMode("fuel", "disabled"); err != nil {
		t.Fatal(err)
	}

	select {
	case notification := <-notifications:
		t.Fatalf("stale notification survived lifecycle boundary: %+v", notification)
	default:
	}
}

func TestProductDeliveryHonoursCategoryOutputMode(t *testing.T) {
	resolver, err := presentation.NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	decision := messagepolicy.Decision{
		Version: messagepolicy.ContractVersionV1, CandidateID: "lap", Family: messagepolicy.FamilyLaps,
		Intent: messagepolicy.IntentLapCompleted, Priority: messagepolicy.PriorityInformation,
		CreatedAtMS: 100, ExpiresAtMS: 200,
	}
	for _, test := range []struct {
		mode                  OutputMode
		wantVisual, wantAudio bool
	}{
		{OutputVisual, true, false},
		{OutputAudio, false, true},
		{OutputBoth, true, true},
	} {
		t.Run(string(test.mode), func(t *testing.T) {
			service := NewEngineerService(nil)
			if err := service.SetOutputMode("laps", string(test.mode)); err != nil {
				t.Fatal(err)
			}
			player := &recordingPresentationPlayer{}
			port := productDeliveryPort{
				service: service, player: player, resolver: cachedAudioResolver{},
				presentationResolver: resolver, locale: presentation.LocaleEnglish,
			}
			if err := port.Deliver(context.Background(), delivery.Request{
				Version: delivery.ContractVersionV1, DeliveryID: "delivery", Decision: decision,
			}, &presentationAckRecorder{}); err != nil {
				t.Fatal(err)
			}
			if got := len(service.RecentNotifications()) == 1; got != test.wantVisual {
				t.Fatalf("visual published = %v, want %v", got, test.wantVisual)
			}
			if got := len(player.paths) == 1; got != test.wantAudio {
				t.Fatalf("audio played = %v, want %v", got, test.wantAudio)
			}
		})
	}
}

func TestDisabledOutputCannotAcknowledgeAtDeliveryBoundary(t *testing.T) {
	resolver, err := presentation.NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	service := NewEngineerService(nil)
	if err := service.SetOutputMode("laps", "disabled"); err != nil {
		t.Fatal(err)
	}
	reporter := &presentationAckRecorder{}
	port := productDeliveryPort{service: service, presentationResolver: resolver, locale: presentation.LocaleEnglish}
	err = port.Deliver(context.Background(), delivery.Request{Decision: messagepolicy.Decision{Family: messagepolicy.FamilyLaps}}, reporter)
	if !errors.Is(err, ErrDisabledOutputReachedDelivery) {
		t.Fatalf("Deliver() error=%v", err)
	}
	if len(reporter.states) != 0 {
		t.Fatalf("disabled output acknowledged states=%v", reporter.states)
	}
}

func TestDisablingOutputDuringStartedAckCannotPublishOrPlay(t *testing.T) {
	resolver, err := presentation.NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	service := NewEngineerService(nil)
	player := &recordingPresentationPlayer{}
	reporter := &blockingStartedReporter{started: make(chan struct{}), release: make(chan struct{})}
	ctx, cancel := context.WithCancelCause(context.Background())
	decision := messagepolicy.Decision{
		Version: messagepolicy.ContractVersionV1, CandidateID: "lap-race", Family: messagepolicy.FamilyLaps,
		Intent: messagepolicy.IntentLapCompleted, Priority: messagepolicy.PriorityInformation,
		CreatedAtMS: 100, ExpiresAtMS: 200,
	}
	service.activeDelivery = &activeDelivery{id: "delivery-race", decision: decision, cancel: cancel}
	beforeScheduler := service.scheduler.State()
	port := productDeliveryPort{
		service: service, player: player, resolver: cachedAudioResolver{},
		presentationResolver: resolver, locale: presentation.LocaleEnglish,
	}
	done := make(chan error, 1)
	go func() {
		done <- port.Deliver(ctx, delivery.Request{
			Version: delivery.ContractVersionV1, DeliveryID: "delivery-race", Decision: decision,
		}, reporter)
	}()

	<-reporter.started
	if err := service.SetOutputMode("laps", "disabled"); err != nil {
		t.Fatal(err)
	}
	close(reporter.release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}

	if got := service.RecentNotifications(); len(got) != 0 {
		t.Fatalf("visual notification escaped disabled race: %+v", got)
	}
	if len(player.paths) != 0 {
		t.Fatalf("audio escaped disabled race: %v", player.paths)
	}
	wantAcks := []delivery.Acknowledgement{
		{State: delivery.StateStarted, Reason: delivery.ReasonNone},
		{State: delivery.StateCancelled, Reason: delivery.ReasonLifecycleBoundary},
	}
	if got := reporter.snapshot(); !reflect.DeepEqual(got, wantAcks) {
		t.Fatalf("acknowledgements = %+v, want %+v", got, wantAcks)
	}
	if afterScheduler := service.scheduler.State(); !reflect.DeepEqual(afterScheduler, beforeScheduler) {
		t.Fatalf("disabled delivery mutated scheduler: before=%+v after=%+v", beforeScheduler, afterScheduler)
	}
}
