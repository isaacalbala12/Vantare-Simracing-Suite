package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/delivery"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/presentation"
)

var ErrDeliveryTransportRunning = errors.New("engineer delivery transport cannot change while the service is running")

type wallClock struct{}

func (wallClock) NowMS() int64 { return time.Now().UnixMilli() }

type activeDelivery struct {
	id       string
	decision messagepolicy.Decision
	cancel   context.CancelCauseFunc
}

type deliveryResult struct {
	id string
}

type startRejectedError struct {
	reason messagepolicy.Reason
}

func (err startRejectedError) Error() string {
	return "engineer delivery start rejected: " + string(err.reason)
}

// SetDeliveryTransport installs the single product delivery port. Composition
// must finish before Start so an active message can never switch transports.
func (s *EngineerService) SetDeliveryTransport(port delivery.Port) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return ErrDeliveryTransportRunning
	}
	s.deliveryPort = port
	return nil
}

// DeliveryMetrics returns bounded, sanitized lifecycle counters and latency.
func (s *EngineerService) DeliveryMetrics() delivery.MetricsSnapshot {
	return s.deliveryMetrics.Snapshot()
}

func (s *EngineerService) submitCandidateLocked(candidate messagepolicy.Candidate) (bool, []messagepolicy.PolicyOutcome) {
	accepted, outcomes := s.scheduler.Submit(candidate)
	if !accepted {
		return false, outcomes
	}
	if candidate.Priority == messagepolicy.PrioritySpotter && s.activeDelivery != nil &&
		s.activeDelivery.decision.Priority < messagepolicy.PrioritySpotter {
		s.activeDelivery.cancel(delivery.ErrPreemptedBySpotter)
	}
	s.signalDeliveryLocked()
	return true, outcomes
}

func (s *EngineerService) signalDeliveryLocked() {
	select {
	case s.deliveryWake <- struct{}{}:
	default:
	}
}

func (s *EngineerService) cancelDeliveryLocked(cause error) {
	if s.activeDelivery != nil {
		s.activeDelivery.cancel(cause)
	}
}

func (s *EngineerService) queueLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			s.mu.Lock()
			s.cancelDeliveryLocked(delivery.ErrLifecycleBoundary)
			s.mu.Unlock()
			return
		case result := <-s.deliveryDone:
			s.mu.Lock()
			if s.activeDelivery != nil && s.activeDelivery.id == result.id {
				s.activeDelivery = nil
			}
			s.signalDeliveryLocked()
			s.mu.Unlock()
		case <-s.deliveryWake:
			for s.dispatchNext(ctx) {
			}
		}
	}
}

// dispatchNext returns true only when a selected item failed synchronously and
// the loop may immediately try the next pending candidate.
func (s *EngineerService) dispatchNext(parent context.Context) bool {
	s.mu.Lock()
	if !s.running || !s.enabled || s.activeDelivery != nil || s.scheduler == nil {
		s.mu.Unlock()
		return false
	}
	decision, _, ok := s.scheduler.Next()
	if !ok {
		s.mu.Unlock()
		return false
	}

	s.deliveryNext++
	deliveryID := fmt.Sprintf("delivery-%d", s.deliveryNext)
	deliveryCtx, cancel := context.WithCancelCause(parent)
	request := delivery.Request{
		Version: delivery.ContractVersionV1, DeliveryID: deliveryID,
		DecidedAtMS: s.policyClock.NowMS(), Decision: decision,
	}
	session, err := delivery.NewSession(request, s.policyClock, s.deliveryMetrics, func(ack delivery.Acknowledgement) error {
		if ack.State != delivery.StateStarted {
			return nil
		}
		s.mu.Lock()
		if cause := context.Cause(deliveryCtx); cause != nil {
			s.mu.Unlock()
			reason := messagepolicy.ReasonLifecycleBoundary
			if errors.Is(cause, delivery.ErrPreemptedBySpotter) {
				reason = messagepolicy.ReasonPreemptedBySpotter
			} else if errors.Is(cause, delivery.ErrSourceUnavailable) {
				reason = messagepolicy.ReasonSourceUnavailable
			}
			return startRejectedError{reason: reason}
		}
		reason := s.scheduler.AcknowledgeStarted(decision)
		s.mu.Unlock()
		if reason != "" {
			return startRejectedError{reason: reason}
		}
		return nil
	})
	if err != nil {
		cancel(err)
		s.lastError = err.Error()
		s.mu.Unlock()
		return true
	}
	if err := session.Acknowledge(delivery.StateQueued, delivery.ReasonNone); err != nil {
		cancel(err)
		s.lastError = err.Error()
		s.mu.Unlock()
		return true
	}

	port := s.deliveryPort
	if port == nil {
		port = productDeliveryPort{
			service: s, player: s.audioPlayer, resolver: s.audioResolver, router: s.audioRouter,
			presentationResolver: s.presentationResolver, locale: s.presentationLocale,
		}
	}

	s.activeDelivery = &activeDelivery{id: deliveryID, decision: decision, cancel: cancel}
	s.wg.Add(1)
	s.mu.Unlock()

	go s.runDelivery(deliveryCtx, request, session, port)
	return false
}

