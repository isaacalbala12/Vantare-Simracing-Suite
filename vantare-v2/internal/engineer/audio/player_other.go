//go:build !windows

package audio

import "context"

// Player is a stub on non-Windows platforms.
type Player struct{}

func NewPlayer() *Player {
	return &Player{}
}

func (p *Player) Play(path string) error {
	return ErrPlaybackUnsupported
}

func (p *Player) PlayContext(context.Context, string) error {
	return ErrPlaybackUnsupported
}

func (p *Player) Stop() {}
