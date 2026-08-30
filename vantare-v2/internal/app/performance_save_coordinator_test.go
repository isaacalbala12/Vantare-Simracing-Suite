package app

import (
	"sync"
	"testing"

	"github.com/vantare/overlays/v2/pkg/config"
)

func TestPerformanceSaveCoordinatorSerializesAndReconcilesConfirmedSnapshots(t *testing.T) {
	var stateMu sync.Mutex
	settingsLevel := 1
	profileLevel := 1
	settingsEntered := make(chan struct{})
	releaseSettings := make(chan struct{})
	profileAttempted := make(chan struct{})
	profileEntered := make(chan struct{})
	var reconciled [][2]int

	coordinator := newPerformanceSaveCoordinator(
		func() *AppSettings {
			stateMu.Lock()
			defer stateMu.Unlock()
			snapshot := DefaultAppSettings()
			snapshot.Performance.Level = settingsLevel
			return snapshot
		},
		func() *config.ProfileDocumentV4 {
			stateMu.Lock()
			defer stateMu.Unlock()
			return &config.ProfileDocumentV4{
				Performance: &config.ProfilePerformanceV4{Mode: config.ProfilePerformanceLevel, Level: profileLevel},
			}
		},
		func(settings PerformanceSettings, profile *config.ProfileDocumentV4) {
			reconciled = append(reconciled, [2]int{settings.Level, profile.Performance.Level})
		},
	)

	settingsDone := make(chan error, 1)
	go func() {
		_, _, err := coordinator.Execute(func() error {
			close(settingsEntered)
			<-releaseSettings
			stateMu.Lock()
			settingsLevel = 5
			stateMu.Unlock()
			return nil
		})
		settingsDone <- err
	}()
	<-settingsEntered

	profileDone := make(chan error, 1)
	go func() {
		close(profileAttempted)
		_, _, err := coordinator.Execute(func() error {
			close(profileEntered)
			stateMu.Lock()
			profileLevel = 5
			stateMu.Unlock()
			return nil
		})
		profileDone <- err
	}()
	<-profileAttempted
	select {
	case <-profileEntered:
		t.Fatal("profile persistence entered while settings persistence was unconfirmed")
	default:
	}

	close(releaseSettings)
	if err := <-settingsDone; err != nil {
		t.Fatal(err)
	}
	if err := <-profileDone; err != nil {
		t.Fatal(err)
	}

	want := [][2]int{{5, 1}, {5, 5}}
	if len(reconciled) != len(want) || reconciled[0] != want[0] || reconciled[1] != want[1] {
		t.Fatalf("reconciled=%v want=%v; old settings must never pair with the new profile", reconciled, want)
	}
}
