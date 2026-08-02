package lmu

import (
	"bytes"
	"context"
	"errors"
)

var (
	ErrMappingUnavailable = errors.New("LMU_Data mapping is unavailable")
	ErrMappingRead        = errors.New("LMU_Data mapping read failed")
	ErrIncoherentSnapshot = errors.New("LMU_Data snapshot did not stabilize")
)

// memoryReader is deliberately private: raw bytes never cross the LMU driver
// boundary. Snapshot copies one coherent acquisition into driver-owned memory.
type memoryReader interface {
	Snapshot(destination []byte) error
	Close() error
}

type openMemory func() (memoryReader, error)

func readStable(ctx context.Context, reader memoryReader, destination, scratch []byte, maxComparisons int) error {
	if maxComparisons < 1 {
		maxComparisons = 1
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := reader.Snapshot(destination); err != nil {
		return err
	}
	for range maxComparisons {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := reader.Snapshot(scratch); err != nil {
			return err
		}
		if bytes.Equal(destination, scratch) {
			return nil
		}
		copy(destination, scratch)
	}
	return ErrIncoherentSnapshot
}
