package app_test

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

func TestHubServiceCreateAndList(t *testing.T) {
	dir := t.TempDir()

	// Create a profile first via real service
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), mgr, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.CreateProfile("Test Layout"); err != nil {
		t.Fatal(err)
	}

	profiles, err := hubSvc.ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(profiles))
	}
	if profiles[0].File != "custom-test-layout.json" {
		t.Fatalf("file=%q", profiles[0].File)
	}
	if profiles[0].Name != "Test Layout" {
		t.Fatalf("name=%q, want 'Test Layout'", profiles[0].Name)
	}
	if profiles[0].Widgets != 3 {
		t.Fatalf("expected 3 widgets, got %d", profiles[0].Widgets)
	}
	if profiles[0].PreviewDocument == nil {
		t.Fatal("expected previewDocument in list entry")
	}
	if profiles[0].PreviewDocument.SchemaVersion != config.ProfileSchemaVersionV3 {
		t.Fatalf("preview schema=%d want %d", profiles[0].PreviewDocument.SchemaVersion, config.ProfileSchemaVersionV3)
	}
}

func TestHubServiceActivateProfile(t *testing.T) {
	dir := t.TempDir()

	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), mgr, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.CreateProfile("Racing"); err != nil {
		t.Fatal(err)
	}

	if err := hubSvc.ActivateProfile("custom-racing"); err != nil {
		t.Fatal(err)
	}

	p := profileSvc.GetProfile()
	if p == nil || p.ID != "custom-racing" {
		t.Fatalf("profile not activated: got %v", p)
	}
	// ActivateProfile now only loads the profile; it does not mutate the window or force racing mode.
	if fw.fullscreen {
		t.Fatal("activated profile should not leave overlay fullscreen")
	}
	if fw.ignoreMouse {
		t.Fatal("activated profile should not apply window settings")
	}
}

func TestHubServiceStartOverlayForcesRacingMode(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example-edit.json")
	err := config.SaveFile(path, &config.ProfileConfig{
		ID:          "custom-edit",
		Name:        "Edit Layout",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	runtime := &fakeOverlayRuntime{}
	hubSvc := app.NewHubService(dir, profileSvc, nil, runtime)
	attachStudioProfileSvc(t, hubSvc, profileSvc)

	status, err := hubSvc.StartOverlay("custom-edit")
	if err != nil {
		t.Fatal(err)
	}
	if !status.Running {
		t.Fatal("overlay should be running")
	}
	if status.Mode != config.ModeRacing {
		t.Fatalf("runtime mode=%q, want racing", status.Mode)
	}
	if profileSvc.GetProfile().DisplayMode != config.ModeEdit {
		t.Fatalf("saved profile mode should remain edit, got %q", profileSvc.GetProfile().DisplayMode)
	}
}

func TestHubServiceDeleteProfile(t *testing.T) {
	dir := t.TempDir()

	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), mgr, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.CreateProfile("To Delete"); err != nil {
		t.Fatal(err)
	}

	if err := hubSvc.DeleteProfile("custom-to-delete"); err != nil {
		t.Fatal(err)
	}

	profiles, _ := hubSvc.ListProfiles()
	if len(profiles) != 0 {
		t.Fatalf("expected 0 profiles after delete, got %d", len(profiles))
	}

	// Delete non-existent should error
	if err := hubSvc.DeleteProfile("nonexistent"); err == nil {
		t.Fatal("expected error deleting nonexistent profile")
	}
}

func TestHubServiceListNoProfilesDir(t *testing.T) {
	dir := t.TempDir()

	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), mgr, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	profiles, err := hubSvc.ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected 0 profiles, got %d", len(profiles))
	}
}

