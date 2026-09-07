//go:build !windows

package discordpresence

import (
	"context"
	"errors"
	"io"
)

func dialDiscordPipe(context.Context, string) (io.ReadWriteCloser, error) {
	return nil, errors.New("Discord Rich Presence is only supported on Windows")
}
