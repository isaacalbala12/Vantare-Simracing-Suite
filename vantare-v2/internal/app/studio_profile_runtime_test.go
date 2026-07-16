package app

import (
	"os"
	"path/filepath"
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
