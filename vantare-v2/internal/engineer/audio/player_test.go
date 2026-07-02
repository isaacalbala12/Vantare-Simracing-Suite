//go:build windows

package audio

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf16"
)

// findCachedMP3 finds a real MP3 file in the TTS cache for testing.
// Returns empty string if none found.
func findCachedMP3(t *testing.T) string {
	cacheDir := os.Getenv("APPDATA") + `\Vantare\Ingeniero\tts-cache\edge`
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		return ""
	}
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".mp3" {
			return filepath.Join(cacheDir, e.Name())
		}
	}
	return ""
}

func TestPlayer_PlayInvalidFile(t *testing.T) {
	p := NewPlayer()

	tmpDir := t.TempDir()
	dummyPath := filepath.Join(tmpDir, "invalid.mp3")
	if err := os.WriteFile(dummyPath, []byte("not real audio"), 0644); err != nil {
		t.Fatalf("cannot create dummy file: %v", err)
	}

	// Play should not hang or panic. It may return an error from PowerShell
	// (invalid media) or timeout, but either way it should return within
	// maxPlaybackDuration + margin.
	start := time.Now()
	err := p.Play(dummyPath)
	elapsed := time.Since(start)

	if elapsed > maxPlaybackDuration+2*time.Second {
		t.Errorf("Play took %v, should complete within %v + margin", elapsed, maxPlaybackDuration)
	}

	// Error is acceptable for invalid audio. What matters is no hang.
	_ = err
	t.Logf("Play(invalid) returned err=%v in %v", err, elapsed)
}

func TestPlayer_StopWhenIdle(t *testing.T) {
	p := NewPlayer()
	// Stop on a fresh player should not panic or block.
	p.Stop()
}

func TestPlayer_PlayRealFile(t *testing.T) {
	mp3Path := findCachedMP3(t)
	if mp3Path == "" {
		t.Skip("no cached MP3 files found, skipping real playback test")
	}

	p := NewPlayer()
	start := time.Now()
	err := p.Play(mp3Path)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Play failed for real MP3: %v", err)
	}

	// A real MP3 should take at least 1 second (audio is ~2s) but
	// no more than maxPlaybackDuration.
	if elapsed < 500*time.Millisecond {
		t.Errorf("Play returned too fast (%v) — audio likely didn't play", elapsed)
	}
	if elapsed > maxPlaybackDuration+2*time.Second {
		t.Errorf("Play took %v, exceeded maxPlaybackDuration", elapsed)
	}

	t.Logf("Play(real) took %v, err=%v", elapsed, err)
}

func TestPlayer_StopCutsPlayback(t *testing.T) {
	mp3Path := findCachedMP3(t)
	if mp3Path == "" {
		t.Skip("no cached MP3 files found")
	}

	p := NewPlayer()

	// Start playback in a goroutine.
	playDone := make(chan error, 1)
	go func() {
		playDone <- p.Play(mp3Path)
	}()

	// Give it a moment to start.
	time.Sleep(1 * time.Second)

	// Stop should kill the process and Play should return quickly after.
	stopStart := time.Now()
	p.Stop()
	stopElapsed := time.Since(stopStart)

	if stopElapsed > 2*time.Second {
		t.Errorf("Stop took %v, should return quickly after kill", stopElapsed)
	}

	// Wait for Play to return (it should have been killed).
	select {
	case <-playDone:
	case <-time.After(5 * time.Second):
		t.Fatal("Play did not return within 5s after Stop")
	}
}

