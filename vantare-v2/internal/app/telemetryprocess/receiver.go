package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
)

var ErrReceiverProtocol = errors.New("telemetry IPC receiver protocol violation")

type receiverCursor struct {
	epoch    uint64
	sequence uint64
}

func (cursor receiverCursor) after(previous receiverCursor) bool {
	return cursor.epoch > previous.epoch || cursor.epoch == previous.epoch && cursor.sequence > previous.sequence
}

// ReceivedV1 holds one validated child message. FactACK must be written to
// the child after Retain and successful delivery; facts stay in Receiver until DrainFacts.
type ReceivedV1 struct {
	Configuration    *ConfigurationAckV1
	Overlay          *overlayv2.UpdateV2
	Engineer         *engineer.SnapshotV1
	EngineerIdentity *engineer.Identity
	Strategy         *strategy.SnapshotV1
	Status           *StatusV1
	Resync           *ResyncRequiredV1
	FactACK          *Frame
	FactAdded        bool
	Facts            []engineer.FactEnvelopeV1
	Stopped          bool
}

// EngineerObservation prepares a validated Rust snapshot for the existing
// product consumer. Replay frames without identity cannot cross this boundary.
func (event ReceivedV1) EngineerObservation(manifest engineer.Manifest) (engineer.ObservationSnapshotV1, error) {
	if event.Engineer == nil || event.EngineerIdentity == nil {
		return engineer.ObservationSnapshotV1{}, ErrInvalidObservationSnapshot
	}
	return engineer.AdaptSnapshotV1(*event.Engineer, *event.EngineerIdentity, manifest)
}

// Receiver is scoped to one verified child instance. The host writes the
// Configuration returned by Configure, then feeds incoming frames to Accept.
// It never reconstructs canonical telemetry in Go.
type Receiver struct {
	active       *ConfigurationV1
	pending      *ConfigurationV1
	ack          receiverCursor
	lastProducts map[string]receiverCursor
	facts        *FactRetainer
	status       StatusTracker
	needsResync  bool
	stopped      bool
}

func NewReceiver() *Receiver {
	return &Receiver{lastProducts: make(map[string]receiverCursor, 3)}
}

func (receiver *Receiver) Configure(value ConfigurationV1) (Frame, error) {
	if receiver.stopped || receiver.pending != nil || receiver.active != nil && value.Revision <= receiver.active.Revision {
		return Frame{}, ErrReceiverProtocol
	}
	frame, err := EncodeConfiguration(value)
	if err != nil {
		return Frame{}, err
	}
	receiver.pending = &value
	return frame, nil
}

func (receiver *Receiver) Accept(frame Frame) (ReceivedV1, error) {
	if receiver.stopped {
		return ReceivedV1{}, ErrReceiverProtocol
	}
	switch frame.Kind {
	case KindStatus:
		status, err := receiver.status.Accept(frame)
		if err != nil {
			return ReceivedV1{}, err
		}
		return ReceivedV1{Status: &status}, nil
	case KindConfigurationAck:
		return receiver.acceptConfiguration(frame)
	case KindSnapshot:
		return receiver.acceptSnapshot(frame)
	case KindFact:
		if receiver.active == nil || !receiver.active.Consumers.Engineer || receiver.facts == nil || receiver.needsResync {
			return ReceivedV1{}, ErrReceiverProtocol
		}
		ack, added, err := receiver.facts.Retain(frame)
		if err != nil {
			return ReceivedV1{}, err
		}
		return ReceivedV1{FactACK: &ack, FactAdded: added}, nil
	case KindResyncRequired:
		if receiver.facts == nil {
			return ReceivedV1{}, ErrReceiverProtocol
		}
		boundary, err := DecodeResyncRequired(frame)
		if err != nil {
			return ReceivedV1{}, err
		}
		if boundary.Stream != receiver.facts.stream {
			return ReceivedV1{}, ErrReceiverProtocol
		}
		receiver.needsResync = true
		return ReceivedV1{Resync: &boundary}, nil
	case KindStop:
		if err := DecodeStop(frame); err != nil {
			return ReceivedV1{}, err
		}
		receiver.stopped = true
		return ReceivedV1{Stopped: true}, nil
	default:
		return ReceivedV1{}, ErrReceiverProtocol
	}
}

func (receiver *Receiver) acceptConfiguration(frame Frame) (ReceivedV1, error) {
	if receiver.pending == nil {
		return ReceivedV1{}, fmt.Errorf("%w: unsolicited configuration ACK", ErrReceiverProtocol)
	}
	ack, err := DecodeConfigurationAck(frame)
	if err != nil {
		return ReceivedV1{}, err
	}
	next := receiverCursor{epoch: ack.Epoch, sequence: ack.Sequence}
	if ack.Revision != receiver.pending.Revision || receiver.active != nil && !next.after(receiver.ack) {
		return ReceivedV1{}, fmt.Errorf("%w: configuration ACK revision %d cursor %d/%d, pending revision %d previous %d/%d", ErrReceiverProtocol,
			ack.Revision, ack.Epoch, ack.Sequence, receiver.pending.Revision, receiver.ack.epoch, receiver.ack.sequence)
	}
	if receiver.facts == nil {
		receiver.facts, err = NewFactRetainer(MaxRetainedEngineerFacts, FactAckV1{Stream: ack.FactStream, Sequence: ack.FactSequence})
		if err != nil {
			return ReceivedV1{}, err
		}
	} else if receiver.facts.stream != ack.FactStream || ack.FactSequence < receiver.facts.last {
		return ReceivedV1{}, fmt.Errorf("%w: configuration ACK fact cursor changed within child", ErrReceiverProtocol)
	} else if receiver.active != nil && !receiver.active.Consumers.Engineer {
		// Facts produced while Engineer is not demanded are intentionally
		// suppressed by Rust. The next ACK is their new explicit baseline.
		receiver.facts, err = NewFactRetainer(MaxRetainedEngineerFacts, FactAckV1{Stream: ack.FactStream, Sequence: ack.FactSequence})
		if err != nil {
			return ReceivedV1{}, err
		}
	} else if receiver.facts.last != ack.FactSequence {
		return ReceivedV1{}, fmt.Errorf("%w: configuration ACK skipped demanded Engineer facts", ErrReceiverProtocol)
	}
	receiver.active = receiver.pending
	receiver.pending = nil
	receiver.ack = next
	receiver.needsResync = false
	return ReceivedV1{Configuration: &ack}, nil
}

