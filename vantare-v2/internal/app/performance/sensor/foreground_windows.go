//go:build windows

package sensor

import (
	"strings"
	"unsafe"

	"github.com/shirou/gopsutil/v4/process"
	"golang.org/x/sys/windows"
)

var (
	user32Foreground         = windows.NewLazySystemDLL("user32.dll")
	getForegroundWindow      = user32Foreground.NewProc("GetForegroundWindow")
	getWindowThreadProcessID = user32Foreground.NewProc("GetWindowThreadProcessId")
)

func isLMUForeground() bool {
	hwnd, _, _ := getForegroundWindow.Call()
	if hwnd == 0 {
		return false
	}
	var pid uint32
	getWindowThreadProcessID.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 {
		return false
	}
	candidate, err := process.NewProcess(int32(pid))
	if err != nil {
		return false
	}
	name, err := candidate.Name()
	return err == nil && strings.EqualFold(name, "Le Mans Ultimate.exe")
}
