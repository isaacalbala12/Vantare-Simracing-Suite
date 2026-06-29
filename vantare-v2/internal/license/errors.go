package license

import "errors"

var (
	ErrNoCache          = errors.New("no license cache available")
	ErrValidationFailed = errors.New("license validation failed")
	ErrDeviceLimit      = errors.New("device limit reached")
	ErrMissingSession   = errors.New("no session token provided")
	ErrUnconfigured     = errors.New("license backend not configured: supabase env vars missing")
)
