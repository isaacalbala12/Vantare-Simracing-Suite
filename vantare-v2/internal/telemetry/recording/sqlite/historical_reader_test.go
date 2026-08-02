package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
)

func TestHistoricalReplayIsCausalPagedAndFrozen(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{Clock: fixedClock{now: testTime(20)}})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	defer writer.Close()
	for sequence := uint64(1); sequence <= 4; sequence++ {
		if _, err := writer.Append(ctx, batch(sequence, 2, true)); err != nil {
			t.Fatalf("Append(%d) error = %v", sequence, err)
		}
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	// A committed SQLite batch is not part of the stable historical snapshot
	// until the manifest checkpoint acknowledges its cursor.
	if _, err := writer.Append(ctx, batch(5, 2, true)); err != nil {
		t.Fatalf("Append(uncheckpointed 5) error = %v", err)
	}

	reader, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay() error = %v", err)
	}
	defer reader.Close()
	snapshot := reader.Snapshot()
	if snapshot.ID == "" || snapshot.ObservedCount != 4 || snapshot.FactCount != 4 ||
		snapshot.LastObserved != (recording.Cursor{Epoch: 1, Sequence: 4}) ||
		snapshot.LastFact != (recording.Cursor{Epoch: 1, Sequence: 4}) {
		t.Fatalf("snapshot = %#v", snapshot)
	}
	if snapshot.Manifest.LastCheckpointAtUTC == nil {
		t.Fatal("snapshot lost checkpoint metadata")
	}
	*snapshot.Manifest.LastCheckpointAtUTC = testTime(99)
	if reader.Snapshot().Manifest.LastCheckpointAtUTC.Equal(testTime(99)) {
		t.Fatal("caller mutated reader-owned manifest metadata")
	}

	// Establishing the reader snapshot must also isolate later uncheckpointed
	// commits while the writer remains active.
	if _, err := writer.Append(ctx, batch(6, 2, true)); err != nil {
		t.Fatalf("Append(uncheckpointed 6) error = %v", err)
	}

	var (
		after   *recording.HistoricalPosition
		records []recording.HistoricalRecord
	)
	for {
		page, err := reader.QueryPage(ctx, recording.HistoricalQuery{
			SnapshotID: snapshot.ID,
			After:      after,
			Limit:      1,
		})
		if err != nil {
			t.Fatalf("QueryPage() error = %v", err)
		}
		records = append(records, page.Records...)
		if page.Next == nil {
			break
		}
		next := *page.Next
		after = &next
	}
	if len(records) != 8 {
		t.Fatalf("records = %d, want frozen 8", len(records))
	}
	for index := 0; index < len(records); index += 2 {
		sequence := uint64(index/2 + 1)
		observed, fact := records[index], records[index+1]
		if observed.Position != (recording.HistoricalPosition{
			Epoch: 1, CausalSequence: sequence,
			Kind: recording.HistoricalObserved, Sequence: sequence,
		}) || fact.Position != (recording.HistoricalPosition{
			Epoch: 1, CausalSequence: sequence,
			Kind: recording.HistoricalFact, Sequence: sequence,
		}) {
			t.Fatalf("records %d/%d = %#v / %#v", index, index+1, observed, fact)
		}
	}
}

func TestHistoricalReplaySnapshotIDsAreUniquePerReader(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{Clock: fixedClock{now: testTime(20)}})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	if _, err := writer.Append(ctx, batch(1, 1, false)); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	defer writer.Close()
	first, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay(first) error = %v", err)
	}
	defer first.Close()
	second, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay(second) error = %v", err)
	}
	defer second.Close()
	if first.Snapshot().ID == second.Snapshot().ID {
		t.Fatalf("reader snapshot IDs collided: %q", first.Snapshot().ID)
	}
}

