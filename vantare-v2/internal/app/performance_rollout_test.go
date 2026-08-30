package app

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestPerformanceDefaultIsAutomaticSingleAuthority(t *testing.T) {
	want := performanceDefault()
	got := DefaultAppSettings().Performance
	if got.Mode != want.Mode || got.Level != want.Level || got.Source != want.Source || len(got.Overrides) != 0 {
		t.Fatalf("new settings performance = %+v, want automatic default %+v", got, want)
	}
	if want.Mode != "auto" || want.Level != 0 || want.Source != PerformanceSourceDefault {
		t.Fatalf("performance default = %+v, want automatic default provenance", want)
	}
}

func TestPerformanceDefaultStartsAtThreeUnavailableWithoutSensorSample(t *testing.T) {
	settings := DefaultAppSettings().Performance
	target := &runtimePolicyTarget{}
	runtime := NewPerformanceRuntime(
		func() PerformanceSampleRunner { return nil }, settings,
		ResolvePerformancePolicy(settings, nil), target, nil, nil, nil,
	)
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	got := target.PerformancePolicy()
	if got.Mode != "auto" || got.Level != 3 || got.Reason != "unavailable" {
		t.Fatalf("automatic startup policy = %+v, want level 3 unavailable", got)
	}
}

func TestPerformanceDefaultMigrationFromPersistedFiles(t *testing.T) {
	tests := []struct {
		name string
		json string
		want PerformanceSettings
	}{
		{
			name: "file without performance field",
			json: `{"schemaVersion":4}`,
			want: performanceDefault(),
		},
		{
			name: "pre-v4 file without performance field",
			json: `{"schemaVersion":3}`,
			want: performanceDefault(),
		},
		{
			name: "temporary rollout default",
			json: `{"schemaVersion":4,"performance":{"mode":"level","level":1}}`,
			want: PerformanceSettings{
				Mode:         "auto",
				Source:       PerformanceSourceDefault,
				MigratedFrom: PerformanceMigratedFromRolloutLevel1,
			},
		},
		{
			name: "explicit level one choice",
			json: `{"schemaVersion":4,"performance":{"mode":"level","level":1,"source":"user"}}`,
			want: PerformanceSettings{Mode: "level", Level: 1, Source: PerformanceSourceUser},
		},
		{
			name: "explicit custom choice",
			json: `{"schemaVersion":4,"performance":{"mode":"custom","level":4}}`,
			want: PerformanceSettings{Mode: "custom", Level: 4, Source: PerformanceSourceUser},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "app-settings.json")
			if err := os.WriteFile(path, []byte(tt.json), 0o644); err != nil {
				t.Fatal(err)
			}
			svc := NewSettingsService(path, nil, nil)
			if err := svc.Load(); err != nil {
				t.Fatal(err)
			}
			got := svc.Settings().Performance
			if got.Mode != tt.want.Mode || got.Level != tt.want.Level || got.Source != tt.want.Source || got.MigratedFrom != tt.want.MigratedFrom {
				t.Fatalf("migrated performance = %+v, want %+v", got, tt.want)
			}
			if svc.Settings().SchemaVersion != appSettingsSchemaVersion {
				t.Fatalf("schema = %d, want %d", svc.Settings().SchemaVersion, appSettingsSchemaVersion)
			}
		})
	}
}

func TestPerformanceMigrationLoadsRealV4RolloutFile(t *testing.T) {
	fixture, err := os.ReadFile(filepath.Join("testdata", "settings-v4-rollout-level-1.json"))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "app-settings.json")
	if err := os.WriteFile(path, fixture, 0o644); err != nil {
		t.Fatal(err)
	}

	svc := NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	got := svc.Settings().Performance
	if got.Mode != "auto" || got.Source != PerformanceSourceDefault || got.MigratedFrom != PerformanceMigratedFromRolloutLevel1 {
		t.Fatalf("real v4 rollout performance = %+v, want marked automatic migration", got)
	}
}

func TestPerformanceMigrationDoesNotRewriteUnmarkedLevelOneAfterV4(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app-settings.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":5,"performance":{"mode":"level","level":1}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	svc := NewSettingsService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	got := svc.Settings().Performance
	if got.Mode != "level" || got.Level != 1 || got.MigratedFrom != "" {
		t.Fatalf("schema v5 performance = %+v, want unchanged level one", got)
	}
}