func TestHubServiceActivateByIDWhenFilenameDiffers(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example-racing.json")
	profile := &config.ProfileConfig{
		ID:          "default-racing",
		Name:        "Default Racing",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	}
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatal(err)
	}

	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	profileSvc := app.NewProfileService(filepath.Join(dir, "other.json"), mgr, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.ActivateProfile("default-racing"); err != nil {
		t.Fatal(err)
	}
	if profileSvc.GetProfile().ID != "default-racing" {
		t.Fatalf("profile id=%q", profileSvc.GetProfile().ID)
	}
}

func TestHubServiceListProfilesIncludesProfileConfig(t *testing.T) {
	dir := t.TempDir()
	profile := &config.ProfileConfig{
		ID:           "preview-profile",
		Name:         "Preview Profile",
		DisplayMode:  config.ModeRacing,
		MonitorIndex: 0,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, UpdateHz: 30, Position: config.Rect{X: 760, Y: 40, W: 400, H: 48}},
		},
	}
	if err := config.SaveFile(filepath.Join(dir, "preview-profile.json"), profile); err != nil {
		t.Fatalf("save profile: %v", err)
	}

	service := app.NewHubService(dir, nil, nil, nil)
	got, err := service.ListProfiles()
	if err != nil {
		t.Fatalf("ListProfiles() error = %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("profiles len=%d, want 1", len(got))
	}
	if got[0].Profile == nil {
		t.Fatal("Profile is nil, want full profile config for previews")
	}
	if got[0].Profile.ID != "preview-profile" {
		t.Fatalf("Profile.ID=%q, want preview-profile", got[0].Profile.ID)
	}
	if len(got[0].Profile.Widgets) != 1 {
		t.Fatalf("Profile.Widgets len=%d, want 1", len(got[0].Profile.Widgets))
	}
}

func TestHubServiceListProfilesSkipsNonProfileJSONFiles(t *testing.T) {
	dir := t.TempDir()
	profile := &config.ProfileConfig{
		ID:           "preview-profile",
		Name:         "Preview Profile",
		DisplayMode:  config.ModeRacing,
		MonitorIndex: 0,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}},
		},
	}
	if err := config.SaveFile(filepath.Join(dir, "preview-profile.json"), profile); err != nil {
		t.Fatalf("save profile: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "app-settings.json"), []byte(`{"deltaMode":"self","cpuSampling":true}`), 0644); err != nil {
		t.Fatalf("write settings: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "updater-settings.json"), []byte(`{"channel":"stable"}`), 0644); err != nil {
		t.Fatalf("write updater settings: %v", err)
	}

	service := app.NewHubService(dir, nil, nil, nil)
	got, err := service.ListProfiles()
	if err != nil {
		t.Fatalf("ListProfiles() error = %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("profiles len=%d, want 1", len(got))
	}
	if got[0].ID != "preview-profile" {
		t.Fatalf("profile id=%q, want preview-profile", got[0].ID)
	}
}

func TestHubServiceCreateDuplicate(t *testing.T) {
	dir := t.TempDir()
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), mgr, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.CreateProfile("Racing"); err != nil {
		t.Fatal(err)
	}
	if err := hubSvc.CreateProfile("Racing"); err == nil {
		t.Fatal("expected duplicate create error")
	}
}

func TestHubServiceSaveProfileAsOwnCopy(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	p := &config.ProfileConfig{
		ID:          "custom-recommended-copy",
		Name:        "Recommended Copy",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}},
		},
	}

	if err := hubSvc.SaveProfileAsOwnCopy(p); err != nil {
		t.Fatal(err)
	}
	loaded, err := config.LoadFile(filepath.Join(dir, "custom-recommended-copy.json"))
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Name != "Recommended Copy" {
		t.Fatalf("name=%q", loaded.Name)
	}
}

