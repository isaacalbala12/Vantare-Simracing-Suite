//go:build windows

package sensor

import (
	"errors"

	"golang.org/x/sys/windows"
)

const windowsStillActive = 259

func processIsAlive(pid int) bool {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		// Ante falta de permisos se conserva la sesión: un falso positivo aquí
		// interrumpiría otra instancia viva. PID inexistente sí es huérfano.
		return !errors.Is(err, windows.ERROR_INVALID_PARAMETER)
	}
	defer windows.CloseHandle(handle)
	var exitCode uint32
	if err := windows.GetExitCodeProcess(handle, &exitCode); err != nil {
		return true
	}
	return exitCode == windowsStillActive
}
