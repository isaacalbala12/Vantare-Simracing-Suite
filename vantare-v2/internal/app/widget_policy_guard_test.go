package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/license"
	"github.com/vantare/overlays/v2/pkg/config"
)

func guardWidget(id, widgetType string) config.WidgetInstanceV3 {
	return config.WidgetInstanceV3{
		ID:       id,
		Type:     config.WidgetTypeV3(widgetType),
		Layout:   config.WidgetLayoutV3{X: 10, Y: 10, W: 300, H: 200},
		Behavior: config.WidgetBehaviorV3{Enabled: true, UpdateHz: 10},
		Content:  map[string]any{"mode": "default"},
		Visual:   config.WidgetVisualV3{SystemID: "vantare-original", SystemVersion: 1, ConfigVersion: 1},
	}
}

func guardDoc(widgets ...config.WidgetInstanceV3) *config.ProfileDocumentV3 {
	return &config.ProfileDocumentV3{
		SchemaVersion: 3,
		ID:            "profile-1",
		Name:          "Test",
		DisplayMode:   "edit",
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			"general": {Type: "general", Widgets: widgets},
		},
	}
}

func guardFreePolicy() license.WidgetPolicy {
	return license.WidgetPolicy{
		OverlaysBasic:   true,
		BrandCrystal:    license.BrandRequired,
		BrandEfficiency: license.BrandRequired,
		BrandOriginal:   license.BrandNone,
	}
}

func guardSuitePolicy() license.WidgetPolicy {
	policy := guardFreePolicy()
	policy.OverlaysAdvanced = true
	policy.EngineerAI = true
	policy.BrandCrystal = license.BrandOptional
	policy.BrandEfficiency = license.BrandOptional
	return policy
}

func guardDeniedIDs(t *testing.T, err error) []string {
	t.Helper()
	if err == nil {
		t.Fatal("expected a policy denial, got nil")
	}
	var denied *WidgetPolicyDeniedError
	if !errors.As(err, &denied) {
		t.Fatalf("error type = %T, want *WidgetPolicyDeniedError", err)
	}
	return denied.WidgetIDs
}

func TestGuardAllowsFreeLayoutMoveOfPremium(t *testing.T) {
	saved := guardDoc(guardWidget("delta-main", "delta"))
	draft := guardDoc(guardWidget("delta-main", "delta"))
	draft.Layouts["general"].Widgets[0].Layout.X = 500
	if err := checkStudioProfileSave(guardFreePolicy(), saved, draft); err != nil {
		t.Fatalf("layout move denied: %v", err)
	}
}

func TestGuardAllowsFreeDeleteOfPremium(t *testing.T) {
	saved := guardDoc(guardWidget("delta-main", "delta"), guardWidget("standings-main", "standings"))
	draft := guardDoc(guardWidget("standings-main", "standings"))
	if err := checkStudioProfileSave(guardFreePolicy(), saved, draft); err != nil {
		t.Fatalf("delete denied: %v", err)
	}
}

func TestGuardDeniesFreeAddOfPremium(t *testing.T) {
	saved := guardDoc(guardWidget("standings-main", "standings"))
	draft := guardDoc(guardWidget("standings-main", "standings"), guardWidget("delta-main", "delta"))
	ids := guardDeniedIDs(t, checkStudioProfileSave(guardFreePolicy(), saved, draft))
	if len(ids) != 1 || ids[0] != "delta-main" {
		t.Fatalf("denied ids = %v, want [delta-main]", ids)
	}
}

func TestGuardDeniesFreeContentEditOfPremium(t *testing.T) {
	saved := guardDoc(guardWidget("delta-main", "delta"))
	draft := guardDoc(guardWidget("delta-main", "delta"))
	widgets := draft.Layouts["general"].Widgets
	widgets[0].Content = map[string]any{"mode": "gap"}
	draft.Layouts["general"] = config.SessionLayoutV3{Type: "general", Widgets: widgets}
	ids := guardDeniedIDs(t, checkStudioProfileSave(guardFreePolicy(), saved, draft))
	if len(ids) != 1 || ids[0] != "delta-main" {
		t.Fatalf("denied ids = %v, want [delta-main]", ids)
	}
}

