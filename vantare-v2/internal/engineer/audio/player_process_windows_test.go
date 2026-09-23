//go:build windows

package audio

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

const processFixtureReady = "VANTARE_AUDIO_TEST_PROCESS_READY"

func TestMain(m *testing.M) {
	if readyPath := os.Getenv(processFixtureReady); readyPath != "" {
		if err := os.WriteFile(readyPath, []byte("ready"), 0o600); err != nil {
			os.Exit(91)
		}
		// Deliberately unresponsive playback process. The real Player must
		// terminate and reap it; no scheduler sleep coordinates the test.
		<-time.After(time.Hour)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func TestPlayerTerminatesActiveProcess(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	fixture, err := os.ReadFile(executable)
	if err != nil {
		t.Fatal(err)
	}
	binDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(binDir, "powershell.exe"), fixture, 0o700); err != nil {
		t.Fatal(err)
	}
	// Only the process-lifecycle tests substitute the executable. The media
	// event tests use Windows PowerShell and WPF themselves.
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	for _, action := range []string{"cancel", "stop", "timeout"} {
		t.Run(action, func(t *testing.T) {
			readyPath := filepath.Join(t.TempDir(), "ready")
			// The fixture bypasses decoding, but playback still validates its input.
			mediaPath := filepath.Join(t.TempDir(), "blocked.mp3")
			if err := os.WriteFile(mediaPath, []byte("fixture"), 0o600); err != nil {
				t.Fatal(err)
			}
			t.Setenv(processFixtureReady, readyPath)
			ctx, cancel := context.WithCancel(context.Background())
			player := NewPlayer()
			done := make(chan error, 1)
			finished := false
			t.Cleanup(func() {
				cancel()
				player.Stop()
				if !finished {
					select {
					case <-done:
					case <-time.After(3 * time.Second):
						t.Error("playback process did not join during cleanup")
					}
				}
			})
			go func() { done <- player.PlayContext(ctx, mediaPath) }()
			// Poll a child-written readiness marker, not an assumed startup
			// duration, before requesting cancellation or Stop.
			poll := time.NewTicker(10 * time.Millisecond)
			defer poll.Stop()
			readyDeadline := time.NewTimer(5 * time.Second)
			defer readyDeadline.Stop()
		ready:
			for {
				select {
				case err := <-done:
					finished = true
					t.Fatalf("playback returned before child readiness: %v", err)
				case <-readyDeadline.C:
					t.Fatal("playback child did not signal readiness")
				case <-poll.C:
					if _, err := os.Stat(readyPath); err == nil {
						break ready
					} else if !errors.Is(err, os.ErrNotExist) {
						t.Fatal(err)
					}
				}
			}
			player.mu.Lock()
			child := player.current
			player.mu.Unlock()
			if child == nil {
				t.Fatal("ready child is not tracked")
			}
			switch action {
			case "cancel":
				cancel()
			case "stop":
				player.Stop()
			}
			wait := 3 * time.Second
			if action == "timeout" {
				wait += maxPlaybackDuration
			}
			select {
			case err := <-done:
				finished = true
				if err == nil {
					t.Fatal("terminated playback reported success")
				}
				if action == "cancel" && !errors.Is(err, context.Canceled) {
					t.Fatalf("cancellation error = %v", err)
				}
				if action == "timeout" && !errors.Is(err, context.DeadlineExceeded) {
					t.Fatalf("timeout error = %v", err)
				}
				var exitErr *exec.ExitError
				if action == "stop" && !errors.As(err, &exitErr) {
					t.Fatalf("Stop did not kill the process: %v", err)
				}
			case <-time.After(wait):
				t.Fatal("playback did not return after termination")
			}
			if child.ProcessState == nil || child.ProcessState.Success() {
				t.Fatalf("child was not reaped after termination: %v", child.ProcessState)
			}
			player.mu.Lock()
			current := player.current
			player.mu.Unlock()
			if current != nil {
				t.Fatal("terminated child is still tracked")
			}
		})
	}
}
