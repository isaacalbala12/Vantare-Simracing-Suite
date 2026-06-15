package app

import (
	"io"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/delta"
	"github.com/vantare/overlays/v2/internal/telemetry/fusion"
	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/lmuapi"
	"github.com/vantare/overlays/v2/internal/telemetry/normalizer"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
	"github.com/vantare/overlays/v2/pkg/models"
)

// enrichedLMUSource combines high-frequency shared memory with low-frequency
// LMU REST local API data. Shared memory wins for fast inputs; REST wins for
// standings, relative, lap timing and pit state.
type enrichedLMUSource struct {
	mmap  service.Source
	cache *lmuRESTCache
}

func (s *enrichedLMUSource) Read() []byte {
	return s.mmap.Read()
}

func (s *enrichedLMUSource) ReadTelemetry() *models.Telemetry {
	base := normalizer.New().FromBuffer(s.mmap.Read())
	var rows []lmuapi.StandingRow
	var session *lmuapi.SessionInfo
	if s.cache != nil {
		rows, session = s.cache.Snapshot()
	}
	d, ok := delta.AlphaDelta(rows)
	if !ok {
		d = 0
	}
	return fusion.Merge(base, rows, session, d)
}

func (s *enrichedLMUSource) Info() service.SourceInfo {
	if withInfo, ok := s.mmap.(service.SourceWithInfo); ok {
		return withInfo.Info()
	}
	return service.SourceInfo{
		Kind:      service.SimulatorLMU,
		Name:      "Le Mans Ultimate",
		Live:      true,
		Available: true,
	}
}

func (s *enrichedLMUSource) Close() error {
	if s.cache != nil {
		s.cache.Close()
	}
	if closer, ok := s.mmap.(io.Closer); ok {
		return closer.Close()
	}
	return nil
}

func wrapLMUSourceWithREST(mmap service.Source) service.Source {
	api := lmuapi.NewClient("http://localhost:6397", 750*time.Millisecond)
	return &enrichedLMUSource{
		mmap:  mmap,
		cache: newLMURESTCache(api, 250*time.Millisecond, 2*time.Second),
	}
}

type lmuRESTCache struct {
	api            *lmuapi.Client
	pollEvery      time.Duration
	ttl            time.Duration
	mu             sync.RWMutex
	rows           []lmuapi.StandingRow
	session        *lmuapi.SessionInfo
	rowsUpdated    time.Time
	sessionUpdated time.Time
	stop           chan struct{}
	done           chan struct{}
	closeOnce      sync.Once
}

func newLMURESTCache(api *lmuapi.Client, pollEvery, ttl time.Duration) *lmuRESTCache {
	if pollEvery <= 0 {
		pollEvery = 250 * time.Millisecond
	}
	if ttl <= 0 {
		ttl = 2 * time.Second
	}
	c := &lmuRESTCache{
		api:       api,
		pollEvery: pollEvery,
		ttl:       ttl,
		stop:      make(chan struct{}),
		done:      make(chan struct{}),
	}
	go c.run()
	return c
}

func (c *lmuRESTCache) run() {
	defer close(c.done)
	c.poll()
	ticker := time.NewTicker(c.pollEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			c.poll()
		case <-c.stop:
			return
		}
	}
}

func (c *lmuRESTCache) poll() {
	if c == nil || c.api == nil {
		return
	}
	now := time.Now()
	if rows, err := c.api.Standings(); err == nil {
		c.mu.Lock()
		c.rows = append([]lmuapi.StandingRow(nil), rows...)
		c.rowsUpdated = now
		c.mu.Unlock()
	}
	if info, err := c.api.SessionInfo(); err == nil {
		c.mu.Lock()
		copied := *info
		c.session = &copied
		c.sessionUpdated = now
		c.mu.Unlock()
	}
	c.expire(now)
}

func (c *lmuRESTCache) expire(now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.rowsUpdated.IsZero() && now.Sub(c.rowsUpdated) > c.ttl {
		c.rows = nil
	}
	if !c.sessionUpdated.IsZero() && now.Sub(c.sessionUpdated) > c.ttl {
		c.session = nil
	}
}

func (c *lmuRESTCache) Snapshot() ([]lmuapi.StandingRow, *lmuapi.SessionInfo) {
	if c == nil {
		return nil, nil
	}
	now := time.Now()
	c.mu.RLock()
	rowsFresh := !c.rowsUpdated.IsZero() && now.Sub(c.rowsUpdated) <= c.ttl
	sessionFresh := !c.sessionUpdated.IsZero() && now.Sub(c.sessionUpdated) <= c.ttl
	var rows []lmuapi.StandingRow
	if rowsFresh {
		rows = append([]lmuapi.StandingRow(nil), c.rows...)
	}
	var session *lmuapi.SessionInfo
	if sessionFresh && c.session != nil {
		copied := *c.session
		session = &copied
	}
	c.mu.RUnlock()
	return rows, session
}

func (c *lmuRESTCache) Close() {
	if c == nil {
		return
	}
	c.closeOnce.Do(func() {
		close(c.stop)
		<-c.done
	})
}

func createMockSource() service.Source {
	buf := lmu.BuildSyntheticBuffer()
	return service.FuncSource{
		ReadFunc: func() []byte { return buf },
		InfoData: service.SourceInfo{
			Kind:      service.SimulatorMock,
			Name:      "Mock telemetry",
			Live:      false,
			Available: true,
		},
	}
}