func TestHubServiceSaveProfileAsOwnCopyDoesNotMutateInputProfile(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	p := &config.ProfileConfig{
		ID:          "recommended-copy",
		Name:        "Recommended Copy",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 300, H: 250}},
		},
	}

	if err := hubSvc.SaveProfileAsOwnCopy(p); err != nil {
		t.Fatal(err)
	}

	if p.ID != "recommended-copy" {
		t.Fatalf("input profile ID mutated: got %q", p.ID)
	}
	if p.SchemaVersion != 0 {
		t.Fatalf("input schema version mutated: got %d", p.SchemaVersion)
	}
	if p.Widgets[0].VariantID != "" {
		t.Fatalf("input widget variant ID mutated: got %q", p.Widgets[0].VariantID)
	}

	loaded, err := config.LoadFile(filepath.Join(dir, "custom-recommended-copy.json"))
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ID != "custom-recommended-copy" {
		t.Fatalf("saved profile ID=%q, want custom-recommended-copy", loaded.ID)
	}
	if loaded.SchemaVersion != config.ProfileSchemaVersionV2 {
		t.Fatalf("saved SchemaVersion=%d, want %d", loaded.SchemaVersion, config.ProfileSchemaVersionV2)
	}
}

func TestHubServiceSaveProfileAsOwnCopyGeneratesUniqueIDOnCollision(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	makeProfile := func() *config.ProfileConfig {
		return &config.ProfileConfig{
			ID:          "custom-racing",
			Name:        "Racing Copy",
			DisplayMode: config.ModeRacing,
			Widgets: []config.WidgetConfig{
				{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}},
			},
		}
	}

	for i := 0; i < 3; i++ {
		if err := hubSvc.SaveProfileAsOwnCopy(makeProfile()); err != nil {
			t.Fatal(err)
		}
	}

	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var profiles []string
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".json") && f.Name() != "dummy.json" {
			profiles = append(profiles, f.Name())
		}
	}
	sort.Strings(profiles)
	want := []string{"custom-racing-1.json", "custom-racing-2.json", "custom-racing.json"}
	if !reflect.DeepEqual(profiles, want) {
		t.Fatalf("files=%v, want %v", profiles, want)
	}
}

func TestHubServiceSaveProfileAsOwnCopyConvertsLegacyToSchemaV2(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	p := &config.ProfileConfig{
		ID:          "legacy-copy",
		Name:        "Legacy Copy",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 300, H: 250}},
		},
	}

	if err := hubSvc.SaveProfileAsOwnCopy(p); err != nil {
		t.Fatal(err)
	}

	loaded, err := config.LoadFile(filepath.Join(dir, "custom-legacy-copy.json"))
	if err != nil {
		t.Fatal(err)
	}
	if loaded.SchemaVersion != config.ProfileSchemaVersionV2 {
		t.Fatalf("SchemaVersion=%d, want %d", loaded.SchemaVersion, config.ProfileSchemaVersionV2)
	}
	if _, ok := loaded.Layouts[config.LayoutGeneral]; !ok {
		t.Fatal("general layout missing")
	}
	if len(loaded.Variants) != 1 {
		t.Fatalf("variants=%d, want 1", len(loaded.Variants))
	}
	if loaded.Variants[0].WidgetType != "relative" {
		t.Fatalf("variant widgetType=%q, want relative", loaded.Variants[0].WidgetType)
	}
}

