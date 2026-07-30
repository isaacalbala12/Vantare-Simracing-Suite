package sqlite

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
	_ "modernc.org/sqlite"
)

const (
	applicationID = 0x56414E54
	schemaVersion = 1
	manifestName  = "manifest.json"
)

var (
	ErrDatabaseIdentity = errors.New("recording database identity mismatch")
	ErrIntegrity        = errors.New("recording database integrity check failed")
	ErrCursorRegression = errors.New("recording cursor regression")
	ErrStorageLimit     = errors.New("recording session storage limit reached")
	ErrSessionExists    = errors.New("recording session already exists")
	ErrSessionActive    = errors.New("recording session is active")
	ErrFutureManifest   = errors.New("recording manifest version is newer than supported")
)

type FaultPoint string

const (
	FaultBeforeAppend   FaultPoint = "before_append"
	FaultBeforeCommit   FaultPoint = "before_commit"
	FaultBeforeManifest FaultPoint = "before_manifest"
	FaultAfterCommit    FaultPoint = "after_commit_before_manifest"
	FaultAfterManifest  FaultPoint = "after_manifest_replace"
	FaultBeforeRecovery FaultPoint = "before_recovery"
)

type FaultInjector interface {
	Check(FaultPoint) error
}

type Store struct {
	files           FileSystem
	clock           recording.Clock
	fault           FaultInjector
	maxSessionBytes int64
}

type Options struct {
	Files FileSystem
	Clock recording.Clock
	Fault FaultInjector
	// MaxSessionBytes stops recording after the committed batch that crosses
	// the limit. Zero leaves policy to the composition root. Data is never
	// deleted automatically.
	MaxSessionBytes int64
}

func New(options Options) *Store {
	files := options.Files
	if files == nil {
		files = OSFileSystem{}
	}
	clock := options.Clock
	if clock == nil {
		clock = utcClock{}
	}
	return &Store{
		files: files, clock: clock, fault: options.Fault,
		maxSessionBytes: options.MaxSessionBytes,
	}
}

type utcClock struct{}

func (utcClock) Now() time.Time { return time.Now().UTC() }

func (s *Store) Begin(
	ctx context.Context,
	ref recording.SessionRef,
	manifest recording.SessionManifest,
) (recording.SessionWriter, error) {
	sessionDir, err := sessionDirectory(ref)
	if err != nil {
		return nil, err
	}
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	if ref.SessionID != manifest.SessionID || s.maxSessionBytes < 0 {
		return nil, recording.ErrInvalidRecording
	}
	if err := s.files.MkdirAll(sessionDir, 0o700); err != nil {
		return nil, fmt.Errorf("create recording session: %w", err)
	}
	lease, err := acquireSessionLease(sessionDir)
	if err != nil {
		return nil, err
	}
	releaseLease := true
	defer func() {
		if releaseLease {
			_ = lease.Close()
		}
	}()
	for _, path := range []string{
		filepath.Join(sessionDir, manifestName),
		filepath.Join(sessionDir, manifest.ActiveDatabase),
	} {
		if _, err := s.files.Stat(path); err == nil {
			return nil, ErrSessionExists
		} else if !os.IsNotExist(err) {
			return nil, fmt.Errorf("inspect existing recording session: %w", err)
		}
	}
	databasePath := filepath.Join(sessionDir, manifest.ActiveDatabase)
	database, err := sql.Open("sqlite", writableDSN(databasePath))
	if err != nil {
		return nil, fmt.Errorf("open recording database: %w", err)
	}
	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)
	writer := &sessionWriter{
		store:        s,
		ref:          ref,
		sessionDir:   sessionDir,
		databasePath: databasePath,
		database:     database,
		manifest:     manifest,
		lease:        lease,
	}
	if err := writer.initialize(ctx); err != nil {
		_ = database.Close()
		return nil, err
	}
	if err := writer.persistManifest(ctx); err != nil {
		_ = database.Close()
		return nil, err
	}
	releaseLease = false
	return writer, nil
}

