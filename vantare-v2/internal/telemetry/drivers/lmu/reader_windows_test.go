//go:build windows

package lmu

import (
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
)

func TestOpenSharedMemoryMapFailureUsesCloseReturnValue(t *testing.T) {
	mapFailure := errors.New("map failed")
	staleLastError := errors.New("stale last error")
	closeFailure := errors.New("close failed")
	tests := []struct {
		name        string
		closeResult uintptr
		closeErr    error
		wantClose   bool
	}{
		{name: "successful close ignores stale last error", closeResult: 1, closeErr: staleLastError},
		{name: "failed close is joined", closeResult: 0, closeErr: closeFailure, wantClose: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			api := windowsAPI{
				open:    func(*uint16) (uintptr, error) { return 10, nil },
				mapView: func(uintptr) (uintptr, error) { return 0, mapFailure },
				close:   func(uintptr) (uintptr, error) { return tt.closeResult, tt.closeErr },
			}
			_, err := openSharedMemoryWithAPI(api, func(uintptr) []byte { t.Fatal("view called after map failure"); return nil })
			if !strings.Contains(err.Error(), mapFailure.Error()) {
				t.Fatalf("error = %v", err)
			}
			if errors.Is(err, staleLastError) || strings.Contains(err.Error(), staleLastError.Error()) {
				t.Fatalf("stale last-error leaked: %v", err)
			}
			if got := errors.Is(err, closeFailure); got != tt.wantClose {
				t.Fatalf("close failure present=%v want=%v: %v", got, tt.wantClose, err)
			}
		})
	}
}

func TestWindowsReaderCloseIsConcurrentIdempotentAndSnapshotFailsAfter(t *testing.T) {
	var unmaps atomic.Int32
	var closes atomic.Int32
	api := windowsAPI{
		unmap: func(uintptr) (uintptr, error) { unmaps.Add(1); return 1, syscall.Errno(0) },
		close: func(uintptr) (uintptr, error) { closes.Add(1); return 1, syscall.Errno(0) },
	}
	reader := &windowsReader{handle: 2, addr: 1, data: make([]byte, ObjectOutSize), api: api}
	var wait sync.WaitGroup
	errs := make(chan error, 8)
	for range 8 {
		wait.Add(1)
		go func() { defer wait.Done(); errs <- reader.Close() }()
	}
	wait.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("Close: %v", err)
		}
	}
	if unmaps.Load() != 1 || closes.Load() != 1 {
		t.Fatalf("unmaps=%d closes=%d", unmaps.Load(), closes.Load())
	}
	if err := reader.Snapshot(make([]byte, ObjectOutSize)); !errors.Is(err, ErrMappingRead) {
		t.Fatalf("Snapshot after Close = %v", err)
	}
}

func TestWindowsReaderClosePropagatesUnmapAndHandleFailures(t *testing.T) {
	unmapFailure := errors.New("unmap failed")
	closeFailure := errors.New("handle close failed")
	reader := &windowsReader{
		handle: 2, addr: 1, data: make([]byte, ObjectOutSize),
		api: windowsAPI{
			unmap: func(uintptr) (uintptr, error) { return 0, unmapFailure },
			close: func(uintptr) (uintptr, error) { return 0, closeFailure },
		},
	}
	err := reader.Close()
	if !errors.Is(err, unmapFailure) || !errors.Is(err, closeFailure) {
		t.Fatalf("Close error = %v", err)
	}
}
