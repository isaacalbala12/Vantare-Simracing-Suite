package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWidgetDesignServiceMigratesLegacyPresetsInMemory(t *testing.T) {
	dir := t.TempDir()
	presetsPath := filepath.Join(dir, "widget-presets.json")
	presets := presetFile{
		Version: 1,
		Presets: []WidgetPreset{{
			ID:         "preset-delta",
			Name:       "Delta Preset",
			WidgetType: "delta",
			Appearance: map[string]any{"accentColor": "#fff"},
			CreatedAt:  "2026-07-10T00:00:00Z",
			UpdatedAt:  "2026-07-10T00:00:00Z",
		}},
	}
	data, err := json.MarshalIndent(presets, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(presetsPath, data, 0644); err != nil {
		t.Fatal(err)
	}

	svc := NewWidgetDesignService(dir, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	designs := svc.List()
	if len(designs) != 1 {
		t.Fatalf("expected 1 migrated design, got %d", len(designs))
	}
	if designs[0].Origin != "user" {
		t.Fatalf("origin=%q want user", designs[0].Origin)
	}
	if designs[0].SystemID != "vantare-original" {
		t.Fatalf("systemId=%q", designs[0].SystemID)
	}
	if _, err := os.Stat(filepath.Join(dir, "widget-designs.json")); !os.IsNotExist(err) {
		t.Fatal("migration must stay in memory until save")
	}
}

func TestWidgetDesignServiceMigratesCrystalAlias(t *testing.T) {
	dir := t.TempDir()
	presetsPath := filepath.Join(dir, "widget-presets.json")
	presets := presetFile{
		Version: 1,
		Presets: []WidgetPreset{{
			ID:         "preset-crystal",
			Name:       "Crystal Preset",
			WidgetType: "relative",
			Variant: &PresetVariant{
				ThemeID: "glassmorphism-pro",
			},
			CreatedAt: "2026-07-10T00:00:00Z",
			UpdatedAt: "2026-07-10T00:00:00Z",
		}},
	}
	data, err := json.MarshalIndent(presets, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(presetsPath, data, 0644); err != nil {
		t.Fatal(err)
	}

	svc := NewWidgetDesignService(dir, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	designs := svc.List()
	if len(designs) != 1 || designs[0].SystemID != "vantare-crystal" {
		t.Fatalf("expected crystal design, got %+v", designs)
	}
}

func TestWidgetDesignServiceSaveWritesDesignsAtomically(t *testing.T) {
	dir := t.TempDir()
	spy := &studioProfileSpy{}
	svc := NewWidgetDesignService(dir, spy)
	design := WidgetDesignV1{
		Name:            "Saved Design",
		WidgetType:      "delta",
		SystemID:        "vantare-original",
		SystemVersion:   1,
		ConfigVersion:   1,
		Visual:          map[string]any{"legacyDesignId": "vantare-racing"},
		IncludesContent: false,
		Origin:          "user",
	}
	if err := svc.Save(&design); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "widget-designs.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "Saved Design") {
		t.Fatal("expected saved design on disk")
	}
	foundSaved := false
	for i, event := range spy.events {
		if event == "design:saved" {
			foundSaved = true
			payload := spy.data[i].(map[string]any)
			if payload["design"] == nil {
				t.Fatal("expected full design in saved event")
			}
		}
	}
	if !foundSaved {
		t.Fatalf("events=%v", spy.events)
	}
}

func TestWidgetDesignServiceDeleteDoesNotMutateProfileWidgets(t *testing.T) {
	dir := t.TempDir()
	svc := NewWidgetDesignService(dir, nil)
	design := WidgetDesignV1{
		ID:              "design-1",
		Name:            "Delete Me",
		WidgetType:      "delta",
		SystemID:        "vantare-original",
		SystemVersion:   1,
		ConfigVersion:   1,
		Visual:          map[string]any{},
		IncludesContent: false,
		Origin:          "user",
	}
	if err := svc.Save(&design); err != nil {
		t.Fatal(err)
	}
	profileWidget := map[string]any{
		"id":   "delta-main",
		"type": "delta",
		"visual": map[string]any{
			"provenance": map[string]any{"designId": "design-1"},
		},
	}
	before, err := json.Marshal(profileWidget)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Delete("design-1"); err != nil {
		t.Fatal(err)
	}
	after, err := json.Marshal(profileWidget)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("delete mutated external profile widget snapshot")
	}
}

func TestWidgetDesignServiceRejectsInvalidDesign(t *testing.T) {
	dir := t.TempDir()
	svc := NewWidgetDesignService(dir, nil)
	cases := []WidgetDesignV1{
		{Name: "T", WidgetType: "telemetry", SystemID: "vantare-original", SystemVersion: 1, ConfigVersion: 1, Visual: map[string]any{}, Origin: "user"},
		{Name: "T", WidgetType: "delta", SystemID: "broadcast-pro", SystemVersion: 1, ConfigVersion: 1, Visual: map[string]any{}, Origin: "user"},
		{Name: "T", WidgetType: "delta", SystemID: "vantare-original", SystemVersion: 0, ConfigVersion: 1, Visual: map[string]any{}, Origin: "user"},
		{Name: "   ", WidgetType: "delta", SystemID: "vantare-original", SystemVersion: 1, ConfigVersion: 1, Visual: map[string]any{}, Origin: "user"},
	}
	for _, design := range cases {
		if err := svc.Save(&design); err == nil {
			t.Fatalf("expected error for %#v", design)
		}
	}
}

func TestWidgetDesignServiceRejectsOversizedDesign(t *testing.T) {
	dir := t.TempDir()
	svc := NewWidgetDesignService(dir, nil)
	design := WidgetDesignV1{
		Name:            "Huge",
		WidgetType:      "delta",
		SystemID:        "vantare-original",
		SystemVersion:   1,
		ConfigVersion:   1,
		Visual:          map[string]any{"blob": strings.Repeat("x", 256*1024)},
		IncludesContent: false,
		Origin:          "user",
	}
	if err := svc.Save(&design); err == nil {
		t.Fatal("expected oversized design rejection")
	}
}

func TestWidgetDesignServiceListByWidgetType(t *testing.T) {
	dir := t.TempDir()
	svc := NewWidgetDesignService(dir, nil)
	for _, item := range []WidgetDesignV1{
		{Name: "A", WidgetType: "delta", SystemID: "vantare-original", SystemVersion: 1, ConfigVersion: 1, Visual: map[string]any{}, Origin: "user"},
		{Name: "B", WidgetType: "relative", SystemID: "vantare-crystal", SystemVersion: 1, ConfigVersion: 1, Visual: map[string]any{}, Origin: "user"},
	} {
		design := item
		if err := svc.Save(&design); err != nil {
			t.Fatal(err)
		}
	}
	got := svc.ListByType("delta")
	if len(got) != 1 || got[0].WidgetType != "delta" {
		t.Fatalf("ListByType(delta)=%+v", got)
	}
}

func TestWidgetDesignServiceHandleListEmitsResponse(t *testing.T) {
	dir := t.TempDir()
	spy := &studioProfileSpy{}
	svc := NewWidgetDesignService(dir, spy)
	_ = svc.Save(&WidgetDesignV1{
		Name: "Listed", WidgetType: "delta", SystemID: "vantare-original",
		SystemVersion: 1, ConfigVersion: 1, Visual: map[string]any{}, Origin: "user",
	})
	svc.handleList(map[string]any{"widgetType": "delta", "requestId": "req-1"})
	found := false
	for i, event := range spy.events {
		if event != "design:list:response" {
			continue
		}
		found = true
		payload := spy.data[i].(map[string]any)
		if payload["requestId"] != "req-1" {
			t.Fatalf("requestId=%v", payload["requestId"])
		}
	}
	if !found {
		t.Fatalf("events=%v want design:list:response", spy.events)
	}
}
