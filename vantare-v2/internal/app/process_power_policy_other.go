//go:build !windows

package app

func ApplyProcessPowerPolicy(_ int) error { return nil }
