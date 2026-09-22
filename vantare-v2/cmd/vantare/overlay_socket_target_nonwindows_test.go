//go:build !windows

package main

import "sync"

type captureOverlayPullTarget struct {
	mu       sync.Mutex
	onClosed map[string]func()
}

func newCaptureOverlayPullTarget() *captureOverlayPullTarget {
	return &captureOverlayPullTarget{onClosed: make(map[string]func())}
}

func (target *captureOverlayPullTarget) WatchClose(window string, callback func()) bool {
	target.mu.Lock()
	defer target.mu.Unlock()
	if _, exists := target.onClosed[window]; !exists {
		target.onClosed[window] = callback
	}
	return true
}

func (target *captureOverlayPullTarget) close(window string) {
	target.mu.Lock()
	callback := target.onClosed[window]
	delete(target.onClosed, window)
	target.mu.Unlock()
	if callback != nil {
		callback()
	}
}
