package service

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/delivery"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

type gatedTransport struct {
	allowStart chan struct{}
	started    chan messagepolicy.Decision
	terminal   chan delivery.Acknowledgement
	release    chan struct{}
}

func newGatedTransport(allowImmediately bool) *gatedTransport {
	transport := &gatedTransport{
		allowStart: make(chan struct{}), started: make(chan messagepolicy.Decision, 8),
		terminal: make(chan delivery.Acknowledgement, 8), release: make(chan struct{}, 8),
	}
	if allowImmediately {
		close(transport.allowStart)
	}
	return transport
}

func (transport *gatedTransport) Deliver(ctx context.Context, request delivery.Request, reporter delivery.Reporter) error {
	select {
	case <-transport.allowStart:
	case <-ctx.Done():
		reason := delivery.ReasonLifecycleBoundary
		if errors.Is(context.Cause(ctx), delivery.ErrPreemptedBySpotter) {
			reason = delivery.ReasonPreemptedBySpotter
		} else if errors.Is(context.Cause(ctx), delivery.ErrSourceUnavailable) {
			reason = delivery.ReasonSourceUnavailable
		}
		if err := reporter.Acknowledge(delivery.StateCancelled, reason); err != nil {
			return err
		}
		transport.terminal <- delivery.Acknowledgement{State: delivery.StateCancelled, Reason: reason}
		return context.Cause(ctx)
	}
	if cause := context.Cause(ctx); cause != nil {
		reason := delivery.ReasonLifecycleBoundary
		if errors.Is(cause, delivery.ErrPreemptedBySpotter) {
			reason = delivery.ReasonPreemptedBySpotter
		} else if errors.Is(cause, delivery.ErrSourceUnavailable) {
			reason = delivery.ReasonSourceUnavailable
		}
		if err := reporter.Acknowledge(delivery.StateCancelled, reason); err != nil {
			return err
		}
		transport.terminal <- delivery.Acknowledgement{State: delivery.StateCancelled, Reason: reason}
		return cause
	}
	if err := reporter.Acknowledge(delivery.StateStarted, delivery.ReasonNone); err != nil {
		return err
	}
	transport.started <- request.Decision
	select {
	case <-transport.release:
		if err := reporter.Acknowledge(delivery.StateCompleted, delivery.ReasonNone); err != nil {
			return err
		}
		return nil
	case <-ctx.Done():
		state, reason := delivery.StateCancelled, delivery.ReasonLifecycleBoundary
		if errors.Is(context.Cause(ctx), delivery.ErrPreemptedBySpotter) {
			state, reason = delivery.StateInterrupted, delivery.ReasonPreemptedBySpotter
		} else if errors.Is(context.Cause(ctx), delivery.ErrSourceUnavailable) {
			reason = delivery.ReasonSourceUnavailable
		}
		if err := reporter.Acknowledge(state, reason); err != nil {
			return err
		}
		transport.terminal <- delivery.Acknowledgement{State: state, Reason: reason}
		return context.Cause(ctx)
	}
}

type lateStartTransport struct {
	calls         atomic.Int32
	ready         chan struct{}
	start         chan struct{}
	firstResult   chan error
	secondStarted chan struct{}
}

func (transport *lateStartTransport) Deliver(_ context.Context, _ delivery.Request, reporter delivery.Reporter) error {
	if transport.calls.Add(1) == 1 {
		transport.ready <- struct{}{}
		<-transport.start
		err := reporter.Acknowledge(delivery.StateStarted, delivery.ReasonNone)
		transport.firstResult <- err
		return err
	}
	if err := reporter.Acknowledge(delivery.StateStarted, delivery.ReasonNone); err != nil {
		return err
	}
	close(transport.secondStarted)
	return reporter.Acknowledge(delivery.StateCompleted, delivery.ReasonNone)
}

type failingThenCompletingTransport struct {
	started chan string
	calls   int
}

type blockingAudioPlayer struct {
	started chan string
	release chan struct{}
}

