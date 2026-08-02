package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"hash/crc32"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
)

type historicalReader struct {
	mu       sync.Mutex
	database *sql.DB
	tx       *sql.Tx
	snapshot recording.HistoricalSnapshot
	closed   bool
}

func (s *Store) OpenHistoricalReplay(
	ctx context.Context,
	ref recording.SessionRef,
) (_ recording.HistoricalReplayReader, resultErr error) {
	sessionDir, err := sessionDirectory(ref)
	if err != nil {
		return nil, err
	}
	manifest, future, err := s.readManifest(filepath.Join(sessionDir, manifestName))
	if err != nil {
		return nil, err
	}
	if err := validateManifestEnvelope(manifest, ref); err != nil {
		return nil, err
	}
	if future {
		return nil, ErrFutureManifest
	}
	database, err := sql.Open("sqlite", readOnlyDSN(filepath.Join(sessionDir, manifest.ActiveDatabase)))
	if err != nil {
		return nil, fmt.Errorf("open historical replay database: %w", err)
	}
	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)
	defer func() {
		if resultErr != nil {
			_ = database.Close()
		}
	}()
	if err := validateDatabase(ctx, database, true); err != nil {
		return nil, err
	}
	tx, err := database.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("begin historical replay snapshot: %w", err)
	}
	defer func() {
		if resultErr != nil {
			_ = tx.Rollback()
		}
	}()

	snapshot, err := loadHistoricalSnapshot(
		ctx,
		tx,
		ref,
		manifest,
		s.clock.Now().Round(0).UTC(),
	)
	if err != nil {
		return nil, err
	}
	currentManifest, currentFuture, err := s.readManifest(filepath.Join(sessionDir, manifestName))
	if err != nil {
		return nil, err
	}
	if currentFuture || !reflect.DeepEqual(currentManifest, manifest) {
		return nil, recording.ErrHistoricalSnapshot
	}
	return &historicalReader{database: database, tx: tx, snapshot: snapshot}, nil
}

