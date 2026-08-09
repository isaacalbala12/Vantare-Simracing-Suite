// Package startup owns whether Vantare launches itself when the user signs in.
//
// The Windows Run key is the single source of truth, deliberately: it is also
// editable from Task Manager and from the registry, so a copy in app-settings
// would drift the moment the user turns autostart off anywhere else and the
// settings page would then report something false.
package startup

import "errors"

// ErrUnsupported is returned on platforms with no autostart mechanism.
var ErrUnsupported = errors.New("startup: not supported on this platform")

// Options is what the user chose about launching at sign-in.
type Options struct {
	// Enabled is whether Vantare launches when the user signs in.
	Enabled bool `json:"enabled"`
	// Minimised starts the Hub window minimised. It only has meaning when
	// Enabled is set, because it travels in the registered command line.
	Minimised bool `json:"minimised"`
	// Supported reports whether this platform can do any of it, so the UI can
	// say so instead of offering a control that silently fails.
	Supported bool `json:"supported"`
}

// MinimisedFlag is the argument the registered command line carries, and the
// one main() looks for at startup.
const MinimisedFlag = "--minimised"

// WantsMinimised reports whether the process was started minimised.
func WantsMinimised(args []string) bool {
	for _, arg := range args {
		if arg == MinimisedFlag {
			return true
		}
	}
	return false
}