func (player *blockingAudioPlayer) PlayContext(ctx context.Context, path string) error {
	player.started <- path
	select {
	case <-player.release:
		return nil
	case <-ctx.Done():
		return context.Cause(ctx)
	}
}

type deliveryResolver map[string]string

func (resolver deliveryResolver) ResolveCached(_ context.Context, textKey string, _ audio.Channel) (string, error) {
	return resolver[textKey], nil
}

type firstCallBlockingResolver struct {
	calls    atomic.Int32
	started  chan struct{}
	done     chan error
	fallback string
}

type benchmarkAudioPlayer struct {
	started        chan string
	onSpotterStart func()
}

func (player *benchmarkAudioPlayer) PlayContext(ctx context.Context, path string) error {
	if path == "spotter.wav" {
		player.onSpotterStart()
		player.started <- path
		return nil
	}
	player.started <- path
	<-ctx.Done()
	return context.Cause(ctx)
}

func (resolver *firstCallBlockingResolver) ResolveCached(ctx context.Context, _ string, _ audio.Channel) (string, error) {
	if resolver.calls.Add(1) != 1 {
		return resolver.fallback, nil
	}
	close(resolver.started)
	<-ctx.Done()
	resolver.done <- ctx.Err()
	return "", ctx.Err()
}

func (transport *failingThenCompletingTransport) Deliver(_ context.Context, request delivery.Request, reporter delivery.Reporter) error {
	transport.calls++
	if err := reporter.Acknowledge(delivery.StateStarted, delivery.ReasonNone); err != nil {
		return err
	}
	transport.started <- request.Decision.CandidateID
	if transport.calls == 1 {
		return reporter.Acknowledge(delivery.StateFailed, delivery.ReasonTransportError)
	}
	return reporter.Acknowledge(delivery.StateCompleted, delivery.ReasonNone)
}

func TestEngineerDeliverySpotterPreemptsActiveNonCriticalAndNeverTheReverse(t *testing.T) {
	transport := newGatedTransport(true)
	service := NewEngineerService(nil)
	service.SetDeliveryTransport(transport)
	service.Start(context.Background())
	defer service.Stop()

	evidence := deliveryEvidence(t)
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
	if started := receiveDecision(t, transport.started); started.Family != messagepolicy.FamilyFuel {
		t.Fatalf("first started = %+v", started)
	}

	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("spotter", messagepolicy.FamilySpotter, messagepolicy.IntentSpotterCarLeft, messagepolicy.PrioritySpotter))
	select {
	case terminal := <-transport.terminal:
		if terminal.State != delivery.StateInterrupted || terminal.Reason != delivery.ReasonPreemptedBySpotter {
			t.Fatalf("preemption = %+v", terminal)
		}
	case <-time.After(time.Second):
		t.Fatal("Spotter did not interrupt active Engineer delivery")
	}
	if started := receiveDecision(t, transport.started); started.Family != messagepolicy.FamilySpotter {
		t.Fatalf("second started = %+v", started)
	}

	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("info", messagepolicy.FamilyLaps, messagepolicy.IntentLapCompleted, messagepolicy.PriorityInformation))
	select {
	case terminal := <-transport.terminal:
		t.Fatalf("non-critical Engineer interrupted Spotter: %+v", terminal)
	case <-time.After(30 * time.Millisecond):
	}
	transport.release <- struct{}{}
}

func TestEngineerDeliverySpotterCancelsExistingAudioPlayback(t *testing.T) {
	player := &blockingAudioPlayer{started: make(chan string, 2), release: make(chan struct{}, 1)}
	service := NewEngineerService(nil)
	service.SetAudioPlayer(player)
	service.SetAudioResolver(deliveryResolver{
		messagepolicy.IntentFuelHalfTank:   "fuel.mp3",
		messagepolicy.IntentSpotterCarLeft: "spotter.mp3",
	})
	service.Start(context.Background())
	defer service.Stop()

	evidence := deliveryEvidence(t)
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
	if path := receiveID(t, player.started); path != "fuel.mp3" {
		t.Fatalf("first playback = %q", path)
	}
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("spotter", messagepolicy.FamilySpotter, messagepolicy.IntentSpotterCarLeft, messagepolicy.PrioritySpotter))
	if path := receiveID(t, player.started); path != "spotter.mp3" {
		t.Fatalf("playback after preemption = %q", path)
	}
	waitForDeliveryMetric(t, service, func(snapshot delivery.MetricsSnapshot) bool { return snapshot.Interrupted == 1 })
	player.release <- struct{}{}
}

