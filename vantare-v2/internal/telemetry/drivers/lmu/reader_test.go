package lmu

import (
	"errors"
	"testing"
)

type testReader struct {
	data       []byte
	readErr    error
	reads      int
	closes     int
	closeError error
}

func (reader *testReader) Snapshot(destination []byte) error {
	reader.reads++
	if reader.readErr != nil {
		return reader.readErr
	}
	if len(reader.data) != ObjectOutSize || len(destination) < len(reader.data) {
		return ErrIncompatibleBuffer
	}
	copy(destination, reader.data)
	return nil
}

func (reader *testReader) Close() error { reader.closes++; return reader.closeError }

func TestPrivateReaderCopiesAndReportsFailures(t *testing.T) {
	source := make([]byte, ObjectOutSize)
	source[100] = 42
	reader := &testReader{data: source}
	destination := make([]byte, ObjectOutSize)
	if err := reader.Snapshot(destination); err != nil {
		t.Fatal(err)
	}
	if destination[100] != 42 || reader.reads != 1 {
		t.Fatalf("copy failed: reads=%d value=%d", reader.reads, destination[100])
	}
	if err := reader.Snapshot(destination[:10]); !errors.Is(err, ErrIncompatibleBuffer) {
		t.Fatalf("short destination error = %v", err)
	}
}