func (s *Store) Inspect(ctx context.Context, ref recording.SessionRef) (recording.SessionSummary, error) {
	sessionDir, err := sessionDirectory(ref)
	if err != nil {
		return recording.SessionSummary{}, err
	}
	manifest, future, err := s.readManifest(filepath.Join(sessionDir, manifestName))
	if err != nil {
		return recording.SessionSummary{}, err
	}
	if err := validateManifestEnvelope(manifest, ref); err != nil {
		return recording.SessionSummary{}, err
	}
	if future {
		manifest.AccessMode = recording.AccessReadOnly
		return recording.SessionSummary{
			Ref:                ref,
			Manifest:           manifest,
			EffectiveIntegrity: manifest.EffectiveIntegrity(),
			CountsKnown:        false,
		}, nil
	}
	databasePath := filepath.Join(sessionDir, manifest.ActiveDatabase)
	database, err := sql.Open("sqlite", readOnlyDSN(databasePath))
	if err != nil {
		return recording.SessionSummary{}, fmt.Errorf("open recording database read-only: %w", err)
	}
	defer database.Close()
	if err := validateDatabase(ctx, database, !future); err != nil {
		return recording.SessionSummary{}, err
	}
	if !future {
		databaseCursor, cursorErr := databaseCommittedCursor(ctx, database)
		if cursorErr != nil {
			return recording.SessionSummary{}, cursorErr
		}
		if !manifest.CommittedCursor.IsZero() && databaseCursor.Before(manifest.CommittedCursor) {
			return recording.SessionSummary{}, ErrIntegrity
		}
	}
	bytesUsed, err := s.databaseBytes(databasePath)
	if err != nil {
		return recording.SessionSummary{}, err
	}
	var observed, facts uint64
	if err := database.QueryRowContext(ctx, "SELECT COUNT(*) FROM observed_records").Scan(&observed); err != nil {
		return recording.SessionSummary{}, fmt.Errorf("count observed: %w", err)
	}
	if err := database.QueryRowContext(ctx, "SELECT COUNT(*) FROM facts").Scan(&facts); err != nil {
		return recording.SessionSummary{}, fmt.Errorf("count facts: %w", err)
	}
	return recording.SessionSummary{
		Ref:                ref,
		Manifest:           manifest,
		EffectiveIntegrity: manifest.EffectiveIntegrity(),
		ObservedCount:      observed,
		FactCount:          facts,
		CountsKnown:        true,
		Bytes:              bytesUsed,
	}, nil
}

func (s *Store) OpenReader(ctx context.Context, ref recording.SessionRef) (recording.SessionReader, error) {
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
		return nil, fmt.Errorf("open recording reader: %w", err)
	}
	database.SetMaxOpenConns(1)
	if err := validateDatabase(ctx, database, false); err != nil {
		_ = database.Close()
		return nil, err
	}
	return &sessionReader{database: database}, nil
}