func TestEngineerDeliveryPreemptionCancelsBlockedCacheResolution(t *testing.T) {
	resolver := &firstCallBlockingResolver{
		started: make(chan struct{}), done: make(chan error, 1), fallback: "spotter.mp3",
	}
	player := &blockingAudioPlayer{started: make(chan string, 1), release: make(chan struct{}, 1)}
	service := NewEngineerService(nil)
	service.SetAudioPlayer(player)
	service.SetAudioResolver(resolver)
	service.Start(context.Background())
	defer service.Stop()

	evidence := deliveryEvidence(t)
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
	select {
	case <-resolver.started:
	case <-time.After(time.Second):
		t.Fatal("cache resolver did not block")
	}
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("spotter", messagepolicy.FamilySpotter, messagepolicy.IntentSpotterCarLeft, messagepolicy.PrioritySpotter))
	select {
	case err := <-resolver.done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("blocked resolver error = %v, want context cancellation", err)
		}
	case <-time.After(time.Second):
		t.Fatal("preemption did not cancel blocked cache resolution")
	}
	if path := receiveID(t, player.started); path != "spotter.mp3" {
		t.Fatalf("Spotter playback path = %q", path)
	}
	player.release <- struct{}{}
}

func TestEngineerDeliveryStopCancelsBlockedCacheResolutionAndJoins(t *testing.T) {
	resolver := &firstCallBlockingResolver{started: make(chan struct{}), done: make(chan error, 1)}
	service := NewEngineerService(nil)
	service.SetAudioPlayer(&blockingAudioPlayer{started: make(chan string, 1), release: make(chan struct{}, 1)})
	service.SetAudioResolver(resolver)
	service.Start(context.Background())
	service.submitCandidateForDeliveryTest(t, deliveryEvidence(t), deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
	select {
	case <-resolver.started:
	case <-time.After(time.Second):
		t.Fatal("cache resolver did not block")
	}

	stopped := make(chan struct{})
	go func() {
		service.Stop()
		close(stopped)
	}()
	select {
	case err := <-resolver.done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("blocked resolver error = %v, want context cancellation", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Stop did not cancel blocked cache resolution")
	}
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("Stop did not join blocked cache resolution")
	}
}

func TestEngineerDeliverySourceLossCancelsBlockedCacheResolution(t *testing.T) {
	resolver := &firstCallBlockingResolver{started: make(chan struct{}), done: make(chan error, 1)}
	service := NewEngineerService(nil)
	service.SetAudioPlayer(&blockingAudioPlayer{started: make(chan string, 1), release: make(chan struct{}, 1)})
	service.SetAudioResolver(resolver)
	service.Start(context.Background())
	defer service.Stop()
	service.submitCandidateForDeliveryTest(t, deliveryEvidence(t), deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
	select {
	case <-resolver.started:
	case <-time.After(time.Second):
		t.Fatal("cache resolver did not block")
	}
	if err := service.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceStale}); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-resolver.done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("blocked resolver error = %v, want context cancellation", err)
		}
	case <-time.After(time.Second):
		t.Fatal("source loss did not cancel blocked cache resolution")
	}
}