func TestHistoricalReplayHidesEntireUncheckpointedChunkEvenWhenFactCauseIsOld(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	for sequence := uint64(1); sequence <= 4; sequence++ {
		if _, err := writer.Append(ctx, batch(sequence, 1, true)); err != nil {
			t.Fatalf("Append(%d) error = %v", sequence, err)
		}
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint(4) error = %v", err)
	}
	later := batch(5, 1, true)
	later.Facts[0].CausalSnapshotSequence = 4
	if _, err := writer.Append(ctx, later); err != nil {
		t.Fatalf("Append(uncheckpointed 5) error = %v", err)
	}
	before, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay(before checkpoint) error = %v", err)
	}
	if before.Snapshot().ObservedCount != 4 || before.Snapshot().FactCount != 4 {
		t.Fatalf("before checkpoint snapshot = %#v", before.Snapshot())
	}
	if err := before.Close(); err != nil {
		t.Fatalf("Close(before) error = %v", err)
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint(5) error = %v", err)
	}
	after, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay(after checkpoint) error = %v", err)
	}
	defer after.Close()
	if after.Snapshot().ObservedCount != 5 || after.Snapshot().FactCount != 5 {
		t.Fatalf("after checkpoint snapshot = %#v", after.Snapshot())
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close() error = %v", err)
	}
}

func TestHistoricalReplayAcceptsUnixEpochTimestamp(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	input := batch(1, 1, true)
	input.Observed[0].CapturedAtUTC = time.Unix(0, 0).UTC()
	input.Facts[0].OccurredAtUTC = time.Unix(0, 1).UTC()
	if _, err := writer.Append(ctx, input); err != nil {
		t.Fatalf("Append(epoch timestamps) error = %v", err)
	}
	if _, err := writer.Complete(ctx); err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("writer.Close() error = %v", err)
	}
	reader, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay(epoch timestamps) error = %v", err)
	}
	defer reader.Close()
	page, err := reader.QueryPage(ctx, recording.HistoricalQuery{
		SnapshotID: reader.Snapshot().ID,
		Limit:      2,
	})
	if err != nil {
		t.Fatalf("QueryPage() error = %v", err)
	}
	if len(page.Records) != 2 ||
		!page.Records[0].AtUTC.Equal(time.Unix(0, 0).UTC()) ||
		!page.Records[1].AtUTC.Equal(time.Unix(0, 1).UTC()) {
		t.Fatalf("epoch records = %#v", page.Records)
	}
}

func TestHistoricalReplayRejectsWrongSnapshotAndFiltersFacts(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	if _, err := writer.Append(ctx, batch(1, 1, true)); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	defer writer.Close()
	reader, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay() error = %v", err)
	}
	defer reader.Close()

	if _, err := reader.QueryPage(ctx, recording.HistoricalQuery{
		SnapshotID: "another-reader",
		Limit:      2,
	}); !errors.Is(err, recording.ErrHistoricalSnapshot) {
		t.Fatalf("QueryPage(wrong snapshot) error = %v", err)
	}
	page, err := reader.QueryPage(ctx, recording.HistoricalQuery{
		SnapshotID: reader.Snapshot().ID,
		Limit:      2,
		FactTypes:  []recording.FactType{recording.FactPitEntered},
	})
	if err != nil {
		t.Fatalf("QueryPage(filtered) error = %v", err)
	}
	if len(page.Records) != 1 || page.Records[0].Position.Kind != recording.HistoricalObserved {
		t.Fatalf("filtered records = %#v", page.Records)
	}
}

