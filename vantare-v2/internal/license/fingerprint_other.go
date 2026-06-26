//go:build !windows

package license

import "errors"

// errPlatformUnsupported is returned by readMachineGUIDPlatform on non-Windows
// platforms. It is package-private and only used as a sentinel to fall back to
// the directory-based fingerprint.
var errPlatformUnsupported = errors.New("machine guid read not supported on this platform")

func readMachineGUIDPlatform() (string, error) {
	return "", errPlatformUnsupported
}
