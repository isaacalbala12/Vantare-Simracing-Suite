//go:build windows

package startup

import (
	"strings"
	"testing"

	"golang.org/x/sys/windows/registry"
)

// useScratchKey points the package at a throwaway key so the tests never touch
// the developer's real autostart entry.
func useScratchKey(t *testing.T) string {
	t.Helper()
	scratch := `Software\Vantare\test-startup`
	original := runKeyPath
	runKeyPath = scratch
	t.Cleanup(func() {
		runKeyPath = original
		_ = registry.DeleteKey(registry.CURRENT_USER, scratch)
	})
	return scratch
}

func TestReadReportsDisabledWhenTheKeyDoesNotExist(t *testing.T) {
	useScratchKey(t)

	options, err := Read()
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if options.Enabled {
		t.Fatal("expected autostart to be reported as disabled")
	}
	if !options.Supported {
		t.Fatal("Windows must report autostart as supported")
	}
}

func TestApplyRoundTripsThroughTheRegistry(t *testing.T) {
	useScratchKey(t)

	for _, want := range []Options{
		{Enabled: true, Minimised: false},
		{Enabled: true, Minimised: true},
	} {
		if err := Apply(want); err != nil {
			t.Fatalf("Apply(%+v): %v", want, err)
		}
		got, err := Read()
		if err != nil {
			t.Fatalf("Read: %v", err)
		}
		if got.Enabled != want.Enabled || got.Minimised != want.Minimised {
			t.Fatalf("round trip = %+v, want enabled=%v minimised=%v", got, want.Enabled, want.Minimised)
		}
	}
}

func TestApplyQuotesTheExecutablePath(t *testing.T) {
	scratch := useScratchKey(t)

	if err := Apply(Options{Enabled: true}); err != nil {
		t.Fatalf("Apply: %v", err)
	}

	key, err := registry.OpenKey(registry.CURRENT_USER, scratch, registry.QUERY_VALUE)
	if err != nil {
		t.Fatalf("open scratch key: %v", err)
	}
	defer key.Close()
	value, _, err := key.GetStringValue(valueName)
	if err != nil {
		t.Fatalf("read scratch value: %v", err)
	}
	// Without the quotes, an install under "Program Files" would have Windows
	// try to run "C:\Program" with "Files\..." as an argument.
	if !strings.HasPrefix(value, `"`) {
		t.Fatalf("registered command %q must quote the executable path", value)
	}
}

func TestApplyDisabledIsTolerantOfAMissingEntry(t *testing.T) {
	useScratchKey(t)

	// The user can remove the entry from Task Manager at any time, so turning
	// the setting off must reach the same end state rather than fail.
	if err := Apply(Options{Enabled: false}); err != nil {
		t.Fatalf("Apply(disabled) with no entry: %v", err)
	}
	if err := Apply(Options{Enabled: true}); err != nil {
		t.Fatalf("Apply(enabled): %v", err)
	}
	if err := Apply(Options{Enabled: false}); err != nil {
		t.Fatalf("Apply(disabled): %v", err)
	}
	options, err := Read()
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if options.Enabled {
		t.Fatal("expected autostart to be off after Apply(disabled)")
	}
}