func TestHistoricalReplayTimeWindowKeepsCausalSnapshotAndFactsTogether(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	input := batch(1, 1, true)
	input.Facts[0].OccurredAtUTC = testTime(3)
	if _, err := writer.Append(ctx, input); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	defer writer.Close()
	reader, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay() error = %v", err)
	}
	defer reader.Close()
	snapshotID := reader.Snapshot().ID
	end := testTime(2)
	page, err := reader.QueryPage(ctx, recording.HistoricalQuery{
		SnapshotID: snapshotID,
		EndUTC:     &end,
		Limit:      4,
	})
	if err != nil {
		t.Fatalf("QueryPage(end window) error = %v", err)
	}
	if len(page.Records) != 2 ||
		page.Records[0].Position.Kind != recording.HistoricalObserved ||
		page.Records[1].Position.Kind != recording.HistoricalFact {
		t.Fatalf("end-window records = %#v, want causal observed then fact", page.Records)
	}
	start := testTime(2)
	page, err = reader.QueryPage(ctx, recording.HistoricalQuery{
		SnapshotID: snapshotID,
		StartUTC:   &start,
		Limit:      4,
	})
	if err != nil {
		t.Fatalf("QueryPage(start window) error = %v", err)
	}
	if len(page.Records) != 0 {
		t.Fatalf("start-window records = %#v, want no orphan fact", page.Records)
	}
}

func TestHistoricalReplayRejectsOrphanFactBeforeEmission(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	if _, err := writer.Append(ctx, batch(1, 1, true)); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	database, err := sql.Open("sqlite", writableDSN(
		filepath.Join(ref.Root, ref.SessionID, manifest.ActiveDatabase),
	))
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	if _, err := database.ExecContext(ctx, `
		UPDATE facts SET causal_snapshot_sequence = 99
		WHERE epoch = 1 AND fact_sequence = 1`); err != nil {
		t.Fatalf("corrupt fact cause error = %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("database.Close() error = %v", err)
	}
	if _, err := store.OpenHistoricalReplay(ctx, ref); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("OpenHistoricalReplay(orphan) error = %v, want integrity", err)
	}
}

func TestHistoricalReplayRejectsSequenceGapBeforeEmission(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	for sequence := uint64(1); sequence <= 3; sequence++ {
		if _, err := writer.Append(ctx, batch(sequence, 1, false)); err != nil {
			t.Fatalf("Append(%d) error = %v", sequence, err)
		}
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		t.Fatalf("Checkpoint() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	database, err := sql.Open("sqlite", writableDSN(
		filepath.Join(ref.Root, ref.SessionID, manifest.ActiveDatabase),
	))
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	if _, err := database.ExecContext(ctx, `
		PRAGMA foreign_keys = OFF;
		DELETE FROM observed_records WHERE epoch = 1 AND sequence = 2`); err != nil {
		t.Fatalf("delete middle record error = %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("database.Close() error = %v", err)
	}
	if _, err := store.OpenHistoricalReplay(ctx, ref); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("OpenHistoricalReplay(gap) error = %v, want integrity", err)
	}
}

func TestHistoricalReplayRejectsChunkMetadataBeforeEmission(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		update string
	}{
		{name: "schema", update: "UPDATE chunks SET schema_version = 2"},
		{name: "codec", update: "UPDATE chunks SET codec = 'gzip'"},
		{name: "observed count", update: "UPDATE chunks SET observed_count = observed_count + 1"},
		{name: "fact count", update: "UPDATE chunks SET fact_count = fact_count + 1"},
		{name: "payload bytes", update: "UPDATE chunks SET payload_bytes = payload_bytes + 1"},
		{name: "aggregate crc", update: "UPDATE chunks SET payload_crc32 = payload_crc32 + 1"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			ref, manifest := testSession(t.TempDir())
			store := New(Options{})
			writer, err := store.Begin(ctx, ref, manifest)
			if err != nil {
				t.Fatalf("Begin() error = %v", err)
			}
			if _, err := writer.Append(ctx, batch(1, 1, true)); err != nil {
				t.Fatalf("Append() error = %v", err)
			}
			if _, err := writer.Complete(ctx); err != nil {
				t.Fatalf("Complete() error = %v", err)
			}
			if err := writer.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
			database, err := sql.Open("sqlite", writableDSN(
				filepath.Join(ref.Root, ref.SessionID, manifest.ActiveDatabase),
			))
			if err != nil {
				t.Fatalf("sql.Open() error = %v", err)
			}
			if _, err := database.ExecContext(ctx, test.update); err != nil {
				t.Fatalf("corrupt chunk error = %v", err)
			}
			if err := database.Close(); err != nil {
				t.Fatalf("database.Close() error = %v", err)
			}
			if _, err := store.OpenHistoricalReplay(ctx, ref); !errors.Is(err, ErrIntegrity) {
				t.Fatalf("OpenHistoricalReplay(corrupt chunk) error = %v", err)
			}
		})
	}
}

