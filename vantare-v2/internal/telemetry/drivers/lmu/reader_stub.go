//go:build !windows

package lmu

func openSharedMemory() (memoryReader, error) { return nil, ErrMappingUnavailable }
