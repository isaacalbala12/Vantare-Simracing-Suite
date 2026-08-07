//go:build !windows

package startup

// Read reports that this platform has no autostart mechanism, so the settings
// page can say so rather than offer a control that quietly does nothing.
func Read() (Options, error) {
	return Options{}, nil
}

// Apply always fails here. Callers surface the error; they must not pretend it
// worked.
func Apply(Options) error {
	return ErrUnsupported
}