func TestEngineerDeliveryRevalidatesImmediatelyBeforeStartedAck(t *testing.T) {
	transport := newGatedTransport(false)
	service := NewEngineerService(nil)
	service.SetDeliveryTransport(transport)
	service.Start(context.Background())
	defer service.Stop()

	evidence := deliveryEvidence(t)
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("left", messagepolicy.FamilySpotter, messagepolicy.IntentSpotterCarLeft, messagepolicy.PrioritySpotter))
	waitForDeliveryMetric(t, service, func(snapshot delivery.MetricsSnapshot) bool { return snapshot.Queued == 1 })
	invalidated := evidence
	invalidated.Semantic = messagepolicy.SemanticEvidence{SpotterKnown: true}
	service.mu.Lock()
	service.scheduler.Observe(invalidated)
	service.mu.Unlock()
	close(transport.allowStart)

	select {
	case started := <-transport.started:
		t.Fatalf("stale decision started: %+v", started)
	case <-time.After(50 * time.Millisecond):
	}
	waitForDeliveryMetric(t, service, func(snapshot delivery.MetricsSnapshot) bool { return snapshot.Cancelled == 1 })
}

func TestEngineerDeliverySpotterCancelsQueuedNonCriticalBeforeStart(t *testing.T) {
	transport := newGatedTransport(false)
	service := NewEngineerService(nil)
	if err := service.SetDeliveryTransport(transport); err != nil {
		t.Fatal(err)
	}
	service.Start(context.Background())
	defer service.Stop()

	evidence := deliveryEvidence(t)
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
	waitForDeliveryMetric(t, service, func(snapshot delivery.MetricsSnapshot) bool { return snapshot.Queued == 1 })
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("spotter", messagepolicy.FamilySpotter, messagepolicy.IntentSpotterCarLeft, messagepolicy.PrioritySpotter))
	select {
	case terminal := <-transport.terminal:
		if terminal.State != delivery.StateCancelled || terminal.Reason != delivery.ReasonPreemptedBySpotter {
			t.Fatalf("queued preemption = %+v", terminal)
		}
	case <-time.After(time.Second):
		t.Fatal("Spotter did not cancel queued Engineer delivery")
	}
	close(transport.allowStart)
	if started := receiveDecision(t, transport.started); started.CandidateID != "spotter" {
		t.Fatalf("started after queued preemption = %+v", started)
	}
	transport.release <- struct{}{}
}

func TestEngineerDeliveryRejectsLateStartAckAfterPreemption(t *testing.T) {
	transport := &lateStartTransport{
		ready: make(chan struct{}, 1), start: make(chan struct{}),
		firstResult: make(chan error, 1), secondStarted: make(chan struct{}),
	}
	service := NewEngineerService(nil)
	if err := service.SetDeliveryTransport(transport); err != nil {
		t.Fatal(err)
	}
	service.Start(context.Background())
	defer service.Stop()

	evidence := deliveryEvidence(t)
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
	select {
	case <-transport.ready:
	case <-time.After(time.Second):
		t.Fatal("transport did not reach the pre-start boundary")
	}
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("spotter", messagepolicy.FamilySpotter, messagepolicy.IntentSpotterCarLeft, messagepolicy.PrioritySpotter))
	close(transport.start)
	select {
	case err := <-transport.firstResult:
		if err == nil {
			t.Fatal("late start ACK was accepted after preemption")
		}
	case <-time.After(time.Second):
		t.Fatal("late start ACK did not return")
	}
	select {
	case <-transport.secondStarted:
	case <-time.After(time.Second):
		t.Fatal("Spotter did not start after rejecting the stale Engineer ACK")
	}
	waitForDeliveryMetric(t, service, func(snapshot delivery.MetricsSnapshot) bool { return snapshot.Cancelled == 1 })
}

func TestEngineerDeliveryStopCancelsAndJoinsActiveTransport(t *testing.T) {
	transport := newGatedTransport(true)
	service := NewEngineerService(nil)
	service.SetDeliveryTransport(transport)
	service.Start(context.Background())
	service.submitCandidateForDeliveryTest(t, deliveryEvidence(t), deliveryCandidate("left", messagepolicy.FamilySpotter, messagepolicy.IntentSpotterCarLeft, messagepolicy.PrioritySpotter))
	receiveDecision(t, transport.started)

	done := make(chan struct{})
	go func() {
		service.Stop()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Stop did not join active transport")
	}
	if snapshot := service.DeliveryMetrics(); snapshot.Cancelled != 1 {
		t.Fatalf("metrics after stop = %+v", snapshot)
	}
}

