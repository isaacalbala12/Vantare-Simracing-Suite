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
	snapshot, err := decodeObservationSnapshot(frame, ProductEngineerV1, func(value engineer.SnapshotV1) projection.Metadata { return value.Metadata })
	if err != nil {
		return engineer.SnapshotV1{}, err
	}
	if snapshot.Capabilities == nil || snapshot.Vehicles == nil {
		return engineer.SnapshotV1{}, ErrInvalidObservationSnapshot
	}
	return snapshot, nil
}

func DecodeStrategySnapshot(frame Frame) (strategy.SnapshotV1, error) {
	snapshot, err := decodeObservationSnapshot(frame, ProductStrategyV1, func(value strategy.SnapshotV1) projection.Metadata { return value.Metadata })
	if err != nil {
		return strategy.SnapshotV1{}, err
	}
	if snapshot.Capabilities == nil {
		return strategy.SnapshotV1{}, ErrInvalidObservationSnapshot
	}
	return snapshot, nil
}

func decodeObservationSnapshot[T any](frame Frame, product string, metadataOf func(T) projection.Metadata) (T, error) {
	var zero T
	if frame.Kind != KindSnapshot {
		return zero, ErrInvalidObservationSnapshot
	}
	var envelope struct {
		Product  string          `json:"product"`
		Snapshot json.RawMessage `json:"snapshot"`
	}
	decoder := json.NewDecoder(bytes.NewReader(frame.Payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&envelope); err != nil {
		return zero, fmt.Errorf("%w: envelope: %v", ErrInvalidObservationSnapshot, err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return zero, ErrInvalidObservationSnapshot
	}
	if envelope.Product != product || len(envelope.Snapshot) == 0 {
		return zero, ErrInvalidObservationSnapshot
	}
	decoder = json.NewDecoder(bytes.NewReader(envelope.Snapshot))
	decoder.DisallowUnknownFields()
	var snapshot T
	if err := decoder.Decode(&snapshot); err != nil {
		return zero, fmt.Errorf("%w: snapshot: %v", ErrInvalidObservationSnapshot, err)
	}
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return zero, ErrInvalidObservationSnapshot
	}
	metadata := metadataOf(snapshot)
	if metadata.CanonicalVersion != 1 || metadata.ProjectionVersion != 1 ||
		metadata.Epoch == 0 || metadata.Sequence == 0 {
		return zero, ErrInvalidObservationSnapshot
	}
	if _, err := time.Parse(time.RFC3339Nano, metadata.CapturedAt); err != nil {
		return zero, ErrInvalidObservationSnapshot
	}
	return snapshot, nil
}
