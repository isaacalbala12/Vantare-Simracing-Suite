package main

import (
	"sync"

	"github.com/vantare/overlays/v2/internal/app/launcher"
)

// launcherStartupQueue holds Windows Run flags delivered by Wails while the
// first instance is still loading settings and the launcher service.
type launcherStartupQueue struct {
	mu      sync.Mutex
	pending []string
	launch  func(string)
	ready   bool
}

func (q *launcherStartupQueue) Offer(args []string) {
	id, ok := launcher.ParseLaunchFlag(args)
	if !ok {
		return
	}
	q.mu.Lock()
	if !q.ready {
		q.pending = append(q.pending, id)
		q.mu.Unlock()
		return
	}
	launch := q.launch
	q.mu.Unlock()
	launch(id)
}

func (q *launcherStartupQueue) Ready(launch func(string)) {
	q.mu.Lock()
	q.launch = launch
	for len(q.pending) > 0 {
		id := q.pending[0]
		q.pending = q.pending[1:]
		q.mu.Unlock()
		launch(id)
		q.mu.Lock()
	}
	q.ready = true
	q.mu.Unlock()
}