func TestEngineerDeliveryTransportFailureDoesNotBlockNextDecision(t *testing.T) {
	transport := &failingThenCompletingTransport{started: make(chan string, 2)}
	service := NewEngineerService(nil)
	if err := service.SetDeliveryTransport(transport); err != nil {
		t.Fatal(err)
	}
	service.Start(context.Background())
	defer service.Stop()

	evidence := deliveryEvidence(t)
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
	service.submitCandidateForDeliveryTest(t, evidence, deliveryCandidate("lap", messagepolicy.FamilyLaps, messagepolicy.IntentLapCompleted, messagepolicy.PriorityInformation))
	if got := receiveID(t, transport.started); got != "fuel" {
		t.Fatalf("first delivery = %q", got)
	}
	if got := receiveID(t, transport.started); got != "lap" {
		t.Fatalf("second delivery = %q", got)
	}
	waitForDeliveryMetric(t, service, func(snapshot delivery.MetricsSnapshot) bool {
		return snapshot.Failed == 1 && snapshot.Completed == 1
	})
}

func TestEngineerDeliverySourceUnavailableCancelsActiveTransport(t *testing.T) {
	transport := newGatedTransport(true)
	service := NewEngineerService(nil)
	if err := service.SetDeliveryTransport(transport); err != nil {
		t.Fatal(err)
	}
	service.Start(context.Background())
	defer service.Stop()

	service.submitCandidateForDeliveryTest(t, deliveryEvidence(t), deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
	receiveDecision(t, transport.started)
	if err := service.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceStale}); err != nil {
		t.Fatal(err)
	}
	select {
	case terminal := <-transport.terminal:
		if terminal.State != delivery.StateCancelled || terminal.Reason != delivery.ReasonSourceUnavailable {
			t.Fatalf("source cancellation = %+v", terminal)
		}
	case <-time.After(time.Second):
		t.Fatal("source loss did not cancel active delivery")
	}
}

func TestEngineerDeliveryLifecycleFactsCancelActiveTransport(t *testing.T) {
	tests := []engineerprojection.FactKind{
		engineerprojection.FactSessionStarted,
		engineerprojection.FactSessionEnded,
		engineerprojection.FactDriverChanged,
		engineerprojection.FactConnectionLost,
	}
	for _, kind := range tests {
		t.Run(string(kind), func(t *testing.T) {
			transport := newGatedTransport(true)
			service := NewEngineerService(nil)
			if err := service.SetDeliveryTransport(transport); err != nil {
				t.Fatal(err)
			}
			service.Start(context.Background())
			defer service.Stop()

			service.submitCandidateForDeliveryTest(t, deliveryEvidence(t), deliveryCandidate("fuel", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource))
			receiveDecision(t, transport.started)
			fact := engineerprojection.FactEnvelopeV1{
				Metadata: projection.Metadata{Epoch: 1, Sequence: 1},
				Fact:     engineerprojection.FactV1{Sequence: 1, Kind: kind},
			}
			if err := service.ConsumeFact(fact); err != nil {
				t.Fatal(err)
			}
			select {
			case terminal := <-transport.terminal:
				if terminal.State != delivery.StateCancelled || terminal.Reason != delivery.ReasonLifecycleBoundary {
					t.Fatalf("lifecycle cancellation = %+v", terminal)
				}
			case <-time.After(time.Second):
				t.Fatal("lifecycle fact did not cancel active delivery")
			}
		})
	}
}

func TestEngineerDeliveryTransportCannotChangeWhileRunning(t *testing.T) {
	service := NewEngineerService(nil)
	service.Start(context.Background())
	defer service.Stop()
	if err := service.SetDeliveryTransport(newGatedTransport(true)); !errors.Is(err, ErrDeliveryTransportRunning) {
		t.Fatalf("SetDeliveryTransport while running error = %v", err)
	}
}

