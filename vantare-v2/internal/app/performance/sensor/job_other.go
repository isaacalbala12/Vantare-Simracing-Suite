//go:build !windows

package sensor

import "os/exec"

func startCommandInKillOnCloseJob(command *exec.Cmd) (func() error, error) {
	if err := command.Start(); err != nil {
		return nil, err
	}
	return func() error { return nil }, nil
}
