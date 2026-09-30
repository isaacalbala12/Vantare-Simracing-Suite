package launcher

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestExitPolicyClosesOnlyConfiguredOwnedProcesses(t *testing.T) {
	backend := &fakeSettingsBackend{apps: sampleApps(), profiles: []app.LaunchProfile{
		{ID: "close", Policy: &app.LaunchPolicy{Exit: app.ExitCloseStarted}},
		{ID: "leave", Policy: &app.LaunchPolicy{Exit: app.ExitLeave}},
		{ID: "ask", Policy: &app.LaunchPolicy{Exit: app.ExitAsk}},
	}}
	svc := NewService(backend, &spyEmitter{}, stubChainExec)
	for pid, profileID := range map[int]string{41: "close", 42: "leave", 43: "ask"} {
		svc.owned[pid] = ownedProcess{appID: "obs", profileID: profileID, identity: ProcessIdentity{PID: pid, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: uint64(pid)}}
	}
	closed := make([]int, 0)
	svc.chain.closeOwned = func(_ context.Context, appID string, identity ProcessIdentity) error {
		closed = append(closed, identity.PID)
		svc.ForgetStartedProcess(appID, identity.PID)
		return nil
	}
	asked := 0
	err := svc.CloseOnExit(context.Background(), func(count int) bool {
		asked = count
		return false
	})
	if err != nil || asked != 1 || len(closed) != 1 || closed[0] != 41 {
		t.Fatalf("exit choices were not respected: asked=%d closed=%v err=%v", asked, closed, err)
	}
	if !svc.OwnsStartedProcess("obs", 42) || !svc.OwnsStartedProcess("obs", 43) {
		t.Fatal("leave and declined ask must preserve their processes")
	}
}

func TestExitWaitsForRunnerAndRejectsNewLaunch(t *testing.T) {
	backend := &fakeSettingsBackend{apps: sampleApps()}
	svc := NewService(backend, &spyEmitter{}, stubChainExec)
	profile := app.LaunchProfile{ID: "creator", Policy: &app.LaunchPolicy{FirstStepDelay: 10}, Steps: []app.LaunchStep{{AppID: "obs"}}}
	if err := svc.chain.StartChain(context.Background(), profile); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := svc.CloseOnExit(ctx, nil); err != nil {
		t.Fatalf("shutdown did not wait for cancellation: %v", err)
	}
	if err := svc.chain.StartChain(context.Background(), profile); !errors.Is(err, ErrLauncherStopping) {
		t.Fatalf("launcher accepted a new chain during shutdown: %v", err)
	}
}

func TestExitAskCanCloseVerifiedProcess(t *testing.T) {
	backend := &fakeSettingsBackend{apps: sampleApps(), profiles: []app.LaunchProfile{{ID: "ask"}}}
	svc := NewService(backend, &spyEmitter{}, stubChainExec)
	svc.owned[43] = ownedProcess{appID: "obs", profileID: "ask", identity: ProcessIdentity{PID: 43, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 100}}
	closed := 0
	svc.chain.closeOwned = func(_ context.Context, appID string, identity ProcessIdentity) error {
		closed++
		svc.ForgetStartedProcess(appID, identity.PID)
		return nil
	}
	if err := svc.CloseOnExit(context.Background(), func(count int) bool { return count == 1 }); err != nil || closed != 1 {
		t.Fatalf("accepted exit choice did not close owned process: closed=%d err=%v", closed, err)
	}
}

func TestExitDoesNotPromptForExitedProcess(t *testing.T) {
	backend := &fakeSettingsBackend{apps: sampleApps(), profiles: []app.LaunchProfile{{ID: "ask"}}}
	svc := NewService(backend, &spyEmitter{}, stubChainExec)
	svc.owned[43] = ownedProcess{appID: "obs", profileID: "ask", identity: ProcessIdentity{PID: 43, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 100}}
	svc.inspectOwned = func(context.Context, ProcessIdentity) bool { return false }
	svc.chain.closeOwned = func(context.Context, string, ProcessIdentity) error {
		t.Fatal("exited process was sent to closer")
		return nil
	}
	if err := svc.CloseOnExit(context.Background(), func(int) bool {
		t.Fatal("exited process prompted the user")
		return true
	}); err != nil || svc.OwnsStartedProcess("obs", 43) {
		t.Fatalf("exited process identity was not pruned: %v", err)
	}
}

func TestExitReleasesPendingCancelDecision(t *testing.T) {
	backend := &fakeSettingsBackend{apps: sampleApps(), profiles: []app.LaunchProfile{{ID: "ask"}}}
	emit := &decisionEmitter{requests: make(chan DecisionRequest, 1)}
	svc := NewService(backend, emit, stubChainExec)
	finished := make(chan string, 1)
	go func() {
		finished <- svc.chain.requestDecision(context.Background(), "ask", "", "cancel", "close?", []string{"leave", "close-started"})
	}()
	select {
	case <-emit.requests:
	case <-time.After(time.Second):
		t.Fatal("cancel prompt was not opened")
	}
	if err := svc.CloseOnExit(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	select {
	case answer := <-finished:
		if answer != "" {
			t.Fatalf("shutdown accepted cancel answer %q", answer)
		}
	case <-time.After(time.Second):
		t.Fatal("cancel prompt remained pending during shutdown")
	}
}

func TestExitTakesOverPendingCancelClose(t *testing.T) {
	svc := NewService(&fakeSettingsBackend{apps: sampleApps()}, &spyEmitter{}, stubChainExec)
	svc.owned[43] = ownedProcess{appID: "obs", profileID: "ask", identity: ProcessIdentity{PID: 43, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 100}}
	closed := 0
	svc.chain.closeOwned = func(context.Context, string, ProcessIdentity) error {
		closed++
		return nil
	}
	if err := svc.CloseOnExit(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	svc.applyCancelPolicy("ask", app.CancelCloseStarted, 1000)
	if closed != 0 {
		t.Fatal("cancel policy closed a process after exit policy took over")
	}
}
