package launcher

import (
	"context"
	"testing"
	"time"
)

func TestIdentityMatchesPrefersPathThenFallsBackToName(t *testing.T) {
	if !IdentityMatches(
		ProcessIdentity{ExecutablePath: `C:\Apps\OBS\obs64.exe`, ProcessName: "other.exe"},
		ProcessIdentity{ExecutablePath: `c:\apps\obs\obs64.exe`, ProcessName: "obs64.exe"},
	) {
		t.Fatal("same normalized executable path should match")
	}
	if IdentityMatches(
		ProcessIdentity{ExecutablePath: `C:\Apps\OBS\obs64.exe`},
		ProcessIdentity{ExecutablePath: `C:\Other\obs64.exe`, ProcessName: "obs64.exe"},
	) {
		t.Fatal("different explicit paths must not match by name")
	}
	if !IdentityMatches(ProcessIdentity{ProcessName: "OBS64.EXE"}, ProcessIdentity{ProcessName: "obs64.exe"}) {
		t.Fatal("name fallback should be case-insensitive")
	}
}

type fakeInspector struct {
	info ProcessInfo
}

func (f fakeInspector) Find(context.Context, ProcessIdentity) (ProcessInfo, bool) {
	return f.info, f.info.Alive
}

func TestWaitForReadyUsesInjectedClockBoundaries(t *testing.T) {
	err := WaitForReady(context.Background(), fakeInspector{info: ProcessInfo{PID: 12, ProcessName: "obs64.exe", Alive: true}}, ProcessIdentity{PID: 12, ProcessName: "obs64.exe"}, time.Second, time.Millisecond)
	if err != nil {
		t.Fatalf("expected ready process, got %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := WaitForReady(ctx, fakeInspector{}, ProcessIdentity{PID: 12}, time.Second, time.Millisecond); err == nil {
		t.Fatal("expected cancelled readiness wait")
	}
}

func TestCloseProcessRequiresConfirmedIdentity(t *testing.T) {
	err := CloseProcess(context.Background(), fakeInspector{}, ProcessIdentity{PID: 42, ProcessName: "obs.exe"})
	if err == nil {
		t.Fatal("close must reject an unconfirmed process")
	}
	if err := CloseProcess(context.Background(), fakeInspector{}, ProcessIdentity{}); err == nil {
		t.Fatal("close must reject an identity without PID")
	}
}
