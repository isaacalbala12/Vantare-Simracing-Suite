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
	backend := newProfilesBackend()
	src := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido", Description: "streaming setup",
		Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}, {AppID: "obs", Delay: 2}},
	}
	if err := SaveProfile(backend, src); err != nil {
		t.Fatalf("seed: %v", err)
	}

	t.Run("duplicate ok", func(t *testing.T) {
		err := DuplicateProfile(backend, "creator", "creator-copy", "Creador (copia)")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(backend.profiles) != 2 {
			t.Fatalf("expected 2 profiles, got %d", len(backend.profiles))
		}
		var dup *app.LaunchProfile
		for i := range backend.profiles {
			if backend.profiles[i].ID == "creator-copy" {
				dup = &backend.profiles[i]
			}
		}
		if dup == nil {
			t.Fatal("duplicate not found")
		}
		if dup.Name != "Creador (copia)" {
			t.Errorf("unexpected name %q", dup.Name)
		}
		if len(dup.Steps) != 2 || dup.Steps[0].AppID != "lmu" {
			t.Errorf("steps not copied correctly: %+v", dup.Steps)
		}
		// Original must be untouched.
		if backend.profiles[0].ID != "creator" || backend.profiles[0].Name != "Creador de Contenido" {
			t.Errorf("source profile mutated: %+v", backend.profiles[0])
		}
	})

	t.Run("source not found", func(t *testing.T) {
		err := DuplicateProfile(backend, "ghost", "x", "X")
		if !errors.Is(err, ErrProfileNotFound) {
			t.Fatalf("expected ErrProfileNotFound, got %v", err)
		}
	})

	t.Run("duplicate id collision", func(t *testing.T) {
		err := DuplicateProfile(backend, "creator", "creator", "Otra vez")
		if !errors.Is(err, ErrProfileDuplicate) {
			t.Fatalf("expected ErrProfileDuplicate, got %v", err)
		}
	})
}
