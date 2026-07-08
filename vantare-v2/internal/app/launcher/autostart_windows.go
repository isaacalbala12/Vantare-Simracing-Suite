//go:build windows

package launcher

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows/registry"
)

const autostartKeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`

func autostartValueName(profileID string) string { return fmt.Sprintf("Vantare.%s", profileID) }

// RegisterAutostart crea una entrada en HKCU\...\Run para lanzar Vantare con
// --launch=<profileID>. Es idempotente: si la entrada ya existe con el mismo
// valor, no se modifica.
func RegisterAutostart(profileID string) error {
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
	k, err := registry.OpenKey(registry.CURRENT_USER, autostartKeyPath, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	return k.DeleteValue(autostartValueName(profileID))
}

// ParseLaunchFlag extrae --launch=<id> de los argumentos. Devuelve el ID y true
// si se encontró un flag válido.
func ParseLaunchFlag(args []string) (string, bool) {
	for _, a := range args {
		if len(a) > 9 && a[:9] == "--launch=" {
			id := a[9:]
			if id != "" {
				return id, true
			}
		}
	}
	return "", false
}
