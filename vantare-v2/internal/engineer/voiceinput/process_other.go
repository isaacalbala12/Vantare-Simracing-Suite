//go:build !windows

package voiceinput

import "os/exec"

func prepareHiddenProcess(*exec.Cmd) {}
func lowerProcessPriority(int) error { return nil }
