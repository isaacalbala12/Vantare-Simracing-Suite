package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/license"
	"github.com/vantare/overlays/v2/pkg/config"
)

// freePolicyAuthority returns a license service holding a Free authority
// without any network: anonymous with no entitlements derives basic-only.
func freePolicyAuthority() *license.Service {
	svc := license.NewService(license.Config{}, nil, nil)
	svc.EmitChanged(&license.Result{State: license.StateAuthenticatedNoEntitlement})
	return svc
}

func wiringLegacyWidget(id, widgetType string) config.WidgetConfig {
	return config.WidgetConfig{
		ID: id, Type: widgetType, Enabled: true, UpdateHz: 15,
		Position: config.Rect{X: 1, Y: 2, W: 3, H: 4},
		Props:    map[string]any{"mode": "default"},
	}
}

func wiringLegacyDoc(id string, widgets ...config.WidgetConfig) *config.ProfileConfig {
	return &config.ProfileConfig{
		SchemaVersion: config.ProfileSchemaVersionV2,
		ID:            id,
		Name:          "Wiring",
		DisplayMode:   config.ModeRacing,
		Widgets:       widgets,
	}
}

func writeWiringLegacyProfile(t *testing.T, path string, profile *config.ProfileConfig) {
	t.Helper()
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatal(err)
	}
}

func deniedWidgetIDs(t *testing.T, err error) []string {
	t.Helper()
	if err == nil {
		t.Fatal("expected a policy denial, got nil")
	}
	var denied *app.WidgetPolicyDeniedError
	if !errors.As(err, &denied) {
		t.Fatalf("error type = %T, want *app.WidgetPolicyDeniedError", err)
	}
	return denied.WidgetIDs
}

// TestWidgetPolicyWiringHubDeniesForgedSave is the composition coverage for
// ISA-1097: if wireWidgetPolicySources stops connecting a service, the
// forged save below succeeds and this test fails. The unwired control proves
// the test is sensitive (legacy behavior without a source).
func TestWidgetPolicyWiringHubDeniesForgedSave(t *testing.T) {
	forged := func() *config.ProfileConfig {
		draft := wiringLegacyDoc("legacy-1",
			wiringLegacyWidget("delta", "delta"), wiringLegacyWidget("standings", "standings"))
		draft.Widgets[0].Props = map[string]any{"mode": "gap"}
		return draft
	}

	unwiredDir := t.TempDir()
	writeWiringLegacyProfile(t, filepath.Join(unwiredDir, "legacy-1.json"), wiringLegacyDoc("legacy-1",
		wiringLegacyWidget("delta", "delta"), wiringLegacyWidget("standings", "standings")))
	unwired := app.NewHubService(unwiredDir, app.NewProfileService(filepath.Join(unwiredDir, "dummy.json"), nil, nil), nil, nil)
	if err := unwired.SaveProfile(forged()); err != nil {
		t.Fatalf("unwired control must keep legacy behavior, got: %v", err)
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-1.json")
	writeWiringLegacyProfile(t, path, wiringLegacyDoc("legacy-1",
		wiringLegacyWidget("delta", "delta"), wiringLegacyWidget("standings", "standings")))
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	wired := app.NewHubService(dir, profileSvc, nil, nil)
	wireWidgetPolicySources(wired, profileSvc, nil, freePolicyAuthority())
	ids := deniedWidgetIDs(t, wired.SaveProfile(forged()))
	if len(ids) != 1 || ids[0] != "delta" {
		t.Fatalf("denied ids = %v, want [delta]", ids)
	}
	stored, err := config.LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if mode := stored.Widgets[0].Props["mode"]; mode != "default" {
		t.Fatalf("disk props mode=%v, want default (denial must not persist)", mode)
	}
}

func TestWidgetPolicyWiringProfileServiceDeniesForgedState(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-2.json")
	writeWiringLegacyProfile(t, path, wiringLegacyDoc("legacy-2",
		wiringLegacyWidget("delta", "delta"), wiringLegacyWidget("standings", "standings")))
	svc := app.NewProfileService(path, nil, nil)
	if err := svc.LoadActiveProfile(path); err != nil {
		t.Fatal(err)
	}
	wireWidgetPolicySources(nil, svc, nil, freePolicyAuthority())
	moved := []config.WidgetConfig{wiringLegacyWidget("delta", "delta"), wiringLegacyWidget("standings", "standings")}
	moved[0].Position.X = 900
	if err := svc.SaveProfileState(moved, nil); err != nil {
		t.Fatalf("position move denied: %v", err)
	}
	forged := []config.WidgetConfig{wiringLegacyWidget("delta", "delta"), wiringLegacyWidget("standings", "standings")}
	forged[0].Props = map[string]any{"mode": "gap"}
	ids := deniedWidgetIDs(t, svc.SaveProfileState(forged, nil))
	if len(ids) != 1 || ids[0] != "delta" {
		t.Fatalf("denied ids = %v, want [delta]", ids)
	}
}

func TestWidgetPolicyWiringStudioDeniesForgedSave(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	doc := config.NormalizeProfileDocumentV3(&config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "wiring-profile",
		Name:          "Wiring",
		DisplayMode:   config.ModeEdit,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: []config.WidgetInstanceV3{{
				ID:       "delta-main",
				Type:     "delta",
				Layout:   config.WidgetLayoutV3{X: 10, Y: 10, W: 300, H: 200},
				Behavior: config.WidgetBehaviorV3{Enabled: true, UpdateHz: 10},
				Content:  map[string]any{"mode": "default"},
				Visual:   config.WidgetVisualV3{SystemID: "vantare-original", SystemVersion: 1, ConfigVersion: 1},
			}}},
		},
	})
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
	svc := app.NewStudioProfileService(nil, nil)
	loaded, err := svc.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	wireWidgetPolicySources(nil, nil, svc, freePolicyAuthority())
	draft := config.NormalizeProfileDocumentV3(loaded.Document)
	widgets := draft.Layouts[config.LayoutGeneral].Widgets
	widgets[0].Content = map[string]any{"mode": "gap"}
	draft.Layouts[config.LayoutGeneral] = config.SessionLayoutV3{Type: config.LayoutGeneral, Widgets: widgets}
	ids := deniedWidgetIDs(t, svc.Save("req-wiring-1", loaded.Revision, draft))
	if len(ids) != 1 || ids[0] != "delta-main" {
		t.Fatalf("denied ids = %v, want [delta-main]", ids)
	}
}
