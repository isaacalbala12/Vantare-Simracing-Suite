//go:build windows

package launcher

import (
	"fmt"
	"strings"
	"sync"
	"syscall"

	"golang.org/x/sys/windows"
)

// Modifier constants for Windows RegisterHotKey.
const (
	MOD_ALT     = 0x0001
	MOD_CONTROL = 0x0002
	MOD_SHIFT   = 0x0004
	MOD_WIN     = 0x0008
)

var (
	moduser32            = windows.NewLazySystemDLL("user32.dll")
	procRegisterHotKey   = moduser32.NewProc("RegisterHotKey")
	procUnregisterHotKey = moduser32.NewProc("UnregisterHotKey")
)

// reservedCombos lists hotkey combinations that must not be assigned to any
// profile because they conflict with OS or Hub-level shortcuts.
var reservedCombos = map[string]bool{
	"ctrl+c": true, "ctrl+v": true, "ctrl+x": true, "ctrl+z": true,
	"alt+f4": true, "alt+tab": true, "win+l": true,
}

// IsHotkeyAllowed returns false if the given combo is a reserved system
// shortcut that a profile hotkey must not override.
func IsHotkeyAllowed(combo string) bool {
	return !reservedCombos[strings.ToLower(combo)]
}

// ParseHotkeyString parses a user-facing hotkey string like "ctrl+shift+1"
// into the Windows modifier flags and virtual key code.
func ParseHotkeyString(s string) (modifiers uint32, vk uint32, err error) {
	parts := strings.Split(strings.ToLower(s), "+")
	if len(parts) < 2 {
		return 0, 0, fmt.Errorf("invalid hotkey: %s", s)
	}
	for _, p := range parts[:len(parts)-1] {
		switch p {
		case "ctrl":
			modifiers |= MOD_CONTROL
		case "shift":
			modifiers |= MOD_SHIFT
		case "alt":
			modifiers |= MOD_ALT
		case "win":
			modifiers |= MOD_WIN
		default:
			return 0, 0, fmt.Errorf("unknown modifier: %s", p)
		}
	}
	last := parts[len(parts)-1]
	if len(last) == 1 {
		vk = uint32(last[0])
	} else {
		return 0, 0, fmt.Errorf("invalid key: %s", last)
	}
	return modifiers, vk, nil
}

// registerHotKey wraps user32!RegisterHotKey via syscall.
// Returns true on success.
func registerHotKey(hwnd syscall.Handle, id int32, modifiers, vk uint32) bool {
	ret, _, callErr := procRegisterHotKey.Call(
		uintptr(hwnd),
		uintptr(id),
		uintptr(modifiers),
		uintptr(vk),
	)
	if ret == 0 {
		_ = callErr // unused but captured for debugging
	}
	return ret != 0
}

// unregisterHotKey wraps user32!UnregisterHotKey via syscall.
func unregisterHotKey(hwnd syscall.Handle, id int32) bool {
	ret, _, _ := procUnregisterHotKey.Call(uintptr(hwnd), uintptr(id))
	return ret != 0
}

// HotkeyManager manages per-profile hotkey registration with Windows.
// It is safe for concurrent use.
type HotkeyManager struct {
	mu     sync.Mutex
	nextID int
	active map[string]int // profileID -> hotkey ID
	combos map[int]string // hotkey ID -> combo string
}

// NewHotkeyManager creates a new HotkeyManager with no registered hotkeys.
func NewHotkeyManager() *HotkeyManager {
	return &HotkeyManager{
		active: make(map[string]int),
		combos: make(map[int]string),
	}
}

// Register registers a hotkey for the given profile. If the profile already
// has a hotkey registered, it is best-effort unregistered first (idempotent).
// The combo must be allowed by IsHotkeyAllowed; reserved combinations are
// rejected.
func (h *HotkeyManager) Register(profileID, combo string) error {
	if !IsHotkeyAllowed(combo) {
		return fmt.Errorf("hotkey reserved: %s", combo)
	}
	mods, vk, err := ParseHotkeyString(combo)
	if err != nil {
		return err
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	// Unregister any existing hotkey for this profile.
	if existing, ok := h.active[profileID]; ok {
		unregisterHotKey(0, int32(existing))
		delete(h.active, profileID)
		delete(h.combos, existing)
	}

	id := h.nextID
	h.nextID++

	if !registerHotKey(0, int32(id), mods, vk) {
		return fmt.Errorf("RegisterHotKey failed for %s", combo)
	}
	h.active[profileID] = id
	h.combos[id] = combo
	return nil
}

// Unregister removes the hotkey registration for the given profile, if any.
func (h *HotkeyManager) Unregister(profileID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if id, ok := h.active[profileID]; ok {
		unregisterHotKey(0, int32(id))
		delete(h.active, profileID)
		delete(h.combos, id)
	}
}

// ReRegisterAll unregisters and re-registers every active profile hotkey.
// This is intended for use after WM_POWERBROADCAST (system resume) where the
// OS may have invalidated previous hotkey registrations. If a single
// re-registration fails (e.g. another app grabbed the combo), it is silently
// skipped so the remaining hotkeys still work.
func (h *HotkeyManager) ReRegisterAll() {
	h.mu.Lock()
	// Snapshot the current active registrations under the lock.
	type entry struct {
		profileID string
		combo     string
	}
	snapshot := make([]entry, 0, len(h.active))
	for pid, hid := range h.active {
		if c, ok := h.combos[hid]; ok {
			snapshot = append(snapshot, entry{pid, c})
		}
	}
	h.mu.Unlock()

	// Re-register outside the lock to avoid blocking concurrent Unregister
	// calls during the per-hotkey syscall round-trips.
	for _, s := range snapshot {
		_ = h.Register(s.profileID, s.combo) // best-effort
	}
}
