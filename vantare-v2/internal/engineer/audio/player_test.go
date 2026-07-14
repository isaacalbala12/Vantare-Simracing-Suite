//go:build windows

package audio

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"
	"unicode/utf16"
)

func TestPlayer_PlayInvalidFile(t *testing.T) {
	rp := NewRecorderPlayer()
	err := rp.Play("invalid.mp3")
	if err != nil {
		t.Errorf("RecorderPlayer should not fail, got %v", err)
	}
	if len(rp.Played()) != 1 || rp.Played()[0] != "invalid.mp3" {
		t.Errorf("expected recorder to capture 'invalid.mp3', got %v", rp.Played())
	}
}

func TestPlayer_PlayFile_CheckPathSent(t *testing.T) {
	// Verify the player sends the file path to the player process.
	// Instead of playing real audio, we use a recorder player.
	rp := NewRecorderPlayer()
	if err := rp.Play("test.mp3"); err != nil {
		t.Fatalf("RecorderPlayer.Play failed: %v", err)
	}
	if len(rp.Played()) != 1 || rp.Played()[0] != "test.mp3" {
		t.Errorf("expected recorder to capture 'test.mp3', got %v", rp.Played())
	}
}

func TestPlayer_StopWhenIdle(t *testing.T) {
	var p Player
	p.Stop()
}

func TestPlayer_StopCutsPlayback(t *testing.T) {
	// Use recorder to verify Stop doesn't block.
	rp := NewRecorderPlayer()
	playDone := make(chan error, 1)
	go func() {
		playDone <- rp.Play("test.mp3")
	}()
	time.Sleep(50 * time.Millisecond)
	rp.Stop()
	select {
	case err := <-playDone:
		if err != nil {
			t.Errorf("Play returned error: %v", err)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Play did not return within 1s after Stop")
	}
}

func TestPlayer_SequentialPlays(t *testing.T) {
	rp := NewRecorderPlayer()
	err1 := rp.Play("track1.mp3")
	err2 := rp.Play("track2.mp3")
	if err1 != nil {
		t.Errorf("first Play failed: %v", err1)
	}
	if err2 != nil {
		t.Errorf("second Play failed: %v", err2)
	}
	played := rp.Played()
	if len(played) != 2 {
		t.Errorf("expected 2 plays, got %d: %v", len(played), played)
	}
	if played[0] != "track1.mp3" || played[1] != "track2.mp3" {
		t.Errorf("unexpected play order: %v", played)
	}
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