func TestGuardDeniesFreeVisualEditOfPremium(t *testing.T) {
	saved := guardDoc(guardWidget("delta-main", "delta"))
	draft := guardDoc(guardWidget("delta-main", "delta"))
	widgets := draft.Layouts["general"].Widgets
	widgets[0].Visual.AppearanceOverrides = map[string]any{"showHeader": false}
	draft.Layouts["general"] = config.SessionLayoutV3{Type: "general", Widgets: widgets}
	ids := guardDeniedIDs(t, checkStudioProfileSave(guardFreePolicy(), saved, draft))
	if len(ids) != 1 || ids[0] != "delta-main" {
		t.Fatalf("denied ids = %v, want [delta-main]", ids)
	}
}

func TestGuardAllowsUnrelatedFreeEditWithPremiumUntouched(t *testing.T) {
	saved := guardDoc(guardWidget("delta-main", "delta"), guardWidget("standings-main", "standings"))
	draft := guardDoc(guardWidget("delta-main", "delta"), guardWidget("standings-main", "standings"))
	widgets := draft.Layouts["general"].Widgets
	widgets[1].Layout.X = 700
	draft.Layouts["general"] = config.SessionLayoutV3{Type: "general", Widgets: widgets}
	if err := checkStudioProfileSave(guardFreePolicy(), saved, draft); err != nil {
		t.Fatalf("unrelated edit denied: %v", err)
	}
}

func TestGuardAllowsSuiteEditOfPremium(t *testing.T) {
	saved := guardDoc(guardWidget("delta-main", "delta"))
	draft := guardDoc(guardWidget("delta-main", "delta"), guardWidget("relative-main", "relative"))
	widgets := draft.Layouts["general"].Widgets
	widgets[0].Content = map[string]any{"mode": "gap"}
	draft.Layouts["general"] = config.SessionLayoutV3{Type: "general", Widgets: widgets}
	if err := checkStudioProfileSave(guardSuitePolicy(), saved, draft); err != nil {
		t.Fatalf("suite edit denied: %v", err)
	}
}

func TestGuardEngineerAddsRadioButNotDelta(t *testing.T) {
	policy := guardFreePolicy()
	policy.EngineerAI = true
	policy.BrandCrystal = license.BrandOptional
	policy.BrandEfficiency = license.BrandOptional
	saved := guardDoc()
	if err := checkStudioProfileSave(policy, saved, guardDoc(guardWidget("radio-main", "engineer-radio"))); err != nil {
		t.Fatalf("engineer-radio add denied: %v", err)
	}
	ids := guardDeniedIDs(t, checkStudioProfileSave(policy, saved, guardDoc(guardWidget("delta-main", "delta"))))
	if len(ids) != 1 || ids[0] != "delta-main" {
		t.Fatalf("denied ids = %v, want [delta-main]", ids)
	}
}

func TestGuardOverlaysAddsDeltaButNotRadio(t *testing.T) {
	policy := guardFreePolicy()
	policy.OverlaysAdvanced = true
	policy.BrandCrystal = license.BrandOptional
	policy.BrandEfficiency = license.BrandOptional
	saved := guardDoc()
	if err := checkStudioProfileSave(policy, saved, guardDoc(guardWidget("delta-main", "delta"))); err != nil {
		t.Fatalf("delta add denied: %v", err)
	}
	ids := guardDeniedIDs(t, checkStudioProfileSave(policy, saved, guardDoc(guardWidget("radio-main", "engineer-radio"))))
	if len(ids) != 1 || ids[0] != "radio-main" {
		t.Fatalf("denied ids = %v, want [radio-main]", ids)
	}
}

