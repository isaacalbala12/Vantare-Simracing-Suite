//go:build sqlite

package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"

	_ "modernc.org/sqlite"
)

const (
	sqliteApplicationID = 0x56414E54 // "VANT"
	sqliteUserVersion   = 1
)

type sqlStore struct {
	db   *sql.DB
	tx   *sql.Tx
	stmt *sql.Stmt
}

func init() {
	register(candidate{Name: "sqlite", SupportsCommit: true, OpenWriter: openSQLiteStore, OpenReader: openSQLiteReader})
}

func openSQLiteStore(path string) (store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	for _, statement := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=FULL",
		fmt.Sprintf("PRAGMA application_id=%d", sqliteApplicationID),
		fmt.Sprintf("PRAGMA user_version=%d", sqliteUserVersion),
		`CREATE TABLE records (
			epoch INTEGER NOT NULL,
			sequence INTEGER NOT NULL,
			channel INTEGER NOT NULL,
			captured_at_ns INTEGER NOT NULL,
			payload BLOB NOT NULL,
			payload_crc INTEGER NOT NULL,
			PRIMARY KEY (epoch, sequence)
		)`,
		"CREATE INDEX records_time ON records(captured_at_ns, sequence)",
		"CREATE INDEX records_channel_time ON records(channel, captured_at_ns, sequence)",
	} {
		if _, err := db.Exec(statement); err != nil {
			db.Close()
			return nil, fmt.Errorf("initialize sqlite with %q: %w", statement, err)
		}
	}
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("begin sqlite batch: %w", err)
	}
	stmt, err := tx.Prepare("INSERT INTO records(epoch, sequence, channel, captured_at_ns, payload, payload_crc) VALUES (?, ?, ?, ?, ?, ?)")
	if err != nil {
		tx.Rollback()
		db.Close()
		return nil, fmt.Errorf("prepare sqlite append: %w", err)
	}
	return &sqlStore{db: db, tx: tx, stmt: stmt}, nil
}

func (s *sqlStore) Append(rec record) error {
	if _, err := s.stmt.Exec(rec.Epoch, rec.Sequence, rec.Channel, rec.Timestamp, rec.Payload, rec.PayloadCRC); err != nil {
		return fmt.Errorf("append sqlite record: %w", err)
	}
	return nil
}

func (s *sqlStore) Sync() error {
	if err := s.stmt.Close(); err != nil {
		return fmt.Errorf("close sqlite statement: %w", err)
	}
	if err := s.tx.Commit(); err != nil {
		return fmt.Errorf("commit sqlite batch: %w", err)
	}
	tx, err := s.db.BeginTx(context.Background(), nil)
	if err != nil {
		return fmt.Errorf("begin next sqlite batch: %w", err)
	}
	stmt, err := tx.Prepare("INSERT INTO records(epoch, sequence, channel, captured_at_ns, payload, payload_crc) VALUES (?, ?, ?, ?, ?, ?)")
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("prepare next sqlite batch: %w", err)
	}
	s.tx, s.stmt = tx, stmt
	return nil
}

func (s *sqlStore) Close() error {
	return errors.Join(s.stmt.Close(), s.tx.Rollback(), s.db.Close())
}

type sqlReader struct{ db *sql.DB }

func openSQLiteReader(path string) (reader, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("open sqlite reader: %w", err)
	}
	return &sqlReader{db: db}, nil
}

func (r *sqlReader) Summarize(from, to int64) (summary, error) {
	rows, err := r.db.Query(`SELECT epoch, sequence, channel, captured_at_ns, payload, payload_crc
		FROM records WHERE captured_at_ns BETWEEN ? AND ? ORDER BY epoch, sequence`, from, to)
	if err != nil {
		return summary{}, fmt.Errorf("query sqlite records: %w", err)
	}
	defer rows.Close()
	var result summary
	digest := sha256.New()
	for rows.Next() {
		var rec record
		if err := rows.Scan(&rec.Epoch, &rec.Sequence, &rec.Channel, &rec.Timestamp, &rec.Payload, &rec.PayloadCRC); err != nil {
			return summary{}, fmt.Errorf("scan sqlite record: %w", err)
		}
		if err := updateSummary(&result, rec, digest); err != nil {
			return summary{}, err
		}
	}
	if err := rows.Err(); err != nil {
		return summary{}, fmt.Errorf("iterate sqlite records: %w", err)
	}
	copy(result.Digest[:], digest.Sum(nil))
	return result, nil
}

func (r *sqlReader) Close() error { return r.db.Close() }
