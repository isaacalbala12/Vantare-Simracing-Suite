package app

import (
	"io"
	"log"
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
	mmap       service.Source
	cache      *lmuRESTCache
	deltaStore *delta.Store
	prevLaps   map[int]int16  // vehicleID -> previous LapsCompleted
	trackLen   map[int]float64 // vehicleID -> estimated track length per vehicle
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

	d := computeDeltaFromEngine(s, rows, session)
	return fusion.Merge(base, rows, session, d)
}

// computeDeltaFromEngine uses the distance-based delta engine with self/session/global
// reference laps. Falls back to AlphaDelta when distance data is insufficient.
func computeDeltaFromEngine(s *enrichedLMUSource, rows []lmuapi.StandingRow, session *lmuapi.SessionInfo) float64 {
	if s.deltaStore == nil {
		// Fall back to AlphaDelta
		d, ok := delta.AlphaDelta(rows)
		if ok {
			return d
		}
		return 0
	}

	if len(rows) == 0 {
		return 0
	}

	// Find the player vehicle
	var playerRow *lmuapi.StandingRow
	var vehicleID int
	for i, r := range rows {
		if r.Player {
			playerRow = &rows[i]
			vehicleID = int(r.SlotIDOrPositionID())
			break
		}
	}
	if playerRow == nil {
		return 0
	}

	// Track name from session or player row
	trackName := ""
	if session != nil {
		trackName = session.TrackName
	}
	if trackName == "" {
		trackName = playerRow.VehicleName
	}

	carClass := playerRow.CarClass
	if carClass == "" {
		carClass = "unknown"
	}

	// Record current lap point
	s.deltaStore.RecordPoint(vehicleID, trackName, carClass, playerRow.LapDistance, playerRow.TimeIntoLap)

	// Track max LapDistance seen for this vehicle to estimate track length
	curMax := s.trackLen[vehicleID]
	if playerRow.LapDistance > curMax {
		s.trackLen[vehicleID] = playerRow.LapDistance
	}

	// Detect lap completion: LapsCompleted increased
	prevLaps := s.prevLaps[vehicleID]
	currentLaps := playerRow.LapsCompleted
	if currentLaps > prevLaps && prevLaps >= 0 {
		// Lap just completed — promote the buffer
		bestLapTime := playerRow.LastLapTime
		if bestLapTime <= 0 {
			bestLapTime = playerRow.BestLapTime
		}
		s.deltaStore.CompleteLap(vehicleID, trackName, carClass, bestLapTime, delta.ModeSelf)

		// Estimate track length from max distance seen during the just-completed lap
		if s.trackLen[vehicleID] > 0 {
			// For session/global modes, create synthetic references from best laps
			// when we have a track length estimate
			if bestLapTime > 0 {
				synthetic := delta.SyntheticReference(bestLapTime, s.trackLen[vehicleID], 20)
				if synthetic != nil {
					synthetic.TrackName = trackName
					synthetic.CarClass = carClass
					// Store in session lap slot if it's the best
					s.deltaStore.CompleteLap(vehicleID, trackName, carClass, bestLapTime, delta.ModeSession)
				}
			}
		}
	}
	s.prevLaps[vehicleID] = currentLaps

	// Get reference and compute delta
	trackLength := s.trackLen[vehicleID]
	ref := s.deltaStore.GetReference(delta.ModeSelf, vehicleID, trackName, carClass, trackLength, playerRow.BestLapTime)
	current := delta.LapPoint{Distance: playerRow.LapDistance, TimeIntoLap: playerRow.TimeIntoLap}
	d, ok := delta.ComputeDelta(ref, current)
	if !ok {
		return 0
	}
	return d
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
		mmap:       mmap,
		cache:      newLMURESTCache(api, 250*time.Millisecond, 2*time.Second),
		deltaStore: delta.NewStore(),
		prevLaps:   make(map[int]int16),
		trackLen:   make(map[int]float64),
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
	lastErr        error
	lastErrAt      time.Time
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
	} else {
		c.logErr("standings", err, now)
	}
	if info, err := c.api.SessionInfo(); err == nil {
		c.mu.Lock()
		copied := *info
		c.session = &copied
		c.sessionUpdated = now
		c.mu.Unlock()
	} else {
		c.logErr("sessionInfo", err, now)
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

func (c *lmuRESTCache) logErr(endpoint string, err error, now time.Time) {
	const quietPeriod = 5 * time.Second
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.lastErr != nil && c.lastErr.Error() == err.Error() && now.Sub(c.lastErrAt) < quietPeriod {
		return
	}
	c.lastErr = err
	c.lastErrAt = now
	log.Printf("LMU REST %s error: %v", endpoint, err)
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