func loadHistoricalSnapshot(
	ctx context.Context,
	tx *sql.Tx,
	ref recording.SessionRef,
	manifest recording.SessionManifest,
	openedAt time.Time,
) (recording.HistoricalSnapshot, error) {
	if err := validateHistoricalChunks(ctx, tx, manifest.CommittedCursor); err != nil {
		return recording.HistoricalSnapshot{}, err
	}
	observedVisible, observedArgs := historicalVisibilityWhere(
		"observed.epoch",
		"observed.sequence",
		manifest.CommittedCursor,
	)
	factVisible, factArgs := historicalVisibilityWhere(
		"fact_chunk.epoch",
		"fact_chunk.last_sequence",
		manifest.CommittedCursor,
	)
	var observedCount, factCount uint64
	if err := tx.QueryRowContext(
		ctx,
		"SELECT COUNT(*) FROM observed_records AS observed WHERE "+observedVisible,
		observedArgs...,
	).Scan(&observedCount); err != nil {
		return recording.HistoricalSnapshot{}, fmt.Errorf("count historical observed: %w", err)
	}
	if err := tx.QueryRowContext(
		ctx,
		`SELECT COUNT(*)
		 FROM facts AS fact
		 JOIN chunks AS fact_chunk ON fact_chunk.chunk_id = fact.chunk_id
		 WHERE `+factVisible,
		factArgs...,
	).Scan(&factCount); err != nil {
		return recording.HistoricalSnapshot{}, fmt.Errorf("count historical facts: %w", err)
	}
	var orphanFacts uint64
	orphanQuery := `
		SELECT COUNT(*)
		FROM facts AS fact
		JOIN chunks AS fact_chunk ON fact_chunk.chunk_id = fact.chunk_id
		LEFT JOIN observed_records AS observed
		  ON observed.epoch = fact.epoch
		 AND observed.sequence = fact.causal_snapshot_sequence
		WHERE ` + factVisible + `
		  AND observed.sequence IS NULL`
	if err := tx.QueryRowContext(ctx, orphanQuery, factArgs...).Scan(&orphanFacts); err != nil {
		return recording.HistoricalSnapshot{}, fmt.Errorf("check historical fact causality: %w", err)
	}
	if orphanFacts != 0 {
		return recording.HistoricalSnapshot{}, ErrIntegrity
	}
	for _, stream := range []struct {
		table      string
		epoch      string
		sequence   string
		visibility string
		args       []any
	}{
		{
			table: "observed_records AS observed",
			epoch: "observed.epoch", sequence: "observed.sequence",
			visibility: observedVisible, args: observedArgs,
		},
		{
			table: `facts AS fact
				JOIN chunks AS fact_chunk ON fact_chunk.chunk_id = fact.chunk_id`,
			epoch:      "fact.epoch",
			sequence:   "fact.fact_sequence",
			visibility: factVisible, args: factArgs,
		},
	} {
		gaps, err := historicalSequenceGaps(
			ctx,
			tx,
			stream.table,
			stream.epoch,
			stream.sequence,
			stream.visibility,
			stream.args,
		)
		if err != nil {
			return recording.HistoricalSnapshot{}, err
		}
		if gaps != 0 {
			return recording.HistoricalSnapshot{}, ErrIntegrity
		}
	}
	lastObserved, err := historicalLastCursor(
		ctx,
		tx,
		"observed_records AS observed",
		"observed.epoch",
		"observed.sequence",
		observedVisible,
		observedArgs,
	)
	if err != nil {
		return recording.HistoricalSnapshot{}, err
	}
	lastFact, err := historicalLastCursor(
		ctx,
		tx,
		`facts AS fact
		 JOIN chunks AS fact_chunk ON fact_chunk.chunk_id = fact.chunk_id`,
		"fact.epoch",
		"fact.fact_sequence",
		factVisible,
		factArgs,
	)
	if err != nil {
		return recording.HistoricalSnapshot{}, err
	}
	var snapshotNonce [16]byte
	if _, err := rand.Read(snapshotNonce[:]); err != nil {
		return recording.HistoricalSnapshot{}, fmt.Errorf("generate historical snapshot id: %w", err)
	}
	return recording.HistoricalSnapshot{
		ID:                 hex.EncodeToString(snapshotNonce[:]),
		Ref:                ref,
		Manifest:           manifest,
		ObservedCount:      observedCount,
		FactCount:          factCount,
		LastObserved:       lastObserved,
		LastFact:           lastFact,
		OpenedAtUTC:        openedAt,
		EffectiveIntegrity: manifest.EffectiveIntegrity(),
	}, nil
}