func TestEngineerHealthExposesOnlySanitizedPolicyAndDeliveryMetrics(t *testing.T) {
	service := NewEngineerService(nil)
	evidence := deliveryEvidence(t)
	candidate := deliveryCandidate("candidate-private", messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource)
	candidate.Payload = map[string]string{"driverName": "private-driver"}
	service.mu.Lock()
	service.scheduler.Observe(evidence)
	service.scheduler.Submit(candidate)
	service.mu.Unlock()

	body, err := json.Marshal(service.Health())
	if err != nil {
		t.Fatal(err)
	}
	if string(body) == "" || containsAny(string(body), "candidate-private", "private-driver", "driverName") {
		t.Fatalf("health leaked a policy identifier or payload: %s", body)
	}
	if service.Health().Policy.Accepted != 1 {
		t.Fatalf("policy metrics = %+v", service.Health().Policy)
	}
}

func BenchmarkEngineerDeliverySchedulerToStartedUnderConcurrentPreemption(b *testing.B) {
	const concurrentPressure = 8
	player := &benchmarkAudioPlayer{started: make(chan string, 2)}
	service := NewEngineerService(nil)
	service.SetAudioPlayer(player)
	service.SetAudioResolver(deliveryResolver{
		messagepolicy.IntentFuelHalfTank:   "fuel.wav",
		messagepolicy.IntentSpotterCarLeft: "spotter.wav",
	})
	service.Start(context.Background())
	b.Cleanup(service.Stop)
	evidence := deliveryEvidence(b)
	evidence.FreshUntilMS = time.Now().Add(time.Hour).UnixMilli()
	service.mu.Lock()
	service.scheduler.Observe(evidence)
	service.mu.Unlock()

	var sequence atomic.Uint64
	b.ReportAllocs()
	b.ReportMetric(concurrentPressure, "submissions/op")
	b.ResetTimer()
	b.StopTimer()
	for range b.N {
		var accepted atomic.Int32
		var submissions sync.WaitGroup
		submissions.Add(concurrentPressure)
		for range concurrentPressure {
			go func() {
				defer submissions.Done()
				id := sequence.Add(1)
				candidate := deliveryCandidate("fuel-"+strconv.FormatUint(id, 10), messagepolicy.FamilyFuel, messagepolicy.IntentFuelHalfTank, messagepolicy.PriorityFailureResource)
				candidate.Subject = "car-" + strconv.FormatUint(id, 10)
				service.mu.Lock()
				ok, _ := service.submitCandidateLocked(candidate)
				service.mu.Unlock()
				if ok {
					accepted.Add(1)
				}
			}()
		}
		submissions.Wait()
		if accepted.Load() == 0 {
			b.Fatal("concurrent pressure admitted no Engineer decision")
		}
		if path := <-player.started; path != "fuel.wav" {
			b.Fatalf("first product PlayContext path = %q, want fuel.wav", path)
		}

		id := sequence.Add(1)
		spotter := deliveryCandidate("spotter-"+strconv.FormatUint(id, 10), messagepolicy.FamilySpotter, messagepolicy.IntentSpotterCarLeft, messagepolicy.PrioritySpotter)
		spotter.Subject = "spotter-" + strconv.FormatUint(id, 10)
		player.onSpotterStart = b.StopTimer
		b.StartTimer()
		service.mu.Lock()
		acceptedSpotter, _ := service.submitCandidateLocked(spotter)
		service.mu.Unlock()
		if !acceptedSpotter {
			b.StopTimer()
			b.Fatal("Spotter preemption was rejected")
		}
		if path := <-player.started; path != "spotter.wav" {
			b.StopTimer()
			b.Fatalf("product PlayContext path after preemption = %q, want spotter.wav", path)
		}
		for {
			service.mu.Lock()
			idle := service.activeDelivery == nil && service.scheduler.State().Pending == 0
			service.mu.Unlock()
			if idle {
				break
			}
			time.Sleep(time.Microsecond)
		}
	}
}

