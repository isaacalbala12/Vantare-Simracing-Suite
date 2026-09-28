package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
)

const (
	ProductEngineerV1 = "engineer-v1"
	ProductStrategyV1 = "strategy-v1"
)

var ErrInvalidObservationSnapshot = errors.New("telemetry IPC observation snapshot is invalid")

func DecodeEngineerSnapshot(frame Frame) (engineer.SnapshotV1, error) {
	snapshot, _, err := DecodeEngineerSnapshotWithIdentity(frame)
	return snapshot, err
}

// DecodeEngineerSnapshotWithIdentity retains the committed run identity for
// the product adapter. Old replay fixtures have no identity and stay readable;
// a productive consumer must require a complete one.
func DecodeEngineerSnapshotWithIdentity(frame Frame) (engineer.SnapshotV1, *engineer.Identity, error) {
	snapshot, identity, err := decodeObservationSnapshot(frame, ProductEngineerV1, func(value engineer.SnapshotV1) projection.Metadata { return value.Metadata })
	if err != nil {
		return engineer.SnapshotV1{}, nil, err
	}
	if snapshot.Capabilities == nil || snapshot.Vehicles == nil {
		return engineer.SnapshotV1{}, nil, ErrInvalidObservationSnapshot
	}
	if identity != nil && (!(engineer.Context{Epoch: uint64(snapshot.Metadata.Epoch), Identity: *identity}).Complete() ||
		identity.Vehicle != engineer.VehicleID(snapshot.Player.ID)) {
		return engineer.SnapshotV1{}, nil, ErrInvalidObservationSnapshot
	}
	return snapshot, identity, nil
}

func DecodeStrategySnapshot(frame Frame) (strategy.SnapshotV1, error) {
	snapshot, identity, err := decodeObservationSnapshot(frame, ProductStrategyV1, func(value strategy.SnapshotV1) projection.Metadata { return value.Metadata })
	if err != nil {
		return strategy.SnapshotV1{}, err
	}
	if snapshot.Capabilities == nil || identity != nil {
		return strategy.SnapshotV1{}, ErrInvalidObservationSnapshot
	}
	return snapshot, nil
}

func decodeObservationSnapshot[T any](frame Frame, product string, metadataOf func(T) projection.Metadata) (T, *engineer.Identity, error) {
	var zero T
	if frame.Kind != KindSnapshot {
		return zero, nil, ErrInvalidObservationSnapshot
	}
	var envelope struct {
		Product  string             `json:"product"`
		Identity *engineer.Identity `json:"identity"`
		Snapshot json.RawMessage    `json:"snapshot"`
	}
	decoder := json.NewDecoder(bytes.NewReader(frame.Payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&envelope); err != nil {
		return zero, nil, fmt.Errorf("%w: envelope: %v", ErrInvalidObservationSnapshot, err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return zero, nil, ErrInvalidObservationSnapshot
	}
	if envelope.Product != product || len(envelope.Snapshot) == 0 {
		return zero, nil, ErrInvalidObservationSnapshot
	}
	decoder = json.NewDecoder(bytes.NewReader(envelope.Snapshot))
	decoder.DisallowUnknownFields()
	var snapshot T
	if err := decoder.Decode(&snapshot); err != nil {
		return zero, nil, fmt.Errorf("%w: snapshot: %v", ErrInvalidObservationSnapshot, err)
	}
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return zero, nil, ErrInvalidObservationSnapshot
	}
	metadata := metadataOf(snapshot)
	if metadata.CanonicalVersion != 1 || metadata.ProjectionVersion != 1 ||
		metadata.Epoch == 0 || metadata.Sequence == 0 {
		return zero, nil, ErrInvalidObservationSnapshot
	}
	if _, err := time.Parse(time.RFC3339Nano, metadata.CapturedAt); err != nil {
		return zero, nil, ErrInvalidObservationSnapshot
	}
	return snapshot, envelope.Identity, nil
}