func validateHistoricalChunks(
	ctx context.Context,
	tx *sql.Tx,
	committed recording.Cursor,
) error {
	visible, args := historicalVisibilityWhere(
		"chunk.epoch",
		"chunk.last_sequence",
		committed,
	)
	var expectedChunks uint64
	if err := tx.QueryRowContext(
		ctx,
		"SELECT COUNT(*) FROM chunks AS chunk WHERE "+visible,
		args...,
	).Scan(&expectedChunks); err != nil {
		return fmt.Errorf("count historical chunks: %w", err)
	}
	if committed.IsZero() {
		if expectedChunks != 0 {
			return ErrIntegrity
		}
		return nil
	}
	var partialChunks uint64
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM chunks AS chunk
		WHERE (chunk.epoch < ? OR (chunk.epoch = ? AND chunk.first_sequence <= ?))
		  AND NOT (chunk.epoch < ? OR (chunk.epoch = ? AND chunk.last_sequence <= ?))`,
		committed.Epoch, committed.Epoch, committed.Sequence,
		committed.Epoch, committed.Epoch, committed.Sequence,
	).Scan(&partialChunks); err != nil {
		return fmt.Errorf("check historical chunk boundary: %w", err)
	}
	if partialChunks != 0 {
		return ErrIntegrity
	}
	query := `
		WITH records AS (
			SELECT chunk_id, 1 AS kind, epoch, sequence,
			       sequence AS causal_sequence, captured_at_ns AS at_ns, payload
			FROM observed_records
			UNION ALL
			SELECT chunk_id, 2 AS kind, epoch, fact_sequence AS sequence,
			       causal_snapshot_sequence AS causal_sequence,
			       occurred_at_ns AS at_ns, payload
			FROM facts
		)
		SELECT chunk.chunk_id, chunk.schema_version, chunk.codec, chunk.epoch,
		       chunk.first_sequence, chunk.last_sequence,
		       chunk.first_captured_at_ns, chunk.last_captured_at_ns,
		       chunk.observed_count, chunk.fact_count, chunk.payload_bytes,
		       chunk.payload_crc32,
		       records.kind, records.epoch, records.sequence,
		       records.causal_sequence, records.at_ns, records.payload
		FROM chunks AS chunk
		JOIN records ON records.chunk_id = chunk.chunk_id
		WHERE ` + visible + `
		ORDER BY chunk.chunk_id, records.kind, records.sequence`
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("query historical chunk integrity: %w", err)
	}
	defer rows.Close()
	type chunkState struct {
		id                   int64
		schema               int
		codec                string
		epoch                uint64
		firstSequence        uint64
		lastSequence         uint64
		firstAt              int64
		lastAt               int64
		expectedObserved     uint64
		expectedFacts        uint64
		expectedPayloadBytes uint64
		expectedCRC          uint32
		observed             uint64
		facts                uint64
		payloadBytes         uint64
		crc                  uint32
		actualFirstSequence  uint64
		actualLastSequence   uint64
		actualFirstAt        int64
		actualLastAt         int64
		hasTimestamp         bool
	}
	var (
		current *chunkState
		seen    uint64
	)
	validate := func(chunk *chunkState) error {
		if chunk == nil {
			return nil
		}
		if chunk.schema != schemaVersion ||
			chunk.codec != "none" ||
			chunk.observed == 0 ||
			chunk.observed != chunk.expectedObserved ||
			chunk.facts != chunk.expectedFacts ||
			chunk.payloadBytes != chunk.expectedPayloadBytes ||
			chunk.crc != chunk.expectedCRC ||
			chunk.actualFirstSequence != chunk.firstSequence ||
			chunk.actualLastSequence != chunk.lastSequence ||
			!chunk.hasTimestamp ||
			chunk.actualFirstAt != chunk.firstAt ||
			chunk.actualLastAt != chunk.lastAt {
			return ErrIntegrity
		}
		return nil
	}
	for rows.Next() {
		var (
			candidate      chunkState
			kind           uint8
			recordEpoch    uint64
			recordSequence uint64
			causalSequence uint64
			atNS           int64
			payload        []byte
		)
		if err := rows.Scan(
			&candidate.id,
			&candidate.schema,
			&candidate.codec,
			&candidate.epoch,
			&candidate.firstSequence,
			&candidate.lastSequence,
			&candidate.firstAt,
			&candidate.lastAt,
			&candidate.expectedObserved,
			&candidate.expectedFacts,
			&candidate.expectedPayloadBytes,
			&candidate.expectedCRC,
			&kind,
			&recordEpoch,
			&recordSequence,
			&causalSequence,
			&atNS,
			&payload,
		); err != nil {
			return fmt.Errorf("scan historical chunk integrity: %w", err)
		}
		if current == nil || candidate.id != current.id {
			if err := validate(current); err != nil {
				return err
			}
			current = &candidate
			seen++
		}
		if recordEpoch != current.epoch {
			return ErrIntegrity
		}
		switch kind {
		case 1:
			if recordEpoch != current.epoch ||
				causalSequence != recordSequence {
				return ErrIntegrity
			}
			current.observed++
			if current.actualFirstSequence == 0 {
				current.actualFirstSequence = recordSequence
			}
			current.actualLastSequence = recordSequence
		case 2:
			if recordEpoch != current.epoch ||
				causalSequence > current.lastSequence {
				return ErrIntegrity
			}
			current.facts++
		default:
			return ErrIntegrity
		}
		if !current.hasTimestamp {
			current.actualFirstAt = atNS
			current.actualLastAt = atNS
			current.hasTimestamp = true
		} else if atNS < current.actualFirstAt {
			current.actualFirstAt = atNS
		} else if atNS > current.actualLastAt {
			current.actualLastAt = atNS
		}
		current.payloadBytes += uint64(len(payload))
		current.crc = crc32.Update(current.crc, crc32.IEEETable, payload)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate historical chunk integrity: %w", err)
	}
	if err := validate(current); err != nil {
		return err
	}
	if seen != expectedChunks {
		return ErrIntegrity
	}
	return nil
}

func historicalSequenceGaps(
	ctx context.Context,
	tx *sql.Tx,
	table string,
	epochColumn string,
	sequenceColumn string,
	visibility string,
	args []any,
) (uint64, error) {
	query := fmt.Sprintf(`
		WITH ordered AS (
			SELECT %[1]s AS epoch,
			       %[2]s AS sequence,
			       LAG(%[1]s) OVER (ORDER BY %[1]s, %[2]s) AS previous_epoch,
			       LAG(%[2]s) OVER (ORDER BY %[1]s, %[2]s) AS previous_sequence
			FROM %[3]s
			WHERE %[4]s
		)
		SELECT COUNT(*)
		FROM ordered
		WHERE (previous_epoch IS NULL AND sequence != 1)
		   OR (previous_epoch = epoch AND sequence != previous_sequence + 1)
		   OR (previous_epoch != epoch AND sequence != 1)`,
		epochColumn,
		sequenceColumn,
		table,
		visibility,
	)
	var gaps uint64
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&gaps); err != nil {
		return 0, fmt.Errorf("check historical sequence continuity: %w", err)
	}
	return gaps, nil
}

func historicalLastCursor(
	ctx context.Context,
	tx *sql.Tx,
	table string,
	epochColumn string,
	sequenceColumn string,
	visibility string,
	args []any,
) (recording.Cursor, error) {
	var cursor recording.Cursor
	query := fmt.Sprintf(
		"SELECT %s, %s FROM %s WHERE %s ORDER BY %s DESC, %s DESC LIMIT 1",
		epochColumn,
		sequenceColumn,
		table,
		visibility,
		epochColumn,
		sequenceColumn,
	)
	err := tx.QueryRowContext(ctx, query, args...).Scan(&cursor.Epoch, &cursor.Sequence)
	if errors.Is(err, sql.ErrNoRows) {
		return recording.Cursor{}, nil
	}
	if err != nil {
		return recording.Cursor{}, fmt.Errorf("read historical cursor: %w", err)
	}
	return cursor, nil
}

func (reader *historicalReader) Snapshot() recording.HistoricalSnapshot {
	reader.mu.Lock()
	defer reader.mu.Unlock()
	snapshot := reader.snapshot
	snapshot.Manifest = cloneHistoricalManifest(snapshot.Manifest)
	return snapshot
}

func (reader *historicalReader) QueryPage(
	ctx context.Context,
	query recording.HistoricalQuery,
) (recording.HistoricalPage, error) {
	query = cloneHistoricalQuery(query)
	if err := query.Validate(); err != nil {
		return recording.HistoricalPage{}, err
	}
	reader.mu.Lock()
	defer reader.mu.Unlock()
	if reader.closed {
		return recording.HistoricalPage{}, recording.ErrClosed
	}
	if query.SnapshotID != reader.snapshot.ID {
		return recording.HistoricalPage{}, recording.ErrHistoricalSnapshot
	}
	rows, err := reader.queryRows(ctx, query)
	if err != nil {
		return recording.HistoricalPage{}, err
	}
	defer rows.Close()

	records := make([]recording.HistoricalRecord, 0, int(query.Limit)+1)
	for rows.Next() {
		record, err := scanHistoricalRecord(rows)
		if err != nil {
			return recording.HistoricalPage{}, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return recording.HistoricalPage{}, fmt.Errorf("iterate historical replay page: %w", err)
	}
	page := recording.HistoricalPage{SnapshotID: reader.snapshot.ID}
	if len(records) > int(query.Limit) {
		records = records[:query.Limit]
		next := records[len(records)-1].Position
		page.Next = &next
	}
	page.Records = records
	return page, nil
}

func cloneHistoricalQuery(query recording.HistoricalQuery) recording.HistoricalQuery {
	query.FactTypes = append([]recording.FactType(nil), query.FactTypes...)
	if query.StartUTC != nil {
		value := *query.StartUTC
		query.StartUTC = &value
	}
	if query.EndUTC != nil {
		value := *query.EndUTC
		query.EndUTC = &value
	}
	if query.After != nil {
		value := *query.After
		query.After = &value
	}
	return query
}

func (reader *historicalReader) queryRows(
	ctx context.Context,
	query recording.HistoricalQuery,
) (*sql.Rows, error) {
	// A time window selects causal snapshots, not the independent wall clock of
	// each fact. This guarantees that a selected fact never appears without the
	// observed record that caused it.
	observedWhere, observedArgs := historicalTimeWhere("observed.captured_at_ns", query)
	factWhere, factArgs := historicalTimeWhere("causal.captured_at_ns", query)
	observedVisible, observedVisibleArgs := historicalVisibilityWhere(
		"observed.epoch",
		"observed.sequence",
		reader.snapshot.Manifest.CommittedCursor,
	)
	factVisible, factVisibleArgs := historicalVisibilityWhere(
		"fact_chunk.epoch",
		"fact_chunk.last_sequence",
		reader.snapshot.Manifest.CommittedCursor,
	)
	observedWhere += " AND " + observedVisible
	observedArgs = append(observedArgs, observedVisibleArgs...)
	factWhere += " AND " + factVisible
	factArgs = append(factArgs, factVisibleArgs...)
	if len(query.FactTypes) > 0 {
		factWhere += " AND fact.fact_type IN (" + strings.TrimRight(
			strings.Repeat("?,", len(query.FactTypes)),
			",",
		) + ")"
		for _, factType := range query.FactTypes {
			factArgs = append(factArgs, factType)
		}
	}
	statement := `
		WITH records AS (
			SELECT observed.epoch,
			       observed.sequence AS causal_sequence,
			       1 AS kind,
			       observed.sequence,
			       observed.captured_at_ns AS at_ns,
			       observed.payload,
			       observed.payload_crc32,
			       0 AS stored_fact_type
			FROM observed_records AS observed
			WHERE ` + observedWhere + `
			UNION ALL
			SELECT fact.epoch,
			       fact.causal_snapshot_sequence,
			       2 AS kind,
			       fact.fact_sequence AS sequence,
			       fact.occurred_at_ns AS at_ns,
			       fact.payload,
			       fact.payload_crc32,
			       fact.fact_type AS stored_fact_type
			FROM facts AS fact
			JOIN observed_records AS causal
			  ON causal.epoch = fact.epoch
			 AND causal.sequence = fact.causal_snapshot_sequence
			JOIN chunks AS fact_chunk ON fact_chunk.chunk_id = fact.chunk_id
			WHERE ` + factWhere + `
		)
		SELECT epoch, causal_sequence, kind, sequence, at_ns, payload,
		       payload_crc32, stored_fact_type
		FROM records
		WHERE 1 = 1`
	args := append(observedArgs, factArgs...)
	if query.After != nil {
		statement += `
		  AND (
		       epoch > ?
		    OR (epoch = ? AND causal_sequence > ?)
		    OR (epoch = ? AND causal_sequence = ? AND kind > ?)
		    OR (epoch = ? AND causal_sequence = ? AND kind = ? AND sequence > ?)
		  )`
		position := *query.After
		args = append(args,
			position.Epoch,
			position.Epoch, position.CausalSequence,
			position.Epoch, position.CausalSequence, position.Kind,
			position.Epoch, position.CausalSequence, position.Kind, position.Sequence,
		)
	}
	statement += `
		ORDER BY epoch, causal_sequence, kind, sequence
		LIMIT ?`
	args = append(args, uint64(query.Limit)+1)
	rows, err := reader.tx.QueryContext(ctx, statement, args...)
	if err != nil {
		return nil, fmt.Errorf("query historical replay page: %w", err)
	}
	return rows, nil
}

func historicalTimeWhere(column string, query recording.HistoricalQuery) (string, []any) {
	where := "1 = 1"
	var args []any
	if query.StartUTC != nil {
		where += " AND " + column + " >= ?"
		args = append(args, query.StartUTC.UnixNano())
	}
	if query.EndUTC != nil {
		where += " AND " + column + " <= ?"
		args = append(args, query.EndUTC.UnixNano())
	}
	return where, args
}

func scanHistoricalRecord(rows *sql.Rows) (recording.HistoricalRecord, error) {
	var (
		position       recording.HistoricalPosition
		atNS           int64
		payload        []byte
		expected       uint32
		storedFactType recording.FactType
	)
	if err := rows.Scan(
		&position.Epoch,
		&position.CausalSequence,
		&position.Kind,
		&position.Sequence,
		&atNS,
		&payload,
		&expected,
		&storedFactType,
	); err != nil {
		return recording.HistoricalRecord{}, fmt.Errorf("scan historical replay record: %w", err)
	}
	if crc32.ChecksumIEEE(payload) != expected {
		return recording.HistoricalRecord{}, ErrIntegrity
	}
	record := recording.HistoricalRecord{
		Position: position,
		AtUTC:    time.Unix(0, atNS).UTC(),
	}
	var err error
	switch position.Kind {
	case recording.HistoricalObserved:
		if storedFactType != recording.FactUnknown {
			return recording.HistoricalRecord{}, ErrIntegrity
		}
		var observed recording.RecordingPayloadV1
		observed, err = recording.DecodePayloadV1(payload)
		record.Observed = &observed
	case recording.HistoricalFact:
		var fact recording.RecordingFactV1
		fact, err = recording.DecodeFactV1(payload)
		if err == nil && fact.FactType != storedFactType {
			return recording.HistoricalRecord{}, ErrIntegrity
		}
		record.Fact = &fact
	default:
		return recording.HistoricalRecord{}, recording.ErrInvalidRecording
	}
	if err != nil {
		return recording.HistoricalRecord{}, err
	}
	if err := record.Validate(); err != nil {
		return recording.HistoricalRecord{}, err
	}
	return record, nil
}

func historicalVisibilityWhere(
	epochColumn string,
	sequenceColumn string,
	committed recording.Cursor,
) (string, []any) {
	if committed.IsZero() {
		return "0 = 1", nil
	}
	return "(" + epochColumn + " < ? OR (" + epochColumn + " = ? AND " +
			sequenceColumn + " <= ?))",
		[]any{committed.Epoch, committed.Epoch, committed.Sequence}
}

func (reader *historicalReader) Close() error {
	reader.mu.Lock()
	defer reader.mu.Unlock()
	if reader.closed {
		return nil
	}
	reader.closed = true
	rollbackErr := reader.tx.Rollback()
	if errors.Is(rollbackErr, sql.ErrTxDone) {
		rollbackErr = nil
	}
	return errors.Join(rollbackErr, reader.database.Close())
}

func cloneHistoricalManifest(
	manifest recording.SessionManifest,
) recording.SessionManifest {
	if manifest.EndedAtUTC != nil {
		ended := *manifest.EndedAtUTC
		manifest.EndedAtUTC = &ended
	}
	if manifest.LastCheckpointAtUTC != nil {
		checkpoint := *manifest.LastCheckpointAtUTC
		manifest.LastCheckpointAtUTC = &checkpoint
	}
	return manifest
}
