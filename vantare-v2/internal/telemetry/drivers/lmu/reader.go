package lmu

import "errors"

var (
	ErrMappingUnavailable = errors.New("LMU_Data mapping is unavailable")
	ErrMappingRead        = errors.New("LMU_Data mapping read failed")
)

// memoryReader is deliberately private: raw bytes never cross the LMU driver
// boundary. Snapshot copies one coherent acquisition into driver-owned memory.
type memoryReader interface {
	Snapshot(destination []byte) error
	Close() error
}

type openMemory func() (memoryReader, error)
