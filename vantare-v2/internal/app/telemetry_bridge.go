package app

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/telemetry/diff"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
	"github.com/vantare/overlays/v2/pkg/models"
)

// EventEmitter sends events to the UI layer (Wails, tests).
type EventEmitter interface {
	Emit(name string, data any)
}

// UpdateWire is the JSON shape consumed by the React overlay.
type UpdateWire struct {
	Seq      uint64             `json:"seq"`
	Snapshot *models.Telemetry  `json:"snapshot"`
	Diff     *diff.Payload      `json:"diff,omitempty"`
}

type TelemetryBridge struct {
	svc     *service.Service
	emitter EventEmitter
	unsub   func()
	wg      sync.WaitGroup
}

func NewTelemetryBridge(svc *service.Service, emitter EventEmitter) *TelemetryBridge {
	return &TelemetryBridge{svc: svc, emitter: emitter}
}

func (b *TelemetryBridge) Start() {
	ch, unsub := b.svc.Subscribe()
	b.unsub = unsub
	b.wg.Add(1)
	go func() {
		defer b.wg.Done()
		for upd := range ch {
			b.emitter.Emit("telemetry:update", UpdateWire{
				Seq:      upd.Seq,
				Snapshot: upd.Snapshot,
				Diff:     upd.Diff,
			})
		}
	}()
}

func (b *TelemetryBridge) Stop() {
	if b.unsub != nil {
		b.unsub()
		b.unsub = nil
	}
	b.wg.Wait()
}

// WireFromUpdate builds the frontend payload (used in tests).
func WireFromUpdate(upd service.Update) UpdateWire {
	return UpdateWire{
		Seq:      upd.Seq,
		Snapshot: upd.Snapshot,
		Diff:     upd.Diff,
	}
}
