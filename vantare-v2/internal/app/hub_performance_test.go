package app

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/pkg/config"
)

func TestHubServiceActiveProfileReconcilesPerformanceEventAndNextFrame(t *testing.T) {
	dir := t.TempDir()
	store := config.ProfileDocumentStore{}
	for id, level := range map[string]int{"profile-a": 1, "profile-b": 5} {
		doc := config.NormalizeProfileDocumentV4(&config.ProfileDocumentV4{
			SchemaVersion: config.ProfileSchemaVersionV4,
			ID:            id,
			Name:          id,
			DisplayMode:   config.ModeRacing,
			Layouts: map[config.LayoutType]config.SessionLayoutV4{
				config.LayoutGeneral: {Type: config.LayoutGeneral},
			},
			Performance: &config.ProfilePerformanceV4{Mode: config.ProfilePerformanceLevel, Level: level},
		})
		if _, err := store.SaveV4(filepath.Join(dir, id+".json"), "", doc, config.ProfileSchemaVersionV4); err != nil {
			t.Fatal(err)
		}
	}

	events := &studioProfileSpy{}
	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Emitter: events,
		PerformancePolicy: performancepolicy.Policy{
			Mode: performancepolicy.ModeLevel, Level: performancepolicy.LevelMaximum,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := runtime.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()

	settings := NewSettingsService(filepath.Join(dir, "settings.json"), nil, nil)
	if err := settings.Load(); err != nil {
		t.Fatal(err)
	}
	profileSvc := NewProfileService(filepath.Join(dir, "profile-a.json"), nil, events)
	studioSvc := NewStudioProfileService(events, nil)
	hub := NewHubService(dir, profileSvc, events, nil)
	hub.SetSettingsService(settings)
	hub.SetStudioProfileService(studioSvc)
	hub.SetPerformancePolicyReconciler(func(profile *config.ProfileDocumentV4) {
		runtime.SetPerformancePolicy(ResolvePerformancePolicy(settings.Settings().Performance, profile))
	})

	if err := hub.ActivateProfile("profile-a"); err != nil {
		t.Fatal(err)
	}
	if err := hub.SetActiveProfile("profile-b"); err != nil {
		t.Fatal(err)
	}

	foundLevelFive := false
	for index, name := range events.events {
		if name != "performance:level" {
			continue
		}
		performance, ok := events.data[index].(overlayv2.PerformanceV2)
		if ok && performance.Level == 5 {
			foundLevelFive = true
		}
	}
	if !foundLevelFive {
		t.Fatalf("events=%v, want performance:level 5", events.events)
	}

	if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), hardeningBatch(1, 1)); err != nil {
		t.Fatal(err)
	}
	event, ok := publisher.ReplaySnapshot()
	if !ok {
		t.Fatal("missing overlay frame")
	}
	var update overlayv2.UpdateV2
	if err := json.Unmarshal(event.Data, &update); err != nil {
		t.Fatal(err)
	}
	if update.Frame == nil || update.Frame.Capabilities.Performance == nil || update.Frame.Capabilities.Performance.Level != 5 {
		t.Fatalf("performance=%+v, want level 5", update.Frame.Capabilities.Performance)
	}
}

func TestStartupRestoresProfileBeforeRuntimeAndWaitsForExplicitLevelRequest(t *testing.T) {
	dir := t.TempDir()
	doc := config.NormalizeProfileDocumentV4(&config.ProfileDocumentV4{
		SchemaVersion: config.ProfileSchemaVersionV4,
		ID:            "profile-b",
		Name:          "profile-b",
		DisplayMode:   config.ModeRacing,
		Layouts: map[config.LayoutType]config.SessionLayoutV4{
			config.LayoutGeneral: {Type: config.LayoutGeneral},
		},
		Performance: &config.ProfilePerformanceV4{Mode: config.ProfilePerformanceLevel, Level: 5},
	})
	if _, err := (config.ProfileDocumentStore{}).SaveV4(
		filepath.Join(dir, "profile-b.json"), "", doc, config.ProfileSchemaVersionV4,
	); err != nil {
		t.Fatal(err)
	}

	settings := NewSettingsService(filepath.Join(dir, "settings.json"), nil, nil)
	if err := settings.Load(); err != nil {
		t.Fatal(err)
	}
	configured := settings.Settings()
	configured.ActiveOverlayProfileID = "profile-b"
	configured.Performance = PerformanceSettings{Mode: "level", Level: 1}
	if err := settings.Save(configured); err != nil {
		t.Fatal(err)
	}

	events := &studioProfileSpy{}
	profileSvc := NewProfileService(filepath.Join(dir, "profile-b.json"), nil, events)
	studioSvc := NewStudioProfileService(events, nil)
	hub := NewHubService(dir, profileSvc, events, nil)
	hub.SetSettingsService(settings)
	hub.SetStudioProfileService(studioSvc)
	if err := hub.RestoreActiveProfile(); err != nil {
		t.Fatal(err)
	}

	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{
		Emitter:           events,
		PerformancePolicy: ResolvePerformancePolicy(settings.Settings().Performance, studioSvc.PerformanceProfile()),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(events.events) != 0 {
		t.Fatalf("startup events=%v want none before settings:get", events.events)
	}

	runtime.EmitPerformanceLevel()
	if len(events.events) != 1 || events.events[0] != "performance:level" {
		t.Fatalf("events=%v want one explicit performance:level", events.events)
	}
	performance, ok := events.data[0].(overlayv2.PerformanceV2)
	if !ok || performance.Level != 5 {
		t.Fatalf("performance=%T %+v want level 5", events.data[0], events.data[0])
	}
}