func TestGuardUnknownTypeAddDeniedButIdenticalAllowed(t *testing.T) {
	saved := guardDoc()
	ids := guardDeniedIDs(t, checkStudioProfileSave(guardSuitePolicy(), saved, guardDoc(guardWidget("mystery", "future-widget"))))
	if len(ids) != 1 || ids[0] != "mystery" {
		t.Fatalf("denied ids = %v, want [mystery]", ids)
	}
	preserved := guardDoc(guardWidget("mystery", "future-widget"))
	if err := checkStudioProfileSave(guardFreePolicy(), preserved, guardDoc(guardWidget("mystery", "future-widget"))); err != nil {
		t.Fatalf("identical unknown widget denied: %v", err)
	}
}

func TestGuardNilBaselineAdmitsImportForPreservation(t *testing.T) {
	draft := guardDoc(guardWidget("delta-main", "delta"), guardWidget("standings-main", "standings"))
	if err := checkStudioProfileSave(guardFreePolicy(), nil, draft); err != nil {
		t.Fatalf("import denied: %v (blocked widgets stay inactive, never deleted)", err)
	}
}

type stubWidgetPolicySource struct {
	policy license.WidgetPolicy
}

func (s stubWidgetPolicySource) CurrentWidgetPolicy() license.WidgetPolicy {
	return s.policy
}

func writeStudioGuardProfile(t *testing.T, path string, widgets ...config.WidgetInstanceV3) {
	t.Helper()
	doc := config.NormalizeProfileDocumentV3(&config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "service-profile",
		Name:          "Service",
		DisplayMode:   config.ModeEdit,
		MonitorIndex:  0,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: widgets},
		},
	})
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}

func loadStudioGuardDraft(loaded *config.LoadedProfileV3) *config.ProfileDocumentV3 {
	return config.NormalizeProfileDocumentV3(loaded.Document)
}

func TestStudioSaveDeniesForgedPremiumEdit(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	writeStudioGuardProfile(t, path, guardWidget("delta-main", "delta"))
	svc := NewStudioProfileService(&studioProfileSpy{}, nil)
	loaded, err := svc.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	svc.SetWidgetPolicySource(stubWidgetPolicySource{policy: guardFreePolicy()})
	draft := loadStudioGuardDraft(loaded)
	widgets := draft.Layouts[config.LayoutGeneral].Widgets
	widgets[0].Content = map[string]any{"mode": "gap"}
	draft.Layouts[config.LayoutGeneral] = config.SessionLayoutV3{Type: config.LayoutGeneral, Widgets: widgets}
	if err := svc.Save("req-forge-1", loaded.Revision, draft); err == nil {
		t.Fatal("forged premium edit saved without denial")
	} else {
		guardDeniedIDs(t, err)
	}
	stored, err := (config.ProfileDocumentStore{}).LoadV4(path)
	if err != nil {
		t.Fatal(err)
	}
	if mode := stored.Document.Layouts[config.LayoutGeneral].Widgets[0].Content["mode"]; mode != "default" {
		t.Fatalf("disk content mode=%v, want default (denial must not persist)", mode)
	}
}

func TestStudioSaveInPlaceAllowsPremiumLayoutMove(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	writeStudioGuardProfile(t, path, guardWidget("delta-main", "delta"))
	svc := NewStudioProfileService(&studioProfileSpy{}, nil)
	loaded, err := svc.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	svc.SetWidgetPolicySource(stubWidgetPolicySource{policy: guardFreePolicy()})
	draft := loadStudioGuardDraft(loaded)
	widgets := draft.Layouts[config.LayoutGeneral].Widgets
	widgets[0].Layout.X = 900
	draft.Layouts[config.LayoutGeneral] = config.SessionLayoutV3{Type: config.LayoutGeneral, Widgets: widgets}
	if err := svc.SaveInPlace("req-move-1", loaded.Revision, draft); err != nil {
		t.Fatalf("layout move denied: %v", err)
	}
}

