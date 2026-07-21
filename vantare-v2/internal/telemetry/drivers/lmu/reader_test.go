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
	snapshots  [][]byte
	closed     chan struct{}
}

func (reader *testReader) Snapshot(destination []byte) error {
	reader.reads++
	if reader.readErr != nil {
		return reader.readErr
	}
	source := reader.data
	if len(reader.snapshots) != 0 {
		index := reader.reads - 1
		if index >= len(reader.snapshots) {
			index = len(reader.snapshots) - 1
		}
		source = reader.snapshots[index]
	}
	if len(source) != ObjectOutSize || len(destination) < len(source) {
		return ErrIncompatibleBuffer
	}
	copy(destination, source)
	return nil
}

func TestReadStableRequiresTwoConsecutiveEqualCopies(t *testing.T) {
	a := make([]byte, ObjectOutSize)
	b := append([]byte(nil), a...)
	b[10] = 1
	tests := []struct {
		name      string
		frames    [][]byte
		max       int
		wantErr   error
		wantReads int
	}{
		{name: "stable", frames: [][]byte{a, a}, max: 3, wantReads: 2},
		{name: "changes once", frames: [][]byte{a, b, b}, max: 3, wantReads: 3},
		{name: "never stable", frames: [][]byte{a, b, a, b}, max: 3, wantErr: ErrIncoherentSnapshot, wantReads: 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reader := &testReader{snapshots: tt.frames}
			err := readStable(t.Context(), reader, make([]byte, ObjectOutSize), make([]byte, ObjectOutSize), tt.max)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if reader.reads != tt.wantReads {
				t.Fatalf("reads = %d, want %d", reader.reads, tt.wantReads)
			}
		})
	}
}

func (reader *testReader) Close() error {
	reader.closes++
	if reader.closed != nil {
		close(reader.closed)
	}
	return reader.closeError
}

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
