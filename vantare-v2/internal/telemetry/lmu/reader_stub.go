//go:build !windows

package lmu

import "errors"

const MemoryName = "LMU_Data"

// Reader maps LMU shared memory (Windows only).
type Reader struct{}

func Open() (*Reader, error) {
	return nil, errors.New("lmu shared memory is only supported on windows")
}

func (r *Reader) Bytes() []byte { return nil }

func (r *Reader) Close() error { return nil }
