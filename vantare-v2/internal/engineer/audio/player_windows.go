//go:build windows

package audio

import (
	"encoding/base64"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf16"
)

// maxPlaybackDuration is the maximum time a single playback can take
// before it's killed. Spotter phrases are 1-3 seconds; 8s gives margin.
const maxPlaybackDuration = 8 * time.Second

// killTimeout is how long we wait after killing a process before giving up.
const killTimeout = 2 * time.Second

// Player plays audio files on Windows using WPF MediaPlayer via a
// PowerShell subprocess. Play() blocks until the audio finishes or
// the timeout elapses, ensuring the queueLoop doesn't cut off audio
// mid-playback.
type Player struct {
	mu      sync.Mutex
	current *exec.Cmd
}

func NewPlayer() *Player {
	return &Player{}
}

// escapePSQuote escapes a PowerShell single-quoted string literal.
// In PowerShell, ” inside a single-quoted string is a literal '.
func escapePSQuote(path string) string {
	return strings.ReplaceAll(path, "'", "''")
}

// buildPSScript returns a PowerShell script that plays the given
// audio path using WPF MediaPlayer. The path must already be escaped
// for single-quote context (see escapePSQuote).
func buildPSScript(escapedPath string) string {
	return fmt.Sprintf(
		`try { `+
			`Add-Type -AssemblyName presentationCore -ErrorAction Stop; `+
			`$p = New-Object System.Windows.Media.MediaPlayer; `+
			`$p.Open([uri]'%s'); `+
			`Start-Sleep -Milliseconds 200; `+
			`if ($p.NaturalDuration.HasTimeSpan) { `+
			`$secs = [math]::Ceiling($p.NaturalDuration.TimeSpan.TotalSeconds + 0.5) `+
			`} else { $secs = 3 }; `+
			`$p.Play(); `+
			`Start-Sleep -Seconds $secs; `+
			`$p.Close() `+
			`} catch { exit 1 }`,
		escapedPath,
	)
}

// encodePSCommand encodes a PowerShell script as UTF-16LE base64
// for use with powershell -EncodedCommand. This prevents any
// command-line injection via the script content.
func encodePSCommand(script string) string {
	utf16le := encodeUTF16LE(script)
	return base64.StdEncoding.EncodeToString(utf16le)
}

// encodeUTF16LE encodes a string as UTF-16LE bytes (no BOM).
func encodeUTF16LE(s string) []byte {
	runes := []rune(s)
	encoded := utf16.Encode(runes)
	buf := make([]byte, len(encoded)*2)
	for i, r := range encoded {
		buf[i*2] = byte(r)
		buf[i*2+1] = byte(r >> 8)
	}
	return buf
}

// Play plays an audio file and blocks until playback completes or
// maxPlaybackDuration elapses. If audio is already playing, it stops
// the previous playback first. Returns an error if the file cannot
// be played or the process times out.
func (p *Player) Play(path string) error {
	p.mu.Lock()

	// Stop any currently playing audio.
	p.stopLocked()

	absPath, err := filepath.Abs(path)
	if err != nil {
		p.mu.Unlock()
		return fmt.Errorf("audio: cannot resolve path: %w", err)
	}

	// Build a PowerShell script with the path safely embedded via
	// single-quote escaping (PS convention: '' inside '' = literal ').
	// Then encode the entire script as UTF-16LE base64 (-EncodedCommand)
	// to prevent command-line injection regardless of path contents.
	psScript := buildPSScript(escapePSQuote(absPath))
	encoded := encodePSCommand(psScript)

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded)
	// Do NOT set cmd.Stderr — it creates a pipe that blocks cmd.Wait()
	// after Kill(). We rely on the exit code for error detection.

	if err := cmd.Start(); err != nil {
		p.mu.Unlock()
		return fmt.Errorf("audio: cannot start playback: %w", err)
	}
	p.current = cmd
	p.mu.Unlock()

	// Wait for playback with timeout.
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case err := <-done:
		p.mu.Lock()
		p.current = nil
		p.mu.Unlock()
		if err != nil {
			return fmt.Errorf("audio: playback error: %w", err)
		}
		return nil
	case <-time.After(maxPlaybackDuration):
		// Timeout — kill the process and wait briefly.
		_ = cmd.Process.Kill()
		select {
		case <-done:
		case <-time.After(killTimeout):
			// Process won't die — abandon it.
		}
		p.mu.Lock()
		p.current = nil
		p.mu.Unlock()
		return fmt.Errorf("audio: playback timed out after %v", maxPlaybackDuration)
	}
}

// Stop kills any currently playing audio process.
func (p *Player) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stopLocked()
}

// stopLocked kills the current process. Must be called with mu held.
func (p *Player) stopLocked() {
	if p.current != nil && p.current.Process != nil {
		_ = p.current.Process.Kill()
		// Wait briefly for the process to die — don't block forever.
		done := make(chan struct{})
		go func() {
			_ = p.current.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(killTimeout):
		}
	}
	p.current = nil
}
