//go:build windows

package launcher

import "testing"

func TestParseHotkeyString(t *testing.T) {
	t.Run("ctrl+shift+1", func(t *testing.T) {
		mods, vk, err := ParseHotkeyString("ctrl+shift+1")
		if err != nil {
			t.Fatal(err)
		}
		if mods&MOD_CONTROL == 0 {
			t.Error("expected MOD_CONTROL flag")
		}
		if mods&MOD_SHIFT == 0 {
			t.Error("expected MOD_SHIFT flag")
		}
		if vk != 0x31 {
			t.Errorf("expected VK_1=0x31, got %x", vk)
		}
	})

	t.Run("alt+a", func(t *testing.T) {
		mods, vk, err := ParseHotkeyString("alt+a")
		if err != nil {
			t.Fatal(err)
		}
		if mods&MOD_ALT == 0 {
			t.Error("expected MOD_ALT flag")
		}
		if vk != 0x61 { // 'a' lowercased
			t.Errorf("expected 'a'=0x61, got %x", vk)
		}
	})

	t.Run("win+e", func(t *testing.T) {
		mods, _, err := ParseHotkeyString("win+e")
		if err != nil {
			t.Fatal(err)
		}
		if mods&MOD_WIN == 0 {
			t.Error("expected MOD_WIN flag")
		}
	})

	t.Run("no modifiers", func(t *testing.T) {
		_, _, err := ParseHotkeyString("a")
		if err == nil {
			t.Error("expected error for hotkey without modifiers")
		}
	})

	t.Run("unknown modifier", func(t *testing.T) {
		_, _, err := ParseHotkeyString("super+a")
		if err == nil {
			t.Error("expected error for unknown modifier")
		}
	})

	t.Run("multi-char key", func(t *testing.T) {
		_, _, err := ParseHotkeyString("ctrl+enter")
		if err == nil {
			t.Error("expected error for multi-char key")
		}
	})

	t.Run("ctrl+shift+f12", func(t *testing.T) {
		_, _, err := ParseHotkeyString("ctrl+shift+f12")
		if err == nil {
			t.Error("expected error for multi-char key 'f12'")
		}
	})
}

func TestHotkeyWhitelistRejectsReserved(t *testing.T) {
	rejected := []string{
		"ctrl+c", "Ctrl+C", "ctrl+v", "ctrl+x", "ctrl+z",
		"alt+f4", "alt+tab", "win+l",
	}
	for _, combo := range rejected {
		if IsHotkeyAllowed(combo) {
			t.Errorf("%s should be rejected", combo)
		}
	}

	allowed := []string{
		"ctrl+shift+1", "alt+shift+a", "ctrl+alt+del",
	}
	for _, combo := range allowed {
		if !IsHotkeyAllowed(combo) {
			t.Errorf("%s should be allowed", combo)
		}
	}
}

func TestHotkeyReregistrationIdempotent(t *testing.T) {
	mgr := NewHotkeyManager()
	defer mgr.Unregister("profile-1")

	// Register a hotkey.
	if err := mgr.Register("profile-1", "ctrl+shift+1"); err != nil {
		t.Fatalf("first Register: %v", err)
	}
	if len(mgr.active) != 1 {
		t.Fatalf("expected 1 active hotkey, got %d", len(mgr.active))
	}
	firstID := mgr.active["profile-1"]

	// Re-register the same combo for the same profile (idempotent: replaces).
	if err := mgr.Register("profile-1", "ctrl+shift+1"); err != nil {
		t.Fatalf("second Register: %v", err)
	}
	if len(mgr.active) != 1 {
		t.Fatalf("expected 1 active hotkey after re-register, got %d", len(mgr.active))
	}
	secondID := mgr.active["profile-1"]
	if firstID == secondID {
		t.Error("expected a new hotkey ID after re-registration")
	}
}

func TestHotkeyManagerReRegisterAll(t *testing.T) {
	mgr := NewHotkeyManager()
	defer func() {
		mgr.Unregister("profile-1")
		mgr.Unregister("profile-2")
	}()

	// Register two hotkeys.
	if err := mgr.Register("profile-1", "ctrl+shift+1"); err != nil {
		t.Fatalf("Register profile-1: %v", err)
	}
	if err := mgr.Register("profile-2", "alt+shift+a"); err != nil {
		t.Fatalf("Register profile-2: %v", err)
	}

	// ReRegisterAll must not lose entries.
	mgr.ReRegisterAll()

	if len(mgr.active) != 2 {
		t.Errorf("expected 2 active hotkeys after ReRegisterAll, got %d", len(mgr.active))
	}
	if _, ok := mgr.active["profile-1"]; !ok {
		t.Error("profile-1 should still be active")
	}
	if _, ok := mgr.active["profile-2"]; !ok {
		t.Error("profile-2 should still be active")
	}
}
