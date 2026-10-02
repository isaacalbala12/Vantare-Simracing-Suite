package launcher

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestCancelChainAndWaitSignalsAfterRunnerStops(t *testing.T) {
	runner := NewChainRunner(sampleBackend(), &spyEmitter{}, stubChainExec)
	profile := app.LaunchProfile{ID: "creator", Policy: &app.LaunchPolicy{FirstStepDelay: 10}, Steps: []app.LaunchStep{{AppID: "obs"}}}
	if err := runner.StartChain(context.Background(), profile); err != nil {
		t.Fatal(err)
	}
	done, cancelled := runner.CancelChainAndWait(profile.ID)
	if !cancelled || done == nil {
		t.Fatal("active chain must provide completion signal on cancellation")
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cancelled runner did not finish")
	}
}

func TestCancelPolicyOnlyClosesProcessesFromItsProfile(t *testing.T) {
	backend := &fakeSettingsBackend{apps: sampleApps()}
	svc := NewService(backend, &spyEmitter{}, stubChainExec)
	svc.owned[42] = ownedProcess{appID: "obs", profileID: "creator", identity: ProcessIdentity{PID: 42, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 100}}
	svc.owned[43] = ownedProcess{appID: "obs", profileID: "other", identity: ProcessIdentity{PID: 43, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 200}}
	closed := make([]int, 0)
	svc.chain.closeOwned = func(_ context.Context, appID string, identity ProcessIdentity) error {
		closed = append(closed, identity.PID)
		svc.ForgetStartedProcess(appID, identity.PID)
		return nil
	}
	svc.applyCancelPolicy("creator", app.CancelLeave, 1000)
	if len(closed) != 0 {
		t.Fatal("leave policy closed a process")
	}
	svc.applyCancelPolicy("creator", app.CancelCloseStarted, 1000)
	if len(closed) != 1 || closed[0] != 42 || !svc.OwnsStartedProcess("obs", 43) {
		t.Fatalf("cancel must close only this profile's owned process: closed=%v", closed)
	}
}

func TestCancelPolicyDoesNotCloseLaterRelaunch(t *testing.T) {
	svc := NewService(&fakeSettingsBackend{apps: sampleApps()}, &spyEmitter{}, stubChainExec)
	svc.owned[42] = ownedProcess{appID: "obs", profileID: "creator", identity: ProcessIdentity{PID: 42, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 100}}
	svc.owned[43] = ownedProcess{appID: "obs", profileID: "creator", identity: ProcessIdentity{PID: 43, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 300}}
	closed := make([]int, 0)
	svc.chain.closeOwned = func(_ context.Context, _ string, identity ProcessIdentity) error {
		closed = append(closed, identity.PID)
		return nil
	}
	svc.applyCancelPolicy("creator", app.CancelCloseStarted, 200)
	if len(closed) != 1 || closed[0] != 42 {
		t.Fatalf("old cancellation reached a later run: closed=%v", closed)
	}
}

func TestCancelChainAppliesCloseStartedAfterRunnerFinishes(t *testing.T) {
	backend := &fakeSettingsBackend{apps: sampleApps(), profiles: []app.LaunchProfile{{
		ID: "creator", Name: "Creator", Policy: &app.LaunchPolicy{Cancel: app.CancelCloseStarted, FirstStepDelay: 10},
		Steps: []app.LaunchStep{{AppID: "obs"}},
	}}}
	svc := NewService(backend, &spyEmitter{}, stubChainExec)
	closed := make(chan int, 1)
	svc.chain.closeOwned = func(_ context.Context, appID string, identity ProcessIdentity) error {
		svc.ForgetStartedProcess(appID, identity.PID)
		closed <- identity.PID
		return nil
	}
	if err := svc.chain.StartChain(context.Background(), backend.profiles[0]); err != nil {
		t.Fatal(err)
	}
	svc.owned[42] = ownedProcess{appID: "obs", profileID: "creator", identity: ProcessIdentity{PID: 42, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 100}}
	if !svc.CancelChain("creator") {
		t.Fatal("profile was not cancelled")
	}
	select {
	case pid := <-closed:
		if pid != 42 {
			t.Fatalf("closed PID %d", pid)
		}
	case <-time.After(time.Second):
		t.Fatal("close-started did not close the profile's process after cancellation")
	}
}

func TestRestartKeepsProfileOwnershipForLaterCancel(t *testing.T) {
	svc := NewService(&fakeSettingsBackend{apps: sampleApps()}, &spyEmitter{}, stubChainExec)
	svc.owned[42] = ownedProcess{appID: "obs", profileID: "creator", identity: ProcessIdentity{PID: 42, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 100}}
	replacement := ProcessIdentity{PID: 43, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 200}
	if !svc.TransferStartedProcess("obs", 42, replacement) {
		t.Fatal("verified restart was not recorded")
	}
	if svc.OwnsStartedProcess("obs", 42) || len(svc.ownedForProfile("creator")) != 1 || svc.ownedForProfile("creator")[0].identity.PID != 43 {
		t.Fatal("restart lost profile ownership or retained the old PID")
	}
	if svc.TransferStartedProcess("obs", 43, ProcessIdentity{PID: 44, ExecutablePath: `C:\Other\cmd.exe`, CreationTime: 300}) {
		t.Fatal("replacement with another path was accepted")
	}
	if svc.OwnsStartedProcess("obs", 43) {
		t.Fatal("old authority survived an unverified replacement")
	}
}

func TestCancelAskCanBeRememberedBeforeClosing(t *testing.T) {
	backend := &fakeSettingsBackend{apps: sampleApps()}
	backend.profiles = []app.LaunchProfile{{ID: "creator", Name: "Creator", Steps: []app.LaunchStep{{AppID: "obs"}}}}
	emit := &decisionEmitter{requests: make(chan DecisionRequest, 1)}
	svc := NewService(backend, emit, stubChainExec)
	svc.owned[42] = ownedProcess{appID: "obs", profileID: "creator", identity: ProcessIdentity{PID: 42, ExecutablePath: `C:\Windows\System32\cmd.exe`, CreationTime: 100}}
	closed := make(chan int, 1)
	svc.chain.closeOwned = func(_ context.Context, appID string, identity ProcessIdentity) error {
		svc.ForgetStartedProcess(appID, identity.PID)
		closed <- identity.PID
		return nil
	}
	go svc.applyCancelPolicy("creator", app.CancelAsk, 1000)
	var request DecisionRequest
	select {
	case request = <-emit.requests:
	case <-time.After(time.Second):
		t.Fatal("cancel did not ask before closing")
	}
	if request.Kind != "cancel" || len(request.Actions) != 2 || request.Actions[0] != "leave" || request.Actions[1] != "close-started" {
		t.Fatalf("cancel offered wrong actions: %+v", request)
	}
	_, remembered, err := svc.ResolveDecision(request.DecisionID, "close-started", true)
	if err != nil || !remembered {
		t.Fatalf("could not remember cancel choice: remembered=%v err=%v", remembered, err)
	}
	select {
	case pid := <-closed:
		if pid != 42 {
			t.Fatalf("closed PID %d", pid)
		}
	case <-time.After(time.Second):
		t.Fatal("chosen process was not closed")
	}
	if got := app.NormalizeLaunchPolicy(svc.ListProfiles()[0].Policy).Cancel; got != app.CancelCloseStarted {
		t.Fatalf("remembered cancel policy = %q", got)
	}
}