func TestHubServiceSaveProfileAsOwnCopyPreservesExistingV2VariantsAndLayouts(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	p := &config.ProfileConfig{
		SchemaVersion: config.ProfileSchemaVersionV2,
		ID:            "v2-copy",
		Name:          "V2 Copy",
		DisplayMode:   config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", VariantID: "variant-relative-custom", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 300, H: 250}},
		},
		Layouts: map[config.LayoutType]config.ProfileLayout{
			config.LayoutGeneral: {
				Type:    config.LayoutGeneral,
				Widgets: []config.WidgetConfig{{ID: "relative", Type: "relative", VariantID: "variant-relative-custom", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 300, H: 250}}},
			},
			config.LayoutRace: {
				Type:    config.LayoutRace,
				Widgets: []config.WidgetConfig{{ID: "relative", Type: "relative", VariantID: "variant-relative-custom", Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 300, H: 250}}},
			},
		},
		Variants: []config.WidgetVariantConfig{
			{
				ID:         "variant-relative-custom",
				WidgetType: "relative",
				TemplateID: "relative-custom",
				Columns: []config.ColumnConfig{
					{ID: "bestLap", MetricID: "bestLap", Enabled: true},
				},
			},
		},
		Source: &config.ProfileSourceMeta{
			Kind:      "recommended",
			ProfileID: "vantare-racing-basic",
			Name:      "Racing Básico",
		},
	}

	if err := hubSvc.SaveProfileAsOwnCopy(p); err != nil {
		t.Fatal(err)
	}

	loaded, err := config.LoadFile(filepath.Join(dir, "custom-v2-copy.json"))
	if err != nil {
		t.Fatal(err)
	}
	if loaded.SchemaVersion != config.ProfileSchemaVersionV2 {
		t.Fatalf("SchemaVersion=%d, want %d", loaded.SchemaVersion, config.ProfileSchemaVersionV2)
	}
	race, ok := loaded.Layouts[config.LayoutRace]
	if !ok {
		t.Fatal("race layout was dropped")
	}
	if race.Widgets[0].Position.X != 100 {
		t.Fatalf("race layout X=%d, want 100", race.Widgets[0].Position.X)
	}
	if len(loaded.Variants) != 1 || loaded.Variants[0].TemplateID != "relative-custom" {
		t.Fatalf("variant lost: %+v", loaded.Variants)
	}
	if loaded.Variants[0].Columns[0].ID != "bestLap" || !loaded.Variants[0].Columns[0].Enabled {
		t.Fatalf("variant column lost: %+v", loaded.Variants[0].Columns)
	}
	if loaded.Source == nil || loaded.Source.ProfileID != "vantare-racing-basic" {
		t.Fatalf("source lost: %+v", loaded.Source)
	}
}

func TestHubServiceSaveProfileAsOwnCopyRejectsInvalidInput(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.SaveProfileAsOwnCopy(nil); err == nil {
		t.Fatal("expected error for nil profile")
	}
	if err := hubSvc.SaveProfileAsOwnCopy(&config.ProfileConfig{ID: "", Name: "No ID"}); err == nil {
		t.Fatal("expected error for empty id")
	}
	if err := hubSvc.SaveProfileAsOwnCopy(&config.ProfileConfig{ID: "../traversal", Name: "Bad ID"}); err == nil {
		t.Fatal("expected error for invalid id")
	}
}

func TestHubServiceSaveProfileAsOwnCopyRejectsDegenerateCustomID(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.SaveProfileAsOwnCopy(&config.ProfileConfig{
		ID:          "custom-",
		Name:        "Degenerate",
		DisplayMode: config.ModeRacing,
		Widgets:     []config.WidgetConfig{{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}}},
	}); err == nil {
		t.Fatal("expected error for degenerate custom- id")
	}
}

func TestHubServiceSaveProfileAsOwnCopyReturnsErrorWhenStatFails(t *testing.T) {
	dir := t.TempDir()
	// Use a regular file as profilesDir so os.Stat on any subpath fails with
	// a non-ErrNotExist error (e.g., "not a directory"), ensuring the function
	// returns instead of looping forever.
	profilesFile := filepath.Join(dir, "notadir")
	if err := os.WriteFile(profilesFile, []byte{}, 0644); err != nil {
		t.Fatal(err)
	}

	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(profilesFile, profileSvc, nil, nil)

	done := make(chan struct{})
	go func() {
		defer close(done)
		err := hubSvc.SaveProfileAsOwnCopy(&config.ProfileConfig{
			ID:          "custom-test",
			Name:        "Test",
			DisplayMode: config.ModeRacing,
			Widgets:     []config.WidgetConfig{{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}}},
		})
		if err == nil {
			t.Error("expected error when stat fails")
		}
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("SaveProfileAsOwnCopy hung on stat error")
	}
}

