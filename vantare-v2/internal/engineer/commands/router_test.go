package commands

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func TestRouterRoutesEveryQueryAcrossLocales(t *testing.T) {
	catalog := DefaultCatalogV1()
	lifecycle := testLifecycle()
	for _, intent := range catalog.Intents {
		if intent.Kind != KindQuery {
			continue
		}
		for _, locale := range SupportedLocales() {
			name := intent.ID + "/" + string(locale)
			t.Run(name, func(t *testing.T) {
				port := newFakeCommandPort()
				port.queryResults[intent.ID] = QueryResult{
					State: QueryFresh, ResponseKey: intent.ResponseKey,
					Values:   map[string]string{"value": "demonstrated"},
					Evidence: freshCommandEvidence(lifecycle, 10, 2_000),
				}
				router := newTestRouter(t, catalog, port)
				text := intent.Phrases[locale][0]
				for _, slot := range intent.Slots {
					text = strings.ReplaceAll(text, "{"+slot.Name+"}", exampleSlotValue(locale, slot))
				}

				turn := router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: locale, Text: text, Lifecycle: lifecycle})
				if turn.Outcome != OutcomeQueryAnswered || turn.IntentID != intent.ID || turn.ResponseKey != intent.ResponseKey {
					t.Fatalf("Handle() = %+v", turn)
				}
				if got := turn.Values["value"]; got != "demonstrated" {
					t.Fatalf("Handle() values = %+v", turn.Values)
				}
			})
		}
	}
}

func TestRouterUnknownAndAmbiguousFailClosed(t *testing.T) {
	lifecycle := testLifecycle()
	t.Run("two unknown turns fall back without touching a port", func(t *testing.T) {
		port := newFakeCommandPort()
		router := newTestRouter(t, DefaultCatalogV1(), port)
		first := router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "make me faster", Lifecycle: lifecycle})
		second := router.Handle(context.Background(), TurnInput{AtMS: 1_001, Locale: LocaleEnglish, Text: "do something", Lifecycle: lifecycle})
		if first.Outcome != OutcomeUnknown || second.Outcome != OutcomeFallback || second.Fallback != FallbackPTTOrUI {
			t.Fatalf("turns = first:%+v second:%+v", first, second)
		}
		if port.queryCalls != 0 || port.proposeCalls != 0 || port.applyCalls != 0 {
			t.Fatalf("unknown input touched port: %+v", port)
		}
	})

	t.Run("ambiguous template never reaches a port", func(t *testing.T) {
		catalog := DefaultCatalogV1()
		for index := range catalog.Intents {
			if catalog.Intents[index].ID == "query.rival.by_name" {
				catalog.Intents[index].Phrases[LocaleEnglish][0] = "tell me about car {driver_name}"
			}
		}
		port := newFakeCommandPort()
		router := newTestRouter(t, catalog, port)
		turn := router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "tell me about car 51", Lifecycle: lifecycle})
		if turn.Outcome != OutcomeAmbiguous || port.queryCalls != 0 || port.proposeCalls != 0 || port.applyCalls != 0 {
			t.Fatalf("Handle() = %+v, port = %+v", turn, port)
		}
	})
}

func TestRouterQueriesNeverInventMissingOrStaleData(t *testing.T) {
	lifecycle := testLifecycle()
	tests := []struct {
		name   string
		result QueryResult
		reason TurnReason
	}{
		{name: "missing", result: QueryResult{State: QueryMissing, Values: map[string]string{"value": "must-not-leak"}}, reason: ReasonEvidenceMissing},
		{name: "stale state", result: QueryResult{State: QueryStale, Values: map[string]string{"value": "must-not-leak"}}, reason: ReasonEvidenceStale},
		{name: "expired evidence", result: QueryResult{State: QueryFresh, ResponseKey: "response.fuel", Values: map[string]string{"value": "must-not-leak"}, Evidence: freshCommandEvidence(lifecycle, 10, 1_000)}, reason: ReasonEvidenceStale},
		{name: "wrong lifecycle", result: QueryResult{State: QueryFresh, ResponseKey: "response.fuel", Values: map[string]string{"value": "must-not-leak"}, Evidence: freshCommandEvidence(DialogueLifecycle{SessionID: "other", DriverID: "driver-1", SourceID: "lmu", Epoch: 1}, 10, 2_000)}, reason: ReasonEvidenceStale},
		{name: "wrong response contract", result: QueryResult{State: QueryFresh, ResponseKey: "response.position", Values: map[string]string{"value": "must-not-leak"}, Evidence: freshCommandEvidence(lifecycle, 10, 2_000)}, reason: ReasonInvalidPortResult},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			port := newFakeCommandPort()
			port.queryResults["query.fuel"] = tt.result
			router := newTestRouter(t, DefaultCatalogV1(), port)
			turn := router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "how much fuel is left", Lifecycle: lifecycle})
			if turn.Outcome != OutcomeUnavailable || turn.Reason != tt.reason || len(turn.Values) != 0 {
				t.Fatalf("Handle() = %+v", turn)
			}
		})
	}
}