func (s *EngineerService) runDelivery(ctx context.Context, request delivery.Request, session *delivery.Session, port delivery.Port) {
	defer s.wg.Done()
	err := port.Deliver(ctx, request, session)
	if !session.Terminal() {
		cause := context.Cause(ctx)
		var rejected startRejectedError
		switch {
		case errors.Is(cause, delivery.ErrPreemptedBySpotter):
			state := delivery.StateCancelled
			if session.State() == delivery.StateStarted {
				state = delivery.StateInterrupted
			}
			_ = session.Acknowledge(state, delivery.ReasonPreemptedBySpotter)
		case errors.Is(cause, delivery.ErrSourceUnavailable):
			_ = session.Acknowledge(delivery.StateCancelled, delivery.ReasonSourceUnavailable)
		case cause != nil:
			_ = session.Acknowledge(delivery.StateCancelled, delivery.ReasonLifecycleBoundary)
		case errors.As(err, &rejected):
			reason := delivery.ReasonPolicyRejected
			switch rejected.reason {
			case messagepolicy.ReasonDeadlineElapsed:
				reason = delivery.ReasonDeadlineElapsed
			case messagepolicy.ReasonSourceUnavailable, messagepolicy.ReasonEvidenceStale:
				reason = delivery.ReasonSourceUnavailable
			}
			_ = session.Acknowledge(delivery.StateCancelled, reason)
		case err != nil:
			_ = session.Acknowledge(delivery.StateFailed, delivery.ReasonTransportError)
		default:
			_ = session.Acknowledge(delivery.StateFailed, delivery.ReasonTransportError)
		}
	}
	// At most one delivery is active, so the single-slot result channel cannot
	// block. Always report completion even when this delivery was cancelled;
	// otherwise a preempted item could leave the scheduler permanently busy.
	s.deliveryDone <- deliveryResult{id: request.DeliveryID}
}

type productDeliveryPort struct {
	service              *EngineerService
	player               AudioPlayer
	resolver             AudioResolver
	router               *audio.AudioRouter
	presentationResolver *presentation.Resolver
	locale               presentation.Locale
}

const audioCacheResolveTimeout = 100 * time.Millisecond

func (port productDeliveryPort) Deliver(ctx context.Context, request delivery.Request, reporter delivery.Reporter) error {
	if cause := context.Cause(ctx); cause != nil {
		reason := delivery.ReasonLifecycleBoundary
		if errors.Is(cause, delivery.ErrPreemptedBySpotter) {
			reason = delivery.ReasonPreemptedBySpotter
		} else if errors.Is(cause, delivery.ErrSourceUnavailable) {
			reason = delivery.ReasonSourceUnavailable
		}
		return reporter.Acknowledge(delivery.StateCancelled, reason)
	}
	presented, err := port.presentationResolver.Resolve(request.Decision, port.locale)
	if err != nil {
		return err
	}
	path := ""
	if port.player != nil {
		channel := audio.Channel(presented.Channel)
		resolveCtx, cancelResolve := context.WithTimeout(ctx, audioCacheResolveTimeout)
		var resolveErr error
		audioRequest := audio.PresentationRequest{
			Locale: presented.Locale, VoiceText: presented.VoiceText,
			Channel: channel, LegacyIntent: presented.Intent,
		}
		if port.router != nil {
			path, resolveErr = port.router.ResolvePresentationCached(resolveCtx, audioRequest)
		} else if port.resolver != nil {
			path, resolveErr = port.resolver.ResolvePresentationCached(resolveCtx, audioRequest)
		}
		cancelResolve()
		if cause := context.Cause(ctx); cause != nil {
			return acknowledgeCancellation(reporter, cause)
		}
		// A cache miss, lookup error or local timeout degrades to the visual
		// transport. Synthesis is deliberately outside this delivery cut.
		if resolveErr != nil {
			path = ""
		}
	}
	if cause := context.Cause(ctx); cause != nil {
		return acknowledgeCancellation(reporter, cause)
	}
	if err := reporter.Acknowledge(delivery.StateStarted, delivery.ReasonNone); err != nil {
		return err
	}
	port.service.publishDecision(request.Decision, presented)
	if port.player == nil {
		return reporter.Acknowledge(delivery.StateCompleted, delivery.ReasonNone)
	}
	if path == "" {
		// The visual notification is a complete product transport even while
		// audio/TTS is not configured in this checkpoint.
		return reporter.Acknowledge(delivery.StateCompleted, delivery.ReasonNone)
	}
	if err := port.player.PlayContext(ctx, path); err != nil {
		if errors.Is(context.Cause(ctx), delivery.ErrPreemptedBySpotter) {
			return reporter.Acknowledge(delivery.StateInterrupted, delivery.ReasonPreemptedBySpotter)
		}
		if errors.Is(context.Cause(ctx), delivery.ErrSourceUnavailable) {
			return reporter.Acknowledge(delivery.StateCancelled, delivery.ReasonSourceUnavailable)
		}
		if context.Cause(ctx) != nil {
			return reporter.Acknowledge(delivery.StateCancelled, delivery.ReasonLifecycleBoundary)
		}
		return reporter.Acknowledge(delivery.StateFailed, delivery.ReasonTransportError)
	}
	return reporter.Acknowledge(delivery.StateCompleted, delivery.ReasonNone)
}

