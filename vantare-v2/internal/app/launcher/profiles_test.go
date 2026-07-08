package launcher

import (
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

// fakeProfilesBackend is an in-memory ProfilesBackend for tests.
type fakeProfilesBackend struct {
	apps     map[string]app.LauncherAppEntry
	profiles []app.LaunchProfile
}

func (f *fakeProfilesBackend) GetLauncherProfiles() []app.LaunchProfile {
	return f.profiles
}

func (f *fakeProfilesBackend) SetLauncherProfiles(profiles []app.LaunchProfile) error {
	f.profiles = profiles
	return nil
}

func (f *fakeProfilesBackend) GetLauncherApps() map[string]app.LauncherAppEntry {
	return f.apps
}

func newProfilesBackend() *fakeProfilesBackend {
	return &fakeProfilesBackend{
		apps: map[string]app.LauncherAppEntry{
			"lmu":  {ID: "lmu", DisplayName: "Le Mans Ultimate"},
			"obs":  {ID: "obs", DisplayName: "OBS Studio"},
			"spot": {ID: "spot", DisplayName: "Spotify"},
		},
		profiles: []app.LaunchProfile{},
	}
}

func TestSaveProfileValidatesAppIDs(t *testing.T) {
	backend := newProfilesBackend()

	t.Run("valid AppID", func(t *testing.T) {
		err := SaveProfile(backend, app.LaunchProfile{
			ID: "p1", Name: "P1", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}},
		})
		if err != nil {
			t.Fatalf("expected ok, got %v", err)
		}
	})

	t.Run("unknown AppID", func(t *testing.T) {
		err := SaveProfile(backend, app.LaunchProfile{
			ID: "p2", Name: "P2", Steps: []app.LaunchStep{{AppID: "ghost", Delay: 0}},
		})
		if !errors.Is(err, ErrInvalidStep) {
			t.Fatalf("expected ErrInvalidStep, got %v", err)
		}
	})

	t.Run("negative delay", func(t *testing.T) {
		err := SaveProfile(backend, app.LaunchProfile{
			ID: "p3", Name: "P3", Steps: []app.LaunchStep{{AppID: "lmu", Delay: -1}},
		})
		if !errors.Is(err, ErrInvalidStep) {
			t.Fatalf("expected ErrInvalidStep, got %v", err)
		}
	})

	t.Run("empty step AppID", func(t *testing.T) {
		err := SaveProfile(backend, app.LaunchProfile{
			ID: "p4", Name: "P4", Steps: []app.LaunchStep{{AppID: "", Delay: 0}},
		})
		if !errors.Is(err, ErrInvalidStep) {
			t.Fatalf("expected ErrInvalidStep, got %v", err)
		}
	})

	t.Run("empty id", func(t *testing.T) {
		err := SaveProfile(backend, app.LaunchProfile{
			ID: "", Name: "NoID", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}},
		})
		if !errors.Is(err, ErrInvalidConfig) {
			t.Fatalf("expected ErrInvalidConfig, got %v", err)
		}
	})

	t.Run("empty name", func(t *testing.T) {
		err := SaveProfile(backend, app.LaunchProfile{
			ID: "p5", Name: "", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}},
		})
		if !errors.Is(err, ErrInvalidConfig) {
			t.Fatalf("expected ErrInvalidConfig, got %v", err)
		}
	})
}

func TestSaveProfileUpdatesExisting(t *testing.T) {
	backend := newProfilesBackend()
	base := app.LaunchProfile{ID: "p1", Name: "P1", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}}
	if err := SaveProfile(backend, base); err != nil {
		t.Fatalf("save: %v", err)
	}
	updated := app.LaunchProfile{ID: "p1", Name: "P1 renamed", Steps: []app.LaunchStep{
		{AppID: "lmu", Delay: 0}, {AppID: "obs", Delay: 2},
	}}
	if err := SaveProfile(backend, updated); err != nil {
		t.Fatalf("update: %v", err)
	}
	if len(backend.profiles) != 1 {
		t.Fatalf("expected 1 profile after update, got %d", len(backend.profiles))
	}
	if backend.profiles[0].Name != "P1 renamed" {
		t.Errorf("expected name updated, got %q", backend.profiles[0].Name)
	}
	if len(backend.profiles[0].Steps) != 2 {
		t.Errorf("expected 2 steps after update, got %d", len(backend.profiles[0].Steps))
	}
}

