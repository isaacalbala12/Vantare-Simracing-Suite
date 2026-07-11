package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/pkg/config"
)

type studioProfileSpy struct {
	events []string
	data   []any
}

func (s *studioProfileSpy) Emit(name string, data any) {
	s.events = append(s.events, name)
	s.data = append(s.data, data)
}

func TestStudioProfileServiceLoadEmitsLoaded(t *testing.T) {
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
	var savedCalls int
	svc := NewStudioProfileService(spy, func(saved StudioProfileSaved) {
		savedCalls++
	})

	loaded, err := svc.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.MigratedFrom != 0 {
		t.Fatalf("migratedFrom=%d want 0", loaded.MigratedFrom)
	}
	svc.EmitLoaded("req-load-1")

	if len(spy.events) != 1 || spy.events[0] != "studio:profile:loaded" {
		t.Fatalf("events=%v want studio:profile:loaded", spy.events)
	}
	payload, ok := spy.data[0].(map[string]any)
	if !ok {
		t.Fatalf("payload type=%T", spy.data[0])
	}
	if payload["requestId"] != "req-load-1" {
		t.Fatalf("requestId=%v want req-load-1", payload["requestId"])
	}
	if payload["revision"] == "" {
		t.Fatal("expected revision in loaded payload")
	}
	if payload["migratedFrom"] != 0 {
		t.Fatalf("migratedFrom=%v want 0", payload["migratedFrom"])
	}
	if payload["document"] == nil {
		t.Fatal("expected document in loaded payload")
	}
	if savedCalls != 0 {
		t.Fatal("onSaved should not run on load")
	}
}

func TestStudioProfileServiceSaveEmitsSavedAndCallback(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := config.NormalizeProfileDocumentV3(&config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "studio-empty",
		Name:          "Studio Empty",
		DisplayMode:   config.ModeEdit,
		MonitorIndex:  0,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: []config.WidgetInstanceV3{}},
		},
	})

	spy := &studioProfileSpy{}
	var callback StudioProfileSaved
	callbackCount := 0
	svc := NewStudioProfileService(spy, func(saved StudioProfileSaved) {
		callback = saved
		callbackCount++
	})
	svc.path = path
	svc.loaded = &config.LoadedProfileV3{Document: doc, Revision: "", MigratedFrom: config.ProfileSchemaVersionV3}

	if err := svc.Save("req-save-1", "", doc); err != nil {
		t.Fatal(err)
	}
	if callbackCount != 1 {
		t.Fatalf("onSaved calls=%d want 1", callbackCount)
	}
	if callback.Path != path || callback.Document == nil || callback.Revision == "" {
		t.Fatalf("callback=%+v", callback)
	}
	if svc.loaded.Revision != callback.Revision {
		t.Fatalf("service revision=%q callback revision=%q", svc.loaded.Revision, callback.Revision)
	}

	foundSaved := false
	for i, event := range spy.events {
		if event == "studio:profile:saved" {
			foundSaved = true
			payload := spy.data[i].(map[string]any)
			if payload["requestId"] != "req-save-1" {
				t.Fatalf("requestId=%v want req-save-1", payload["requestId"])
			}
			if payload["revision"] != callback.Revision {
				t.Fatalf("saved revision=%v want %q", payload["revision"], callback.Revision)
			}
		}
	}
	if !foundSaved {
		t.Fatalf("events=%v want studio:profile:saved", spy.events)
	}
}

func TestStudioProfileServiceSaveConflictDoesNotCallOnSaved(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := config.NormalizeProfileDocumentV3(&config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "studio-conflict-callback",
		Name:          "Studio Conflict Callback",
		DisplayMode:   config.ModeEdit,
		MonitorIndex:  0,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: []config.WidgetInstanceV3{}},
		},
	})

	callbackCount := 0
	svc := NewStudioProfileService(nil, func(saved StudioProfileSaved) {
		callbackCount++
	})
	svc.path = path
	svc.loaded = &config.LoadedProfileV3{Document: doc, Revision: "", MigratedFrom: config.ProfileSchemaVersionV3}
	if err := svc.Save("req-conflict-initial", "", doc); err != nil {
		t.Fatal(err)
	}
	if callbackCount != 1 {
		t.Fatalf("callbackCount=%d want 1", callbackCount)
	}

	if err := svc.Save("req-conflict-stale", "stale-revision", doc); err == nil {
		t.Fatal("expected conflict error")
	}
	if callbackCount != 1 {
		t.Fatalf("callbackCount=%d want unchanged after conflict", callbackCount)
	}
}

