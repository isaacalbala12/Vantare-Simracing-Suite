//go:build production

package main

// startCPUProfile is disabled in production: a release must never profile
// itself, regardless of VANTARE_CPU_PROFILE_PATH or
// VANTARE_CPU_PROFILE_DURATION. The stop function is non-nil so callers need no
// build-tag branch. The diagnostic implementation is in cpu_profile.go.
func startCPUProfile() func() {
	return func() {}
}
