//go:build windows

package startup

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// runKeyPath is shared with the Launcher, which registers one entry per launch
// profile as `Vantare.<profileID>`. This package owns exactly one value name,
// with no dot, so the two never collide and turning app autostart off does not
// disturb a profile the user set up in the Launcher.
// It is a var so the tests can point at a scratch key instead of writing to
// the developer's real autostart.
var runKeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`

const valueName = "Vantare"

// Read reports what the Run key currently says.
func Read() (Options, error) {
	options := Options{Supported: true}
	key, err := registry.OpenKey(registry.CURRENT_USER, runKeyPath, registry.QUERY_VALUE)
	if err != nil {
		if errors.Is(err, registry.ErrNotExist) {
			return options, nil
		}
		return options, fmt.Errorf("startup: open run key: %w", err)
	}
	defer key.Close()

	value, _, err := key.GetStringValue(valueName)
	if err != nil {
		if errors.Is(err, registry.ErrNotExist) {
			return options, nil
		}
		return options, fmt.Errorf("startup: read run value: %w", err)
	}
	options.Enabled = true
	options.Minimised = strings.Contains(value, MinimisedFlag)
	return options, nil
}

// Apply writes the Run key so it matches what the user asked for. Disabling is
// tolerant of the entry not being there: the end state is what matters, and the
// user may have removed it from Task Manager.
func Apply(options Options) error {
	if !options.Enabled {
		return remove()
	}
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("startup: resolve executable: %w", err)
	}
	command := fmt.Sprintf("%q", executable)
	if options.Minimised {
		command += " " + MinimisedFlag
	}
	key, _, err := registry.CreateKey(registry.CURRENT_USER, runKeyPath, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("startup: open run key: %w", err)
	}
	defer key.Close()
	if err := key.SetStringValue(valueName, command); err != nil {
		return fmt.Errorf("startup: write run value: %w", err)
	}
	return nil
}

func remove() error {
	key, err := registry.OpenKey(registry.CURRENT_USER, runKeyPath, registry.SET_VALUE)
	if err != nil {
		if errors.Is(err, registry.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("startup: open run key: %w", err)
	}
	defer key.Close()
	if err := key.DeleteValue(valueName); err != nil && !errors.Is(err, registry.ErrNotExist) {
		return fmt.Errorf("startup: delete run value: %w", err)
	}
	return nil
}
