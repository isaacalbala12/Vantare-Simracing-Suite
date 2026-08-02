//go:build mcap

package main

import (
	"bufio"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/foxglove/mcap/go/mcap"
)

type mcapStore struct {
	file     *os.File
	buf      *bufio.Writer
	writer   *mcap.Writer
	channels map[uint16]uint16
}

func init() {
	register(candidate{Name: "mcap", SupportsCommit: false, OpenWriter: openMCAPStore, OpenReader: openMCAPReader})
}

func openMCAPStore(path string) (store, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create mcap store: %w", err)
	}
	buf := bufio.NewWriterSize(file, 256*1024)
	writer, err := mcap.NewWriter(buf, &mcap.WriterOptions{
		Chunked: true, ChunkSize: 4 * 1024 * 1024,
		IncludeCRC: true,
	})
	if err != nil {
		file.Close()
		return nil, fmt.Errorf("create mcap writer: %w", err)
	}
	if err := writer.WriteHeader(&mcap.Header{Profile: "vantare.tc06a", Library: "mcap-go"}); err != nil {
		file.Close()
		return nil, fmt.Errorf("write mcap header: %w", err)
	}
	channels := make(map[uint16]uint16, 2)
	for _, channel := range []uint16{channelObserved, channelFacts} {
		topic := "vantare/observed"
		if channel == channelFacts {
			topic = "vantare/facts"
		}
		if err := writer.WriteChannel(&mcap.Channel{ID: channel, Topic: topic, MessageEncoding: "application/octet-stream"}); err != nil {
			file.Close()
			return nil, fmt.Errorf("write mcap channel: %w", err)
		}
		channels[channel] = channel
	}
	return &mcapStore{file: file, buf: buf, writer: writer, channels: channels}, nil
}

func (s *mcapStore) Append(rec record) error {
	if err := s.writer.WriteMessage(&mcap.Message{
		ChannelID:   s.channels[rec.Channel],
		Sequence:    uint32(rec.Sequence),
		LogTime:     uint64(rec.Timestamp),
		PublishTime: uint64(rec.Timestamp),
		Data:        rec.Payload,
	}); err != nil {
		return fmt.Errorf("append mcap message: %w", err)
	}
	return nil
}

func (s *mcapStore) Sync() error {
	// mcap-go does not expose a partial-chunk checkpoint. Durability is reached
	// only when Close finalizes the active chunk, footer and summary.
	return nil
}

func (s *mcapStore) Close() error {
	writerErr := s.writer.Close()
	flushErr := s.buf.Flush()
	syncErr := s.file.Sync()
	closeErr := s.file.Close()
	return errors.Join(writerErr, flushErr, syncErr, closeErr)
}

type mcapReader struct {
	file   *os.File
	reader *mcap.Reader
}

func openMCAPReader(path string) (reader, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open mcap: %w", err)
	}
	mcapFileReader, err := mcap.NewReader(file)
	if err != nil {
		file.Close()
		return nil, fmt.Errorf("create mcap reader: %w", err)
	}
	return &mcapReader{file: file, reader: mcapFileReader}, nil
}

func (r *mcapReader) Summarize(from, to int64) (summary, error) {
	var options []mcap.ReadOpt
	if from >= 0 && to >= 0 {
		after, before := uint64(from), uint64(to)
		if after > 0 {
			after--
		}
		if before < ^uint64(0) {
			before++
		}
		options = append(options, mcap.AfterNanos(after), mcap.BeforeNanos(before))
	}
	iterator, err := r.reader.Messages(options...)
	if err != nil {
		return summary{}, fmt.Errorf("create mcap iterator: %w", err)
	}
	var result summary
	digest := sha256.New()
	for {
		_, channel, message, err := iterator.Next(nil)
		if errors.Is(err, io.EOF) {
			copy(result.Digest[:], digest.Sum(nil))
			return result, nil
		}
		if err != nil {
			return summary{}, fmt.Errorf("iterate mcap: %w", err)
		}
		rec, err := parseRecord(channel.ID, message.Data)
		if err != nil {
			return summary{}, err
		}
		if rec.Timestamp < from || rec.Timestamp > to {
			continue
		}
		if err := updateSummary(&result, rec, digest); err != nil {
			return summary{}, err
		}
	}
}

func (r *mcapReader) Close() error { return r.file.Close() }
