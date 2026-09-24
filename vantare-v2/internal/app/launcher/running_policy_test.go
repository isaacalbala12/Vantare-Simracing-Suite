package launcher

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestAlreadyRunningRestartRequiresAllProcessesOwned(t *testing.T) {
	runner := NewChainRunner(sampleBackend(), &spyEmitter{}, stubChainExec)
	path := `C:\Windows\System32\cmd.exe`
	runner.findRunning = func(context.Context, string) ([]ProcessInfo, error) {
		return []ProcessInfo{{PID: 42, ExecutablePath: path, CreationTime: 100, Alive: true}}, nil
	}
	closed := 0
	runner.closeOwned = func(context.Context, string, ProcessIdentity) error { closed++; return nil }
	profile := app.LaunchProfile{ID: "creator", Policy: &app.LaunchPolicy{AlreadyRunning: app.AlreadyRunningRestart}}
	entry := sampleApps()["obs"]
	result, handled, abort := runner.resolveRunningStep(context.Background(), profile, entry)
	if !handled || abort || result.success || closed != 0 {
		t.Fatalf("external app must not be closed: result=%+v handled=%v abort=%v closed=%d", result, handled, abort, closed)
	}
	runner.ownedProcess = func(string, int) (ProcessIdentity, bool) {
		return ProcessIdentity{PID: 42, ExecutablePath: path, CreationTime: 100}, true
	}
	_, handled, abort = runner.resolveRunningStep(context.Background(), profile, entry)
	if handled || abort || closed != 1 {
		t.Fatalf("owned app should be closed before new launch: handled=%v abort=%v closed=%d", handled, abort, closed)
	}
}

func TestAlreadyRunningIgnoresUnverifiedCandidate(t *testing.T) {
	runner := NewChainRunner(sampleBackend(), &spyEmitter{}, stubChainExec)
	runner.findRunning = func(context.Context, string) ([]ProcessInfo, error) {
		return []ProcessInfo{{PID: 42, ExecutablePath: `C:\Other\cmd.exe`, CreationTime: 100, Alive: true}}, nil
	}
	profile := app.LaunchProfile{ID: "creator", Policy: &app.LaunchPolicy{AlreadyRunning: app.AlreadyRunningReuse}}
	_, handled, abort := runner.resolveRunningStep(context.Background(), profile, sampleApps()["obs"])
	if handled || abort {
		t.Fatal("candidate with a different path must not count as the app already running")
	}
}

func TestAlreadyRunningAskOffersOnlySafeActions(t *testing.T) {
	emit := &decisionEmitter{requests: make(chan DecisionRequest, 1)}
	runner := NewChainRunner(sampleBackend(), emit, stubChainExec)
	runner.findRunning = func(context.Context, string) ([]ProcessInfo, error) {
		return []ProcessInfo{{PID: 42, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 100, Alive: true}}, nil
	}
	profile := app.LaunchProfile{ID: "creator", Policy: &app.LaunchPolicy{AlreadyRunning: app.AlreadyRunningAsk}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	done := make(chan chainStepResult, 1)
	go func() {
		result, _, _ := runner.resolveRunningStep(ctx, profile, sampleApps()["obs"])
		done <- result
	}()
	select {
	case request := <-emit.requests:
		if request.Kind != "alreadyRunning" || len(request.Actions) != 2 || request.Actions[0] != "reuse" || request.Actions[1] != "cancel" {
			t.Fatalf("external process must not offer restart: %+v", request)
		}
		if _, err := runner.ResolveDecision(request.DecisionID, "reuse"); err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("already-running decision was not requested")
	}
	select {
	case result := <-done:
		if !result.success || result.pid != 42 {
			t.Fatalf("reuse decision was not applied: %+v", result)
		}
	case <-ctx.Done():
		t.Fatal("already-running decision did not resume")
	}
}
