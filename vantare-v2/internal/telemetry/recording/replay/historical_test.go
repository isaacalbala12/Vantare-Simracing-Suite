package replay

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
)

type fakeHistoricalReader struct {
	snapshot       recording.HistoricalSnapshot
	records        []recording.HistoricalRecord
	closed         bool
	pageSnapshotID string
}

func (reader *fakeHistoricalReader) Snapshot() recording.HistoricalSnapshot {
	return reader.snapshot
}

func (reader *fakeHistoricalReader) QueryPage(
	_ context.Context,
	query recording.HistoricalQuery,
) (recording.HistoricalPage, error) {
	start := 0
	if query.After != nil {
		for index, record := range reader.records {
			if record.Position == *query.After {
				start = index + 1
				break
			}
		}
	}
	end := start + int(query.Limit)
	if end > len(reader.records) {
		end = len(reader.records)
	}
	page := recording.HistoricalPage{
		SnapshotID: reader.snapshot.ID,
		Records:    append([]recording.HistoricalRecord(nil), reader.records[start:end]...),
	}
	if reader.pageSnapshotID != "" {
		page.SnapshotID = reader.pageSnapshotID
	}
	if end < len(reader.records) {
		next := reader.records[end-1].Position
		page.Next = &next
	}
	return page, nil
}

func (reader *fakeHistoricalReader) Close() error {
	reader.closed = true
	return nil
}

func TestHistoricalSourcePagesOwnsRecordsAndUsesOriginalClock(t *testing.T) {
	t.Parallel()
	started := testMetadata().StartedAtUTC
	metadata := testMetadata()
	metadata.SchemaID = "historical-query"
	manifest := recording.NewSessionManifest(
		"session-local-0001",
		"lmu",
		"test",
		started,
	)
	metadata.AppBuild = manifest.AppBuild
	reader := &fakeHistoricalReader{
		snapshot: recording.HistoricalSnapshot{
			ID:       "snapshot-local",
			Manifest: manifest,
		},
		records: []recording.HistoricalRecord{
			historicalObserved(started, 1),
			historicalFact(started.Add(time.Millisecond), 1),
			historicalObserved(started.Add(2*time.Millisecond), 2),
		},
	}
	source, err := NewHistoricalSource(reader, metadata, 1)
	if err != nil {
		t.Fatalf("NewHistoricalSource() error = %v", err)
	}
	for index, wantOffset := range []time.Duration{0, time.Millisecond, 2 * time.Millisecond} {
		frame, err := source.Next(context.Background())
		if err != nil {
			t.Fatalf("Next(%d) error = %v", index, err)
		}
		if frame.Offset != wantOffset {
			t.Fatalf("Next(%d) offset = %s, want %s", index, frame.Offset, wantOffset)
		}
		if frame.Value.Observed != nil {
			frame.Value.Observed.Vehicles = nil
		}
	}
	if _, err := source.Next(context.Background()); err != io.EOF {
		t.Fatalf("Next(end) error = %v, want EOF", err)
	}
	if err := source.Close(); err != nil || !reader.closed {
		t.Fatalf("Close() = %v, closed = %t", err, reader.closed)
	}
}

func TestHistoricalSourceRejectsRegressiveTime(t *testing.T) {
	t.Parallel()
	started := testMetadata().StartedAtUTC
	metadata := testMetadata()
	metadata.SchemaID = "historical-query"
	metadata.AppBuild = "test"
	reader := &fakeHistoricalReader{
		snapshot: recording.HistoricalSnapshot{
			ID: "snapshot-local",
			Manifest: recording.NewSessionManifest(
				"session-local-0001", "lmu", "test", started,
			),
		},
		records: []recording.HistoricalRecord{
			historicalObserved(started.Add(time.Second), 1),
			historicalFact(started, 1),
		},
	}
	source, err := NewHistoricalSource(reader, metadata, 2)
	if err != nil {
		t.Fatalf("NewHistoricalSource() error = %v", err)
	}
	if _, err := source.Next(context.Background()); err != nil {
		t.Fatalf("Next(first) error = %v", err)
	}
	if _, err := source.Next(context.Background()); err != ErrInvalidFixture {
		t.Fatalf("Next(regressive) error = %v, want invalid fixture", err)
	}
}

