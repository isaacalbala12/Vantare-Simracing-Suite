//go:build windows

package telemetryprocess

import (
	"context"
	"errors"
	"sync"
)

var ErrOverlayBridgeClosed = errors.New("telemetry Rust overlay bridge closed")
var ErrOverlayBridgeBusy = errors.New("telemetry Rust overlay bridge is full")

const maxPendingOverlayRPC = 32

type OverlayRPC struct {
	Command OverlayCommandV1
	Result  chan<- OverlayRPCResult
}

type OverlayRPCResult struct {
	Reply OverlayReplyV1
	Err   error
}

type overlayBridge struct {
	cancel  context.CancelFunc
	done    chan struct{}
	mu      sync.Mutex
	pending map[uint64]chan<- OverlayRPCResult
	once    sync.Once
}

func newOverlayBridge(parent context.Context, requests <-chan OverlayRPC, write func(Frame) error) *overlayBridge {
	ctx, cancel := context.WithCancel(parent)
	bridge := &overlayBridge{cancel: cancel, done: make(chan struct{}), pending: make(map[uint64]chan<- OverlayRPCResult)}
	go func() {
		defer close(bridge.done)
		for {
			select {
			case <-ctx.Done():
				return
			case request, open := <-requests:
				if !open {
					return
				}
				frame, err := EncodeOverlayCommand(request.Command)
				if err != nil {
					sendOverlayResult(request.Result, OverlayRPCResult{Err: err})
					continue
				}
				bridge.mu.Lock()
				if _, duplicate := bridge.pending[request.Command.RequestID]; duplicate {
					bridge.mu.Unlock()
					sendOverlayResult(request.Result, OverlayRPCResult{Err: ErrInvalidOverlayCommand})
					continue
				}
				if len(bridge.pending) >= maxPendingOverlayRPC {
					bridge.mu.Unlock()
					sendOverlayResult(request.Result, OverlayRPCResult{Err: ErrOverlayBridgeBusy})
					continue
				}
				bridge.pending[request.Command.RequestID] = request.Result
				bridge.mu.Unlock()
				if err := write(frame); err != nil {
					bridge.mu.Lock()
					delete(bridge.pending, request.Command.RequestID)
					bridge.mu.Unlock()
					sendOverlayResult(request.Result, OverlayRPCResult{Err: err})
					return
				}
			}
		}
	}()
	return bridge
}

func (bridge *overlayBridge) accept(frame Frame) error {
	reply, err := DecodeOverlayReply(frame)
	if err != nil {
		return err
	}
	bridge.mu.Lock()
	result, found := bridge.pending[reply.RequestID]
	delete(bridge.pending, reply.RequestID)
	bridge.mu.Unlock()
	if !found {
		return ErrInvalidOverlayReply
	}
	sendOverlayResult(result, OverlayRPCResult{Reply: reply})
	return nil
}

func (bridge *overlayBridge) close() {
	bridge.once.Do(func() {
		bridge.cancel()
		<-bridge.done
		bridge.mu.Lock()
		defer bridge.mu.Unlock()
		for id, result := range bridge.pending {
			sendOverlayResult(result, OverlayRPCResult{Err: ErrOverlayBridgeClosed})
			delete(bridge.pending, id)
		}
	})
}

func sendOverlayResult(result chan<- OverlayRPCResult, value OverlayRPCResult) {
	if result == nil {
		return
	}
	select {
	case result <- value:
	default:
	}
}
