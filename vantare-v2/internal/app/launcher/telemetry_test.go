package launcher

import (
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestRecordProfileAttemptAlwaysIncrements(t *testing.T) {
	backend := &fakeProfilesBackend{
		apps: map[string]app.LauncherAppEntry{
			"lmu": {ID: "lmu", DisplayName: "Le Mans Ultimate"},
		},
		profiles: []app.LaunchProfile{
			{ID: "pro", Name: "Pro"},
		},
	}

	// First call simulates a successful launch.
	if err := RecordProfileAttempt(backend, "pro"); err != nil {
		t.Fatalf("first attempt: %v", err)
	}
	got := backend.GetLauncherProfiles()
	if len(got) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(got))
	}
	if got[0].LaunchCount != 1 {
		t.Errorf("expected LaunchCount=1 after first attempt, got %d", got[0].LaunchCount)
	}
	if got[0].LastLaunchedAt == nil {
		t.Fatal("LastLaunchedAt should be set after first attempt")
	}
	firstTime := *got[0].LastLaunchedAt

	// Small sleep ensures a distinct timestamp for the second call.
	time.Sleep(time.Microsecond)

	// Second call simulates a failed launch — count must still increment.
	if err := RecordProfileAttempt(backend, "pro"); err != nil {
		t.Fatalf("second attempt: %v", err)
	}
	got = backend.GetLauncherProfiles()
	if got[0].LaunchCount != 2 {
		t.Errorf("expected LaunchCount=2 after second attempt, got %d", got[0].LaunchCount)
	}
	if got[0].LastLaunchedAt == nil {
		t.Fatal("LastLaunchedAt should be set after second attempt")
	}
	if got[0].LastLaunchedAt.Equal(firstTime) {
		t.Error("LastLaunchedAt should have been updated on second attempt")
	}
}

func TestRecordProfileSuccessUpdatesEMA(t *testing.T) {
	backend := &fakeProfilesBackend{
		apps: map[string]app.LauncherAppEntry{
			"lmu": {ID: "lmu", DisplayName: "Le Mans Ultimate"},
		},
		profiles: []app.LaunchProfile{
			{ID: "pro", Name: "Pro"},
		},
	}

	// First call: AvgChainDurationMs == 0 → initialized directly to durationMs.
	if err := RecordProfileSuccess(backend, "pro", 10000); err != nil {
		t.Fatalf("first success: %v", err)
	}
	got := backend.GetLauncherProfiles()
	if got[0].AvgChainDurationMs != 10000 {
		t.Errorf("expected AvgChainDurationMs=10000 after first success, got %d",
			got[0].AvgChainDurationMs)
	}

	// Second call: EMA = 0.3*20000 + 0.7*10000 = 6000 + 7000 = 13000.
	if err := RecordProfileSuccess(backend, "pro", 20000); err != nil {
		t.Fatalf("second success: %v", err)
	}
	got = backend.GetLauncherProfiles()
	if got[0].AvgChainDurationMs != 13000 {
		t.Errorf("expected AvgChainDurationMs=13000 after EMA, got %d",
			got[0].AvgChainDurationMs)
	}
}

func TestRecordProfileAttemptFailsOnUnknownProfile(t *testing.T) {
	backend := &fakeProfilesBackend{
		apps: map[string]app.LauncherAppEntry{
			"lmu": {ID: "lmu", DisplayName: "Le Mans Ultimate"},
		},
		profiles: []app.LaunchProfile{
			{ID: "exists", Name: "Exists"},
		},
	}
	err := RecordProfileAttempt(backend, "does-not-exist")
	if !errors.Is(err, ErrProfileNotFound) {
		t.Fatalf("expected ErrProfileNotFound, got %v", err)
	}
}