func TestStudioSaveWithoutSourceKeepsLegacyBehavior(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	writeStudioGuardProfile(t, path, guardWidget("delta-main", "delta"))
	svc := NewStudioProfileService(&studioProfileSpy{}, nil)
	loaded, err := svc.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	draft := loadStudioGuardDraft(loaded)
	widgets := draft.Layouts[config.LayoutGeneral].Widgets
	widgets[0].Content = map[string]any{"mode": "gap"}
	draft.Layouts[config.LayoutGeneral] = config.SessionLayoutV3{Type: config.LayoutGeneral, Widgets: widgets}
	if err := svc.Save("req-legacy-1", loaded.Revision, draft); err != nil {
		t.Fatalf("legacy save without source denied: %v", err)
	}
}

func legacyWidget(id, widgetType string) config.WidgetConfig {
	return config.WidgetConfig{
		ID: id, Type: widgetType, Enabled: true, UpdateHz: 15,
		Position: config.Rect{X: 1, Y: 2, W: 3, H: 4},
		Props:    map[string]any{"mode": "default"},
	}
}

func legacyDoc(widgets ...config.WidgetConfig) *config.ProfileConfig {
	return &config.ProfileConfig{
		SchemaVersion: config.ProfileSchemaVersionV2,
		ID:            "legacy-1",
		Name:          "Legacy",
		DisplayMode:   config.ModeRacing,
		Widgets:       widgets,
	}
}

func TestLegacyGuardAllowsPositionMoveOfPremium(t *testing.T) {
	saved := legacyDoc(legacyWidget("delta", "delta"))
	draft := legacyDoc(legacyWidget("delta", "delta"))
	draft.Widgets[0].Position.X = 900
	if err := checkLegacyProfileSave(guardFreePolicy(), saved, draft); err != nil {
		t.Fatalf("position move denied: %v", err)
	}
}

func TestLegacyGuardDeniesPropsChangeOfPremium(t *testing.T) {
	saved := legacyDoc(legacyWidget("delta", "delta"))
	draft := legacyDoc(legacyWidget("delta", "delta"))
	draft.Widgets[0].Props = map[string]any{"mode": "gap"}
	ids := guardDeniedIDs(t, checkLegacyProfileSave(guardFreePolicy(), saved, draft))
	if len(ids) != 1 || ids[0] != "delta" {
		t.Fatalf("denied ids = %v, want [delta]", ids)
	}
}

func TestLegacyGuardDeleteAllowedAddDenied(t *testing.T) {
	saved := legacyDoc(legacyWidget("delta", "delta"), legacyWidget("standings", "standings"))
	onlyFree := &config.ProfileConfig{
		SchemaVersion: config.ProfileSchemaVersionV2, ID: "legacy-1", Name: "Legacy",
		DisplayMode: config.ModeRacing, Widgets: []config.WidgetConfig{legacyWidget("standings", "standings")},
	}
	if err := checkLegacyProfileSave(guardFreePolicy(), saved, onlyFree); err != nil {
		t.Fatalf("delete denied: %v", err)
	}
	withPremium := legacyDoc(legacyWidget("standings", "standings"), legacyWidget("relative", "relative"))
	ids := guardDeniedIDs(t, checkLegacyProfileSave(guardFreePolicy(), legacyDoc(legacyWidget("standings", "standings")), withPremium))
	if len(ids) != 1 || ids[0] != "relative" {
		t.Fatalf("denied ids = %v, want [relative]", ids)
	}
}

func TestLegacyGuardSuiteAllowsPropsChange(t *testing.T) {
	saved := legacyDoc(legacyWidget("delta", "delta"))
	draft := legacyDoc(legacyWidget("delta", "delta"))
	draft.Widgets[0].Props = map[string]any{"mode": "gap"}
	if err := checkLegacyProfileSave(guardSuitePolicy(), saved, draft); err != nil {
		t.Fatalf("suite edit denied: %v", err)
	}
}

