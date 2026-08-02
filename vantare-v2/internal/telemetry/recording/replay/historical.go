package replay

import (
	"context"
	"io"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
)

type HistoricalSource struct {
	reader     recording.HistoricalReplayReader
	metadata   FixtureMetadata
	snapshotID string
	pageSize   uint16
	records    []recording.HistoricalRecord
	next       *recording.HistoricalPosition
	index      int
	done       bool
	closed     bool
	last       time.Duration
}

func NewHistoricalSource(
	reader recording.HistoricalReplayReader,
	metadata FixtureMetadata,
	pageSize uint16,
) (*HistoricalSource, error) {
	if reader == nil ||
		metadata.SchemaID != "historical-query" ||
		metadata.Validate() != nil ||
		pageSize == 0 ||
		pageSize > recording.MaxHistoricalPageSize {
		return nil, ErrInvalidFixture
	}
	snapshot := reader.Snapshot()
	if snapshot.ID == "" ||
		snapshot.Manifest.StartedAtUTC != metadata.StartedAtUTC ||
		metadata.SchemaVersion != uint16(snapshot.Manifest.RecordingSchemaVersion) ||
		metadata.SimulatorID != snapshot.Manifest.SimulatorID ||
		metadata.AppBuild != snapshot.Manifest.AppBuild {
		return nil, ErrInvalidFixture
	}
	return &HistoricalSource{
		reader: reader, metadata: metadata, snapshotID: snapshot.ID,
		pageSize: pageSize,
	}, nil
}

func (source *HistoricalSource) Metadata() FixtureMetadata {
	return source.metadata
}

func (source *HistoricalSource) Clone(
	record recording.HistoricalRecord,
) recording.HistoricalRecord {
	return cloneHistoricalRecord(record)
}

func (source *HistoricalSource) Next(
	ctx context.Context,
) (Frame[recording.HistoricalRecord], error) {
	if err := ctx.Err(); err != nil {
		return Frame[recording.HistoricalRecord]{}, err
	}
	if source.closed {
		return Frame[recording.HistoricalRecord]{}, recording.ErrClosed
	}
	if source.index >= len(source.records) {
		if source.done {
			return Frame[recording.HistoricalRecord]{}, io.EOF
		}
		page, err := source.reader.QueryPage(ctx, recording.HistoricalQuery{
			SnapshotID: source.snapshotID,
			After:      source.next,
			Limit:      source.pageSize,
		})
		if err != nil {
			return Frame[recording.HistoricalRecord]{}, err
		}
		if page.SnapshotID != source.snapshotID {
			return Frame[recording.HistoricalRecord]{}, recording.ErrHistoricalSnapshot
		}
		source.records = page.Records
		source.index = 0
		source.next = page.Next
		source.done = page.Next == nil
		if len(source.records) == 0 {
			if source.done {
				return Frame[recording.HistoricalRecord]{}, io.EOF
			}
			return Frame[recording.HistoricalRecord]{}, ErrInvalidFixture
		}
	}
	record := cloneHistoricalRecord(source.records[source.index])
	offset := record.AtUTC.Sub(source.metadata.StartedAtUTC)
	if offset < 0 || offset < source.last {
		return Frame[recording.HistoricalRecord]{}, ErrInvalidFixture
	}
	source.index++
	source.last = offset
	return Frame[recording.HistoricalRecord]{Offset: offset, Value: record}, nil
}

func (source *HistoricalSource) Close() error {
	if source.closed {
		return nil
	}
	source.closed = true
	return source.reader.Close()
}

func cloneHistoricalRecord(record recording.HistoricalRecord) recording.HistoricalRecord {
	if record.Observed != nil {
		value := *record.Observed
		value.Vehicles = append([]recording.RecordingVehicleV1(nil), value.Vehicles...)
		record.Observed = &value
	}
	if record.Fact != nil {
		value := *record.Fact
		record.Fact = &value
	}
	return record
}

var _ Source[recording.HistoricalRecord] = (*HistoricalSource)(nil)
var _ io.Closer = (*HistoricalSource)(nil)
