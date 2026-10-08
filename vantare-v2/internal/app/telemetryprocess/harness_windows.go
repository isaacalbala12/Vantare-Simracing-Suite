//go:build windows

package telemetryprocess

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"golang.org/x/sys/windows"
)

// harnessSession proves the host/child lifecycle without reading LMU or
// publishing to product consumers. It is not a selectable telemetry backend.
type harnessSession struct {
	pipe    *os.File
	child   *childProcess
	once    sync.Once
	stopErr error
}

func startHarness(ctx context.Context, executable, expectedVersion string) (*harnessSession, error) {
	if ctx == nil {
		return nil, errors.New("telemetry harness requires a context")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	pipe, err := newLocalPipe()
	if err != nil {
		return nil, err
	}
	child, err := startInJob(executable, "--harness-pipe", pipe.name,
		"--harness-nonce", hex.EncodeToString(pipe.nonce[:]))
	if err != nil {
		_ = pipe.close()
		return nil, err
	}
	if err := pipe.acceptChild(ctx, child.pid); err != nil {
		_ = pipe.close()
		_ = child.close()
		return nil, err
	}
	file := os.NewFile(uintptr(pipe.handle), "telemetry-pipe")
	if err := file.SetReadDeadline(time.Now().Add(pipeAcceptTimeout)); err != nil {
		_ = file.Close()
		_ = child.close()
		return nil, fmt.Errorf("set telemetry handshake deadline: %w", err)
	}
	frame, err := ReadFrame(file)
	if err == nil {
		err = verifyHandshake(frame, pipe.nonce, expectedVersion)
	}
	if err != nil {
		_ = file.Close()
		_ = child.close()
		return nil, fmt.Errorf("validate telemetry child handshake: %w", err)
	}
	if err := file.SetReadDeadline(time.Time{}); err != nil {
		_ = file.Close()
		_ = child.close()
		return nil, fmt.Errorf("clear telemetry handshake deadline: %w", err)
	}
	return &harnessSession{pipe: file, child: child}, nil
}

func (session *harnessSession) close() error {
	session.once.Do(func() {
		if err := session.pipe.SetWriteDeadline(time.Now().Add(childShutdownTimeout)); err != nil {
			session.stopErr = errors.Join(session.stopErr, fmt.Errorf("set telemetry Stop deadline: %w", err))
		} else if err := WriteFrame(session.pipe, Frame{Kind: KindStop}); err != nil {
			session.stopErr = errors.Join(session.stopErr, fmt.Errorf("send telemetry Stop: %w", err))
		}
		result, err := windows.WaitForSingleObject(session.child.process, uint32(childShutdownTimeout.Milliseconds()))
		if err != nil || result != windows.WAIT_OBJECT_0 {
			session.stopErr = errors.Join(session.stopErr, fmt.Errorf("telemetry child did not stop cleanly: result=%d error=%v", result, err))
		} else {
			var exitCode uint32
			if err := windows.GetExitCodeProcess(session.child.process, &exitCode); err != nil || exitCode != 0 {
				session.stopErr = errors.Join(session.stopErr, fmt.Errorf("telemetry child exit code=%d: %v", exitCode, err))
			}
		}
		if err := session.pipe.Close(); err != nil {
			session.stopErr = errors.Join(session.stopErr, fmt.Errorf("close telemetry pipe: %w", err))
		}
		if err := session.child.close(); err != nil {
			session.stopErr = errors.Join(session.stopErr, err)
		}
	})
	return session.stopErr
}
