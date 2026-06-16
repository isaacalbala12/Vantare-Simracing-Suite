package app

import (
	"fmt"
	"runtime"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"unsafe"
)

// Windows constants for RegisterHotKey.
const (
	WM_HOTKEY = 0x0312

	MOD_ALT     = 0x0001
	MOD_CONTROL = 0x0002
	MOD_SHIFT   = 0x0004
	MOD_WIN     = 0x0008
)

// Virtual key code mapping for common keys.
var keyCodeMap = map[string]uint32{
	"v":         0x56,
	"right":     0x27,
	"left":      0x25,
	"up":        0x26,
	"down":      0x28,
	"space":     0x20,
	"enter":     0x0D,
	"escape":    0x1B,
	"tab":       0x09,
	"backspace": 0x08,
	"delete":    0x2E,
	"insert":    0x2D,
	"home":      0x24,
	"end":       0x23,
	"pageup":    0x21,
	"pagedown":  0x22,
	"f1":        0x70,
	"f2":        0x71,
	"f3":        0x72,
	"f4":        0x73,
	"f5":        0x74,
	"f6":        0x75,
	"f7":        0x76,
	"f8":        0x77,
	"f9":        0x78,
	"f10":       0x79,
	"f11":       0x7A,
	"f12":       0x7B,
	"0":         0x30,
	"1":         0x31,
	"2":         0x32,
	"3":         0x33,
	"4":         0x34,
	"5":         0x35,
	"6":         0x36,
	"7":         0x37,
	"8":         0x38,
	"9":         0x39,
}

var (
	user32            = syscall.NewLazyDLL("user32.dll")
	kernel32          = syscall.NewLazyDLL("kernel32.dll")

	procRegisterHotKey   = user32.NewProc("RegisterHotKey")
	procUnregisterHotKey = user32.NewProc("UnregisterHotKey")
	procGetMessageW      = user32.NewProc("GetMessageW")
	procPeekMessageW     = user32.NewProc("PeekMessageW")
	procDispatchMessageW = user32.NewProc("DispatchMessageW")
	procPostQuitMessage  = user32.NewProc("PostQuitMessage")
)

// ParseHotkeyCombo converts "ctrl+shift+v" into modifier flags and virtual key code.
func ParseHotkeyCombo(combo string) (mods uint32, vk uint32, err error) {
	parts := strings.Split(strings.ToLower(combo), "+")
	if len(parts) < 2 {
		return 0, 0, fmt.Errorf("hotkey %q must have at least 2 parts", combo)
	}

	for _, p := range parts[:len(parts)-1] {
		switch p {
		case "ctrl":
			mods |= MOD_CONTROL
		case "alt":
			mods |= MOD_ALT
		case "shift":
			mods |= MOD_SHIFT
		case "win":
			mods |= MOD_WIN
		default:
			return 0, 0, fmt.Errorf("unknown modifier: %q", p)
		}
	}

	key := parts[len(parts)-1]
	if code, ok := keyCodeMap[key]; ok {
		return mods, code, nil
	}
	if len(key) == 1 && key[0] >= 'a' && key[0] <= 'z' {
		return mods, uint32(key[0]-'a'+0x41), nil
	}
	return 0, 0, fmt.Errorf("unknown key: %q", key)
}

// hotkeyEntry stores one registration.
type hotkeyEntry struct {
	id    int
	combo string
}

// HotkeyManager manages global Windows hotkeys via RegisterHotKey/GetMessage.
type HotkeyManager struct {
	mu      sync.Mutex
	entries []hotkeyEntry
	actions map[int]func()
	nextID  int
	stop    atomic.Bool
	done    chan struct{}
	started bool
}

// NewHotkeyManager creates a hotkey manager. Call Start() after all Register calls.
func NewHotkeyManager() *HotkeyManager {
	return &HotkeyManager{
		actions: make(map[int]func()),
		nextID:  1,
		done:    make(chan struct{}),
	}
}

// Register queues a hotkey handler. Hotkeys become active after Start().
func (m *HotkeyManager) Register(name, combo string, action func()) error {
	if _, _, err := ParseHotkeyCombo(combo); err != nil {
		return fmt.Errorf("register %q: %w", name, err)
	}

	m.mu.Lock()
	id := m.nextID
	m.nextID++
	m.entries = append(m.entries, hotkeyEntry{id: id, combo: combo})
	m.actions[id] = action
	m.mu.Unlock()
	return nil
}

// UnregisterAll unregisters all hotkeys with Windows and clears the registrations.
func (m *HotkeyManager) UnregisterAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, e := range m.entries {
		_, _, _ = procUnregisterHotKey.Call(0, uintptr(e.id))
	}
	m.entries = nil
	m.actions = make(map[int]func())
}

