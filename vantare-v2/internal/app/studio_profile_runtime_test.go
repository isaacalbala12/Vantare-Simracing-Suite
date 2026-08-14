package app

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/vantare/overlays/v2/pkg/config"
)

func TestStudioProfileServiceEmitRuntimeLoaded(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	source, err := os.ReadFile(filepath.Join("..", "..", "pkg", "config", "testdata", "profile-v0-core-widgets.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, source, 0644); err != nil {
		t.Fatal(err)
	}

	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	if _, err := svc.Load(path); err != nil {
		t.Fatal(err)
	}
	svc.EmitRuntimeLoaded()

	if len(spy.events) != 1 || spy.events[0] != "overlay:profile-v3-loaded" {
		t.Fatalf("events=%v", spy.events)
	}
	payload := spy.data[0].(map[string]any)
	if payload["document"] == nil || payload["revision"] == "" {
		t.Fatalf("payload=%v", payload)
	}
	if payload["windowMode"] != string(config.ModeEdit) {
		t.Fatalf("windowMode=%v", payload["windowMode"])
	}
}

func TestStudioProfileServiceNextProfileCyclesAndEmitsRuntime(t *testing.T) {
	dir := t.TempDir()
	store := config.ProfileDocumentStore{}
	for _, id := range []string{"alpha", "beta"} {
		doc := config.NormalizeProfileDocumentV3(&config.ProfileDocumentV3{
			SchemaVersion: config.ProfileSchemaVersionV3,
			ID:            id,
			Name:          id,
			DisplayMode:   config.ModeRacing,
			Layouts: map[config.LayoutType]config.SessionLayoutV3{
				config.LayoutGeneral: {Type: config.LayoutGeneral},
			},
		})
		if _, err := store.Save(filepath.Join(dir, id+".json"), "", doc, config.ProfileSchemaVersionV3); err != nil {
			t.Fatal(err)
		}
	}

	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	svc.SetProfilesDir(dir)
	if _, err := svc.Load(filepath.Join(dir, "alpha.json")); err != nil {
		t.Fatal(err)
	}
	if err := svc.NextProfile(); err != nil {
		t.Fatal(err)
	}
	if svc.Path() != filepath.Join(dir, "beta.json") {
		t.Fatalf("path=%q", svc.Path())
	}
	found := false
	for _, event := range spy.events {
		if event == "overlay:profile-v3-loaded" {
			found = true
		}
	}
	if !found {
		t.Fatalf("events=%v", spy.events)
	}
}

func TestStudioProfileServiceCycleDeltaReferencePersistsAndBroadcasts(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	delta := config.WidgetInstanceV3{
		ID: "delta-main", Type: config.WidgetTypeDelta,
		Layout:   config.WidgetLayoutV3{X: 10, Y: 10, W: 280, H: 96},
		Behavior: config.WidgetBehaviorV3{Enabled: true, UpdateHz: 30},
		Content:  map[string]any{"reference": "personal-best"},
		Visual: config.WidgetVisualV3{
			SystemID: config.DesignSystemVantareOriginal, SystemVersion: 1, ConfigVersion: 1,
			BaseSettings: map[string]any{}, AppearanceOverrides: map[string]any{},
		},
	}
	doc := &config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "delta-profile", Name: "Delta", DisplayMode: config.ModeRacing,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: []config.WidgetInstanceV3{delta}},
			config.LayoutRace:    {Type: config.LayoutRace, Widgets: []config.WidgetInstanceV3{delta}},
		},
	}
	store := config.ProfileDocumentStore{}
	if _, err := store.Save(path, "", doc, config.ProfileSchemaVersionV3); err != nil {
		t.Fatal(err)
	}

	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	if _, err := svc.Load(path); err != nil {
		t.Fatal(err)
	}

	got, err := svc.CycleDeltaReference()
	if err != nil {
		t.Fatal(err)
	}
	if got != "session-best" {
		t.Fatalf("reference=%q want session-best", got)
	}
	for _, want := range []string{"previous-lap", "personal-best"} {
		got, err = svc.CycleDeltaReference()
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("reference=%q want %s", got, want)
		}
	}

	reloaded, err := store.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	for layoutType, layout := range reloaded.Document.Layouts {
		if got := layout.Widgets[0].Content["reference"]; got != "personal-best" {
			t.Fatalf("layout %s reference=%v want personal-best", layoutType, got)
		}
	}
	foundRuntime := false
	for _, event := range spy.events {
		if event == "overlay:profile-v3-loaded" {
			foundRuntime = true
		}
	}
	if !foundRuntime {
		t.Fatalf("events=%v want runtime broadcast", spy.events)
	}
}

