//go:build duckdb

package main

import (
	"crypto/sha256"
	"database/sql"
	"fmt"

	_ "github.com/duckdb/duckdb-go/v2"
)

type duckStore struct {
	db   *sql.DB
	tx   *sql.Tx
	stmt *sql.Stmt
}

func init() {
	register(candidate{Name: "duckdb", SupportsCommit: true, OpenWriter: openDuckStore, OpenReader: openDuckReader})
}

func openDuckStore(path string) (store, error) {
	db, err := sql.Open("duckdb", path)
	if err != nil {
		return nil, fmt.Errorf("open duckdb: %w", err)
	}
	if _, err := db.Exec(`CREATE TABLE records (
		epoch UBIGINT NOT NULL, sequence UBIGINT NOT NULL, channel USMALLINT NOT NULL,
		captured_at_ns BIGINT NOT NULL, payload BLOB NOT NULL, payload_crc UINTEGER NOT NULL,
		PRIMARY KEY(epoch, sequence))`); err != nil {
		db.Close()
		return nil, fmt.Errorf("initialize duckdb: %w", err)
	}
	tx, err := db.Begin()
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("begin duckdb batch: %w", err)
	}
	stmt, err := tx.Prepare("INSERT INTO records VALUES (?, ?, ?, ?, ?, ?)")
	if err != nil {
		tx.Rollback()
		db.Close()
		return nil, fmt.Errorf("prepare duckdb append: %w", err)
	}
	return &duckStore{db: db, tx: tx, stmt: stmt}, nil
}

func (s *duckStore) Append(rec record) error {
	if _, err := s.stmt.Exec(rec.Epoch, rec.Sequence, rec.Channel, rec.Timestamp, rec.Payload, rec.PayloadCRC); err != nil {
		return fmt.Errorf("append duckdb record: %w", err)
	}
	return nil
}

func (s *duckStore) Sync() error {
	if err := s.stmt.Close(); err != nil {
		return fmt.Errorf("close duckdb statement: %w", err)
	}
	return s.tx.Commit()
}

func (s *duckStore) Close() error { return s.db.Close() }

type duckReader struct{ db *sql.DB }

func openDuckReader(path string) (reader, error) {
	db, err := sql.Open("duckdb", path+"?access_mode=read_only")
	if err != nil {
		return nil, fmt.Errorf("open duckdb reader: %w", err)
	}
	return &duckReader{db: db}, nil
}

func (r *duckReader) Summarize(from, to int64) (summary, error) {
	rows, err := r.db.Query(`SELECT epoch, sequence, channel, captured_at_ns, payload, payload_crc
		FROM records WHERE captured_at_ns BETWEEN ? AND ? ORDER BY epoch, sequence`, from, to)
	if err != nil {
		return summary{}, err
	}
	defer rows.Close()
	var result summary
	digest := sha256.New()
	for rows.Next() {
		var rec record
		if err := rows.Scan(&rec.Epoch, &rec.Sequence, &rec.Channel, &rec.Timestamp, &rec.Payload, &rec.PayloadCRC); err != nil {
			return summary{}, err
		}
		if err := updateSummary(&result, rec, digest); err != nil {
			return summary{}, err
		}
	}
	if err := rows.Err(); err != nil {
		return summary{}, err
	}
	copy(result.Digest[:], digest.Sum(nil))
	return result, nil
}

func (r *duckReader) Close() error { return r.db.Close() }