func (s *Store) RecoverCopy(
	ctx context.Context,
	ref recording.SessionRef,
) (report recording.RecoveryReport, err error) {
	if err := s.checkFault(FaultBeforeRecovery); err != nil {
		return recording.RecoveryReport{}, err
	}
	sessionDir, err := sessionDirectory(ref)
	if err != nil {
		return recording.RecoveryReport{}, err
	}
	lease, err := acquireSessionLease(sessionDir)
	if err != nil {
		return recording.RecoveryReport{}, err
	}
	defer func() {
		if closeErr := lease.Close(); err == nil && closeErr != nil {
			err = closeErr
		}
	}()
	manifest, future, err := s.readManifest(filepath.Join(sessionDir, manifestName))
	if err != nil {
		return recording.RecoveryReport{}, err
	}
	if err := validateManifestEnvelope(manifest, ref); err != nil {
		return recording.RecoveryReport{}, err
	}
	if future {
		return recording.RecoveryReport{}, ErrFutureManifest
	}
	originalDatabase := filepath.Join(sessionDir, manifest.ActiveDatabase)
	originalHash, err := s.bundleSHA256(originalDatabase)
	if err != nil {
		return recording.RecoveryReport{}, err
	}
	attemptID, err := randomLocalID()
	if err != nil {
		return recording.RecoveryReport{}, err
	}
	recoveryRoot := filepath.Join(sessionDir, "recovery")
	recoveredRef := recording.SessionRef{Root: recoveryRoot, SessionID: attemptID}
	recoveredDir, err := sessionDirectory(recoveredRef)
	if err != nil {
		return recording.RecoveryReport{}, err
	}
	if err := s.files.MkdirAll(recoveredDir, 0o700); err != nil {
		return recording.RecoveryReport{}, fmt.Errorf("create recovery directory: %w", err)
	}
	recoveredDatabase := filepath.Join(recoveredDir, manifest.ActiveDatabase)
	for _, suffix := range []string{"", "-wal", "-shm"} {
		source := originalDatabase + suffix
		if _, statErr := s.files.Stat(source); statErr != nil {
			if os.IsNotExist(statErr) && suffix != "" {
				continue
			}
			return recording.RecoveryReport{}, fmt.Errorf("stat recovery source: %w", statErr)
		}
		if err := s.files.CopyFile(source, recoveredDatabase+suffix, 0o600); err != nil {
			return recording.RecoveryReport{}, err
		}
	}
	recoveryDB, err := sql.Open("sqlite", writableDSN(recoveredDatabase))
	if err != nil {
		return recording.RecoveryReport{}, fmt.Errorf("open recovery copy: %w", err)
	}
	if _, err := recoveryDB.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		_ = recoveryDB.Close()
		return recording.RecoveryReport{}, fmt.Errorf("checkpoint recovery copy: %w", err)
	}
	if err := validateDatabase(ctx, recoveryDB, true); err != nil {
		_ = recoveryDB.Close()
		return recording.RecoveryReport{}, err
	}
	recoveredCursor, err := databaseCommittedCursor(ctx, recoveryDB)
	if err != nil {
		_ = recoveryDB.Close()
		return recording.RecoveryReport{}, err
	}
	if !manifest.CommittedCursor.IsZero() && recoveredCursor.Before(manifest.CommittedCursor) {
		_ = recoveryDB.Close()
		return recording.RecoveryReport{}, ErrIntegrity
	}
	if err := recoveryDB.Close(); err != nil {
		return recording.RecoveryReport{}, fmt.Errorf("close recovery copy: %w", err)
	}
	recoveredHash, err := s.bundleSHA256(recoveredDatabase)
	if err != nil {
		return recording.RecoveryReport{}, err
	}
	originalHashAfter, err := s.bundleSHA256(originalDatabase)
	if err != nil {
		return recording.RecoveryReport{}, err
	}
	if originalHashAfter != originalHash {
		return recording.RecoveryReport{}, errors.New("original recording changed during recovery")
	}
	now := s.clock.Now()
	manifest.SessionID = attemptID
	manifest.IntegrityState = recording.IntegrityIncomplete
	manifest.AccessMode = recording.AccessReadOnly
	manifest.IncompleteReason = recording.IncompleteInterrupted
	manifest.EndedAtUTC = &now
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return recording.RecoveryReport{}, fmt.Errorf("encode recovery manifest: %w", err)
	}
	if err := s.files.WriteAtomic(ctx, filepath.Join(recoveredDir, manifestName), data, 0o600); err != nil {
		return recording.RecoveryReport{}, err
	}
	return recording.RecoveryReport{
		Original:        ref,
		Recovered:       recoveredRef,
		OriginalSHA256:  originalHash,
		RecoveredSHA256: recoveredHash,
		Manifest:        manifest,
	}, nil
}

func (s *Store) readManifest(path string) (recording.SessionManifest, bool, error) {
	data, err := s.files.ReadFile(path)
	if err != nil {
		return recording.SessionManifest{}, false, fmt.Errorf("read recording manifest: %w", err)
	}
	var header struct {
		ManifestVersion uint16 `json:"manifestVersion"`
	}
	if err := json.Unmarshal(data, &header); err != nil || header.ManifestVersion == 0 {
		return recording.SessionManifest{}, false, recording.ErrInvalidManifest
	}
	var manifest recording.SessionManifest
	if header.ManifestVersion > recording.ManifestVersionV1 {
		if err := json.Unmarshal(data, &manifest); err != nil {
			return recording.SessionManifest{}, false, recording.ErrInvalidManifest
		}
		return manifest, true, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return recording.SessionManifest{}, false, recording.ErrInvalidManifest
	}
	if err := manifest.Validate(); err != nil {
		return recording.SessionManifest{}, false, err
	}
	return manifest, false, nil
}

func validateManifestEnvelope(manifest recording.SessionManifest, ref recording.SessionRef) error {
	if manifest.ManifestVersion == 0 ||
		manifest.RecordingSchemaVersion == 0 ||
		!safeSessionID(manifest.SessionID) ||
		manifest.SessionID != ref.SessionID ||
		filepath.IsAbs(manifest.ActiveDatabase) ||
		filepath.Base(manifest.ActiveDatabase) != manifest.ActiveDatabase ||
		manifest.ActiveDatabase != fmt.Sprintf("history-v%d.sqlite", manifest.RecordingSchemaVersion) {
		return recording.ErrInvalidManifest
	}
	return nil
}