func TestNextDeltaReferenceTreatsMissingAsPersonalBest(t *testing.T) {
	if got := nextDeltaReference(""); got != "session-best" {
		t.Fatalf("missing reference cycles to %q want session-best", got)
	}
}

func TestCycleDeltaReferenceUsesGeneralMissingReferenceAsCanonicalPersonalBest(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	delta := func(id string, content map[string]any) config.WidgetInstanceV3 {
		return config.WidgetInstanceV3{
			ID: id, Type: config.WidgetTypeDelta,
			Layout:   config.WidgetLayoutV3{X: 10, Y: 10, W: 280, H: 96},
			Behavior: config.WidgetBehaviorV3{Enabled: true, UpdateHz: 30},
			Content:  content,
			Visual: config.WidgetVisualV3{
				SystemID: config.DesignSystemVantareOriginal, SystemVersion: 1, ConfigVersion: 1,
				BaseSettings: map[string]any{}, AppearanceOverrides: map[string]any{},
			},
		}
	}
	doc := &config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "delta-canonical", Name: "Delta canonical", DisplayMode: config.ModeRacing,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: []config.WidgetInstanceV3{delta("delta-general", map[string]any{})}},
			config.LayoutRace:    {Type: config.LayoutRace, Widgets: []config.WidgetInstanceV3{delta("delta-race", map[string]any{"reference": "previous-lap"})}},
		},
	}
	store := config.ProfileDocumentStore{}
	if _, err := store.Save(path, "", doc, config.ProfileSchemaVersionV3); err != nil {
		t.Fatal(err)
	}
	svc := NewStudioProfileService(nil, nil)
	if _, err := svc.Load(path); err != nil {
		t.Fatal(err)
	}

	got, err := svc.CycleDeltaReference()
	if err != nil {
		t.Fatal(err)
	}
	if got != "session-best" {
		t.Fatalf("reference=%q want session-best from canonical implicit personal-best", got)
	}
}

func TestCycleDeltaReferenceSerializesConcurrentHotkeyPresses(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := &config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "delta-concurrent", Name: "Delta concurrent", DisplayMode: config.ModeRacing,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {
				Type: config.LayoutGeneral,
				Widgets: []config.WidgetInstanceV3{{
					ID: "delta-main", Type: config.WidgetTypeDelta,
					Layout:   config.WidgetLayoutV3{X: 10, Y: 10, W: 280, H: 96},
					Behavior: config.WidgetBehaviorV3{Enabled: true, UpdateHz: 30},
					Content:  map[string]any{"reference": "personal-best"},
					Visual: config.WidgetVisualV3{
						SystemID: config.DesignSystemVantareOriginal, SystemVersion: 1, ConfigVersion: 1,
						BaseSettings: map[string]any{}, AppearanceOverrides: map[string]any{},
					},
				}},
			},
		},
	}
	store := config.ProfileDocumentStore{}
	if _, err := store.Save(path, "", doc, config.ProfileSchemaVersionV3); err != nil {
		t.Fatal(err)
	}
	svc := NewStudioProfileService(nil, nil)
	if _, err := svc.Load(path); err != nil {
		t.Fatal(err)
	}

	const presses = 12
	start := make(chan struct{})
	errors := make(chan error, presses)
	var group sync.WaitGroup
	for index := 0; index < presses; index++ {
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			_, err := svc.CycleDeltaReference()
			errors <- err
		}()
	}
	close(start)
	group.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent hotkey press: %v", err)
		}
	}

	reloaded, err := store.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	got := reloaded.Document.Layouts[config.LayoutGeneral].Widgets[0].Content["reference"]
	if got != "personal-best" {
		t.Fatalf("reference after %d presses=%v want personal-best", presses, got)
	}
}