func TestHubServiceSaveProfileAsOwnCopyRequiresProfilesDir(t *testing.T) {
	hubSvc := app.NewHubService("", nil, nil, nil)

	if err := hubSvc.SaveProfileAsOwnCopy(&config.ProfileConfig{
		ID:          "custom-test",
		Name:        "Test",
		DisplayMode: config.ModeRacing,
		Widgets:     []config.WidgetConfig{{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}}},
	}); err == nil {
		t.Fatal("expected error when profiles directory is not configured")
	}
}

func TestHubServiceCreateProfileWritesSchemaV2(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.CreateProfile("Schema Two"); err != nil {
		t.Fatal(err)
	}

	loaded, err := config.LoadFile(filepath.Join(dir, "custom-schema-two.json"))
	if err != nil {
		t.Fatal(err)
	}
	if loaded.SchemaVersion != config.ProfileSchemaVersionV2 {
		t.Fatalf("SchemaVersion=%d, want %d", loaded.SchemaVersion, config.ProfileSchemaVersionV2)
	}
	general, ok := loaded.Layouts[config.LayoutGeneral]
	if !ok {
		t.Fatal("general layout missing")
	}
	if len(general.Widgets) != len(loaded.Widgets) {
		t.Fatalf("general widgets=%d, compat widgets=%d", len(general.Widgets), len(loaded.Widgets))
	}
	if len(loaded.Variants) != len(loaded.Widgets) {
		t.Fatalf("variants=%d, widgets=%d", len(loaded.Variants), len(loaded.Widgets))
	}
	if loaded.Widgets[0].Position.W == 0 {
		t.Fatal("created widget lost layout position")
	}
}

func TestHubServiceRejectPathTraversal(t *testing.T) {
	dir := t.TempDir()
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), mgr, nil)
	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)

	if err := hubSvc.DeleteProfile("../outside"); err == nil {
		t.Fatal("expected error for path traversal")
	}
	if err := hubSvc.ActivateProfile("..\\evil"); err == nil {
		t.Fatal("expected error for path traversal")
	}
}

func TestProfileServiceLoadActiveProfileUpdatesSavePath(t *testing.T) {
	dir := t.TempDir()
	pathA := filepath.Join(dir, "a.json")
	pathB := filepath.Join(dir, "b.json")
	config.SaveFile(pathA, &config.ProfileConfig{DisplayMode: config.ModeRacing, Widgets: []config.WidgetConfig{
		{ID: "w1", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}},
	}})
	config.SaveFile(pathB, &config.ProfileConfig{DisplayMode: config.ModeRacing, Widgets: []config.WidgetConfig{
		{ID: "w2", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 30, H: 40}},
	}})

	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	svc := app.NewProfileService(pathA, mgr, nil)
	svc.Load()

	if err := svc.LoadActiveProfile(pathB); err != nil {
		t.Fatal(err)
	}
	newWidgets := []config.WidgetConfig{
		{ID: "w2", Enabled: true, Position: config.Rect{X: 99, Y: 88, W: 30, H: 40}},
	}
	if err := svc.SaveLayout(newWidgets); err != nil {
		t.Fatal(err)
	}

	reloaded, err := config.LoadFile(pathB)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Widgets[0].Position.X != 99 {
		t.Fatalf("saved to wrong file: X=%d", reloaded.Widgets[0].Position.X)
	}
}

type fakeOverlayRuntime struct {
	started int
	stopped int
	lastID  string
	err     error
}

