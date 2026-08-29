//go:build windows

package sensor

import "testing"

func TestOwnsWebViewByExactUserDataDir(t *testing.T) {
	profile := `C:\Users\isaac\AppData\Roaming\vantare-isa944.exe\EBWebView`
	command := `"C:\Program Files\EdgeWebView\msedgewebview2.exe" --type=renderer --user-data-dir="` + profile + `"`
	if !ownsWebViewCommandLine(command, profile) {
		t.Fatal("own profile not detected")
	}
	if ownsWebViewCommandLine(command, `C:\Other\EBWebView`) {
		t.Fatal("foreign profile detected as own")
	}
}