func TestRouterRequiresReadbackAndConfirmationForEveryActionAndLocale(t *testing.T) {
	catalog := DefaultCatalogV1()
	lifecycle := testLifecycle()
	for _, intent := range catalog.Intents {
		if intent.Kind != KindAction {
			continue
		}
		for _, locale := range SupportedLocales() {
			t.Run(intent.ID+"/"+string(locale), func(t *testing.T) {
				port := newFakeCommandPort()
				port.proposal = ActionProposal{ID: "proposal-1", IntentID: intent.ID, Evidence: freshCommandEvidence(lifecycle, 12, 10_000)}
				port.applyResult = ActionResult{State: ActionApplied, Values: map[string]string{"result": "accepted"}}
				router := newTestRouter(t, catalog, port)
				text := intent.Phrases[locale][0]
				for _, slot := range intent.Slots {
					text = strings.ReplaceAll(text, "{"+slot.Name+"}", exampleSlotValue(locale, slot))
				}

				proposal := router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: locale, Text: text, Lifecycle: lifecycle})
				if proposal.Outcome != OutcomeActionProposed || proposal.IntentID != intent.ID ||
					proposal.ResponseKey != intent.ResponseKey+".readback" || !proposal.RequiresConfirmation || port.applyCalls != 0 {
					t.Fatalf("proposal = %+v, apply calls = %d", proposal, port.applyCalls)
				}
				confirmation := catalog.Dialogue.Confirm[locale][0]
				applied := router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: locale, Text: confirmation, Lifecycle: lifecycle})
				if applied.Outcome != OutcomeActionApplied || applied.IntentID != intent.ID || applied.ResponseKey != intent.ResponseKey ||
					applied.Values["result"] != "accepted" || port.applyCalls != 1 {
					t.Fatalf("applied = %+v, port = %+v", applied, port)
				}
				if port.lastConfirmed.IntentID != intent.ID || port.lastConfirmed.ProposalID != "proposal-1" ||
					port.lastConfirmed.ConfirmedAtMS != 1_100 || port.lastConfirmed.Lifecycle != lifecycle {
					t.Fatalf("confirmed action = %+v", port.lastConfirmed)
				}
			})
		}
	}
}

func TestRouterActionProposalAndApplyFailClosed(t *testing.T) {
	lifecycle := testLifecycle()
	tests := []struct {
		name     string
		proposal ActionProposal
		want     TurnReason
	}{
		{name: "stale evidence", proposal: ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 1, 1_000)}, want: ReasonEvidenceStale},
		{name: "wrong lifecycle", proposal: ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(DialogueLifecycle{SessionID: "other", DriverID: "driver-1", SourceID: "lmu", Epoch: 1}, 1, 2_000)}, want: ReasonEvidenceStale},
		{name: "wrong intent", proposal: ActionProposal{ID: "proposal-1", IntentID: "action.pit.abort", Evidence: freshCommandEvidence(lifecycle, 1, 2_000)}, want: ReasonInvalidPortResult},
		{name: "invalid proposal id", proposal: ActionProposal{ID: "Driver Name", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 1, 2_000)}, want: ReasonInvalidPortResult},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			port := newFakeCommandPort()
			port.proposal = tt.proposal
			router := newTestRouter(t, DefaultCatalogV1(), port)
			turn := router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle})
			if turn.Outcome != OutcomeUnavailable || turn.Reason != tt.want || port.applyCalls != 0 {
				t.Fatalf("Handle() = %+v, port = %+v", turn, port)
			}
		})
	}

	t.Run("port failure cannot become an applied action", func(t *testing.T) {
		port := newFakeCommandPort()
		port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 1, 5_000)}
		port.applyErr = context.Canceled
		router := newTestRouter(t, DefaultCatalogV1(), port)
		router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle})
		turn := router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle})
		if turn.Outcome != OutcomeUnavailable || turn.Reason != ReasonPortUnavailable || port.applyCalls != 1 {
			t.Fatalf("Handle() = %+v, port = %+v", turn, port)
		}
	})

	t.Run("oversized applied values never escape the port", func(t *testing.T) {
		port := newFakeCommandPort()
		port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 1, 5_000)}
		port.applyResult = ActionResult{State: ActionApplied, Values: map[string]string{"result": strings.Repeat("x", 257)}}
		router := newTestRouter(t, DefaultCatalogV1(), port)
		router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle})
		turn := router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle})
		if turn.Outcome != OutcomeUnavailable || turn.Reason != ReasonInvalidPortResult || len(turn.Values) != 0 {
			t.Fatalf("Handle() = %+v", turn)
		}
	})
}