func (f *fakeOverlayRuntime) Start(document *config.ProfileDocumentV3) (app.OverlayStatus, error) {
	f.started++
	if document != nil {
		f.lastID = document.ID
	}
	if f.err != nil {
		return app.OverlayStatus{Running: false, ProfileID: f.lastID, Mode: config.ModeRacing}, f.err
	}
	return app.OverlayStatus{Running: true, ProfileID: f.lastID, Mode: config.ModeRacing}, nil
}

func (f *fakeOverlayRuntime) Stop() app.OverlayStatus {
	f.stopped++
	return app.OverlayStatus{Running: false, ProfileID: f.lastID, Mode: config.ModeRacing}
}

func (f *fakeOverlayRuntime) Status() app.OverlayStatus {
	return app.OverlayStatus{Running: f.started > f.stopped, ProfileID: f.lastID, Mode: config.ModeRacing}
}

func attachStudioProfileSvc(t *testing.T, hubSvc *app.HubService, profileSvc *app.ProfileService) {
	t.Helper()
	studioSvc := app.NewStudioProfileService(nil, nil)
	if path := profileSvc.Path(); path != "" {
		if _, err := os.Stat(path); err == nil {
			if _, err := studioSvc.Load(path); err != nil {
				t.Fatal(err)
			}
		}
	}
	hubSvc.SetStudioProfileService(studioSvc)
}

func TestHubServiceStartActiveOverlay(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example-racing.json")
	err := config.SaveFile(path, &config.ProfileConfig{
		ID:          "default-racing",
		Name:        "Default Racing",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	profileSvc := app.NewProfileService(path, nil, nil)
	if err := profileSvc.Load(); err != nil {
		t.Fatal(err)
	}
	runtime := &fakeOverlayRuntime{}
	hubSvc := app.NewHubService(dir, profileSvc, nil, runtime)
	attachStudioProfileSvc(t, hubSvc, profileSvc)

	status, err := hubSvc.StartActiveOverlay()
	if err != nil {
		t.Fatal(err)
	}
	if !status.Running {
		t.Fatal("overlay should be running")
	}
	if runtime.started != 1 {
		t.Fatalf("expected runtime started once, got %d", runtime.started)
	}
}

func TestHubServiceStartActiveOverlayRequiresProfile(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "missing.json"), nil, nil)
	runtime := &fakeOverlayRuntime{}
	hubSvc := app.NewHubService(dir, profileSvc, nil, runtime)

	_, err := hubSvc.StartActiveOverlay()
	if err == nil {
		t.Fatal("expected error when no active profile is loaded")
	}
}

