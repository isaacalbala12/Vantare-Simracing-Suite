//go:build windows

package audio

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
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
// PowerShell recognizes ASCII and typographic single quotes as delimiters;
// doubling each one preserves the original character inside the literal.
func escapePSQuote(path string) string {
	return strings.NewReplacer(
		"'", "''", "‘", "‘‘", "’", "’’", "‚", "‚‚", "‛", "‛‛",
	).Replace(path)
}

// buildPSScript returns a PowerShell script that plays the given
// audio path using WPF MediaPlayer. The path must already be escaped
// for single-quote context (see escapePSQuote).
func buildPSScript(escapedPath string) string {
	// WPF delivers media events through its dispatcher. Handlers mutate a
	// shared object because PowerShell delegates execute in a local scope.
	return fmt.Sprintf(`$ErrorActionPreference = 'Stop';
$state = @{ ExitCode = 1 };
$p = $null;
try {
    Add-Type -AssemblyName PresentationCore;
    $p = New-Object System.Windows.Media.MediaPlayer;
    $frame = New-Object System.Windows.Threading.DispatcherFrame;
    $p.add_MediaOpened({
        try { $p.Play() }
        catch { $state.ExitCode = 1; $frame.Continue = $false }
    });
    $p.add_MediaEnded({ $state.ExitCode = 0; $frame.Continue = $false });
    $p.add_MediaFailed({ $state.ExitCode = 1; $frame.Continue = $false });
    $p.Open([uri]'%s');
    [System.Windows.Threading.Dispatcher]::PushFrame($frame);
} catch {
    $state.ExitCode = 1;
} finally {
    if ($null -ne $p) {
        try { $p.Close() }
        catch { $state.ExitCode = 1 }
    }
}
exit $state.ExitCode;`, escapedPath)
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
	return p.PlayContext(context.Background(), path)
}

// PlayContext plays one file and stops the child process when the caller
// cancels. It performs no detached wait goroutine; the caller owns the
// lifecycle and joins this blocking call.
func (p *Player) PlayContext(ctx context.Context, path string) error {
	playCtx, cancel := context.WithTimeout(ctx, maxPlaybackDuration)
	defer cancel()

	if err := playCtx.Err(); err != nil {
		return fmt.Errorf("audio: playback cancelled: %w", err)
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("audio: cannot resolve path: %w", err)
	}
	// Missing local media does not need WPF or its asynchronous failure event.
	// Validate before stopping a valid playback. MediaFailed still handles a
	// file removed after this check, unreadable content and decoder errors.
	info, err := os.Stat(absPath)
	if err != nil {
		return fmt.Errorf("audio: cannot access media: %w", err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("audio: media is not a regular file: %w", os.ErrInvalid)
	}

	p.mu.Lock()
	if err := playCtx.Err(); err != nil {
		p.mu.Unlock()
		return fmt.Errorf("audio: playback cancelled: %w", err)
	}
	// Stop any currently playing audio only after accepting the new request.
	p.stopLocked()

	// Build a PowerShell script with the path safely embedded via
	// single-quote escaping (PS convention: '' inside '' = literal ').
	// Then encode the entire script as UTF-16LE base64 (-EncodedCommand)
	// to prevent command-line injection regardless of path contents.
	psScript := buildPSScript(escapePSQuote(absPath))
	encoded := encodePSCommand(psScript)

	cmd := exec.CommandContext(playCtx, "powershell", "-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", encoded)
	// Do NOT set cmd.Stderr — it creates a pipe that blocks cmd.Wait()
	// after Kill(). We rely on the exit code for error detection.

	if err := cmd.Start(); err != nil {
		p.mu.Unlock()
		return fmt.Errorf("audio: cannot start playback: %w", err)
	}
	p.current = cmd
	p.mu.Unlock()

	err = cmd.Wait()
	p.mu.Lock()
	if p.current == cmd {
		p.current = nil
	}
	p.mu.Unlock()
	if playCtx.Err() != nil {
		return fmt.Errorf("audio: playback cancelled: %w", playCtx.Err())
	}
	if err != nil {
		return fmt.Errorf("audio: playback error: %w", err)
	}
	return nil
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
	}
	p.current = nil
}
