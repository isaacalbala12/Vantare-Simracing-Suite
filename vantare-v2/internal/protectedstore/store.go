package protectedstore

import "errors"

var (
	ErrNotFound    = errors.New("protected value not found")
	ErrUnsupported = errors.New("protected storage is unavailable on this platform")
)