func TestDeleteProfile(t *testing.T) {
	backend := newProfilesBackend()
	backend.profiles = []app.LaunchProfile{
		{ID: "p1", Name: "P1"},
		{ID: "p2", Name: "P2"},
	}

	t.Run("delete existing", func(t *testing.T) {
		if err := DeleteProfile(backend, "p1"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(backend.profiles) != 1 || backend.profiles[0].ID != "p2" {
			t.Errorf("expected only p2 remaining, got %+v", backend.profiles)
		}
	})

	t.Run("delete nonexistent", func(t *testing.T) {
		err := DeleteProfile(backend, "ghost")
		if !errors.Is(err, ErrProfileNotFound) {
			t.Fatalf("expected ErrProfileNotFound, got %v", err)
		}
	})
}

func TestDuplicateProfile(t *testing.T) {
	t.Run("source not found returns ErrProfileNotFound", func(t *testing.T) {
		backend := newProfilesBackend()
		err := DuplicateProfile(backend, "missing", "missing-copy", "Missing Copy")
		if !errors.Is(err, ErrProfileNotFound) {
			t.Fatalf("expected ErrProfileNotFound, got %v", err)
		}
		if len(backend.profiles) != 0 {
			t.Errorf("no profile should be created when source is missing; got %d", len(backend.profiles))
		}
	})

	t.Run("new id collides returns ErrProfileDuplicate", func(t *testing.T) {
		backend := newProfilesBackend()
		backend.profiles = []app.LaunchProfile{
			{ID: "creator", Name: "Creador"},
			{ID: "creator-copy", Name: "Creador Copy"},
		}
		err := DuplicateProfile(backend, "creator", "creator-copy", "Otra copia")
		if !errors.Is(err, ErrProfileDuplicate) {
			t.Fatalf("expected ErrProfileDuplicate, got %v", err)
		}
		if len(backend.profiles) != 2 {
			t.Errorf("profile list must not change on collision; got %d", len(backend.profiles))
		}
	})

	t.Run("duplicates steps into a new independent slice", func(t *testing.T) {
		backend := newProfilesBackend()
		backend.profiles = []app.LaunchProfile{
			{
				ID: "creator", Name: "Creador de Contenido", Description: "LMU + OBS",
				Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}, {AppID: "obs", Delay: 2}},
			},
		}
		if err := DuplicateProfile(backend, "creator", "creator-copy", "Creador de Contenido (copia)"); err != nil {
			t.Fatalf("DuplicateProfile: %v", err)
		}
		if len(backend.profiles) != 2 {
			t.Fatalf("expected 2 profiles after duplicate, got %d", len(backend.profiles))
		}
		dup := backend.profiles[1]
		if dup.ID != "creator-copy" {
			t.Errorf("expected new id creator-copy, got %q", dup.ID)
		}
		if dup.Name != "Creador de Contenido (copia)" {
			t.Errorf("expected new name, got %q", dup.Name)
		}
		if dup.Description != "LMU + OBS" {
			t.Errorf("description must be copied, got %q", dup.Description)
		}
		if len(dup.Steps) != 2 || dup.Steps[0].AppID != "lmu" || dup.Steps[1].Delay != 2 {
			t.Errorf("steps not copied correctly: %+v", dup.Steps)
		}
		// Mutating the duplicate must NOT mutate the source (independent copy).
		dup.Steps[0].Delay = 99
		if backend.profiles[0].Steps[0].Delay != 0 {
			t.Errorf("duplicate shares underlying steps slice with source")
		}
	})

	t.Run("empty new id rejected as invalid", func(t *testing.T) {
		backend := newProfilesBackend()
		backend.profiles = []app.LaunchProfile{{ID: "p1", Name: "P1"}}
		err := DuplicateProfile(backend, "p1", "", "Sin id")
		if !errors.Is(err, ErrInvalidConfig) {
			t.Fatalf("expected ErrInvalidConfig for empty newID, got %v", err)
		}
	})
}