func TestRouterCancelTimeoutAndDoubleSubmitNeverApplyTwice(t *testing.T) {
	lifecycle := testLifecycle()
	newPending := func(t *testing.T) (*Router, *fakeCommandPort) {
		t.Helper()
		port := newFakeCommandPort()
		port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 1, 10_000)}
		port.applyResult = ActionResult{State: ActionApplied}
		router := newTestRouter(t, DefaultCatalogV1(), port)
		proposal := router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle})
		if proposal.Outcome != OutcomeActionProposed {
			t.Fatalf("proposal = %+v", proposal)
		}
		return router, port
	}

	t.Run("cancel rejects proposal", func(t *testing.T) {
		router, port := newPending(t)
		turn := router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleEnglish, Text: "cancel", Lifecycle: lifecycle})
		if turn.Outcome != OutcomeActionRejected || turn.Reason != ReasonUserRejected || port.applyCalls != 0 {
			t.Fatalf("turn = %+v, port = %+v", turn, port)
		}
		router.Handle(context.Background(), TurnInput{AtMS: 1_200, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle})
		if port.applyCalls != 0 {
			t.Fatalf("cancelled action applied later: %+v", port)
		}
	})

	t.Run("timeout rejects at exact deadline", func(t *testing.T) {
		router, port := newPending(t)
		turn := router.Handle(context.Background(), TurnInput{AtMS: 6_000, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle})
		if turn.Outcome != OutcomeTimedOut || turn.Reason != ReasonDialogueTimeout || port.applyCalls != 0 {
			t.Fatalf("turn = %+v, port = %+v", turn, port)
		}
	})

	t.Run("concurrent confirmation applies once", func(t *testing.T) {
		router, port := newPending(t)
		start := make(chan struct{})
		turns := make(chan Turn, 2)
		for range 2 {
			go func() {
				<-start
				turns <- router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle})
			}()
		}
		close(start)
		first, second := <-turns, <-turns
		if port.applyCalls != 1 {
			t.Fatalf("apply calls = %d, turns = %+v / %+v", port.applyCalls, first, second)
		}
		applied := 0
		for _, turn := range []Turn{first, second} {
			if turn.Outcome == OutcomeActionApplied {
				applied++
			}
		}
		if applied != 1 {
			t.Fatalf("turns = %+v / %+v", first, second)
		}
	})

	t.Run("second action cannot replace pending proposal", func(t *testing.T) {
		router, port := newPending(t)
		turn := router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleEnglish, Text: "abort the pit stop", Lifecycle: lifecycle})
		if turn.Outcome != OutcomeRetry || port.proposeCalls != 1 || port.applyCalls != 0 {
			t.Fatalf("turn = %+v, port = %+v", turn, port)
		}
	})
}

func TestRouterLifecycleChangesCancelPendingAction(t *testing.T) {
	base := testLifecycle()
	tests := []struct {
		name string
		next DialogueLifecycle
	}{
		{name: "session", next: DialogueLifecycle{SessionID: "session-2", DriverID: base.DriverID, SourceID: base.SourceID, Epoch: base.Epoch}},
		{name: "driver", next: DialogueLifecycle{SessionID: base.SessionID, DriverID: "driver-2", SourceID: base.SourceID, Epoch: base.Epoch}},
		{name: "source", next: DialogueLifecycle{SessionID: base.SessionID, DriverID: base.DriverID, SourceID: "iracing", Epoch: base.Epoch}},
		{name: "epoch", next: DialogueLifecycle{SessionID: base.SessionID, DriverID: base.DriverID, SourceID: base.SourceID, Epoch: base.Epoch + 1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			port := newFakeCommandPort()
			port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(base, 1, 10_000)}
			port.applyResult = ActionResult{State: ActionApplied}
			router := newTestRouter(t, DefaultCatalogV1(), port)
			router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: base})
			turn := router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleEnglish, Text: "confirm", Lifecycle: tt.next})
			if turn.Outcome != OutcomeCancelled || turn.Reason != ReasonLifecycleChanged || port.applyCalls != 0 {
				t.Fatalf("Handle() = %+v, port = %+v", turn, port)
			}
		})
	}
}