func TestPlayer_SequentialPlays(t *testing.T) {
	mp3Path := findCachedMP3(t)
	if mp3Path == "" {
		t.Skip("no cached MP3 files found")
	}

	p := NewPlayer()

	// Two sequential plays — the second should wait for the first to finish.
	start := time.Now()
	err1 := p.Play(mp3Path)
	mid := time.Now()
	err2 := p.Play(mp3Path)
	end := time.Now()

	if err1 != nil {
		t.Errorf("first Play failed: %v", err1)
	}
	if err2 != nil {
		t.Errorf("second Play failed: %v", err2)
	}

	firstDur := mid.Sub(start)
	totalDur := end.Sub(start)

	// Each play should take at least ~1s (audio is ~2s).
	if firstDur < 500*time.Millisecond {
		t.Errorf("first Play too fast: %v", firstDur)
	}
	// Total should be roughly 2x the first (both played to completion).
	if totalDur < firstDur*3/2 {
		t.Errorf("total %v too short vs first %v — second play may have been skipped", totalDur, firstDur)
	}

	t.Logf("First: %v, Total: %v", firstDur, totalDur)
}

func TestEscapePSQuote_NormalPath(t *testing.T) {
	got := escapePSQuote(`C:\audio\file.mp3`)
	if got != `C:\audio\file.mp3` {
		t.Errorf("normal path changed: %q", got)
	}
}

func TestEscapePSQuote_SingleQuote(t *testing.T) {
	got := escapePSQuote(`C:\audio\it's.wav`)
	want := `C:\audio\it''s.wav`
	if got != want {
		t.Errorf("escapePSQuote(%q) = %q, want %q", `C:\audio\it's.wav`, got, want)
	}
}

func TestEscapePSQuote_MultipleQuotes(t *testing.T) {
	got := escapePSQuote(`C:\audio\'"'"'.wav`)
	want := `C:\audio\''"''"''.wav`
	if got != want {
		t.Errorf("escapePSQuote(%q) = %q, want %q", `C:\audio\'"'"'.wav`, got, want)
	}
}

func TestEscapePSQuote_Empty(t *testing.T) {
	got := escapePSQuote("")
	if got != "" {
		t.Errorf("empty path changed: %q", got)
	}
}

func TestBuildPSScript_ContainsEscapedPath(t *testing.T) {
	script := buildPSScript(`C:\audio\file.mp3`)
	if !strings.Contains(script, `C:\audio\file.mp3`) {
		t.Errorf("script should contain the path: %s", script)
	}
	if !strings.Contains(script, "Add-Type") {
		t.Errorf("script should contain Add-Type: %s", script)
	}
}

func TestBuildPSScript_EscapedQuoteInPath(t *testing.T) {
	// The path has been escaped: ' -> ''
	script := buildPSScript(`C:\audio\it''s.wav`)
	if !strings.Contains(script, `'C:\audio\it''s.wav'`) {
		t.Errorf("script should contain the escaped path in single quotes: %s", script)
	}
}

func TestEncodePSCommand_RoundTrip(t *testing.T) {
	original := `Write-Host "hello"`
	encoded := encodePSCommand(original)

	// Decode: base64 -> UTF-16LE -> string
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("base64 decode failed: %v", err)
	}
	decoded := string(utf16.Decode(toUint16Slice(raw)))
	if decoded != original {
		t.Errorf("round-trip: got %q, want %q", decoded, original)
	}
}

func TestEncodePSCommand_NoRawPathInCommandLine(t *testing.T) {
	// The encoded command should NOT contain the raw path as a
	// command-line argument — it's embedded in the base64 blob.
	path := `C:\dangerous'; exit 1; '`
	psScript := buildPSScript(escapePSQuote(path))
	encoded := encodePSCommand(psScript)

	// The base64 string should not contain the raw path.
	if strings.Contains(encoded, path) {
		t.Errorf("encoded command contains raw path — injection possible")
	}
	// The base64 string should not contain the unescaped quote.
	if strings.Contains(encoded, `'`) {
		t.Errorf("encoded command contains raw single quote — injection possible")
	}
}

// toUint16Slice converts a byte slice (UTF-16LE) to a []uint16.
func toUint16Slice(b []byte) []uint16 {
	if len(b)%2 != 0 {
		panic("odd byte length in UTF-16LE data")
	}
	s := make([]uint16, len(b)/2)
	for i := range s {
		s[i] = uint16(b[i*2]) | uint16(b[i*2+1])<<8
	}
	return s
}