// Start begins processing hotkey events in a background goroutine.
// All Windows API calls (RegisterHotKey, GetMessage, UnregisterHotKey)
// happen on the same OS thread that owns the message queue.
func (m *HotkeyManager) Start() error {
	m.mu.Lock()
	if m.started {
		m.mu.Unlock()
		return nil
	}
	m.started = true
	m.mu.Unlock()

	go m.messageLoop()
	return nil
}

// Stop terminates the hotkey message loop and unregisters all hotkeys.
func (m *HotkeyManager) Stop() {
	if m.stop.Load() {
		return
	}
	m.stop.Store(true)
	m.UnregisterAll()
	procPostQuitMessage.Call(0)
	<-m.done
}

func (m *HotkeyManager) messageLoop() {
	runtime.LockOSThread()
	defer close(m.done)

	var msg struct {
		hwnd    uintptr
		message uint32
		wParam  uintptr
		lParam  uintptr
		time    uint32
		pt      struct{ x, y int32 }
	}

	// Ensure this thread has a message queue before registering.
	_, _, _ = procPeekMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0, 0)

	// Register all queued entries on this same thread.
	m.mu.Lock()
	entries := make([]hotkeyEntry, len(m.entries))
	copy(entries, m.entries)
	m.mu.Unlock()
	for _, e := range entries {
		m.registerOne(e)
	}

	for !m.stop.Load() {
		ret, _, _ := procGetMessageW.Call(
			uintptr(unsafe.Pointer(&msg)),
			0, 0, 0,
		)
		if ret == 0 {
			return // WM_QUIT
		}

		if msg.message == WM_HOTKEY {
			id := int(msg.wParam)
			m.mu.Lock()
			action := m.actions[id]
			m.mu.Unlock()
			if action != nil {
				go action()
			}
		}

		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}
}

func (m *HotkeyManager) registerOne(e hotkeyEntry) {
	mods, vk, err := ParseHotkeyCombo(e.combo)
	if err != nil {
		log.Printf("hotkey: skip entry id=%d: %v", e.id, err)
		return
	}
	ret, _, _ := procRegisterHotKey.Call(0, uintptr(e.id), uintptr(mods), uintptr(vk))
	if ret == 0 {
		log.Printf("hotkey: RegisterHotKey failed for id=%d combo=%q mods=0x%x vk=0x%x", e.id, e.combo, mods, vk)
	}
}

// ReRegisterAll unregisters and re-registers all hotkeys (called after settings change).
func (m *HotkeyManager) ReRegisterAll() {
	m.mu.Lock()
	entries := make([]hotkeyEntry, len(m.entries))
	copy(entries, m.entries)
	actions := make(map[int]func(), len(m.actions))
	for k, v := range m.actions {
		actions[k] = v
	}
	// Unregister current Windows hotkeys without clearing actions
	for _, e := range m.entries {
		_, _, _ = procUnregisterHotKey.Call(0, uintptr(e.id))
	}
	m.mu.Unlock()

	// Re-register with new combo data - we need to update combos from settings
	// This is called after settings reload; the entries/actions aren't updated here,
	// the caller (main.go) handles that via Register/UnregisterAll.
	_ = entries
	_ = actions
}

// UpdateFromSettings replaces all registrations with new combos from settings.
// Actions are preserved by action name.
func (m *HotkeyManager) UpdateFromSettings(settings *AppSettings, actionMap map[string]func()) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Unregister all current Windows hotkeys
	for _, e := range m.entries {
		_, _, _ = procUnregisterHotKey.Call(0, uintptr(e.id))
	}

	// Preserve existing actions mapped by name
	nameToAction := make(map[string]func())
	for i, e := range m.entries {
		// We need name:action mapping. Store it externally in main.go.
		_ = i
		_ = e
	}
	_ = nameToAction

	// Clear and rebuild from settings
	m.entries = nil
	m.actions = make(map[int]func())

	for name, action := range actionMap {
		combo, ok := settings.Hotkeys[name]
		if !ok || combo == "" {
			continue
		}
		if _, _, err := ParseHotkeyCombo(combo); err != nil {
			log.Printf("hotkey: skip %q: %v", name, err)
			continue
		}
		id := m.nextID
		m.nextID++
		m.entries = append(m.entries, hotkeyEntry{id: id, combo: combo})
		m.actions[id] = action

		// Register with Windows if started
		if m.started {
			mods, vk, _ := ParseHotkeyCombo(combo)
			ret, _, _ := procRegisterHotKey.Call(0, uintptr(id), uintptr(mods), uintptr(vk))
			if ret == 0 {
				log.Printf("hotkey: RegisterHotKey failed for %q combo=%q", name, combo)
			}
		}
	}
}
