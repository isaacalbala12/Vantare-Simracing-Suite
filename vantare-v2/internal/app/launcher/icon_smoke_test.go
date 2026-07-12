//go:build windows

package launcher

import (
	"bytes"
	"fmt"
	"image/png"
	"testing"
)

func pngDimensions(data []byte) string {
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return fmt.Sprintf("decode-error:%v", err)
	}
	return fmt.Sprintf("%dx%d", img.Bounds().Dx(), img.Bounds().Dy())
}

// TestDiscoverIconsSmoke exercises the exact path the running app uses to
// populate AppBadge icons: discover installed apps, then extract each icon.
// It is environment-dependent (reads the registry / desktop) and meant as a
// manual smoke check, not a CI unit test.
func TestDiscoverIconsSmoke(t *testing.T) {
	found := Discover()
	if len(found) == 0 {
		t.Skip("no apps discovered on this machine")
	}
	for id, app := range found {
		exeExists := app.ExecutablePath != "" && fileExists(app.ExecutablePath)
		icon := GetAppIconForApp(id, app.ExecutablePath)
		iconLen := len(icon)
		fmt.Printf("APP id=%-10s name=%-22s detected=%v exe=%q exeExists=%v iconBytes=%d sourceDims=%s\n",
			id, app.DisplayName, app.Detected, app.ExecutablePath, exeExists, iconLen, pngDimensions(icon))
	}
	// Spotlight the three apps from the previous session.
	for _, id := range []string{"discord", "motec", "simhub"} {
		app, ok := found[id]
		if !ok {
			fmt.Printf("SPOTLIGHT %s: NOT discovered on this machine\n", id)
			continue
		}
		icon := GetAppIconForApp(id, app.ExecutablePath)
		status := "NO ICON"
		if len(icon) > 0 {
			status = fmt.Sprintf("ICON OK (%d bytes)", len(icon))
		}
		fmt.Printf("SPOTLIGHT %s -> %s (exe=%q exists=%v sourceDims=%s)\n", id, status, app.ExecutablePath, fileExists(app.ExecutablePath), pngDimensions(icon))
	}
}
