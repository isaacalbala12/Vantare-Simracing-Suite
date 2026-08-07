package storage

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func newTestService(t *testing.T) (*Service, string, string) {
	t.Helper()
	root := t.TempDir()
	configs := filepath.Join(root, "configs")
	telemetry := filepath.Join(root, "telemetry")
	for _, dir := range []string{configs, telemetry} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	return New(configs, telemetry), configs, telemetry
}

func write(t *testing.T, path string, size int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, make([]byte, size), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func find(t *testing.T, summary Summary, key string) Location {
	t.Helper()
	for _, location := range summary.Locations {
		if location.Key == key {
			return location
		}
	}
	t.Fatalf("summary has no %q location", key)
	return Location{}
}

func TestSummaryCountsBytesAndFilesRecursively(t *testing.T) {
	service, configs, telemetry := newTestService(t)
	write(t, filepath.Join(configs, "app-settings.json"), 100)
	write(t, filepath.Join(telemetry, "sessions", "a", "chunk.bin"), 400)
	write(t, filepath.Join(telemetry, "sessions", "b", "chunk.bin"), 500)

	summary := service.Summary()

	if got := find(t, summary, ConfigsKey); got.Bytes != 100 || got.Files != 1 {
		t.Fatalf("configs = %d bytes / %d files, want 100/1", got.Bytes, got.Files)
	}
	if got := find(t, summary, TelemetryKey); got.Bytes != 900 || got.Files != 2 {
		t.Fatalf("telemetry = %d bytes / %d files, want 900/2", got.Bytes, got.Files)
	}
	if summary.TotalBytes != 1000 {
		t.Fatalf("total = %d, want 1000", summary.TotalBytes)
	}
}

// The whole point of this service is that the user can empty the disposable
// half without risking the half that holds their profiles and settings.
func TestClearRefusesConfigsAndLeavesThemUntouched(t *testing.T) {
	service, configs, _ := newTestService(t)
	settings := filepath.Join(configs, "app-settings.json")
	write(t, settings, 100)

	if _, err := service.Clear(ConfigsKey); !errors.Is(err, ErrNotClearable) {
		t.Fatalf("Clear(configs) error = %v, want ErrNotClearable", err)
	}
	if _, err := os.Stat(settings); err != nil {
		t.Fatalf("configs must survive a refused clear: %v", err)
	}
}

func TestClearEmptiesTelemetryButKeepsTheDirectory(t *testing.T) {
	service, configs, telemetry := newTestService(t)
	write(t, filepath.Join(configs, "app-settings.json"), 100)
	write(t, filepath.Join(telemetry, "sessions", "a", "chunk.bin"), 400)

	summary, err := service.Clear(TelemetryKey)
	if err != nil {
		t.Fatalf("Clear(telemetry): %v", err)
	}
	if got := find(t, summary, TelemetryKey); got.Bytes != 0 || got.Files != 0 {
		t.Fatalf("telemetry after clear = %d bytes / %d files, want 0/0", got.Bytes, got.Files)
	}
	// The app keeps writing here, so the directory itself has to stay.
	if info, err := os.Stat(telemetry); err != nil || !info.IsDir() {
		t.Fatalf("telemetry directory must survive the clear: %v", err)
	}
	if got := find(t, summary, ConfigsKey); got.Bytes != 100 {
		t.Fatalf("clearing telemetry touched configs: %d bytes", got.Bytes)
	}
}

func TestClearIsFineWhenThereIsNothingThere(t *testing.T) {
	service := New(t.TempDir(), filepath.Join(t.TempDir(), "never-written"))

	if _, err := service.Clear(TelemetryKey); err != nil {
		t.Fatalf("Clear on a missing directory: %v", err)
	}
}

// The frontend sends a key, never a path. Anything else must not resolve.
func TestUnknownKeysDoNotResolveToAPath(t *testing.T) {
	service, _, _ := newTestService(t)

	for _, key := range []string{"", "..", `C:\Windows`, "Configs"} {
		if _, err := service.Clear(key); !errors.Is(err, ErrUnknownLocation) {
			t.Fatalf("Clear(%q) error = %v, want ErrUnknownLocation", key, err)
		}
		if err := service.Reveal(key); !errors.Is(err, ErrUnknownLocation) {
			t.Fatalf("Reveal(%q) error = %v, want ErrUnknownLocation", key, err)
		}
	}
}

func TestSummaryReportsAMissingDirectoryWithoutFailing(t *testing.T) {
	service := New(filepath.Join(t.TempDir(), "absent"), filepath.Join(t.TempDir(), "absent"))

	summary := service.Summary()

	if len(summary.Locations) != 2 {
		t.Fatalf("expected both locations to be reported, got %d", len(summary.Locations))
	}
	for _, location := range summary.Locations {
		if location.Exists {
			t.Fatalf("%q should be reported as not existing", location.Key)
		}
		// The path is still shown: "where will it go" is as useful as "what is
		// there now".
		if location.Path == "" {
			t.Fatalf("%q must still report its path", location.Key)
		}
	}
}