func TestRouterLocaleChangeCancelsPendingAction(t *testing.T) {
	lifecycle := testLifecycle()
	port := newFakeCommandPort()
	port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 1, 10_000)}
	port.applyResult = ActionResult{State: ActionApplied}
	router := newTestRouter(t, DefaultCatalogV1(), port)
	router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle})
	turn := router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleSpanish, Text: "confirmar", Lifecycle: lifecycle})
	if turn.Outcome != OutcomeCancelled || turn.Reason != ReasonLocaleChanged || port.applyCalls != 0 {
		t.Fatalf("Handle() = %+v, port = %+v", turn, port)
	}
}

func TestRouterRevalidatesEvidenceInsideActionPort(t *testing.T) {
	lifecycle := testLifecycle()
	port := newFakeCommandPort()
	port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 10, 10_000)}
	port.applyResult = ActionResult{State: ActionApplied}
	router := newTestRouter(t, DefaultCatalogV1(), port)
	router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle})
	port.mu.Lock()
	port.currentEvidence = freshCommandEvidence(lifecycle, 11, 10_000)
	port.mu.Unlock()
	turn := router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle})
	if turn.Outcome != OutcomeUnavailable || turn.Reason != ReasonEvidenceStale || port.applyCalls != 1 {
		t.Fatalf("Handle() = %+v, port = %+v", turn, port)
	}
}

func TestRouterCancelledContextNeverReachesPort(t *testing.T) {
	lifecycle := testLifecycle()
	port := newFakeCommandPort()
	router := newTestRouter(t, DefaultCatalogV1(), port)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	turn := router.Handle(ctx, TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "how much fuel is left", Lifecycle: lifecycle})
	if turn.Outcome != OutcomeCancelled || turn.Reason != ReasonContextCancelled || port.queryCalls != 0 {
		t.Fatalf("Handle() = %+v, port = %+v", turn, port)
	}
}

func TestRouterContextCancellationDuringReadOnlyPortFailsClosed(t *testing.T) {
	lifecycle := testLifecycle()
	t.Run("query", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		port := newFakeCommandPort()
		port.onQuery = cancel
		port.queryResults["query.fuel"] = QueryResult{
			State: QueryFresh, ResponseKey: "response.fuel", Values: map[string]string{"litres": "42"},
			Evidence: freshCommandEvidence(lifecycle, 1, 2_000),
		}
		router := newTestRouter(t, DefaultCatalogV1(), port)
		turn := router.Handle(ctx, TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "how much fuel is left", Lifecycle: lifecycle})
		if turn.Outcome != OutcomeCancelled || turn.Reason != ReasonContextCancelled || len(turn.Values) != 0 || port.queryCalls != 1 {
			t.Fatalf("Handle() = %+v, port = %+v", turn, port)
		}
	})

	t.Run("proposal", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		port := newFakeCommandPort()
		port.onPropose = cancel
		port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 1, 2_000)}
		router := newTestRouter(t, DefaultCatalogV1(), port)
		turn := router.Handle(ctx, TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle})
		if turn.Outcome != OutcomeCancelled || turn.Reason != ReasonContextCancelled || turn.ProposalID != "" || port.proposeCalls != 1 {
			t.Fatalf("Handle() = %+v, port = %+v", turn, port)
		}
	})
}

func TestRouterRejectsOversizedQueryValues(t *testing.T) {
	lifecycle := testLifecycle()
	port := newFakeCommandPort()
	port.queryResults["query.fuel"] = QueryResult{
		State: QueryFresh, ResponseKey: "response.fuel", Values: map[string]string{"litres": strings.Repeat("x", 257)},
		Evidence: freshCommandEvidence(lifecycle, 1, 2_000),
	}
	router := newTestRouter(t, DefaultCatalogV1(), port)
	turn := router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "how much fuel is left", Lifecycle: lifecycle})
	if turn.Outcome != OutcomeUnavailable || turn.Reason != ReasonInvalidPortResult || len(turn.Values) != 0 {
		t.Fatalf("Handle() = %+v", turn)
	}
}

