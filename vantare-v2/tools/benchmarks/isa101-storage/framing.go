package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"os"
)

const (
	frameMagic   = uint32(0x56545245) // "VTRE"; disposable baseline only.
	frameVersion = uint16(1)
	frameHeader  = 44
)

type frameStore struct {
	file *os.File
	buf  *bufio.Writer
}

func init() {
	register(candidate{Name: "framing", SupportsCommit: true, OpenWriter: openFrameStore, OpenReader: openFrameReader})
}

func openFrameStore(path string) (store, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create framing store: %w", err)
	}
	return &frameStore{file: file, buf: bufio.NewWriterSize(file, 256*1024)}, nil
}

func (s *frameStore) Append(rec record) error {
	header := make([]byte, frameHeader)
	binary.LittleEndian.PutUint32(header[0:4], frameMagic)
	binary.LittleEndian.PutUint16(header[4:6], frameVersion)
	binary.LittleEndian.PutUint16(header[6:8], rec.Channel)
	binary.LittleEndian.PutUint64(header[8:16], rec.Epoch)
	binary.LittleEndian.PutUint64(header[16:24], rec.Sequence)
	binary.LittleEndian.PutUint64(header[24:32], uint64(rec.Timestamp))
	binary.LittleEndian.PutUint32(header[32:36], uint32(len(rec.Payload)))
	binary.LittleEndian.PutUint32(header[36:40], rec.PayloadCRC)
	binary.LittleEndian.PutUint32(header[40:44], crc32.ChecksumIEEE(header[:40]))
	if _, err := s.buf.Write(header); err != nil {
		return fmt.Errorf("write frame header: %w", err)
	}
	if _, err := s.buf.Write(rec.Payload); err != nil {
		return fmt.Errorf("write frame payload: %w", err)
	}
	return nil
}

func (s *frameStore) Sync() error {
	if err := s.buf.Flush(); err != nil {
		return fmt.Errorf("flush framing store: %w", err)
	}
	if err := s.file.Sync(); err != nil {
		return fmt.Errorf("sync framing store: %w", err)
	}
	return nil
}

func (s *frameStore) Close() error {
	flushErr := s.buf.Flush()
	closeErr := s.file.Close()
	return errors.Join(flushErr, closeErr)
}

type frameReader struct {
	file *os.File
	buf  *bufio.Reader
}

func openFrameReader(path string) (reader, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open framing store: %w", err)
	}
	return &frameReader{file: file, buf: bufio.NewReaderSize(file, 256*1024)}, nil
}

func (r *frameReader) Summarize(from, to int64) (summary, error) {
	var result summary
	digest := sha256.New()
	for {
		rec, err := readFrame(r.buf)
		if errors.Is(err, io.EOF) {
			copy(result.Digest[:], digest.Sum(nil))
			return result, nil
		}
		if err != nil {
			return summary{}, err
		}
		if rec.Timestamp >= from && rec.Timestamp <= to {
			if err := updateSummary(&result, rec, digest); err != nil {
				return summary{}, err
			}
		}
	}
}

func readFrame(input io.Reader) (record, error) {
	header := make([]byte, frameHeader)
	if _, err := io.ReadFull(input, header); err != nil {
		return record{}, err
	}
	if binary.LittleEndian.Uint32(header[0:4]) != frameMagic ||
		binary.LittleEndian.Uint16(header[4:6]) != frameVersion ||
		crc32.ChecksumIEEE(header[:40]) != binary.LittleEndian.Uint32(header[40:44]) {
		return record{}, fmt.Errorf("frame header: %w", errInvalidFixture)
	}
	size := binary.LittleEndian.Uint32(header[32:36])
	if size > 1<<20 {
		return record{}, fmt.Errorf("frame payload size %d: %w", size, errInvalidFixture)
	}
	payload := make([]byte, size)
	if _, err := io.ReadFull(input, payload); err != nil {
		return record{}, err
	}
	rec, err := parseRecord(binary.LittleEndian.Uint16(header[6:8]), payload)
	if err != nil {
		return record{}, err
	}
	rec.PayloadCRC = binary.LittleEndian.Uint32(header[36:40])
	return rec, nil
}

func (r *frameReader) Close() error { return r.file.Close() }