func (s *Store) bundleSHA256(databasePath string) (string, error) {
	digest := sha256.New()
	for _, suffix := range []string{"", "-wal", "-shm"} {
		path := databasePath + suffix
		if _, err := s.files.Stat(path); err != nil {
			if os.IsNotExist(err) && suffix != "" {
				continue
			}
			return "", fmt.Errorf("stat recording bundle: %w", err)
		}
		fileDigest, err := s.files.SHA256(path)
		if err != nil {
			return "", err
		}
		_, _ = digest.Write([]byte(suffix))
		_, _ = digest.Write([]byte{0})
		_, _ = digest.Write([]byte(fileDigest))
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func (s *Store) databaseBytes(path string) (int64, error) {
	var total int64
	for _, suffix := range []string{"", "-wal", "-shm"} {
		info, err := s.files.Stat(path + suffix)
		if err != nil {
			if os.IsNotExist(err) && suffix != "" {
				continue
			}
			return 0, fmt.Errorf("stat recording database: %w", err)
		}
		total += info.Size()
	}
	return total, nil
}

func (s *Store) checkFault(point FaultPoint) error {
	if s.fault == nil {
		return nil
	}
	return s.fault.Check(point)
}

type sessionWriter struct {
	store        *Store
	ref          recording.SessionRef
	sessionDir   string
	databasePath string
	database     *sql.DB

	mu           sync.Mutex
	manifest     recording.SessionManifest
	accepted     recording.Cursor
	committed    recording.Cursor
	lastObserved recording.Cursor
	lastFact     recording.Cursor
	closed       bool
	lease        sessionLease
}

func (w *sessionWriter) initialize(ctx context.Context) error {
	statements := []string{
		"PRAGMA application_id = 1447120468",
		"PRAGMA user_version = 1",
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = FULL",
		"PRAGMA foreign_keys = ON",
		"PRAGMA busy_timeout = 5000",
		schemaSQL,
	}
	for _, statement := range statements {
		if _, err := w.database.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("initialize recording database: %w", err)
		}
	}
	return validateDatabase(ctx, w.database, true)
}

func (w *sessionWriter) Append(ctx context.Context, batch recording.RecordingBatch) (recording.Cursor, error) {
	if err := batch.Validate(); err != nil {
		return recording.Cursor{}, err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return recording.Cursor{}, recording.ErrClosed
	}
	if err := w.store.checkFault(FaultBeforeAppend); err != nil {
		return recording.Cursor{}, err
	}
	if err := validateNextCursor(w.lastObserved, batch.Observed); err != nil {
		return recording.Cursor{}, err
	}
	if err := validateNextFactCursor(w.lastFact, batch.Facts); err != nil {
		return recording.Cursor{}, err
	}
	tx, err := w.database.BeginTx(ctx, nil)
	if err != nil {
		return recording.Cursor{}, fmt.Errorf("begin recording batch: %w", err)
	}
	defer tx.Rollback()

	type observedRecord struct {
		payload []byte
		crc     uint32
		value   recording.RecordingPayloadV1
	}
	observed := make([]observedRecord, 0, len(batch.Observed))
	type factRecord struct {
		payload []byte
		crc     uint32
		value   recording.RecordingFactV1
	}
	facts := make([]factRecord, 0, len(batch.Facts))
	chunkCRC := crc32.NewIEEE()
	var payloadBytes int
	for _, value := range batch.Observed {
		payload, encodeErr := recording.EncodePayloadV1(value)
		if encodeErr != nil {
			return recording.Cursor{}, encodeErr
		}
		crc := crc32.ChecksumIEEE(payload)
		observed = append(observed, observedRecord{payload: payload, crc: crc, value: value})
		_, _ = chunkCRC.Write(payload)
		payloadBytes += len(payload)
	}
	for _, value := range batch.Facts {
		payload, encodeErr := recording.EncodeFactV1(value)
		if encodeErr != nil {
			return recording.Cursor{}, encodeErr
		}
		crc := crc32.ChecksumIEEE(payload)
		facts = append(facts, factRecord{payload: payload, crc: crc, value: value})
		_, _ = chunkCRC.Write(payload)
		payloadBytes += len(payload)
	}
	first, last, firstAt, lastAt := batchBounds(batch)
	result, err := tx.ExecContext(ctx, `
		INSERT INTO chunks (
			schema_version, codec, epoch, first_sequence, last_sequence,
			first_captured_at_ns, last_captured_at_ns, observed_count, fact_count,
			payload_bytes, payload_crc32, durable_at_ns
		) VALUES (?, 'none', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		schemaVersion, first.Epoch, first.Sequence, last.Sequence,
		firstAt.UnixNano(), lastAt.UnixNano(), len(observed), len(facts),
		payloadBytes, chunkCRC.Sum32(), w.store.clock.Now().UnixNano(),
	)
	if err != nil {
		return recording.Cursor{}, fmt.Errorf("insert recording chunk: %w", err)
	}
	chunkID, err := result.LastInsertId()
	if err != nil {
		return recording.Cursor{}, fmt.Errorf("recording chunk id: %w", err)
	}
	for _, record := range observed {
		var source any
		if record.value.SourceTimeNS != nil {
			source = *record.value.SourceTimeNS
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO observed_records
				(epoch, sequence, captured_at_ns, source_time_ns, chunk_id, payload, payload_crc32)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			record.value.Epoch, record.value.Sequence, record.value.CapturedAtUTC.UnixNano(),
			source, chunkID, record.payload, record.crc,
		); err != nil {
			return recording.Cursor{}, fmt.Errorf("insert observed record: %w", err)
		}
	}
	for _, record := range facts {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO facts
				(epoch, fact_sequence, causal_snapshot_sequence, occurred_at_ns,
				 chunk_id, fact_type, payload, payload_crc32)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			record.value.Epoch, record.value.FactSequence, record.value.CausalSnapshotSequence,
			record.value.OccurredAtUTC.UnixNano(), chunkID, record.value.FactType,
			record.payload, record.crc,
		); err != nil {
			return recording.Cursor{}, fmt.Errorf("insert recording fact: %w", err)
		}
	}
	if err := w.store.checkFault(FaultBeforeCommit); err != nil {
		return recording.Cursor{}, err
	}
	if err := tx.Commit(); err != nil {
		return recording.Cursor{}, fmt.Errorf("commit recording batch: %w", err)
	}
	if err := w.store.checkFault(FaultAfterCommit); err != nil {
		return recording.Cursor{}, err
	}
	if len(batch.Observed) > 0 {
		w.lastObserved = batch.Observed[len(batch.Observed)-1].Cursor()
	}
	if len(batch.Facts) > 0 {
		w.lastFact = batch.Facts[len(batch.Facts)-1].Cursor()
	}
	w.accepted = batch.Accepted
	w.committed = batch.Accepted
	if w.store.maxSessionBytes > 0 {
		bytesUsed, sizeErr := w.store.databaseBytes(w.databasePath)
		if sizeErr != nil {
			return w.committed, sizeErr
		}
		if bytesUsed > w.store.maxSessionBytes {
			return w.committed, ErrStorageLimit
		}
	}
	return w.committed, nil
}

func (w *sessionWriter) Checkpoint(ctx context.Context) (recording.PersistedWatermark, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return recording.PersistedWatermark{}, recording.ErrClosed
	}
	if _, err := w.database.ExecContext(ctx, "PRAGMA wal_checkpoint(PASSIVE)"); err != nil {
		return recording.PersistedWatermark{}, fmt.Errorf("checkpoint recording WAL: %w", err)
	}
	now := w.store.clock.Now()
	w.manifest.PersistedAcceptedCursor = w.accepted
	w.manifest.CommittedCursor = w.committed
	w.manifest.LastCheckpointAtUTC = &now
	if err := w.persistManifest(ctx); err != nil {
		return recording.PersistedWatermark{}, err
	}
	return recording.PersistedWatermark{Accepted: w.accepted, Committed: w.committed, AtUTC: now}, nil
}

func (w *sessionWriter) Complete(ctx context.Context) (recording.PersistedWatermark, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return recording.PersistedWatermark{}, recording.ErrClosed
	}
	if _, err := w.database.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return recording.PersistedWatermark{}, fmt.Errorf("complete recording WAL: %w", err)
	}
	now := w.store.clock.Now()
	w.manifest.IntegrityState = recording.IntegrityComplete
	w.manifest.EndedAtUTC = &now
	w.manifest.PersistedAcceptedCursor = w.accepted
	w.manifest.CommittedCursor = w.committed
	w.manifest.LastCheckpointAtUTC = &now
	if err := w.persistManifest(ctx); err != nil {
		return recording.PersistedWatermark{}, err
	}
	return recording.PersistedWatermark{Accepted: w.accepted, Committed: w.committed, AtUTC: now}, nil
}

func (w *sessionWriter) Abort(ctx context.Context, reason recording.IncompleteReason, _ recording.Cursor) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return nil
	}
	now := w.store.clock.Now()
	w.manifest.IntegrityState = recording.IntegrityIncomplete
	w.manifest.EndedAtUTC = &now
	w.manifest.IncompleteReason = reason
	w.manifest.CommittedCursor = w.committed
	w.manifest.LastCheckpointAtUTC = &now
	return w.persistManifest(ctx)
}

func (w *sessionWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return nil
	}
	w.closed = true
	databaseErr := w.database.Close()
	leaseErr := w.lease.Close()
	return errors.Join(databaseErr, leaseErr)
}

func (w *sessionWriter) persistManifest(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := w.store.checkFault(FaultBeforeManifest); err != nil {
		return err
	}
	if err := w.manifest.Validate(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(w.manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode recording manifest: %w", err)
	}
	if err := w.store.files.WriteAtomic(ctx, filepath.Join(w.sessionDir, manifestName), data, 0o600); err != nil {
		return fmt.Errorf("persist recording manifest: %w", err)
	}
	if err := w.store.checkFault(FaultAfterManifest); err != nil {
		return err
	}
	return nil
}

type sessionReader struct {
	mu       sync.Mutex
	database *sql.DB
	closed   bool
}

func (r *sessionReader) Observed(
	ctx context.Context,
	cursorRange recording.CursorRange,
) ([]recording.RecordingPayloadV1, error) {
	if err := cursorRange.Validate(); err != nil {
		return nil, err
	}
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return nil, recording.ErrClosed
	}
	database := r.database
	r.mu.Unlock()
	rows, err := database.QueryContext(ctx, `
		SELECT payload, payload_crc32
		FROM observed_records
		WHERE (epoch > ? OR (epoch = ? AND sequence >= ?))
		  AND (epoch < ? OR (epoch = ? AND sequence <= ?))
		ORDER BY epoch, sequence`,
		cursorRange.First.Epoch, cursorRange.First.Epoch, cursorRange.First.Sequence,
		cursorRange.Last.Epoch, cursorRange.Last.Epoch, cursorRange.Last.Sequence,
	)
	if err != nil {
		return nil, fmt.Errorf("query observed range: %w", err)
	}
	defer rows.Close()
	var result []recording.RecordingPayloadV1
	for rows.Next() {
		var payload []byte
		var expectedCRC uint32
		if err := rows.Scan(&payload, &expectedCRC); err != nil {
			return nil, fmt.Errorf("scan observed record: %w", err)
		}
		if crc32.ChecksumIEEE(payload) != expectedCRC {
			return nil, ErrIntegrity
		}
		value, err := recording.DecodePayloadV1(payload)
		if err != nil {
			return nil, err
		}
		result = append(result, value)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate observed range: %w", err)
	}
	return result, nil
}

func (r *sessionReader) Facts(
	ctx context.Context,
	cursorRange recording.CursorRange,
	types []recording.FactType,
) ([]recording.RecordingFactV1, error) {
	if err := cursorRange.Validate(); err != nil {
		return nil, err
	}
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return nil, recording.ErrClosed
	}
	database := r.database
	r.mu.Unlock()
	query := `
		SELECT payload, payload_crc32
		FROM facts
		WHERE (epoch > ? OR (epoch = ? AND fact_sequence >= ?))
		  AND (epoch < ? OR (epoch = ? AND fact_sequence <= ?))`
	args := []any{
		cursorRange.First.Epoch, cursorRange.First.Epoch, cursorRange.First.Sequence,
		cursorRange.Last.Epoch, cursorRange.Last.Epoch, cursorRange.Last.Sequence,
	}
	if len(types) > 0 {
		query += " AND fact_type IN ("
		for index, factType := range types {
			if !factType.Known() {
				return nil, recording.ErrInvalidRecording
			}
			if index > 0 {
				query += ","
			}
			query += "?"
			args = append(args, factType)
		}
		query += ")"
	}
	query += " ORDER BY epoch, fact_sequence"
	rows, err := database.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query fact range: %w", err)
	}
	defer rows.Close()
	var result []recording.RecordingFactV1
	for rows.Next() {
		var payload []byte
		var expectedCRC uint32
		if err := rows.Scan(&payload, &expectedCRC); err != nil {
			return nil, fmt.Errorf("scan fact record: %w", err)
		}
		if crc32.ChecksumIEEE(payload) != expectedCRC {
			return nil, ErrIntegrity
		}
		value, err := recording.DecodeFactV1(payload)
		if err != nil {
			return nil, err
		}
		result = append(result, value)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate fact range: %w", err)
	}
	return result, nil
}

func (r *sessionReader) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return nil
	}
	r.closed = true
	return r.database.Close()
}

func validateDatabase(ctx context.Context, database *sql.DB, exactVersion bool) error {
	var application, version int
	if err := database.QueryRowContext(ctx, "PRAGMA application_id").Scan(&application); err != nil {
		return fmt.Errorf("read recording application id: %w", err)
	}
	if err := database.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("read recording schema version: %w", err)
	}
	if application != applicationID || (exactVersion && version != schemaVersion) {
		return ErrDatabaseIdentity
	}
	var integrity string
	if err := database.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&integrity); err != nil {
		return fmt.Errorf("check recording integrity: %w", err)
	}
	if integrity != "ok" {
		return ErrIntegrity
	}
	return nil
}

func databaseCommittedCursor(ctx context.Context, database *sql.DB) (recording.Cursor, error) {
	var cursor recording.Cursor
	err := database.QueryRowContext(ctx, `
		SELECT epoch, last_sequence
		FROM chunks
		ORDER BY epoch DESC, last_sequence DESC
		LIMIT 1`).Scan(&cursor.Epoch, &cursor.Sequence)
	if errors.Is(err, sql.ErrNoRows) {
		return recording.Cursor{}, nil
	}
	if err != nil {
		return recording.Cursor{}, fmt.Errorf("read database committed cursor: %w", err)
	}
	return cursor, nil
}

func validateNextCursor(last recording.Cursor, payloads []recording.RecordingPayloadV1) error {
	if len(payloads) == 0 {
		return nil
	}
	first := payloads[0].Cursor()
	if !last.IsZero() && !cursorFollows(last, first) {
		return ErrCursorRegression
	}
	return nil
}

func validateNextFactCursor(last recording.Cursor, facts []recording.RecordingFactV1) error {
	if len(facts) == 0 {
		return nil
	}
	first := facts[0].Cursor()
	if !last.IsZero() && !cursorFollows(last, first) {
		return ErrCursorRegression
	}
	return nil
}

func cursorFollows(previous, next recording.Cursor) bool {
	if previous.Epoch == next.Epoch {
		return previous.Sequence < ^uint64(0) && next.Sequence == previous.Sequence+1
	}
	return next.Epoch > previous.Epoch && next.Sequence == 1
}

func batchBounds(batch recording.RecordingBatch) (recording.Cursor, recording.Cursor, time.Time, time.Time) {
	first := batch.Observed[0].Cursor()
	last := batch.Observed[len(batch.Observed)-1].Cursor()
	var firstAt, lastAt time.Time
	considerTime := func(captured time.Time) {
		if firstAt.IsZero() || captured.Before(firstAt) {
			firstAt = captured
		}
		if lastAt.IsZero() || captured.After(lastAt) {
			lastAt = captured
		}
	}
	for _, payload := range batch.Observed {
		considerTime(payload.CapturedAtUTC)
	}
	for _, fact := range batch.Facts {
		considerTime(fact.OccurredAtUTC)
	}
	return first, last, firstAt, lastAt
}

func sessionDirectory(ref recording.SessionRef) (string, error) {
	if ref.Root == "" || !safeSessionID(ref.SessionID) {
		return "", recording.ErrInvalidRecording
	}
	root, err := filepath.Abs(ref.Root)
	if err != nil {
		return "", recording.ErrInvalidRecording
	}
	directory := filepath.Join(root, ref.SessionID)
	relative, err := filepath.Rel(root, directory)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", recording.ErrInvalidRecording
	}
	return directory, nil
}

func safeSessionID(value string) bool {
	if len(value) < 8 || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '-' || character == '_' {
			continue
		}
		return false
	}
	return true
}

func writableDSN(path string) string {
	return fileDSN(path, "rwc", []string{"busy_timeout(5000)"})
}

func readOnlyDSN(path string) string {
	return fileDSN(path, "ro", []string{"busy_timeout(5000)", "query_only(1)"})
}

func fileDSN(path, mode string, pragmas []string) string {
	normalized := filepath.ToSlash(path)
	if filepath.IsAbs(path) && !strings.HasPrefix(normalized, "/") {
		normalized = "/" + normalized
	}
	query := url.Values{"mode": []string{mode}}
	for _, pragma := range pragmas {
		query.Add("_pragma", pragma)
	}
	dsn := url.URL{Scheme: "file", Path: normalized, RawQuery: query.Encode()}
	return dsn.String()
}

func randomLocalID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", fmt.Errorf("generate recovery id: %w", err)
	}
	return "recovery-" + hex.EncodeToString(bytes[:]), nil
}

const schemaSQL = `
CREATE TABLE IF NOT EXISTS recording_meta (
	key TEXT PRIMARY KEY,
	value BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
	chunk_id INTEGER PRIMARY KEY,
	schema_version INTEGER NOT NULL,
	codec TEXT NOT NULL,
	epoch INTEGER NOT NULL,
	first_sequence INTEGER NOT NULL,
	last_sequence INTEGER NOT NULL,
	first_captured_at_ns INTEGER NOT NULL,
	last_captured_at_ns INTEGER NOT NULL,
	observed_count INTEGER NOT NULL,
	fact_count INTEGER NOT NULL,
	payload_bytes INTEGER NOT NULL,
	payload_crc32 INTEGER NOT NULL,
	durable_at_ns INTEGER NOT NULL,
	UNIQUE(epoch, first_sequence),
	CHECK(last_sequence >= first_sequence)
);
CREATE TABLE IF NOT EXISTS observed_records (
	epoch INTEGER NOT NULL,
	sequence INTEGER NOT NULL,
	captured_at_ns INTEGER NOT NULL,
	source_time_ns INTEGER,
	chunk_id INTEGER NOT NULL REFERENCES chunks(chunk_id),
	payload BLOB NOT NULL,
	payload_crc32 INTEGER NOT NULL,
	PRIMARY KEY(epoch, sequence)
);
CREATE TABLE IF NOT EXISTS facts (
	epoch INTEGER NOT NULL,
	fact_sequence INTEGER NOT NULL,
	causal_snapshot_sequence INTEGER NOT NULL,
	occurred_at_ns INTEGER NOT NULL,
	chunk_id INTEGER NOT NULL REFERENCES chunks(chunk_id),
	fact_type INTEGER NOT NULL,
	payload BLOB NOT NULL,
	payload_crc32 INTEGER NOT NULL,
	PRIMARY KEY(epoch, fact_sequence)
);
CREATE TABLE IF NOT EXISTS algorithm_sets (
	algorithm_set_id INTEGER PRIMARY KEY,
	ordered_manifest BLOB NOT NULL,
	manifest_sha256 BLOB NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS derived_records (
	algorithm_set_id INTEGER NOT NULL REFERENCES algorithm_sets(algorithm_set_id),
	epoch INTEGER NOT NULL,
	sequence INTEGER NOT NULL,
	derived_at_ns INTEGER NOT NULL,
	payload BLOB NOT NULL,
	payload_crc32 INTEGER NOT NULL,
	PRIMARY KEY(algorithm_set_id, epoch, sequence)
);
CREATE TABLE IF NOT EXISTS raw_segments (
	segment_id TEXT PRIMARY KEY,
	relative_path TEXT NOT NULL,
	schema_version INTEGER NOT NULL,
	codec TEXT NOT NULL,
	first_captured_at_ns INTEGER NOT NULL,
	last_captured_at_ns INTEGER NOT NULL,
	byte_length INTEGER NOT NULL,
	sha256 BLOB NOT NULL,
	consent_revision INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS observed_by_time
	ON observed_records(captured_at_ns, epoch, sequence);
CREATE INDEX IF NOT EXISTS facts_by_time
	ON facts(occurred_at_ns, epoch, fact_sequence);
CREATE INDEX IF NOT EXISTS facts_by_type_time
	ON facts(fact_type, occurred_at_ns, epoch, fact_sequence);
`
