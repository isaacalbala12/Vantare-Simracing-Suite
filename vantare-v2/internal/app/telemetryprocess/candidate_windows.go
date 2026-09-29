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

const candidateHeartbeatTimeout = time.Second
const candidateRestartLimit = 3
const candidateRestartWindow = time.Minute

var ErrCandidateHeartbeatTimeout = errors.New("telemetry Rust heartbeat timed out")
var ErrCandidateRestartLimit = errors.New("telemetry Rust restart budget exhausted")

// RunCandidate supervises an explicit Rust candidate. Callers must clear any
// published state in disconnected before a new child is started. It is not
// selected by the Wails runtime until the migration gates are satisfied.
func RunCandidate(ctx context.Context, executable string, configuration ConfigurationV1,
	deliver func(ReceivedV1) error, disconnected func(error)) error {
	return RunCandidateWithUpdates(ctx, executable, configuration, nil, deliver, disconnected)
}

// RunCandidateWithUpdates applies the newest requested policy only after the
// previous revision is ACKed. A restart starts from the latest requested
// revision and a fresh Receiver; product selection is still gated elsewhere.
func RunCandidateWithUpdates(ctx context.Context, executable string, configuration ConfigurationV1,
	updates <-chan ConfigurationV1, deliver func(ReceivedV1) error, disconnected func(error)) error {
	return runCandidateWithUpdates(ctx, executable, configuration, updates, nil, false, deliver, disconnected)
}

// RunCandidateWithOverlay carries window-scoped pull commands to the Rust
// helper. Replies are correlated before the ordinary telemetry receiver sees
// frames; the host never chooses a snapshot or ACK state.
func RunCandidateWithOverlay(ctx context.Context, executable string, configuration ConfigurationV1,
	updates <-chan ConfigurationV1, overlay <-chan OverlayRPC,
	deliver func(ReceivedV1) error, disconnected func(error)) error {
	return runCandidateWithUpdates(ctx, executable, configuration, updates, overlay, false, deliver, disconnected)
}

func RunCandidateWithOverlayBinaryEngineer(ctx context.Context, executable string, configuration ConfigurationV1,
	updates <-chan ConfigurationV1, overlay <-chan OverlayRPC,
	deliver func(ReceivedV1) error, disconnected func(error)) error {
	return runCandidateWithUpdates(ctx, executable, configuration, updates, overlay, true, deliver, disconnected)
}

// RunCandidateWithBinaryEngineer is an explicit R21 measurement mode. It does
// not alter the default candidate or production codec selection.
func RunCandidateWithBinaryEngineer(ctx context.Context, executable string, configuration ConfigurationV1,
	updates <-chan ConfigurationV1, deliver func(ReceivedV1) error, disconnected func(error)) error {
	return runCandidateWithUpdates(ctx, executable, configuration, updates, nil, true, deliver, disconnected)
}