func TestHistoricalReplayRejectsFactTypeColumnPayloadMismatch(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ref, manifest := testSession(t.TempDir())
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		t.Fatalf("Begin() error = %v", err)
	}
	if _, err := writer.Append(ctx, batch(1, 1, true)); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	if _, err := writer.Complete(ctx); err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	database, err := sql.Open("sqlite", writableDSN(
		filepath.Join(ref.Root, ref.SessionID, manifest.ActiveDatabase),
	))
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	if _, err := database.ExecContext(
		ctx,
		"UPDATE facts SET fact_type = ?",
		recording.FactPitEntered,
	); err != nil {
		t.Fatalf("corrupt fact type error = %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("database.Close() error = %v", err)
	}
	reader, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		t.Fatalf("OpenHistoricalReplay() error = %v", err)
	}
	defer reader.Close()
	if _, err := reader.QueryPage(ctx, recording.HistoricalQuery{
		SnapshotID: reader.Snapshot().ID,
		Limit:      4,
	}); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("QueryPage(mismatched fact type) error = %v", err)
	}
}

func TestHistoricalQueryValidation(t *testing.T) {
	t.Parallel()
	tests := []recording.HistoricalQuery{
		{},
		{SnapshotID: "snapshot", Limit: recording.MaxHistoricalPageSize + 1},
		{SnapshotID: "snapshot", Limit: 1, FactTypes: []recording.FactType{recording.FactUnknown}},
		{
			SnapshotID: "snapshot",
			Limit:      1,
			After:      &recording.HistoricalPosition{Epoch: 1, Kind: recording.HistoricalObserved},
		},
	}
	for _, query := range tests {
		if err := query.Validate(); !errors.Is(err, recording.ErrInvalidHistoricalQuery) {
			t.Fatalf("Validate(%#v) error = %v", query, err)
		}
	}
}

func BenchmarkHistoricalReplayPage512(b *testing.B) {
	ctx := context.Background()
	ref, manifest := testSession(b.TempDir())
	store := New(Options{})
	writer, err := store.Begin(ctx, ref, manifest)
	if err != nil {
		b.Fatalf("Begin() error = %v", err)
	}
	for sequence := uint64(1); sequence <= 1024; sequence++ {
		if _, err := writer.Append(ctx, batch(sequence, 64, sequence%10 == 0)); err != nil {
			b.Fatalf("Append(%d) error = %v", sequence, err)
		}
	}
	if _, err := writer.Checkpoint(ctx); err != nil {
		b.Fatalf("Checkpoint() error = %v", err)
	}
	reader, err := store.OpenHistoricalReplay(ctx, ref)
	if err != nil {
		b.Fatalf("OpenHistoricalReplay() error = %v", err)
	}
	b.Cleanup(func() {
		_ = reader.Close()
		_ = writer.Close()
	})
	query := recording.HistoricalQuery{
		SnapshotID: reader.Snapshot().ID,
		Limit:      512,
	}
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		page, err := reader.QueryPage(ctx, query)
		if err != nil {
			b.Fatalf("QueryPage() error = %v", err)
		}
		if len(page.Records) != 512 || page.Next == nil {
			b.Fatalf("page = %d, next = %v", len(page.Records), page.Next)
		}
	}
}
