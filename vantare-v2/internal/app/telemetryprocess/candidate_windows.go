//go:build windows

package telemetryprocess

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"time"

	"golang.org/x/sys/windows"
)

const candidateHeartbeatTimeout = time.Second
const candidateRestartLimit = 3
const candidateRestartWindow = time.Minute

var ErrCandidateHeartbeatTimeout = errors.New("Rust telemetry heartbeat timed out")
var ErrCandidateRestartLimit = errors.New("Rust telemetry restart budget exhausted")

// RunCandidate supervises an explicit Rust candidate. Callers must clear any
// published state in disconnected before a new child is started. It is not
// selected by the Wails runtime until the migration gates are satisfied.
func RunCandidate(ctx context.Context, executable string, configuration ConfigurationV1,
	deliver func(ReceivedV1) error, disconnected func(error)) error {
	if ctx == nil || deliver == nil || disconnected == nil {
		return errors.New("Rust telemetry candidate requires context and callbacks")
	}
	var failures []time.Time
	for {
		if err := ctx.Err(); err != nil {
			return nil
		}
		err := runCandidateOnce(ctx, executable, configuration, deliver)
		if ctx.Err() != nil {
			return err
		}
		if err == nil {
			return nil
		}
		disconnected(err)
		now := time.Now()
		kept := failures[:0]
		for _, failed := range failures {
			if now.Sub(failed) < candidateRestartWindow {
				kept = append(kept, failed)
			}
		}
		failures = append(kept, now)
		if len(failures) >= candidateRestartLimit {
			return fmt.Errorf("%w: %v", ErrCandidateRestartLimit, err)
		}
		backoff := time.Duration(len(failures)) * 250 * time.Millisecond
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
	}
}

func runCandidateOnce(ctx context.Context, executable string, configuration ConfigurationV1,
	deliver func(ReceivedV1) error) error {
	pipe, err := newLocalPipe()
	if err != nil {
		return err
	}
	child, err := startInJob(executable, "--candidate-pipe", pipe.name,
		"--candidate-nonce", hex.EncodeToString(pipe.nonce[:]))
	if err != nil {
		_ = pipe.close()
		return err
	}
	defer child.close()
	if err := pipe.acceptChild(ctx, child.pid); err != nil {
		_ = pipe.close()
		return err
	}
	file := os.NewFile(uintptr(pipe.handle), "telemetry-candidate")
	defer file.Close()
	if err := file.SetReadDeadline(time.Now().Add(pipeAcceptTimeout)); err != nil {
		return err
	}
	handshake, err := ReadFrame(file)
	if err != nil {
		return fmt.Errorf("read Rust candidate handshake: %w", err)
	}
	if err := verifyHandshake(handshake, pipe.nonce, "0.1.0"); err != nil {
		return err
	}
	receiver := NewReceiver()
	configured, err := receiver.Configure(configuration)
	if err != nil {
		return err
	}
	if err := file.SetWriteDeadline(time.Now().Add(childShutdownTimeout)); err != nil {
		return err
	}
	if err := WriteFrame(file, configured); err != nil {
		return fmt.Errorf("send Rust candidate configuration: %w", err)
	}
	lastHeartbeat := time.Now()
	for {
		if ctx.Err() != nil {
			return stopCandidate(file, child)
		}
		if time.Since(lastHeartbeat) >= candidateHeartbeatTimeout {
			return ErrCandidateHeartbeatTimeout
		}
		if err := file.SetReadDeadline(time.Now().Add(candidateHeartbeatTimeout - time.Since(lastHeartbeat))); err != nil {
			return err
		}
		frame, err := ReadFrame(file)
		if errors.Is(err, os.ErrDeadlineExceeded) {
			if ctx.Err() != nil {
				return stopCandidate(file, child)
			}
			return ErrCandidateHeartbeatTimeout
		}
		if err != nil {
			return fmt.Errorf("read Rust candidate frame: %w", err)
		}
		event, err := receiver.Accept(frame)
		if err != nil {
			return fmt.Errorf("validate Rust candidate frame: %w", err)
		}
		if event.Stopped {
			return errors.New("Rust candidate stopped without host request")
		}
		if event.Status != nil {
			lastHeartbeat = time.Now()
		}
		if event.FactACK != nil {
			if err := file.SetWriteDeadline(time.Now().Add(childShutdownTimeout)); err != nil {
				return err
			}
			if err := WriteFrame(file, *event.FactACK); err != nil {
				return fmt.Errorf("acknowledge Rust candidate Fact: %w", err)
			}
		}
		if err := deliver(event); err != nil {
			return fmt.Errorf("deliver Rust candidate event: %w", err)
		}
	}
}

func stopCandidate(file *os.File, child *childProcess) error {
	deadline := time.Now().Add(childShutdownTimeout)
	if err := file.SetDeadline(deadline); err != nil {
		return err
	}
	if err := WriteFrame(file, Frame{Kind: KindStop}); err != nil {
		return fmt.Errorf("send Rust candidate Stop: %w", err)
	}
	for {
		frame, err := ReadFrame(file)
		if err != nil {
			return fmt.Errorf("wait Rust candidate Stop: %w", err)
		}
		if frame.Kind == KindStop {
			if err := DecodeStop(frame); err != nil {
				return err
			}
			break
		}
	}
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return errors.New("Rust candidate shutdown deadline expired")
	}
	result, err := windows.WaitForSingleObject(child.process, uint32(remaining.Milliseconds()))
	if err != nil || result != windows.WAIT_OBJECT_0 {
		return fmt.Errorf("Rust candidate did not exit: wait=%d error=%v", result, err)
	}
	var exitCode uint32
	if err := windows.GetExitCodeProcess(child.process, &exitCode); err != nil || exitCode != 0 {
		return fmt.Errorf("Rust candidate exit code=%d: %v", exitCode, err)
	}
	return nil
}
