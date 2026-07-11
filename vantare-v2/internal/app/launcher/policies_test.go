package launcher

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestResolveAlreadyRunning(t *testing.T) {
	if got := ResolveAlreadyRunning(app.AlreadyRunningReuse, RunningPending); got != RunningReuse {
		t.Fatalf("reuse policy got %q", got)
	}
	if got := ResolveAlreadyRunning(app.AlreadyRunningAsk, RunningPending); got != RunningPending {
		t.Fatalf("ask without decision got %q", got)
	}
	if got := ResolveAlreadyRunning(app.AlreadyRunningAsk, RunningRestart); got != RunningRestart {
		t.Fatalf("explicit restart got %q", got)
	}
}

func TestFailureAndRetryPolicies(t *testing.T) {
	if ContinueAfterFailure(app.FailureStop, true) {
		t.Fatal("stop policy must stop")
	}
	if !ContinueAfterFailure(app.FailureContinue, false) {
		t.Fatal("continue policy must continue")
	}
	if got := RetryAttempts(app.RetryAll, 9); got != 3 {
		t.Fatalf("retry attempts should be capped at 3, got %d", got)
	}
}
