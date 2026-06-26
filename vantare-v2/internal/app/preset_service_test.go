package app

import (
	"os"
	"path/filepath"
	"testing"
)

type mockPresetEmitter struct {
	calls []struct {
		Name string
		Data any
	}
}

func (m *mockPresetEmitter) Emit(name string, data any) {
	m.calls = append(m.calls, struct {
		Name string
		Data any
	}{Name: name, Data: data})
}

func TestPresetServiceLoadMissingFileReturnsEmpty(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load missing file should not error, got %v", err)
	}
	if got := svc.List(); len(got) != 0 {
		t.Fatalf("expected 0 presets, got %d", len(got))
	}
}

func TestPresetServiceLoadValidFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "widget-presets.json")
	data := `{"version":1,"presets":[{"id":"p1","name":"Test","widgetType":"delta","appearance":{"accentColor":"#fff"},"createdAt":"2026-06-26T10:00:00Z","updatedAt":"2026-06-26T10:00:00Z"}]}`
	if err := os.WriteFile(path, []byte(data), 0644); err != nil {
		t.Fatal(err)
	}
	svc := NewPresetService(dir, nil)
	if err := svc.Load(); err != nil {
		t.Fatalf("Load valid file should not error, got %v", err)
	}
	got := svc.List()
	if len(got) != 1 || got[0].ID != "p1" {
		t.Fatalf("expected 1 preset p1, got %+v", got)
	}
}

func TestPresetServiceLoadCorruptFileReturnsError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "widget-presets.json")
	if err := os.WriteFile(path, []byte("{not json"), 0644); err != nil {
		t.Fatal(err)
	}
	svc := NewPresetService(dir, nil)
	err := svc.Load()
	if err == nil {
		t.Fatal("expected error for corrupt file, got nil")
	}
}

func TestPresetServiceSaveNewPreset(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	preset := WidgetPreset{
		Name:       "My Preset",
		WidgetType: "relative",
		Appearance: map[string]any{"accentColor": "#ff0000"},
	}
	if err := svc.Save(&preset); err != nil {
		t.Fatalf("Save should not error, got %v", err)
	}
	if preset.ID == "" {
		t.Fatal("Save should generate an ID")
	}
	if preset.CreatedAt == "" || preset.UpdatedAt == "" {
		t.Fatal("Save should set timestamps")
	}

	// Reload to confirm persistence
	svc2 := NewPresetService(dir, nil)
	if err := svc2.Load(); err != nil {
		t.Fatal(err)
	}
	got := svc2.List()
	if len(got) != 1 || got[0].ID != preset.ID {
		t.Fatalf("expected persisted preset %s, got %+v", preset.ID, got)
	}
}

func TestPresetServiceSaveReplacesExistingID(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	p1 := WidgetPreset{ID: "p1", Name: "Old", WidgetType: "delta"}
	if err := svc.Save(&p1); err != nil {
		t.Fatal(err)
	}
	p2 := WidgetPreset{ID: "p1", Name: "New", WidgetType: "delta"}
	if err := svc.Save(&p2); err != nil {
		t.Fatal(err)
	}
	got := svc.List()
	if len(got) != 1 || got[0].Name != "New" {
		t.Fatalf("expected replaced preset New, got %+v", got)
	}
}

func TestPresetServiceSaveRejectsInvalidID(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	cases := []struct {
		id string
		ok bool
	}{
		{"", true}, // empty generates a new ID
		{"valid-id", true},
		{"../escape", false},
		{"with space", false},
	}
	for _, c := range cases {
		p := WidgetPreset{ID: c.id, Name: "T", WidgetType: "delta"}
		err := svc.Save(&p)
		if c.ok && err != nil {
			t.Errorf("id %q expected ok, got %v", c.id, err)
		}
		if !c.ok && err == nil {
			t.Errorf("id %q expected error, got nil", c.id)
		}
	}
}

func TestPresetServiceDeleteExisting(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	p := WidgetPreset{ID: "p1", Name: "T", WidgetType: "delta"}
	if err := svc.Save(&p); err != nil {
		t.Fatal(err)
	}
	if err := svc.Delete("p1"); err != nil {
		t.Fatalf("Delete should not error, got %v", err)
	}
	if len(svc.List()) != 0 {
		t.Fatal("expected 0 presets after delete")
	}
}

func TestPresetServiceDeleteNonExistingReturnsError(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	if err := svc.Delete("nope"); err == nil {
		t.Fatal("expected error deleting non-existing preset")
	}
}

func TestPresetServiceRename(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	p := WidgetPreset{ID: "p1", Name: "Old", WidgetType: "delta"}
	if err := svc.Save(&p); err != nil {
		t.Fatal(err)
	}

	// Modificamos artificialmente el UpdatedAt en memoria para asegurar que cambie al renombrar
	svc.presets[0].UpdatedAt = "2026-06-26T00:00:00Z"
	oldUpdatedAt := svc.presets[0].UpdatedAt

	if err := svc.Rename("p1", "New Name"); err != nil {
		t.Fatalf("Rename should not error, got %v", err)
	}
	got := svc.List()
	if got[0].Name != "New Name" {
		t.Fatalf("expected name New Name, got %q", got[0].Name)
	}
	if got[0].UpdatedAt == oldUpdatedAt {
		t.Fatal("Rename should update UpdatedAt")
	}
}

