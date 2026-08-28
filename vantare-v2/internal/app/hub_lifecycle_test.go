package app_test

import (
	"context"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

type fakeHubWindow struct {
	closed, hidden, shown, focused, minimised, unminimised int
}

func (w *fakeHubWindow) Close()            { w.closed++ }
func (w *fakeHubWindow) Hide()             { w.hidden++ }
func (w *fakeHubWindow) Show()             { w.shown++ }
func (w *fakeHubWindow) Focus()            { w.focused++ }
func (w *fakeHubWindow) Minimise()         { w.minimised++ }
func (w *fakeHubWindow) UnMinimise()       { w.unminimised++ }
func (w *fakeHubWindow) IsMinimised() bool { return w.minimised > w.unminimised }

func TestHubLifecycleStateMachine(t *testing.T) {
	tests := []struct {
		name        string
		level       int
		canSuspend  bool
		wantDestroy bool
		wantBlocked bool
	}{
		{name: "levels one and two stay alive", level: 2},
		{name: "level three destroys when clean", level: 3, canSuspend: true, wantDestroy: true},
		{name: "level four destroys fallback when clean", level: 4, canSuspend: true, wantDestroy: true},
		{name: "level five destroys when clean", level: 5, canSuspend: true, wantDestroy: true},
		{name: "dirty studio blocks destruction", level: 5, canSuspend: false, wantBlocked: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			created := []*fakeHubWindow{}
			blocked := 0
			lifecycle := app.NewHubLifecycle(func() app.HubWindow {
				window := &fakeHubWindow{}
				created = append(created, window)
				return window
			}, func() int { return test.level }, func(context.Context) bool { return test.canSuspend }, func() { blocked++ })

			first, _ := lifecycle.Open()
			destroyed := lifecycle.HandleMinimise(context.Background())
			if destroyed != test.wantDestroy {
				t.Fatalf("destroyed=%v want %v", destroyed, test.wantDestroy)
			}
			if (blocked > 0) != test.wantBlocked {
				t.Fatalf("blocked=%d wantBlocked=%v", blocked, test.wantBlocked)
			}
			firstWindow := first.(*fakeHubWindow)
			if test.wantDestroy {
				if firstWindow.closed != 1 || firstWindow.hidden != 1 || !lifecycle.IsMinimised() {
					t.Fatalf("destroy state=%+v minimised=%v", firstWindow, lifecycle.IsMinimised())
				}
				reopened, _ := lifecycle.Open()
				if reopened == first || len(created) != 2 {
					t.Fatal("destroyed hub was not recreated")
				}
			} else if firstWindow.closed != 0 || len(created) != 1 {
				t.Fatalf("preserved state=%+v created=%d", firstWindow, len(created))
			}
		})
	}
}