func acknowledgeCancellation(reporter delivery.Reporter, cause error) error {
	reason := delivery.ReasonLifecycleBoundary
	if errors.Is(cause, delivery.ErrPreemptedBySpotter) {
		reason = delivery.ReasonPreemptedBySpotter
	} else if errors.Is(cause, delivery.ErrSourceUnavailable) {
		reason = delivery.ReasonSourceUnavailable
	}
	return reporter.Acknowledge(delivery.StateCancelled, reason)
}

func (s *EngineerService) publishDecision(decision messagepolicy.Decision, presented presentation.Presentation) {
	s.publishNotification(EngineerNotification{
		Version: presented.Version, ID: decision.CandidateID, Category: string(presented.Family),
		Severity: string(presented.Severity), TextKey: presented.Intent, Text: presented.VisualText,
		VoiceText: presented.VoiceText, Locale: string(presented.Locale), Role: string(presented.Role),
		Channel: string(presented.Channel), Priority: int(presented.Priority), CreatedAt: presented.CreatedAtMS,
		ExpiresAt: presented.ExpiresAtMS, Source: "telemetry-core",
	})
}

func (s *EngineerService) publishLegacyHarness(message audio.Message) {
	notification := EngineerNotification{
		ID: message.ID, Category: string(message.Category), Severity: string(message.Severity),
		TextKey: message.TextKey, Text: translateLegacyHarness(message.TextKey), Priority: int(message.Priority),
		CreatedAt: message.CreatedAt, ExpiresAt: message.ExpiresAt, Source: "harness",
	}
	s.publishNotification(notification)

	s.mu.Lock()
	player, resolver, router := s.audioPlayer, s.audioResolver, s.audioRouter
	s.mu.Unlock()
	if player == nil {
		return
	}
	path := ""
	legacyChannel := message.Channel
	if legacyChannel == "" {
		legacyChannel = audio.ChannelEngineer
		if message.Priority == audio.PrioritySpotter {
			legacyChannel = audio.ChannelSpotter
		}
	}
	legacyRequest := audio.PresentationRequest{
		Locale: presentation.LocaleSpanish, VoiceText: translateLegacyHarness(message.TextKey),
		Channel: legacyChannel, LegacyIntent: message.TextKey,
	}
	if router != nil {
		path, _ = router.ResolvePresentationCached(context.Background(), legacyRequest)
	} else if resolver != nil {
		path, _ = resolver.ResolvePresentationCached(context.Background(), legacyRequest)
	}
	if path != "" {
		_ = player.PlayContext(context.Background(), path)
	}
}

func (s *EngineerService) publishNotification(notification EngineerNotification) {
	s.store.Add(notification)
	s.mu.Lock()
	for _, subscriber := range s.subs {
		select {
		case subscriber <- notification:
		default:
			s.dropCount.Add(1)
		}
	}
	s.mu.Unlock()
	if s.emitter != nil {
		s.emitter.Emit("engineer:notification", notification)
		s.emitStatus()
	}
}
