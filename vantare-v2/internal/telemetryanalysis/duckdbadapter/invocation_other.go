//go:build !windows

package duckdbadapter

import "os/exec"

type genericIsolatedProcess struct{ command *exec.Cmd }

func startIsolated(command *exec.Cmd) (isolatedProcess, error) {
	if err := command.Start(); err != nil {
		return nil, err
	}
	return &genericIsolatedProcess{command: command}, nil
}

func (process *genericIsolatedProcess) Wait() error { return process.command.Wait() }
func (process *genericIsolatedProcess) PID() int    { return process.command.Process.Pid }
func (process *genericIsolatedProcess) Terminate() {
	if process.command.Process != nil {
		_ = process.command.Process.Kill()
	}
}
