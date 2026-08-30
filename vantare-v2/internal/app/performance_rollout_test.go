package app

import "testing"

func TestPerformanceRolloutDefaultIsSingleAuthorityForNewAndMigratedSettings(t *testing.T) {
	want := performanceRolloutDefault()
	if got := DefaultAppSettings().Performance; got.Mode != want.Mode || got.Level != want.Level {
		t.Fatalf("new settings performance = %+v, want rollout default %+v", got, want)
	}

	migrated := &AppSettings{SchemaVersion: 3}
	(&SettingsService{}).migrateSettings(migrated)
	if got := migrated.Performance; got.Mode != want.Mode || got.Level != want.Level {
		t.Fatalf("migrated settings performance = %+v, want rollout default %+v", got, want)
	}

	if want.Mode != "level" || want.Level != 1 {
		t.Fatalf("rollout default = %+v, want temporary manual level 1", want)
	}
}
