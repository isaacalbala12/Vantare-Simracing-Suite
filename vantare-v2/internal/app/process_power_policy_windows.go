//go:build windows

package app

import (
	"fmt"
	"syscall"
	"unsafe"
)

const (
	processPowerThrottlingClass     = 4
	processPowerThrottlingVersion   = 1
	processPowerThrottlingExecSpeed = 0x1
	normalPriorityClass             = 0x20
	belowNormalPriorityClass        = 0x4000
)

type processPowerThrottlingState struct {
	Version     uint32
	ControlMask uint32
	StateMask   uint32
}

var (
	processKernel32          = syscall.NewLazyDLL("kernel32.dll")
	processGetCurrentProcess = processKernel32.NewProc("GetCurrentProcess")
	processSetInformation    = processKernel32.NewProc("SetProcessInformation")
	processSetPriorityClass  = processKernel32.NewProc("SetPriorityClass")
)

// ApplyProcessPowerPolicy applies and reverses the Windows execution-speed
// throttling and priority selected by the effective performance level.
func ApplyProcessPowerPolicy(level int) error {
	policy := processPowerPolicyForLevel(level)
	handle, _, _ := processGetCurrentProcess.Call()
	priority := uintptr(normalPriorityClass)
	if policy.belowNormal {
		priority = belowNormalPriorityClass
	}
	if ok, _, callErr := processSetPriorityClass.Call(handle, priority); ok == 0 {
		return fmt.Errorf("SetPriorityClass: %w", callErr)
	}
	state := processPowerThrottlingState{
		Version:     processPowerThrottlingVersion,
		ControlMask: processPowerThrottlingExecSpeed,
	}
	if policy.ecoQoS {
		state.StateMask = processPowerThrottlingExecSpeed
	}
	if ok, _, callErr := processSetInformation.Call(
		handle,
		processPowerThrottlingClass,
		uintptr(unsafe.Pointer(&state)),
		unsafe.Sizeof(state),
	); ok == 0 {
		return fmt.Errorf("SetProcessInformation(ProcessPowerThrottling): %w", callErr)
	}
	return nil
}