func TestStudioProfileServiceSaveConflictEmitsConflict(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := config.NormalizeProfileDocumentV3(&config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "studio-conflict",
		Name:          "Studio Conflict",
		DisplayMode:   config.ModeEdit,
		MonitorIndex:  0,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: []config.WidgetInstanceV3{}},
		},
	})

	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	svc.path = path
	svc.loaded = &config.LoadedProfileV3{Document: doc, Revision: "", MigratedFrom: config.ProfileSchemaVersionV3}
	if err := svc.Save("req-conflict-1", "", doc); err != nil {
		t.Fatal(err)
	}

	err := svc.Save("req-conflict-2", "stale-revision", doc)
	if err == nil {
		t.Fatal("expected conflict error")
	}
	if len(spy.events) == 0 || spy.events[len(spy.events)-1] != "studio:profile:conflict" {
		t.Fatalf("events=%v want terminal studio:profile:conflict", spy.events)
	}
	conflict := spy.data[len(spy.data)-1].(map[string]any)
	if conflict["requestId"] != "req-conflict-2" {
		t.Fatalf("requestId=%v want req-conflict-2", conflict["requestId"])
	}
}

func TestStudioProfileServiceSaveErrorEmitsError(t *testing.T) {
	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	doc := config.NormalizeProfileDocumentV3(&config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "studio-error",
		Name:          "Studio Error",
		DisplayMode:   config.ModeEdit,
		MonitorIndex:  0,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: []config.WidgetInstanceV3{}},
		},
	})
	svc.loaded = &config.LoadedProfileV3{Document: doc, Revision: "abc", MigratedFrom: config.ProfileSchemaVersionV3}

	if err := svc.Save("req-error-1", "abc", doc); err == nil {
		t.Fatal("expected save error without path")
	}
	found := false
	for _, event := range spy.events {
		if event == "studio:profile:error" {
			found = true
		}
	}
	if !found {
		t.Fatalf("events=%v want studio:profile:error", spy.events)
	}
}

func TestStudioProfileServiceHandleLoadResolvesBasenameFromProfilesDir(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "custom-race-hud.json")
	source, err := os.ReadFile(filepath.Join("..", "..", "pkg", "config", "testdata", "profile-v0-core-widgets.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, source, 0644); err != nil {
		t.Fatal(err)
	}

	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	svc.SetProfilesDir(dir)
	svc.HandleLoad(map[string]any{"requestId": "req-basename-load", "file": "custom-race-hud.json"})

	foundLoaded := false
	for i, event := range spy.events {
		if event != "studio:profile:loaded" {
			continue
		}
		foundLoaded = true
		payload := spy.data[i].(map[string]any)
		if payload["requestId"] != "req-basename-load" {
			t.Fatalf("requestId=%v", payload["requestId"])
		}
	}
	if !foundLoaded {
		t.Fatalf("events=%v want studio:profile:loaded", spy.events)
	}
	if svc.Path() != path {
		t.Fatalf("path=%q want %q", svc.Path(), path)
	}
}

func TestStudioProfileServiceHandleLoadEchoesRequestId(t *testing.T) {
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
	svc.HandleLoad(map[string]any{"requestId": "req-handler-load", "file": path})

	foundLoaded := false
	for i, event := range spy.events {
		if event != "studio:profile:loaded" {
			continue
		}
		foundLoaded = true
		payload := spy.data[i].(map[string]any)
		if payload["requestId"] != "req-handler-load" {
			t.Fatalf("requestId=%v", payload["requestId"])
		}
	}
	if !foundLoaded {
		t.Fatalf("events=%v want studio:profile:loaded", spy.events)
	}
}

func TestStudioProfileServiceHandleLoadMissingFileEmitsError(t *testing.T) {
	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	svc.HandleLoad(map[string]any{"requestId": "req-missing-file"})

	found := false
	for i, event := range spy.events {
		if event != "studio:profile:error" {
			continue
		}
		found = true
		payload := spy.data[i].(map[string]any)
		if payload["requestId"] != "req-missing-file" {
			t.Fatalf("requestId=%v", payload["requestId"])
		}
		if payload["operation"] != "load" {
			t.Fatalf("operation=%v want load", payload["operation"])
		}
	}
	if !found {
		t.Fatalf("events=%v want studio:profile:error", spy.events)
	}
}

func TestStudioProfileServiceHandleSaveMissingDocumentEmitsError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := config.NormalizeProfileDocumentV3(&config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "studio-handler",
		Name:          "Studio Handler",
		DisplayMode:   config.ModeEdit,
		MonitorIndex:  0,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: []config.WidgetInstanceV3{}},
		},
	})
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}

	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	svc.path = path
	svc.HandleSave(map[string]any{"requestId": "req-missing-doc", "expectedRevision": ""})

	found := false
	for i, event := range spy.events {
		if event != "studio:profile:error" {
			continue
		}
		found = true
		payload := spy.data[i].(map[string]any)
		if payload["requestId"] != "req-missing-doc" {
			t.Fatalf("requestId=%v", payload["requestId"])
		}
		if payload["operation"] != "save" {
			t.Fatalf("operation=%v want save", payload["operation"])
		}
	}
	if !found {
		t.Fatalf("events=%v want studio:profile:error", spy.events)
	}
}

func TestProfileServicePath(t *testing.T) {
	svc := NewProfileService("/tmp/example.json", nil, nil)
	if svc.Path() != "/tmp/example.json" {
		t.Fatalf("path=%q", svc.Path())
	}
}
