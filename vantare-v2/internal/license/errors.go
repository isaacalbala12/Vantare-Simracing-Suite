package license

import "errors"

var (
	ErrNoCache                   = errors.New("no license cache available")
	ErrValidationFailed          = errors.New("license validation failed")
	ErrDeviceLimit               = errors.New("device limit reached")
	ErrMissingSession            = errors.New("no session token provided")
	ErrUnconfigured              = errors.New("license backend not configured: supabase env vars missing")
	ErrInvalidCredential         = errors.New("offline license credential is invalid")
	ErrUnknownSigningKey         = errors.New("offline license signing key is unknown")
	ErrCredentialAccountMismatch = errors.New("offline license belongs to another account")
	ErrCredentialDeviceMismatch  = errors.New("offline license belongs to another device")
	ErrLegacyCache               = errors.New("legacy license cache cannot grant premium access")
	ErrClockRollback             = errors.New("system clock or credential rollback detected")
	ErrClockStateNotFound        = errors.New("protected license clock not found")
	ErrSecureClockUnavailable    = errors.New("protected license clock unavailable")
	ErrCredentialRejected        = errors.New("license credential request was rejected")
)