func TestHistoricalSourcePinsSnapshotAndRejectsPageFromAnotherReader(t *testing.T) {
	t.Parallel()
	started := testMetadata().StartedAtUTC
	metadata := testMetadata()
	metadata.SchemaID = "historical-query"
	metadata.AppBuild = "test"
	reader := &fakeHistoricalReader{
		snapshot: recording.HistoricalSnapshot{
			ID: "snapshot-local",
			Manifest: recording.NewSessionManifest(
				"session-local-0001", "lmu", "test", started,
			),
		},
		records:        []recording.HistoricalRecord{historicalObserved(started, 1)},
		pageSnapshotID: "snapshot-other",
	}
	source, err := NewHistoricalSource(reader, metadata, 1)
	if err != nil {
		t.Fatalf("NewHistoricalSource() error = %v", err)
	}
	if _, err := source.Next(context.Background()); !errors.Is(
		err,
		recording.ErrHistoricalSnapshot,
	) {
		t.Fatalf("Next(mixed snapshot) error = %v", err)
	}
}

func TestHistoricalSourceRejectsMetadataThatDoesNotMatchManifest(t *testing.T) {
	t.Parallel()
	started := testMetadata().StartedAtUTC
	manifest := recording.NewSessionManifest(
		"session-local-0001", "lmu", "test", started,
	)
	reader := &fakeHistoricalReader{
		snapshot: recording.HistoricalSnapshot{
			ID: "snapshot-local", Manifest: manifest,
		},
	}
	valid := testMetadata()
	valid.SchemaID = "historical-query"
	valid.AppBuild = manifest.AppBuild
	tests := []FixtureMetadata{
		func() FixtureMetadata {
			value := valid
			value.SimulatorID = "iracing"
			return value
		}(),
		func() FixtureMetadata {
			value := valid
			value.AppBuild = "another-build"
			return value
		}(),
		func() FixtureMetadata {
			value := valid
			value.SchemaVersion = 2
			return value
		}(),
	}
	for _, metadata := range tests {
		if _, err := NewHistoricalSource(reader, metadata, 1); err == nil {
			t.Fatalf("NewHistoricalSource(%#v) error = nil, want mismatch", metadata)
		}
	}
}

func historicalObserved(at time.Time, sequence uint64) recording.HistoricalRecord {
	payload := recording.RecordingPayloadV1{
		Version:       recording.RecordingVersionV1,
		Channel:       recording.ChannelObserved,
		Epoch:         1,
		Sequence:      sequence,
		CapturedAtUTC: at,
	}
	return recording.HistoricalRecord{
		Position: recording.HistoricalPosition{
			Epoch: 1, CausalSequence: sequence,
			Kind: recording.HistoricalObserved, Sequence: sequence,
		},
		AtUTC:    at,
		Observed: &payload,
	}
}

func historicalFact(at time.Time, sequence uint64) recording.HistoricalRecord {
	fact := recording.RecordingFactV1{
		Version:                recording.RecordingVersionV1,
		Channel:                recording.ChannelFact,
		Epoch:                  1,
		FactSequence:           sequence,
		OccurredAtUTC:          at,
		CausalSnapshotSequence: sequence,
		FactType:               recording.FactLapCompleted,
		Quality:                recording.QualityCurrent,
	}
	return recording.HistoricalRecord{
		Position: recording.HistoricalPosition{
			Epoch: 1, CausalSequence: sequence,
			Kind: recording.HistoricalFact, Sequence: sequence,
		},
		AtUTC: at,
		Fact:  &fact,
	}
}
