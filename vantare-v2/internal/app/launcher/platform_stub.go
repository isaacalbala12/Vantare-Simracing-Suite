//go:build !windows

package launcher

import "errors"

var errWindowsOnly = errors.New("launcher integration is available only on Windows")

type RegistryApp struct {
	ID             string `json:"id"`
	DisplayName    string `json:"displayName"`
	ExecutablePath string `json:"executablePath"`
}

func ListRegistryApps() []RegistryApp { return nil }

type HotkeyManager struct{}

func NewHotkeyManager() *HotkeyManager               { return &HotkeyManager{} }
func (*HotkeyManager) Register(string, string) error { return errWindowsOnly }
func (*HotkeyManager) Unregister(string)             {}
func (*HotkeyManager) Stop()                         {}
func (*HotkeyManager) ReRegisterAll()                {}

func RegisterAutostart(string) error   { return errWindowsOnly }
func UnregisterAutostart(string) error { return errWindowsOnly }

func ParseLaunchFlag(args []string) (string, bool) {
	for _, arg := range args {
		if len(arg) > len("--launch=") && arg[:len("--launch=")] == "--launch=" {
			return arg[len("--launch="):], true
		}
	}
	return "", false
}