func TestNewRouterRejectsInvalidDependenciesAndTimeout(t *testing.T) {
	port := newFakeCommandPort()
	tests := []struct {
		name       string
		queryPort  QueryPort
		actionPort ActionPort
		timeoutMS  int64
	}{
		{name: "nil query", actionPort: port, timeoutMS: 5_000},
		{name: "nil action", queryPort: port, timeoutMS: 5_000},
		{name: "zero timeout", queryPort: port, actionPort: port},
		{name: "excessive timeout", queryPort: port, actionPort: port, timeoutMS: 60_001},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := NewRouter(DefaultCatalogV1(), tt.queryPort, tt.actionPort, tt.timeoutMS); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("NewRouter() error = %v", err)
			}
		})
	}
}

func TestRouterOwnsCatalogAfterConstruction(t *testing.T) {
	lifecycle := testLifecycle()
	catalog := DefaultCatalogV1()
	port := newFakeCommandPort()
	port.queryResults["query.fuel"] = QueryResult{State: QueryFresh, ResponseKey: "response.fuel", Values: map[string]string{"litres": "42"}, Evidence: freshCommandEvidence(lifecycle, 1, 2_000)}
	router := newTestRouter(t, catalog, port)
	for index := range catalog.Intents {
		catalog.Intents[index].ResponseKey = "forged.response"
		for locale := range catalog.Intents[index].Phrases {
			catalog.Intents[index].Phrases[locale][0] = "forged phrase"
		}
	}
	turn := router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "how much fuel is left", Lifecycle: lifecycle})
	if turn.Outcome != OutcomeQueryAnswered || turn.ResponseKey != "response.fuel" {
		t.Fatalf("caller mutation changed router: %+v", turn)
	}
}

func TestRouterTwoDialogueFailuresClearPendingAndUseFallback(t *testing.T) {
	lifecycle := testLifecycle()
	port := newFakeCommandPort()
	port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 1, 10_000)}
	port.applyResult = ActionResult{State: ActionApplied}
	router := newTestRouter(t, DefaultCatalogV1(), port)
	router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle})

	first := router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleEnglish, Text: "maybe", Lifecycle: lifecycle})
	second := router.Handle(context.Background(), TurnInput{AtMS: 1_200, Locale: LocaleEnglish, Text: "still maybe", Lifecycle: lifecycle})
	if first.Outcome != OutcomeRetry || second.Outcome != OutcomeFallback || second.Fallback != FallbackPTTOrUI {
		t.Fatalf("turns = %+v / %+v", first, second)
	}
	router.Handle(context.Background(), TurnInput{AtMS: 1_300, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle})
	if port.applyCalls != 0 {
		t.Fatalf("fallback retained pending action: %+v", port)
	}
}

func TestRouterClockRollbackCancelsPendingAction(t *testing.T) {
	lifecycle := testLifecycle()
	port := newFakeCommandPort()
	port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 1, 10_000)}
	port.applyResult = ActionResult{State: ActionApplied}
	router := newTestRouter(t, DefaultCatalogV1(), port)
	router.Handle(context.Background(), TurnInput{AtMS: 1_000, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle})
	rollback := router.Handle(context.Background(), TurnInput{AtMS: 999, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle})
	if rollback.Outcome != OutcomeCancelled || rollback.Reason != ReasonClockRollback || port.applyCalls != 0 {
		t.Fatalf("rollback = %+v, port = %+v", rollback, port)
	}
	router.Handle(context.Background(), TurnInput{AtMS: 1_100, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle})
	if port.applyCalls != 0 {
		t.Fatalf("rollback retained pending action: %+v", port)
	}
}

