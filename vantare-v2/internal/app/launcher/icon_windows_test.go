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

// TestGetAppIconForAppCacheAndInvalidation proves the icon cache returns the
// exact same bytes on a second call (even when the source file is gone) and
// that resetShortcutIndex drops the cached entry so the source is re-probed.
func TestGetAppIconForAppCacheAndInvalidation(t *testing.T) {
	src := filepath.Join(os.Getenv("SystemRoot"), "System32", "notepad.exe")
	if !fileExists(src) {
		t.Skip("notepad.exe not found")
	}
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatalf("read notepad.exe: %v", err)
	}
	probe := filepath.Join(t.TempDir(), "vantare-cache-probe.exe")
	if err := os.WriteFile(probe, data, 0o644); err != nil {
		t.Fatalf("write probe executable: %v", err)
	}

	first := GetAppIconForApp("cache-probe", probe)
	if len(first) == 0 {
		t.Fatal("expected icon bytes from probe executable before removal")
	}
	if err := os.Remove(probe); err != nil {
		t.Fatalf("remove probe executable: %v", err)
	}
	// The source is gone, so a non-empty result can only come from the cache.
	second := GetAppIconForApp("cache-probe", probe)
	if !bytes.Equal(first, second) {
		t.Fatal("cached icon must be byte-identical to the first resolution")
	}

	resetShortcutIndex()
	third := GetAppIconForApp("cache-probe", probe)
	if len(third) != 0 {
		t.Fatal("expected no icon after cache invalidation with the source removed")
	}
}

// TestShortcutNameHintsExcludesGeneric verifies the shortcut index does not
// resolve every .lnk whose name contains a generic executable base like "app"
// or "update": those matches are mostly unrelated shortcuts, and each resolve
// is a serialized COM round-trip that slows the first scan.
func TestShortcutNameHintsExcludesGeneric(t *testing.T) {
	hints := shortcutNameHints()
	hintSet := map[string]bool{}
	for _, h := range hints {
		hintSet[h] = true
	}
	if hintSet["app"] || hintSet["update"] {
		t.Fatalf("generic executable hints must be excluded, got %v", hints)
	}
	for _, required := range []string{"discord", "obs studio", "motec", "simhub", "spotify", "crewchiefv4"} {
		if !hintSet[required] {
			t.Errorf("expected hint %q to be present, got %v", required, hints)
		}
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
