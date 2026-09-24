//go:build windows

package launcher

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/windows/registry"
)

const autostartKeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`

func autostartValueName(profileID string) string { return fmt.Sprintf("Vantare.%s", profileID) }

func validAutostartProfileID(id string) bool {
	if id == "" || len(id) > 128 {
		return false
	}
	for _, c := range id {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

// RegisterAutostart crea una entrada en HKCU\...\Run para lanzar Vantare con
// --launch=<profileID>. Es idempotente: si la entrada ya existe con el mismo
// valor, no se modifica.
func RegisterAutostart(profileID string) error {
	if !validAutostartProfileID(profileID) {
		return fmt.Errorf("launcher: invalid autostart profile ID")
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	value := fmt.Sprintf(`"%s" --launch=%s`, exe, profileID)
	k, _, err := registry.CreateKey(registry.CURRENT_USER, autostartKeyPath, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	return k.SetStringValue(autostartValueName(profileID), value)
}

// UnregisterAutostart elimina la entrada de autostart para un perfil.
func UnregisterAutostart(profileID string) error {
	if !validAutostartProfileID(profileID) {
		return fmt.Errorf("launcher: invalid autostart profile ID")
	}
	k, err := registry.OpenKey(registry.CURRENT_USER, autostartKeyPath, registry.SET_VALUE)
	if errors.Is(err, registry.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer k.Close()
	if err := k.DeleteValue(autostartValueName(profileID)); errors.Is(err, registry.ErrNotExist) {
		return nil
	} else {
		return err
	}
}

// ParseLaunchFlag extrae --launch=<id> de los argumentos. Devuelve el ID y true
// si se encontró un flag válido.
func ParseLaunchFlag(args []string) (string, bool) {
	for _, a := range args {
		if len(a) > 9 && a[:9] == "--launch=" {
			id := a[9:]
			if validAutostartProfileID(id) {
				return id, true
			}
		}
	}
	return "", false
}