func runCandidateWithUpdates(ctx context.Context, executable string, configuration ConfigurationV1,
	updates <-chan ConfigurationV1, overlay <-chan OverlayRPC, engineerBinary bool, deliver func(ReceivedV1) error, disconnected func(error)) error {
	if ctx == nil || deliver == nil || disconnected == nil {
		return errors.New("telemetry Rust candidate requires context and callbacks")
	}
	var failures []time.Time
	for {
		if err := ctx.Err(); err != nil {
			return nil
		}
		err := runCandidateOnceWithCodec(ctx, executable, &configuration, &updates, overlay, engineerBinary, deliver)
		if ctx.Err() != nil {
			// An explicit host Stop may cancel while the child is still
			// connecting. Only that cancellation is a clean shutdown;
			// preserve a genuine child shutdown failure.
			if err == nil || errors.Is(err, ctx.Err()) {
				return nil
			}
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
			return errors.Join(ErrCandidateRestartLimit, err)
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
	return runCandidateOnceWithUpdates(ctx, executable, &configuration, nil, deliver)
}

func runCandidateOnceWithUpdates(ctx context.Context, executable string, configuration *ConfigurationV1,
	updates *<-chan ConfigurationV1, deliver func(ReceivedV1) error) error {
	return runCandidateOnceWithCodec(ctx, executable, configuration, updates, nil, false, deliver)
}

func runCandidateOnceWithCodec(ctx context.Context, executable string, configuration *ConfigurationV1,
	updates *<-chan ConfigurationV1, overlay <-chan OverlayRPC, engineerBinary bool, deliver func(ReceivedV1) error) error {
	pipe, err := newLocalPipe()
	if err != nil {
		return err
	}
	args := []string{"--candidate-pipe", pipe.name, "--candidate-nonce", hex.EncodeToString(pipe.nonce[:])}
	if engineerBinary {
		args = append(args, "--candidate-engineer-binary")
	}
	child, err := startInJob(executable, args...)
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
	var writeMu sync.Mutex
	write := func(frame Frame) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		if err := file.SetWriteDeadline(time.Now().Add(childShutdownTimeout)); err != nil {
			return err
		}
		return WriteFrame(file, frame)
	}
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
	if err := receiveCandidateUpdates(configuration, updates); err != nil {
		return err
	}
	configured, err := receiver.Configure(*configuration)
	if err != nil {
		return err
	}
	if err := write(configured); err != nil {
		return fmt.Errorf("send Rust candidate configuration: %w", err)
	}
	bridge := newOverlayBridge(ctx, overlay, write)
	defer bridge.close()
	lastHeartbeat := time.Now()
	for {
		if ctx.Err() != nil {
			bridge.close()
			return stopCandidate(file, child)
		}
		if err := receiveCandidateUpdates(configuration, updates); err != nil {
			return err
		}
		if receiver.pending == nil && receiver.active != nil && configuration.Revision > receiver.active.Revision {
			frame, err := receiver.Configure(*configuration)
			if err != nil {
				return err
			}
			if err := write(frame); err != nil {
				return fmt.Errorf("update Rust candidate configuration: %w", err)
			}
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
				bridge.close()
				return stopCandidate(file, child)
			}
			return ErrCandidateHeartbeatTimeout
		}
		if err != nil {
			return fmt.Errorf("read Rust candidate frame: %w", err)
		}
		if frame.Kind == KindOverlayReply {
			if err := bridge.accept(frame); err != nil {
				return err
			}
			continue
		}
		event, err := receiver.Accept(frame)
		if err != nil {
			return fmt.Errorf("validate Rust candidate frame kind %d: %w", frame.Kind, err)
		}
		if event.Stopped {
			return errors.New("telemetry Rust candidate stopped without host request")
		}
		if event.Status != nil {
			lastHeartbeat = time.Now()
		}
		if err := deliverCandidateEvent(receiver, event, deliver, func(ack Frame) error {
			return write(ack)
		}); err != nil {
			return err
		}
	}
}

// A FactACK confirms that the product callback accepted every fact in this
// event. It must never precede delivery, even though a child restart still
// needs a separate replay boundary for unacknowledged facts.
func deliverCandidateEvent(receiver *Receiver, event ReceivedV1,
	deliver func(ReceivedV1) error, acknowledge func(Frame) error) error {
	if event.FactACK != nil && event.FactAdded {
		event.Facts = receiver.DrainFacts()
	}
	if err := deliver(event); err != nil {
		return fmt.Errorf("deliver Rust candidate event: %w", err)
	}
	if event.FactACK != nil {
		if err := acknowledge(*event.FactACK); err != nil {
			return fmt.Errorf("acknowledge Rust candidate Fact: %w", err)
		}
	}
	return nil
}

// receiveCandidateUpdates drains a burst before a new policy is sent, so a
// superseded revision cannot publish products between two queued requests.
func receiveCandidateUpdates(configuration *ConfigurationV1, updates *<-chan ConfigurationV1) error {
	if updates == nil {
		return nil
	}
	for *updates != nil {
		select {
		case requested, open := <-*updates:
			if !open {
				*updates = nil
				return nil
			}
			if requested.Revision <= configuration.Revision {
				return ErrReceiverProtocol
			}
			if _, err := EncodeConfiguration(requested); err != nil {
				return err
			}
			*configuration = requested
		default:
			return nil
		}
	}
	return nil
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
		return errors.New("telemetry Rust candidate shutdown deadline expired")
	}
	result, err := windows.WaitForSingleObject(child.process, uint32(remaining.Milliseconds()))
	if err != nil || result != windows.WAIT_OBJECT_0 {
		return fmt.Errorf("telemetry Rust candidate did not exit: wait=%d error=%v", result, err)
	}
	var exitCode uint32
	if err := windows.GetExitCodeProcess(child.process, &exitCode); err != nil || exitCode != 0 {
		return fmt.Errorf("telemetry Rust candidate exit code=%d: %v", exitCode, err)
	}
	return nil
}
