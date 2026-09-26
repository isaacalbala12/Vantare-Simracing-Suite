//go:build !windows

package main

func askLauncherExitClose(int) bool { return false }
