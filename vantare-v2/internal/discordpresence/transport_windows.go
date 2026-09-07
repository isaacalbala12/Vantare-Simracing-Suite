//go:build windows

package discordpresence

import (
	"context"
	"io"

	"github.com/Microsoft/go-winio"
)

func dialDiscordPipe(ctx context.Context, path string) (io.ReadWriteCloser, error) {
	return winio.DialPipeContext(ctx, path)
}