func (service *EngineerService) submitCandidateForDeliveryTest(t *testing.T, evidence messagepolicy.Evidence, candidate messagepolicy.Candidate) {
	t.Helper()
	service.mu.Lock()
	service.scheduler.Observe(evidence)
	accepted, outcomes := service.submitCandidateLocked(candidate)
	service.mu.Unlock()
	if !accepted || len(outcomes) != 0 {
		t.Fatalf("submit = %t, %+v", accepted, outcomes)
	}
}

func receiveDecision(t *testing.T, channel <-chan messagepolicy.Decision) messagepolicy.Decision {
	t.Helper()
	select {
	case decision := <-channel:
		return decision
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for delivery")
		return messagepolicy.Decision{}
	}
}

func receiveID(t *testing.T, channel <-chan string) string {
	t.Helper()
	select {
	case id := <-channel:
		return id
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for delivery ID")
		return ""
	}
}

func waitForDeliveryMetric(t *testing.T, service *EngineerService, ready func(delivery.MetricsSnapshot) bool) {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	ticker := time.NewTicker(time.Millisecond)
	defer deadline.Stop()
	defer ticker.Stop()
	for {
		if snapshot := service.DeliveryMetrics(); ready(snapshot) {
			return
		}
		select {
		case <-ticker.C:
		case <-deadline.C:
			t.Fatalf("delivery metric did not reach expected state: %+v", service.DeliveryMetrics())
		}
	}
}

func containsAny(value string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}

func deliveryEvidence(t testing.TB) messagepolicy.Evidence {
	t.Helper()
	manifest, err := engineerprojection.NewManifest([]engineerprojection.Capability{
		{ID: engineerprojection.CapabilitySession, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityStandings, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityControls, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityPit, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityFuel, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityGaps, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilitySpatial, State: engineerprojection.CapabilitySupported},
	})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UnixMilli()
	return messagepolicy.Evidence{
		CanonicalVersion: schema.CanonicalVersionV1, ProjectionVersion: projection.Version(1),
		Context:  engineerprojection.Context{Epoch: 1, Identity: engineerprojection.Identity{Event: "event", Session: "session", Vehicle: "player", Team: "team", Driver: "driver"}},
		Manifest: manifest, Source: engineerprojection.SourceLive, FreshUntilMS: now + 5_000,
		ReadyFamilies: []messagepolicy.Family{messagepolicy.FamilySpotter, messagepolicy.FamilyFuel, messagepolicy.FamilyLaps},
		Semantic:      messagepolicy.SemanticEvidence{SpotterKnown: true, SpotterLeft: true, FuelKnown: true, FuelLitres: 40, FuelCapacityKnown: true, FuelCapacity: 100, LapKnown: true, LapNumber: 1},
	}
}

func deliveryCandidate(id string, family messagepolicy.Family, intent string, priority messagepolicy.Priority) messagepolicy.Candidate {
	now := time.Now().UnixMilli()
	semantic := messagepolicy.SemanticClaim{Rule: messagepolicy.SemanticSpotterLeftActive}
	switch family {
	case messagepolicy.FamilyFuel:
		semantic = messagepolicy.SemanticClaim{Rule: messagepolicy.SemanticFuelHalfTank}
	case messagepolicy.FamilyLaps:
		semantic = messagepolicy.SemanticClaim{Rule: messagepolicy.SemanticLapCurrent, Integer: 1}
	}
	return messagepolicy.Candidate{
		Version: messagepolicy.ContractVersionV1, ID: id, Family: family, Intent: intent, Subject: "player", Priority: priority,
		CreatedAtMS: now, ExpiresAtMS: now + 5_000, CanonicalVersion: schema.CanonicalVersionV1, ProjectionVersion: projection.Version(1),
		Context: engineerprojection.Context{Epoch: 1, Identity: engineerprojection.Identity{Event: "event", Session: "session", Vehicle: "player", Team: "team", Driver: "driver"}}, Semantic: semantic,
	}
}