func TestLegacyGuardUnknownTypeAddDeniedIdenticalAllowed(t *testing.T) {
	ids := guardDeniedIDs(t, checkLegacyProfileSave(guardSuitePolicy(), legacyDoc(), legacyDoc(legacyWidget("mystery", "future-widget"))))
	if len(ids) != 1 || ids[0] != "mystery" {
		t.Fatalf("denied ids = %v, want [mystery]", ids)
	}
	preserved := legacyDoc(legacyWidget("mystery", "future-widget"))
	if err := checkLegacyProfileSave(guardFreePolicy(), preserved, legacyDoc(legacyWidget("mystery", "future-widget"))); err != nil {
		t.Fatalf("identical unknown denied: %v", err)
	}
}

func TestLegacyGuardVariantOfBlockedTypeDenied(t *testing.T) {
	saved := legacyDoc(legacyWidget("delta", "delta"))
	draft := legacyDoc(legacyWidget("delta", "delta"))
	draft.Variants = []config.WidgetVariantConfig{
		{ID: "v-delta-1", WidgetType: "delta", Name: "Fast", Columns: []config.ColumnConfig{{ID: "c1", MetricID: "gap", Enabled: true}}},
	}
	ids := guardDeniedIDs(t, checkLegacyProfileSave(guardFreePolicy(), saved, draft))
	if len(ids) != 1 || ids[0] != "v-delta-1" {
		t.Fatalf("denied ids = %v, want [v-delta-1]", ids)
	}
}

func TestLegacyGuardFreeVariantChangeAllowedAndRemovalAllowed(t *testing.T) {
	saved := legacyDoc(legacyWidget("standings", "standings"))
	saved.Variants = []config.WidgetVariantConfig{
		{ID: "v-stand-1", WidgetType: "standings", Name: "A"},
		{ID: "v-delta-1", WidgetType: "delta", Name: "Old"},
	}
	draft := legacyDoc(legacyWidget("standings", "standings"))
	draft.Variants = []config.WidgetVariantConfig{
		{ID: "v-stand-1", WidgetType: "standings", Name: "B"},
	}
	if err := checkLegacyProfileSave(guardFreePolicy(), saved, draft); err != nil {
		t.Fatalf("free variant change + blocked variant removal denied: %v", err)
	}
}

func TestLegacyGuardNilBaselineAdmitsImport(t *testing.T) {
	draft := legacyDoc(legacyWidget("delta", "delta"))
	if err := checkLegacyProfileSave(guardFreePolicy(), nil, draft); err != nil {
		t.Fatalf("import denied: %v", err)
	}
}

func writeLegacyGuardProfile(t *testing.T, path string, profile *config.ProfileConfig) {
	t.Helper()
	data, err := json.Marshal(profile)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}

func forgedLegacyProps() *config.ProfileConfig {
	draft := legacyDoc(legacyWidget("delta", "delta"), legacyWidget("standings", "standings"))
	draft.ID = "legacy-1"
	draft.Widgets[0].Props = map[string]any{"mode": "gap"}
	return draft
}

func movedLegacyPosition() *config.ProfileConfig {
	draft := legacyDoc(legacyWidget("delta", "delta"), legacyWidget("standings", "standings"))
	draft.ID = "legacy-1"
	draft.Widgets[0].Position.X = 900
	return draft
}

