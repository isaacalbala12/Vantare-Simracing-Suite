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
	open    func()
	openDue bool
	ready   bool
}

func (q *launcherStartupQueue) Open() {
	q.mu.Lock()
	open := q.open
	if open == nil {
		q.openDue = true
	}
	q.mu.Unlock()
	if open != nil {
		open()
	}
}

func (q *launcherStartupQueue) ReadyOpen(open func()) {
	q.mu.Lock()
	q.open = open
	wasDue := q.openDue
	q.openDue = false
	q.mu.Unlock()
	if wasDue {
		open()
	}
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
