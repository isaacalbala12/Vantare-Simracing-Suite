//go:build windows

package main

import (
	"fmt"
	"log"

	"golang.org/x/sys/windows"
)

// askLauncherExitClose is synchronous because Wails is already shutting down.
// The safe default is No: closing the dialog leaves external apps open.
func askLauncherExitClose(count int) bool {
	message, err := windows.UTF16PtrFromString(fmt.Sprintf(
		"Vantare se está cerrando. ¿Cerrar también las %d aplicaciones iniciadas por sus perfiles?\n\nSolo se cerrarán procesos verificados que inició Vantare.", count,
	))
	if err != nil {
		log.Printf("launcher: exit prompt message: %v", err)
		return false
	}
	title, err := windows.UTF16PtrFromString("Lanzador Vantare")
	if err != nil {
		log.Printf("launcher: exit prompt title: %v", err)
		return false
	}
	response, err := windows.MessageBox(0, message, title,
		windows.MB_YESNO|windows.MB_ICONQUESTION|windows.MB_DEFBUTTON2|windows.MB_SETFOREGROUND)
	if err != nil {
		log.Printf("launcher: exit prompt: %v", err)
		return false
	}
	return response == 6 // IDYES
}
