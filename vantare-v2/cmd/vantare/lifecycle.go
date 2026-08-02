package main

import (
	"context"
	"time"
)

type shutdownStep struct {
	name string
	stop func(context.Context) error
}

type shutdownResult struct {
	name     string
	duration time.Duration
	err      error
}

// runShutdown executes every registered teardown step in order. An error in
// one component is reported but never prevents the remaining resources from
// being released.
func runShutdown(ctx context.Context, steps []shutdownStep) []shutdownResult {
	results := make([]shutdownResult, 0, len(steps))
	for _, step := range steps {
		if step.stop == nil {
			continue
		}
		started := time.Now()
		err := step.stop(ctx)
		results = append(results, shutdownResult{
			name:     step.name,
			duration: time.Since(started),
			err:      err,
		})
	}
	return results
}
