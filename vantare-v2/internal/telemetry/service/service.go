package service

import (
	"context"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/diff"
	"github.com/vantare/overlays/v2/internal/telemetry/normalizer"
	"github.com/vantare/overlays/v2/internal/telemetry/pipeline"
	"github.com/vantare/overlays/v2/pkg/models"
)

type Config struct {
	ReadHz float64
	EmitHz float64
	Source Source
}

type Update struct {
	Seq      uint64
	Snapshot *models.Telemetry
	Diff     *diff.Payload
}

type subscriber struct {
	ch   chan Update
	once sync.Once
}

func (sub *subscriber) closeChan() {
	sub.once.Do(func() { close(sub.ch) })
}

type Service struct {
	cfg        Config
	normalizer *normalizer.Normalizer
	filter     *pipeline.Filter
	subs       []*subscriber
	subsMu     sync.Mutex
	latest     *models.Telemetry
	lastEmit   *models.Telemetry
	latestMu   sync.Mutex
	dirty      bool
	seq        uint64
}

func New(cfg Config) *Service {
	if cfg.ReadHz <= 0 {
		cfg.ReadHz = 60
	}
	if cfg.EmitHz <= 0 {
		cfg.EmitHz = 30
	}
	return &Service{
		cfg:        cfg,
		normalizer: normalizer.New(),
		filter:     pipeline.NewFilter(),
	}
}

// Subscribe registers for telemetry updates. Returns replay of latest snapshot if available.
// Call unsubscribe to remove the subscription without closing the service.
func (s *Service) Subscribe() (<-chan Update, func()) {
	ch := make(chan Update, 1)
	sub := &subscriber{ch: ch}

	s.subsMu.Lock()
	s.subs = append(s.subs, sub)

	s.latestMu.Lock()
	if s.latest != nil {
		replay := Update{
			Seq:      s.seq,
			Snapshot: s.latest,
			Diff:     diff.Compute(s.lastEmit, s.latest),
		}
		select {
		case ch <- replay:
		default:
		}
	}
	s.latestMu.Unlock()
	s.subsMu.Unlock()

	unsubscribe := func() {
		s.subsMu.Lock()
		defer s.subsMu.Unlock()
		for i, existing := range s.subs {
			if existing == sub {
				s.subs = append(s.subs[:i], s.subs[i+1:]...)
				sub.closeChan()
				return
			}
		}
	}
	return ch, unsubscribe
}

func (s *Service) Run(ctx context.Context) error {
	readInterval := time.Duration(float64(time.Second) / s.cfg.ReadHz)
	emitInterval := time.Duration(float64(time.Second) / s.cfg.EmitHz)
	readTick := time.NewTicker(readInterval)
	emitTick := time.NewTicker(emitInterval)
	defer readTick.Stop()
	defer emitTick.Stop()

	for {
		select {
		case <-ctx.Done():
			s.closeSubs()
			return ctx.Err()
		case <-readTick.C:
			s.processRead()
		case <-emitTick.C:
			s.flushEmit()
		}
	}
}

func (s *Service) processRead() {
	if s.cfg.Source == nil {
		return
	}
	buf := s.cfg.Source.Read()
	snap, ok := s.filter.ShouldPublish(s.normalizer.FromBuffer(buf))
	if !ok {
		return
	}
	s.latestMu.Lock()
	s.latest = snap
	s.dirty = true
	s.latestMu.Unlock()
}

func (s *Service) flushEmit() {
	s.latestMu.Lock()
	if !s.dirty || s.latest == nil {
		s.latestMu.Unlock()
		return
	}
	snap := s.latest
	s.dirty = false
	prevEmit := s.lastEmit
	s.lastEmit = snap
	s.latestMu.Unlock()

	s.seq++
	upd := Update{
		Seq:      s.seq,
		Snapshot: snap,
		Diff:     diff.Compute(prevEmit, snap),
	}

	s.subsMu.Lock()
	defer s.subsMu.Unlock()
	for _, sub := range s.subs {
		select {
		case sub.ch <- upd:
		default:
		}
	}
}

func (s *Service) closeSubs() {
	s.subsMu.Lock()
	defer s.subsMu.Unlock()
	for _, sub := range s.subs {
		sub.closeChan()
	}
	s.subs = nil
}
