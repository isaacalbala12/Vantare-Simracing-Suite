package launcher

import "strings"

// IsHotkeyAllowed rejects shortcuts reserved by Windows or the Hub.
// Parsing the key shape belongs to the message-loop manager.
func IsHotkeyAllowed(combo string) bool {
	switch strings.ToLower(strings.TrimSpace(combo)) {
	case "ctrl+c", "ctrl+v", "ctrl+x", "ctrl+z", "alt+f4", "alt+tab", "win+l":
		return false
	default:
		return true
	}
}
