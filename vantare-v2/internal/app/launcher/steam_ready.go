package launcher

import (
	"context"
	"fmt"
	"time"
)

// waitForSteamReady observes the game executable, not Steam's URI handler.
func (r *ChainRunner) waitForSteamReady(ctx context.Context, executable string) (ProcessInfo, error) {
	if executable == "" || r.findRunning == nil {
		return ProcessInfo{}, fmt.Errorf("launcher: no se puede verificar el ejecutable de Steam")
	}
	timer := time.NewTimer(r.steamReadyTimeout)
	defer timer.Stop()
	ticker := time.NewTicker(r.processPollInterval)
	defer ticker.Stop()
	for {
		if err := ctx.Err(); err != nil {
			return ProcessInfo{}, err
		}
		processes, err := r.findRunning(ctx, executable)
		if err != nil {
			return ProcessInfo{}, fmt.Errorf("launcher: comprobar proceso de Steam: %w", err)
		}
		for _, process := range processes {
			if process.CreationTime != 0 && ProcessIsReady(ProcessIdentity{ExecutablePath: executable}, process) {
				return process, nil
			}
		}
		select {
		case <-ctx.Done():
			return ProcessInfo{}, ctx.Err()
		case <-timer.C:
			return ProcessInfo{}, fmt.Errorf("launcher: el juego de Steam no apareció en %s", r.steamReadyTimeout)
		case <-ticker.C:
		}
	}
}