func TestHubSaveProfileDeniesForgedProps(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-1.json")
	writeLegacyGuardProfile(t, path, legacyDoc(legacyWidget("delta", "delta"), legacyWidget("standings", "standings")))
	profileSvc := NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := NewHubService(dir, profileSvc, nil, nil)
	hubSvc.SetWidgetPolicySource(stubWidgetPolicySource{policy: guardFreePolicy()})
	ids := guardDeniedIDs(t, hubSvc.SaveProfile(forgedLegacyProps()))
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

func TestHubSaveProfileAllowsPositionMove(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-1.json")
	writeLegacyGuardProfile(t, path, legacyDoc(legacyWidget("delta", "delta")))
	profileSvc := NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := NewHubService(dir, profileSvc, nil, nil)
	hubSvc.SetWidgetPolicySource(stubWidgetPolicySource{policy: guardFreePolicy()})
	if err := hubSvc.SaveProfile(movedLegacyPosition()); err != nil {
		t.Fatalf("position move denied: %v", err)
	}
}

func TestProfileServiceSaveProfileStateMoveAllowedContentDenied(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy-1.json")
	writeLegacyGuardProfile(t, path, legacyDoc(legacyWidget("delta", "delta"), legacyWidget("standings", "standings")))
	svc := NewProfileService(path, nil, nil)
	if err := svc.LoadActiveProfile(path); err != nil {
		t.Fatal(err)
	}
	svc.SetWidgetPolicySource(stubWidgetPolicySource{policy: guardFreePolicy()})
	moved := []config.WidgetConfig{legacyWidget("delta", "delta"), legacyWidget("standings", "standings")}
	moved[0].Position.X = 900
	if err := svc.SaveProfileState(moved, nil); err != nil {
		t.Fatalf("position move denied: %v", err)
	}
	forged := []config.WidgetConfig{legacyWidget("delta", "delta"), legacyWidget("standings", "standings")}
	forged[0].Props = map[string]any{"mode": "gap"}
	ids := guardDeniedIDs(t, svc.SaveProfileState(forged, nil))
	if len(ids) != 1 || ids[0] != "delta" {
		t.Fatalf("denied ids = %v, want [delta]", ids)
	}
}

func studioErrorPayload(t *testing.T, spy *studioProfileSpy) map[string]any {
	t.Helper()
	for i, name := range spy.events {
		if name == "studio:profile:error" {
			payload, ok := spy.data[i].(map[string]any)
			if !ok {
				t.Fatalf("error payload type = %T", spy.data[i])
			}
			return payload
		}
	}
	t.Fatal("no studio:profile:error emitted")
	return nil
}

// Regression for the #1105 contract: a native denial carries code
// widget-access-denied plus widgetIds so the frontend keys its existing
// localized notice off the code instead of matching message strings.
// requestId/operation/message stay untouched for diagnostics.
func TestStudioDenialEmitsTypedPayload(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	writeStudioGuardProfile(t, path, guardWidget("delta-main", "delta"))
	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	loaded, err := svc.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	svc.SetWidgetPolicySource(stubWidgetPolicySource{policy: guardFreePolicy()})
	draft := loadStudioGuardDraft(loaded)
	widgets := draft.Layouts[config.LayoutGeneral].Widgets
	widgets[0].Content = map[string]any{"mode": "gap"}
	draft.Layouts[config.LayoutGeneral] = config.SessionLayoutV3{Type: config.LayoutGeneral, Widgets: widgets}
	if err := svc.Save("req-denied-payload-1", loaded.Revision, draft); err == nil {
		t.Fatal("forged premium edit saved without denial")
	}
	payload := studioErrorPayload(t, spy)
	if payload["code"] != "widget-access-denied" {
		t.Fatalf("code = %v, want widget-access-denied", payload["code"])
	}
	ids, ok := payload["widgetIds"].([]string)
	if !ok || len(ids) != 1 || ids[0] != "delta-main" {
		t.Fatalf("widgetIds = %v (%T), want [delta-main]", payload["widgetIds"], payload["widgetIds"])
	}
	if payload["requestId"] != "req-denied-payload-1" || payload["operation"] != "save" {
		t.Fatalf("correlation lost: %v", payload)
	}
	message, ok := payload["message"].(string)
	if !ok || message == "" {
		t.Fatalf("message missing for diagnostics: %v", payload)
	}
}

func TestStudioGenericErrorCarriesNoDenialCode(t *testing.T) {
	spy := &studioProfileSpy{}
	svc := NewStudioProfileService(spy, nil)
	if err := svc.Save("req-unconfigured-1", "", guardDoc()); err == nil {
		t.Fatal("save without path must fail")
	}
	payload := studioErrorPayload(t, spy)
	if _, present := payload["code"]; present {
		t.Fatalf("generic error must not carry a denial code: %v", payload)
	}
	if _, present := payload["widgetIds"]; present {
		t.Fatalf("generic error must not carry widgetIds: %v", payload)
	}
}
