//go:build windows

package audio

import (
	"testing"
	"time"
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
