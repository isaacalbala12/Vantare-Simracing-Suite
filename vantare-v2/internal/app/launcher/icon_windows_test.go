//go:build windows

package launcher

import (
	"bytes"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetAppIconNotepad(t *testing.T) {
	p := filepath.Join(os.Getenv("SystemRoot"), "System32", "notepad.exe")
	if !fileExists(p) {
		t.Skip("notepad.exe not found")
	}
	b := GetAppIcon(p)
	if len(b) == 0 {
		t.Fatalf("expected non-empty icon bytes for %s", p)
	}
}

func TestGetAppIconForManualExecutable(t *testing.T) {
	p := filepath.Join(os.Getenv("SystemRoot"), "System32", "notepad.exe")
	if !fileExists(p) {
		t.Skip("notepad.exe not found")
	}
	b := GetAppIconForApp("manual-notepad", p)
	if len(b) == 0 {
		t.Fatalf("expected non-empty icon bytes for manual executable %s", p)
	}
	img, err := png.Decode(bytes.NewReader(b))
	if err != nil {
		t.Fatalf("decode manual executable icon: %v", err)
	}
	if img.Bounds().Dx() < 48 || img.Bounds().Dy() < 48 {
		t.Fatalf("manual executable icon too small: %dx%d", img.Bounds().Dx(), img.Bounds().Dy())
	}
}

func TestResolveDiscordLnk(t *testing.T) {
	desktop := filepath.Join(os.Getenv("USERPROFILE"), "Desktop")
	lnk := filepath.Join(desktop, "Discord.lnk")
	if !fileExists(lnk) {
		t.Skip("Discord.lnk not present on this machine")
	}
	target := resolveLnkTarget(lnk)
	if target == "" {
		t.Fatalf("failed to resolve target of %s", lnk)
	}
	t.Logf("Discord.lnk -> %s", target)
	if !strings.Contains(strings.ToLower(target), "discord") {
		t.Fatalf("unexpected shortcut target %q", target)
	}
}

func TestGetAppIconForAppDiscord(t *testing.T) {
	desktop := filepath.Join(os.Getenv("USERPROFILE"), "Desktop")
	lnk := filepath.Join(desktop, "Discord.lnk")
	if !fileExists(lnk) {
		t.Skip("Discord.lnk not present on this machine")
	}
	// Resolve the shortcut and only assert extraction when the target exists
	// (on dev machines Discord may be uninstalled but the .lnk lingers).
	target := resolveLnkTarget(lnk)
	if target == "" || !fileExists(target) {
		t.Skipf("Discord target not present (%q); cannot validate extraction here", target)
	}
	b := GetAppIconForApp("discord", `C:\__vantare_test__\Discord.exe`)
	if len(b) == 0 {
		t.Fatalf("expected icon bytes resolved from Discord.lnk fallback")
	}
}

// TestExtractIconFromLnk verifies that ExtractIconExW on a .lnk whose target
// exists returns a valid icon. Uses a temporary shortcut to notepad.exe.
func TestExtractIconFromLnk(t *testing.T) {
	lnk := filepath.Join(os.TempDir(), "vantare_test_notepad.lnk")
	if !fileExists(lnk) {
		t.Skip("test shortcut not present; create it first")
	}
	b, err := getIconViaSHGetFileInfo(lnk)
	if err != nil {
		t.Fatalf("getIconViaSHGetFileInfo(.lnk) error: %v", err)
	}
	if len(b) == 0 {
		t.Fatalf("expected icon bytes from .lnk shortcut")
	}
}

// TestGetIconHighResDimensions verifies the high-resolution extraction returns
// a PNG larger than the legacy 32x32, so it stays crisp when scaled in the UI.
func TestGetIconHighResDimensions(t *testing.T) {
	p := filepath.Join(os.Getenv("SystemRoot"), "System32", "notepad.exe")
	if !fileExists(p) {
		t.Skip("notepad.exe not found")
	}
	b, err := getIconHighRes(p)
	if err != nil {
		t.Fatalf("high-res extraction failed: %v", err)
	}
	if len(b) == 0 {
		t.Fatalf("expected high-res icon bytes")
	}
	img, err := png.Decode(bytes.NewReader(b))
	if err != nil {
		t.Fatalf("decode png: %v", err)
	}
	w := img.Bounds().Dx()
	h := img.Bounds().Dy()
	t.Logf("high-res icon size: %dx%d", w, h)
	if w < 48 || h < 48 {
		t.Fatalf("icon too small (%dx%d); expected >=48 for crisp UI", w, h)
	}
}
