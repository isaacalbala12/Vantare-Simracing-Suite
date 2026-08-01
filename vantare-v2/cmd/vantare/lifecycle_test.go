package main

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestRunShutdownContinuesAfterErrorAndCancellation(t *testing.T) {
	wantErr := errors.New("component failed")
	ctx, cancel := context.WithCancel(context.Background())
	var calls []string

	results := runShutdown(ctx, []shutdownStep{
		{name: "first", stop: func(context.Context) error {
			calls = append(calls, "first")
			return wantErr
		}},
		{name: "cancel", stop: func(context.Context) error {
			calls = append(calls, "cancel")
			cancel()
			return nil
		}},
		{name: "after-cancel", stop: func(ctx context.Context) error {
			calls = append(calls, "after-cancel")
			return ctx.Err()
		}},
	})

	if !reflect.DeepEqual(calls, []string{"first", "cancel", "after-cancel"}) {
		t.Fatalf("shutdown order = %v", calls)
	}
	if len(results) != 3 || !errors.Is(results[0].err, wantErr) ||
		results[1].err != nil || !errors.Is(results[2].err, context.Canceled) {
		t.Fatalf("shutdown results = %#v", results)
	}
	for _, result := range results {
		if result.name == "" || result.duration < 0 {
			t.Fatalf("invalid result = %#v", result)
		}
	}
}

func TestRunShutdownSkipsUnregisteredSteps(t *testing.T) {
	results := runShutdown(context.Background(), []shutdownStep{{name: "absent"}})
	if len(results) != 0 {
		t.Fatalf("results = %#v", results)
	}
}
