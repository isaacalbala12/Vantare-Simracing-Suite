//go:build windows

package audio

import "sync"

// RecorderPlayer implements the AudioPlayer interface for testing.
// Instead of playing audio, it records the paths passed to Play.
type RecorderPlayer struct {
	mu     sync.Mutex
	played []string
}

// NewRecorderPlayer creates a RecorderPlayer.
func NewRecorderPlayer() *RecorderPlayer {
	return &RecorderPlayer{
		played: make([]string, 0),
	}
}

// Play records the path and returns nil (no actual audio playback).
func (p *RecorderPlayer) Play(path string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.played = append(p.played, path)
	return nil
}

// Played returns the list of paths that were played.
func (p *RecorderPlayer) Played() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]string, len(p.played))
	copy(out, p.played)
	return out
}

// Stop is a no-op for the RecorderPlayer.
func (p *RecorderPlayer) Stop() {}