package launcher

import "strings"

// IsHotkeyAllowed rejects shortcuts reserved by Windows or the Hub.
// Parsing the key shape belongs to the message-loop manager.
func IsHotkeyAllowed(combo string) bool {
	switch strings.ToLower(strings.TrimSpace(combo)) {
	case "ctrl+c", "ctrl+v", "ctrl+x", "ctrl+a", "ctrl+z", "ctrl+y",
		"ctrl+s", "ctrl+o", "ctrl+n", "ctrl+p", "ctrl+w", "ctrl+q",
		"ctrl+r", "ctrl+t", "ctrl+f", "ctrl+h", "ctrl+d", "ctrl+e",
		"ctrl+b", "ctrl+u", "ctrl+i", "ctrl+l", "ctrl+k", "ctrl+j",
		"alt+f4", "alt+tab", "win+l":
		return false
	default:
		return true
	}
}