func (receiver *Receiver) acceptSnapshot(frame Frame) (ReceivedV1, error) {
	if receiver.active == nil {
		return ReceivedV1{}, fmt.Errorf("%w: snapshot before configuration", ErrReceiverProtocol)
	}
	product, err := snapshotProduct(frame.Payload)
	if err != nil {
		return ReceivedV1{}, err
	}
	var event ReceivedV1
	var cursor receiverCursor
	switch product {
	case ProductOverlayV2:
		if !receiver.active.Consumers.OverlayV2 {
			return ReceivedV1{}, fmt.Errorf("%w: Overlay snapshot without demand", ErrReceiverProtocol)
		}
		update, err := DecodeOverlaySnapshot(frame)
		if err != nil {
			return ReceivedV1{}, err
		}
		cursor = receiverCursor{epoch: update.Frame.StreamEpoch, sequence: update.Frame.SourceSequence}
		event.Overlay = &update
	case ProductEngineerV1:
		if !receiver.active.Consumers.Engineer {
			return ReceivedV1{}, fmt.Errorf("%w: Engineer snapshot without demand", ErrReceiverProtocol)
		}
		var snapshot engineer.SnapshotV1
		var identity *engineer.Identity
		if bytes.HasPrefix(frame.Payload, []byte("VTE1")) {
			snapshot, identity, err = DecodeEngineerBinarySnapshot(frame)
		} else {
			snapshot, identity, err = DecodeEngineerSnapshotWithIdentity(frame)
		}
		if err != nil {
			return ReceivedV1{}, err
		}
		cursor = receiverCursor{epoch: uint64(snapshot.Metadata.Epoch), sequence: uint64(snapshot.Metadata.Sequence)}
		event.Engineer = &snapshot
		event.EngineerIdentity = identity
	case ProductStrategyV1:
		if !receiver.active.Consumers.Strategy {
			return ReceivedV1{}, fmt.Errorf("%w: Strategy snapshot without demand", ErrReceiverProtocol)
		}
		snapshot, err := DecodeStrategySnapshot(frame)
		if err != nil {
			return ReceivedV1{}, err
		}
		cursor = receiverCursor{epoch: uint64(snapshot.Metadata.Epoch), sequence: uint64(snapshot.Metadata.Sequence)}
		event.Strategy = &snapshot
	default:
		return ReceivedV1{}, fmt.Errorf("%w: unknown product", ErrReceiverProtocol)
	}
	if cursor.epoch == 0 || cursor.sequence == 0 || cursor != receiver.ack && !cursor.after(receiver.ack) ||
		receiver.lastProducts[product] != (receiverCursor{}) && !cursor.after(receiver.lastProducts[product]) {
		return ReceivedV1{}, fmt.Errorf("%w: %s cursor %d/%d after ack %d/%d and product %d/%d", ErrReceiverProtocol,
			product, cursor.epoch, cursor.sequence, receiver.ack.epoch, receiver.ack.sequence,
			receiver.lastProducts[product].epoch, receiver.lastProducts[product].sequence)
	}
	receiver.lastProducts[product] = cursor
	return event, nil
}

// Rust emits product before the large snapshot/update body. This bounded
// selector avoids parsing that body twice; the selected product's strict
// decoder still validates the complete JSON, including the product value.
// Older or reordered fixtures use the general JSON fallback.
func snapshotProduct(payload []byte) (string, error) {
	if bytes.HasPrefix(payload, []byte("VTE1")) {
		return ProductEngineerV1, nil
	}
	prefix := payload
	if len(prefix) > 512 {
		prefix = prefix[:512]
	}
	if body := bytes.Index(prefix, []byte(`"snapshot"`)); body >= 0 {
		prefix = prefix[:body]
	}
	if body := bytes.Index(prefix, []byte(`"update"`)); body >= 0 {
		prefix = prefix[:body]
	}
	for _, product := range [...]string{ProductOverlayV2, ProductEngineerV1, ProductStrategyV1} {
		if bytes.Contains(prefix, []byte(`"product":"`+product+`"`)) {
			return product, nil
		}
	}
	var envelope struct {
		Product string `json:"product"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return "", fmt.Errorf("%w: snapshot envelope: %v", ErrReceiverProtocol, err)
	}
	return envelope.Product, nil
}

func (receiver *Receiver) DrainFacts() []engineer.FactEnvelopeV1 {
	if receiver.facts == nil {
		return nil
	}
	return receiver.facts.Drain()
}