func TestHubServiceStartOverlayLoadsProfileAndStartsRuntime(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example-racing.json")
	err := config.SaveFile(path, &config.ProfileConfig{
		ID:          "default-racing",
		Name:        "Default Racing",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	runtime := &fakeOverlayRuntime{}
	hubSvc := app.NewHubService(dir, profileSvc, nil, runtime)
	attachStudioProfileSvc(t, hubSvc, profileSvc)

	status, err := hubSvc.StartOverlay("default-racing")
	if err != nil {
		t.Fatal(err)
	}
	if !status.Running {
		t.Fatal("overlay should be running")
	}
	if runtime.started != 1 {
		t.Fatalf("started=%d, want 1", runtime.started)
	}
	if runtime.lastID != "default-racing" {
		t.Fatalf("lastID=%q", runtime.lastID)
	}
}

func TestHubServiceStopOverlayStopsRuntime(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	runtime := &fakeOverlayRuntime{}
	hubSvc := app.NewHubService(dir, profileSvc, nil, runtime)

	status := hubSvc.StopOverlay()
	if status.Running {
		t.Fatal("overlay should not be running")
	}
	if runtime.stopped != 1 {
		t.Fatalf("stopped=%d, want 1", runtime.stopped)
	}
}

func TestHubServiceStartOverlayEmitsStoppedStatusWhenRuntimeFails(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example-racing.json")
	err := config.SaveFile(path, &config.ProfileConfig{
		ID:          "default-racing",
		Name:        "Default Racing",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	runtime := &fakeOverlayRuntime{err: errors.New("create window failed")}
	spy := &spyEmitter{}
	hubSvc := app.NewHubService(dir, profileSvc, spy, runtime)
	attachStudioProfileSvc(t, hubSvc, profileSvc)

	status, err := hubSvc.StartOverlay("default-racing")
	if err == nil {
		t.Fatal("expected runtime error")
	}
	if status.Running {
		t.Fatal("status should report stopped after failed start")
	}
	if len(spy.events) != 1 || spy.events[0] != "overlay:status" {
		t.Fatalf("events=%v, want [overlay:status]", spy.events)
	}
	emitted, ok := spy.data[0].(app.OverlayStatus)
	if !ok {
		t.Fatalf("emitted status type=%T", spy.data[0])
	}
	if emitted.Running {
		t.Fatal("emitted status should report stopped")
	}
}

func TestHubServiceStartOverlayEmitsStatusWhenActivateProfileFails(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	runtime := &fakeOverlayRuntime{}
	spy := &spyEmitter{}
	hubSvc := app.NewHubService(dir, profileSvc, spy, runtime)

	status, err := hubSvc.StartOverlay("missing-profile")
	if err == nil {
		t.Fatal("expected activate error")
	}
	if status.Running {
		t.Fatal("status should report stopped when activation fails")
	}
	if len(spy.events) != 1 || spy.events[0] != "overlay:status" {
		t.Fatalf("events=%v, want [overlay:status]", spy.events)
	}
	emitted, ok := spy.data[0].(app.OverlayStatus)
	if !ok {
		t.Fatalf("emitted status type=%T", spy.data[0])
	}
	if emitted.Running {
		t.Fatal("emitted status should report stopped")
	}
}

func TestHubServiceSetWidgetEnabled(t *testing.T) {
	dir := t.TempDir()
	ps := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	h := app.NewHubService(dir, ps, nil, nil)
	require.NoError(t, h.CreateProfile("test"))
	require.NoError(t, h.ActivateProfile("custom-test"))

	require.NoError(t, h.SetWidgetEnabled("delta", false))
	p := ps.GetProfile()
	require.NotNil(t, p)
	require.False(t, p.Widgets[0].Enabled)
}

func TestHubServiceSetActiveProfilePersistsAndLoads(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "app-settings.json")

	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	settingsSvc := app.NewSettingsService(settingsPath, nil, nil)
	require.NoError(t, settingsSvc.Load())

	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)
	hubSvc.SetSettingsService(settingsSvc)

	require.NoError(t, hubSvc.CreateProfile("Alpha"))

	require.NoError(t, hubSvc.SetActiveProfile("custom-alpha"))

	p := profileSvc.GetProfile()
	require.NotNil(t, p)
	require.Equal(t, "custom-alpha", p.ID)
	require.Equal(t, "custom-alpha", settingsSvc.Settings().ActiveOverlayProfileID)

	// Reload settings from disk to verify persistence.
	settingsSvc2 := app.NewSettingsService(settingsPath, nil, nil)
	require.NoError(t, settingsSvc2.Load())
	require.Equal(t, "custom-alpha", settingsSvc2.Settings().ActiveOverlayProfileID)
}

func TestHubServiceSetActiveProfileWithFilePersistsCanonicalID(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "app-settings.json")

	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	settingsSvc := app.NewSettingsService(settingsPath, nil, nil)
	require.NoError(t, settingsSvc.Load())

	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)
	hubSvc.SetSettingsService(settingsSvc)

	require.NoError(t, hubSvc.CreateProfile("Alpha"))

	require.NoError(t, hubSvc.SetActiveProfile("custom-alpha.json"))

	require.Equal(t, "custom-alpha", profileSvc.GetProfile().ID)
	require.Equal(t, "custom-alpha", settingsSvc.Settings().ActiveOverlayProfileID)
}

