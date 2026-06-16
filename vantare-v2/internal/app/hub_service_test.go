package app_test

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/stretchr/testify/require"
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

func (f *fakeOverlayRuntime) Start(profile *config.ProfileConfig) (app.OverlayStatus, error) {
	f.started++
	if profile != nil {
		f.lastID = profile.ID
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
