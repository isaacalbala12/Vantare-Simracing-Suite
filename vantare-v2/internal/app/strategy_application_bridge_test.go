package app

import (
	"context"
	"errors"
	"reflect"
	"testing"

	strategyapplication "github.com/vantare/overlays/v2/internal/strategy/application"
)

type fakeStrategyApplicationExecutor struct {
	result   []byte
	err      error
	received []byte
}

func (executor *fakeStrategyApplicationExecutor) Execute(_ context.Context, document []byte) ([]byte, error) {
	executor.received = append([]byte(nil), document...)
	return executor.result, executor.err
}

type recordedStrategyApplicationEvent struct {
	name    string
	payload any
}

type strategyApplicationEmitterSpy struct {
	events []recordedStrategyApplicationEvent
}

func (spy *strategyApplicationEmitterSpy) Emit(name string, payload any) {
	spy.events = append(spy.events, recordedStrategyApplicationEvent{name: name, payload: payload})
}

func TestStrategyApplicationBridgeEncodesCommandAndDecodesResult(t *testing.T) {
	t.Parallel()

	executor := &fakeStrategyApplicationExecutor{result: []byte(`{"protocolVersion":"strategy.application.v1","commandId":"events-1","repositoryVersion":4,"events":[],"imported":false,"recoveredFromBackup":false,"closed":false}`)}
	emitter := &strategyApplicationEmitterSpy{}
	bridge := NewStrategyApplicationBridge(context.Background(), executor, emitter)

	bridge.HandleCommand(map[string]any{
		"protocolVersion":           "strategy.application.v1",
		"commandId":                 "events-1",
		"operation":                 "list_events",
		"expectedRepositoryVersion": 4,
	})

	wantDocument := []byte(`{"commandId":"events-1","expectedRepositoryVersion":4,"operation":"list_events","protocolVersion":"strategy.application.v1"}`)
	if !reflect.DeepEqual(executor.received, wantDocument) {
		t.Fatalf("encoded command = %s, want %s", executor.received, wantDocument)
	}
	if len(emitter.events) != 1 || emitter.events[0].name != StrategyApplicationResultEvent {
		t.Fatalf("events = %#v, want one %q", emitter.events, StrategyApplicationResultEvent)
	}
	payload, ok := emitter.events[0].payload.(map[string]any)
	if !ok || payload["commandId"] != "events-1" || payload["repositoryVersion"] != float64(4) {
		t.Fatalf("result payload = %#v", emitter.events[0].payload)
	}
}

func TestStrategyApplicationBridgePropagatesEveryTypedDocumentError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		code strategyapplication.ErrorCode
	}{
		{name: "event not found", code: strategyapplication.ErrorEventNotFound},
		{name: "event conflict", code: strategyapplication.ErrorEventConflict},
		{name: "driver not found", code: strategyapplication.ErrorDriverNotFound},
		{name: "driver conflict", code: strategyapplication.ErrorDriverConflict},
		{name: "driver in use", code: strategyapplication.ErrorDriverInUse},
		{name: "variant not found", code: strategyapplication.ErrorVariantNotFound},
		{name: "variant conflict", code: strategyapplication.ErrorVariantConflict},
		{name: "legacy migration conflict", code: strategyapplication.ErrorLegacyMigrationConflict},
		{name: "legacy migration not found", code: strategyapplication.ErrorLegacyMigrationNotFound},
		{name: "calculation invalid", code: strategyapplication.ErrorCalculationInvalid},
		{name: "calculation infeasible", code: strategyapplication.ErrorCalculationInfeasible},
		{name: "calculation overflow", code: strategyapplication.ErrorCalculationOverflow},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			executor := &fakeStrategyApplicationExecutor{err: &strategyapplication.ApplicationError{
				Code: test.code, Field: "document.id", Cause: errors.New("private cause"),
			}}
			emitter := &strategyApplicationEmitterSpy{}
			NewStrategyApplicationBridge(context.Background(), executor, emitter).HandleCommand(map[string]any{
				"commandId": "command-typed",
			})

			if len(emitter.events) != 1 || emitter.events[0].name != StrategyApplicationErrorEvent {
				t.Fatalf("events = %#v", emitter.events)
			}
			failure, ok := emitter.events[0].payload.(StrategyApplicationErrorResponse)
			if !ok {
				t.Fatalf("failure type = %T", emitter.events[0].payload)
			}
			if failure.CommandID != "command-typed" || failure.Code != StrategyApplicationPublicErrorCode(test.code) || failure.Field != "document.id" || failure.Message == "" {
				t.Fatalf("failure = %#v", failure)
			}
		})
	}
}

func TestStrategyApplicationBridgeSanitizesUnknownErrors(t *testing.T) {
	t.Parallel()

	executor := &fakeStrategyApplicationExecutor{err: errors.New(`C:\Users\private\strategy.json token=secret`)}
	emitter := &strategyApplicationEmitterSpy{}
	NewStrategyApplicationBridge(context.Background(), executor, emitter).HandleCommand(map[string]any{
		"commandId": "command-private",
	})

	failure, ok := emitter.events[0].payload.(StrategyApplicationErrorResponse)
	if !ok {
		t.Fatalf("failure type = %T", emitter.events[0].payload)
	}
	if failure.Code != StrategyApplicationPublicErrorCode(strategyapplication.ErrorInvalidCommand) || failure.Message != "The Strategy request could not be completed." {
		t.Fatalf("failure = %#v", failure)
	}
}