func TestHubServiceSetActiveProfileInvalidIDErrors(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	settingsSvc := app.NewSettingsService(filepath.Join(dir, "app-settings.json"), nil, nil)
	require.NoError(t, settingsSvc.Load())

	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)
	hubSvc.SetSettingsService(settingsSvc)

	require.Error(t, hubSvc.SetActiveProfile(""))
	require.Error(t, hubSvc.SetActiveProfile("nonexistent-profile"))
	require.Empty(t, settingsSvc.Settings().ActiveOverlayProfileID)
}

func TestHubServiceSetActiveProfileStopsRunningOverlay(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	settingsSvc := app.NewSettingsService(filepath.Join(dir, "app-settings.json"), nil, nil)
	require.NoError(t, settingsSvc.Load())

	runtime := &fakeOverlayRuntime{}
	hubSvc := app.NewHubService(dir, profileSvc, nil, runtime)
	hubSvc.SetSettingsService(settingsSvc)

	require.NoError(t, hubSvc.CreateProfile("A"))
	require.NoError(t, hubSvc.CreateProfile("B"))

	studioSvc := app.NewStudioProfileService(nil, nil)
	studioSvc.SetProfilesDir(dir)
	hubSvc.SetStudioProfileService(studioSvc)

	// Start overlay on profile A.
	_, err := hubSvc.StartOverlay("custom-a")
	require.NoError(t, err)
	require.Equal(t, 1, runtime.started)

	// Activate B: does not auto-stop overlay (user must stop manually).
	require.NoError(t, hubSvc.SetActiveProfile("custom-b"))
	require.Equal(t, "custom-b", profileSvc.GetProfile().ID)
}

func TestHubServiceStartActiveOverlayUsesActiveProfile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "example-racing.json")
	err := config.SaveFile(path, &config.ProfileConfig{
		ID:          "default-racing",
		Name:        "Default Racing",
		DisplayMode: config.ModeRacing,
		Widgets:     []config.WidgetConfig{{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}}},
	})
	require.NoError(t, err)

	profileSvc := app.NewProfileService(path, nil, nil)
	require.NoError(t, profileSvc.Load())

	settingsSvc := app.NewSettingsService(filepath.Join(dir, "app-settings.json"), nil, nil)
	require.NoError(t, settingsSvc.Load())

	runtime := &fakeOverlayRuntime{}
	hubSvc := app.NewHubService(dir, profileSvc, nil, runtime)
	hubSvc.SetSettingsService(settingsSvc)
	attachStudioProfileSvc(t, hubSvc, profileSvc)

	// Set active profile and then start overlay.
	settingsSvc.Settings().ActiveOverlayProfileID = "default-racing"
	_ = settingsSvc.Save(settingsSvc.Settings())

	status, err := hubSvc.StartActiveOverlay()
	require.NoError(t, err)
	require.True(t, status.Running)
	require.Equal(t, 1, runtime.started)
}

func TestHubServiceDeleteActiveProfileClearsSettings(t *testing.T) {
	dir := t.TempDir()
	profileSvc := app.NewProfileService(filepath.Join(dir, "dummy.json"), nil, nil)
	settingsSvc := app.NewSettingsService(filepath.Join(dir, "app-settings.json"), nil, nil)
	require.NoError(t, settingsSvc.Load())

	hubSvc := app.NewHubService(dir, profileSvc, nil, nil)
	hubSvc.SetSettingsService(settingsSvc)

	require.NoError(t, hubSvc.CreateProfile("To Delete"))

	require.NoError(t, hubSvc.SetActiveProfile("custom-to-delete"))
	require.Equal(t, "custom-to-delete", settingsSvc.Settings().ActiveOverlayProfileID)

	require.NoError(t, hubSvc.DeleteProfile("custom-to-delete"))
	require.Empty(t, settingsSvc.Settings().ActiveOverlayProfileID)
}