func TestPresetServiceListByType(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	_ = svc.Save(&WidgetPreset{ID: "a", Name: "A", WidgetType: "delta"})
	_ = svc.Save(&WidgetPreset{ID: "b", Name: "B", WidgetType: "relative"})
	_ = svc.Save(&WidgetPreset{ID: "c", Name: "C", WidgetType: "delta"})
	got := svc.ListByType("delta")
	if len(got) != 2 {
		t.Fatalf("expected 2 delta presets, got %d", len(got))
	}
}

func TestPresetServiceSaveRejectsEmptyName(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	p := WidgetPreset{ID: "p1", Name: "   ", WidgetType: "delta"}
	if err := svc.Save(&p); err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestPresetServiceSaveRejectsEmptyWidgetType(t *testing.T) {
	dir := t.TempDir()
	svc := NewPresetService(dir, nil)
	p := WidgetPreset{ID: "p1", Name: "T", WidgetType: "   "}
	if err := svc.Save(&p); err == nil {
		t.Fatal("expected error for empty widgetType")
	}
}

func TestPresetServiceHandleSaveEmitsErrorOnEmptyName(t *testing.T) {
	dir := t.TempDir()
	emitter := &mockPresetEmitter{}
	svc := NewPresetService(dir, emitter)

	svc.handleSave(map[string]any{
		"preset": map[string]any{
			"id":         "p1",
			"name":       "   ",
			"widgetType": "delta",
		},
	})

	if len(emitter.calls) != 1 {
		t.Fatalf("expected 1 emit, got %d", len(emitter.calls))
	}
	call := emitter.calls[0]
	if call.Name != "preset:save:error" {
		t.Fatalf("expected event preset:save:error, got %s", call.Name)
	}
	payload, ok := call.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", call.Data)
	}
	if payload["id"] != "p1" {
		t.Errorf("expected id p1, got %v", payload["id"])
	}
	if payload["message"] == "" {
		t.Error("expected non-empty error message")
	}
}

func TestPresetServiceHandleDeleteEmitsErrorWhenNotFound(t *testing.T) {
	dir := t.TempDir()
	emitter := &mockPresetEmitter{}
	svc := NewPresetService(dir, emitter)

	svc.handleDelete(map[string]any{"id": "missing-id"})

	if len(emitter.calls) != 1 {
		t.Fatalf("expected 1 emit, got %d", len(emitter.calls))
	}
	call := emitter.calls[0]
	if call.Name != "preset:delete:error" {
		t.Fatalf("expected event preset:delete:error, got %s", call.Name)
	}
	payload, ok := call.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", call.Data)
	}
	if payload["id"] != "missing-id" {
		t.Errorf("expected id missing-id, got %v", payload["id"])
	}
	if payload["message"] == "" {
		t.Error("expected non-empty error message")
	}
}

func TestPresetServiceHandleRenameEmitsErrorWhenNotFound(t *testing.T) {
	dir := t.TempDir()
	emitter := &mockPresetEmitter{}
	svc := NewPresetService(dir, emitter)

	svc.handleRename(map[string]any{
		"id":   "missing-id",
		"name": "New Name",
	})

	if len(emitter.calls) != 1 {
		t.Fatalf("expected 1 emit, got %d", len(emitter.calls))
	}
	call := emitter.calls[0]
	if call.Name != "preset:rename:error" {
		t.Fatalf("expected event preset:rename:error, got %s", call.Name)
	}
	payload, ok := call.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", call.Data)
	}
	if payload["id"] != "missing-id" {
		t.Errorf("expected id missing-id, got %v", payload["id"])
	}
	if payload["message"] == "" {
		t.Error("expected non-empty error message")
	}
}

func TestPresetServiceHandlersEmitErrorOnNilData(t *testing.T) {
	dir := t.TempDir()
	emitter := &mockPresetEmitter{}
	svc := NewPresetService(dir, emitter)

	svc.handleSave(nil)
	svc.handleDelete(nil)
	svc.handleRename(nil)

	if len(emitter.calls) != 3 {
		t.Fatalf("expected 3 emits, got %d", len(emitter.calls))
	}
	expected := []string{"preset:save:error", "preset:delete:error", "preset:rename:error"}
	for i, name := range expected {
		if emitter.calls[i].Name != name {
			t.Errorf("call %d: expected %s, got %s", i, name, emitter.calls[i].Name)
		}
		payload, ok := emitter.calls[i].Data.(map[string]any)
		if !ok {
			t.Fatalf("call %d: expected map payload, got %T", i, emitter.calls[i].Data)
		}
		if payload["message"] == "" {
			t.Errorf("call %d: expected non-empty error message", i)
		}
	}
}
