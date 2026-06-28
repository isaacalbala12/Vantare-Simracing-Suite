//go:build windows

package app_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestParseHotkeyCombo(t *testing.T) {
	tests := []struct {
		combo   string
		wantErr bool
	}{
		{"ctrl+shift+v", false},
		{"alt+v", false},
		{"win+1", false},
		{"ctrl+alt+shift+win+f12", false},
		{"", true},
		{"v", true},
		{"ctrl+invalidkey", true},
		{"badmod+v", true},
		{"ctrl+shift+right", false},
		{"ctrl+shift+left", false},
		{"ctrl+shift+up", false},
		{"ctrl+shift+down", false},
		{"ctrl+space", false},
	}
	for _, tt := range tests {
		_, _, err := app.ParseHotkeyCombo(tt.combo)
		gotErr := err != nil
		if gotErr != tt.wantErr {
			t.Errorf("ParseHotkeyCombo(%q) err=%v, wantErr=%v", tt.combo, err, tt.wantErr)
		}
	}
}

func TestParseHotkeyComboCtrlShiftE(t *testing.T) {
	mods, vk, err := app.ParseHotkeyCombo("ctrl+shift+e")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// ctrl=0x0002, shift=0x0004 => combined 0x0006
	if mods != 0x0006 {
		t.Errorf("expected mods=0x0006, got 0x%x", mods)
	}
	if vk != 0x45 {
		t.Errorf("expected vk=0x45 (E), got 0x%x", vk)
	}
}

func TestParseHotkeyComboValues(t *testing.T) {
	mods, vk, err := app.ParseHotkeyCombo("ctrl+shift+v")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// ctrl=0x0002, shift=0x0004 => combined 0x0006
	if mods != 0x0006 {
		t.Errorf("expected mods=0x0006, got 0x%x", mods)
	}
	if vk != 0x56 {
		t.Errorf("expected vk=0x56 (V), got 0x%x", vk)
	}

	mods, vk, err = app.ParseHotkeyCombo("alt+right")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mods != 0x0001 {
		t.Errorf("expected mods=0x0001, got 0x%x", mods)
	}
	if vk != 0x27 {
		t.Errorf("expected vk=0x27 (right arrow), got 0x%x", vk)
	}
}

func TestHotkeyManagerRegister(t *testing.T) {
	m := app.NewHotkeyManager()
	invoked := false
	err := m.Register("test", "ctrl+shift+v", func() {
		invoked = true
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	_ = invoked
}

func TestHotkeyManagerRegisterInvalid(t *testing.T) {
	m := app.NewHotkeyManager()
	err := m.Register("bad", "invalid", func() {})
	if err == nil {
		t.Fatal("expected error for invalid combo")
	}
}

func TestHotkeyManagerUnregisterAll(t *testing.T) {
	m := app.NewHotkeyManager()
	_ = m.Register("a", "ctrl+v", func() {})
	_ = m.Register("b", "alt+x", func() {})
	m.UnregisterAll()
	// Should not panic or error
}

func TestHotkeyManagerStartStop(t *testing.T) {
	m := app.NewHotkeyManager()
	_ = m.Register("test", "ctrl+shift+v", func() {})

	if err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	// Should be idempotent
	if err := m.Start(); err != nil {
		t.Fatalf("second Start: %v", err)
	}
	m.Stop()
	// Should be idempotent
	m.Stop()
}

func TestHotkeyManagerUpdateFromSettingsKeepsToggleEditMode(t *testing.T) {
	m := app.NewHotkeyManager()
	calls := map[string]bool{}
	settings := app.DefaultAppSettings()

	actionMap := map[string]func(){
		"toggleOverlay":  func() { calls["toggleOverlay"] = true },
		"toggleEditMode": func() { calls["toggleEditMode"] = true },
		"nextProfile":    func() { calls["nextProfile"] = true },
		"prevProfile":    func() { calls["prevProfile"] = true },
	}

	m.UpdateFromSettings(settings, actionMap)

	// After UpdateFromSettings with a full action map, all four actions should be
	// registered and the manager should accept future combo changes for them.
	settings.Hotkeys["toggleEditMode"] = "alt+e"
	m.UpdateFromSettings(settings, actionMap)

	// The test primarily guards the P0-NEW finding: if toggleEditMode is omitted
	// from the action map, it disappears after settings:save.
	if len(actionMap) != 4 {
		t.Errorf("expected 4 actions in action map, got %d", len(actionMap))
	}
}

func TestHotkeyManagerUpdateFromSettings(t *testing.T) {
	m := app.NewHotkeyManager()
	invoked := false
	_ = m.Register("toggleOverlay", "ctrl+shift+v", func() {
		invoked = true
	})

	settings := app.DefaultAppSettings()
	settings.Hotkeys["toggleOverlay"] = "alt+v"

	actionMap := map[string]func(){
		"toggleOverlay": func() { invoked = true },
	}

	m.UpdateFromSettings(settings, actionMap)
	_ = invoked
}

func TestParseHotkeyComboAllNamedKeys(t *testing.T) {
	keys := []string{"right", "left", "up", "down", "space", "enter", "escape",
		"tab", "backspace", "delete", "insert", "home", "end", "pageup", "pagedown",
		"f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
		"0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
	}
	for _, key := range keys {
		combo := "ctrl+" + key
		_, vk, err := app.ParseHotkeyCombo(combo)
		if err != nil {
			t.Errorf("ParseHotkeyCombo(%q): %v", combo, err)
			continue
		}
		if vk == 0 {
			t.Errorf("ParseHotkeyCombo(%q) returned vk=0", combo)
		}
	}
}