func TestRouterReplayIsDeterministicAndMatchesGolden(t *testing.T) {
	lifecycle := testLifecycle()
	steps := []TurnInput{
		{AtMS: 1_000, Locale: LocaleSpanish, Text: "cuánto combustible queda", Lifecycle: lifecycle},
		{AtMS: 1_100, Locale: LocaleEnglish, Text: "request the pit stop", Lifecycle: lifecycle},
		{AtMS: 1_200, Locale: LocaleEnglish, Text: "confirm", Lifecycle: lifecycle},
		{AtMS: 1_300, Locale: LocaleItalian, Text: "qual è la mia posizione", Lifecycle: lifecycle},
		{AtMS: 1_400, Locale: LocalePortugueseBrazil, Text: "algo desconhecido", Lifecycle: lifecycle},
	}
	run := func(t *testing.T) ReplayReport {
		t.Helper()
		port := newFakeCommandPort()
		port.queryResults["query.fuel"] = QueryResult{State: QueryFresh, ResponseKey: "response.fuel", Values: map[string]string{"litres": "42"}, Evidence: freshCommandEvidence(lifecycle, 10, 10_000)}
		port.queryResults["query.position"] = QueryResult{State: QueryFresh, ResponseKey: "response.position", Values: map[string]string{"position": "3"}, Evidence: freshCommandEvidence(lifecycle, 11, 10_000)}
		port.proposal = ActionProposal{ID: "proposal-1", IntentID: "action.pit.request", Evidence: freshCommandEvidence(lifecycle, 12, 10_000)}
		port.applyResult = ActionResult{State: ActionApplied, Values: map[string]string{"result": "accepted"}}
		report, err := RunReplay(context.Background(), newTestRouter(t, DefaultCatalogV1(), port), steps)
		if err != nil {
			t.Fatalf("RunReplay() error = %v", err)
		}
		return report
	}

	first, second := run(t), run(t)
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("replay is not deterministic:\nfirst=%+v\nsecond=%+v", first, second)
	}
	encoded, err := json.MarshalIndent(first, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent() error = %v", err)
	}
	encoded = append(encoded, '\n')
	want, err := os.ReadFile("testdata/router_v1.golden.json")
	if err != nil {
		t.Fatalf("ReadFile(golden) error = %v", err)
	}
	if string(encoded) != string(want) {
		t.Fatalf("replay differs from golden:\n%s", encoded)
	}
}

type fakeCommandPort struct {
	mu              sync.Mutex
	queryResults    map[string]QueryResult
	queryErr        error
	proposal        ActionProposal
	proposalErr     error
	applyResult     ActionResult
	applyErr        error
	queryCalls      int
	proposeCalls    int
	applyCalls      int
	lastQuery       QueryRequest
	lastProposal    ActionRequest
	lastConfirmed   ConfirmedAction
	currentEvidence CommandEvidence
	onQuery         func()
	onPropose       func()
}

func newFakeCommandPort() *fakeCommandPort {
	return &fakeCommandPort{queryResults: make(map[string]QueryResult)}
}

func (port *fakeCommandPort) ResolveQuery(_ context.Context, request QueryRequest) (QueryResult, error) {
	port.mu.Lock()
	defer port.mu.Unlock()
	port.queryCalls++
	port.lastQuery = request
	if port.onQuery != nil {
		port.onQuery()
	}
	if port.queryErr != nil {
		return QueryResult{}, port.queryErr
	}
	result, ok := port.queryResults[request.IntentID]
	if !ok {
		return QueryResult{State: QueryMissing}, nil
	}
	return result, nil
}

func (port *fakeCommandPort) ProposeAction(_ context.Context, request ActionRequest) (ActionProposal, error) {
	port.mu.Lock()
	defer port.mu.Unlock()
	port.proposeCalls++
	port.lastProposal = request
	if port.onPropose != nil {
		port.onPropose()
	}
	if port.currentEvidence.Sequence == 0 {
		port.currentEvidence = port.proposal.Evidence
	}
	return port.proposal, port.proposalErr
}

func (port *fakeCommandPort) ApplyAction(_ context.Context, action ConfirmedAction) (ActionResult, error) {
	port.mu.Lock()
	defer port.mu.Unlock()
	port.applyCalls++
	port.lastConfirmed = action
	if action.Evidence != port.currentEvidence {
		return ActionResult{State: ActionStale}, nil
	}
	return port.applyResult, port.applyErr
}

func newTestRouter(t *testing.T, catalog Catalog, port *fakeCommandPort) *Router {
	t.Helper()
	router, err := NewRouter(catalog, port, port, 5_000)
	if err != nil {
		t.Fatalf("NewRouter() error = %v", err)
	}
	return router
}

func testLifecycle() DialogueLifecycle {
	return DialogueLifecycle{SessionID: "session-1", DriverID: "driver-1", SourceID: "lmu", Epoch: 1}
}

func freshCommandEvidence(lifecycle DialogueLifecycle, sequence uint64, freshUntilMS int64) CommandEvidence {
	return CommandEvidence{Lifecycle: lifecycle, Sequence: sequence, FreshUntilMS: freshUntilMS}
}

var _ QueryPort = (*fakeCommandPort)(nil)
var _ ActionPort = (*fakeCommandPort)(nil)
