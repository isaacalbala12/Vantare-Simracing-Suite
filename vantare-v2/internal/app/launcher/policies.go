package launcher

import "github.com/vantare/overlays/v2/internal/app"

type RunningAction string

const (
	RunningPending RunningAction = "pending"
	RunningReuse   RunningAction = "reuse"
	RunningRestart RunningAction = "restart"
	RunningCancel  RunningAction = "cancel"
)

func ResolveAlreadyRunning(policy app.AlreadyRunningPolicy, decision RunningAction) RunningAction {
	switch policy {
	case app.AlreadyRunningReuse:
		return RunningReuse
	case app.AlreadyRunningRestart:
		return RunningRestart
	case app.AlreadyRunningAsk:
		if decision == RunningReuse || decision == RunningRestart || decision == RunningCancel {
			return decision
		}
	}
	return RunningPending
}

func ContinueAfterFailure(policy app.FailurePolicy, decision bool) bool {
	switch policy {
	case app.FailureContinue:
		return true
	case app.FailureStop:
		return false
	case app.FailureAsk:
		return decision
	default:
		return false
	}
}

func RetryAttempts(policy app.RetryPolicy, maxRetries int) int {
	if maxRetries < 0 {
		return 0
	}
	if maxRetries > 3 {
		maxRetries = 3
	}
	if policy == app.RetryAsk {
		return 0
	}
	return maxRetries
}
