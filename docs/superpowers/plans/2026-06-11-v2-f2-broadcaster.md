# v2 Fase 2 — Broadcaster (30 Hz + Subscribe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `internal/telemetry/service` — polls a byte source at 60 Hz, normalizes, deadband-filters, throttles to 30 Hz max, exposes `Subscribe()` for Wails/SSE later.

**Architecture:** Three goroutines per doc §7.4 simplified into one `Run` loop for MVP: ticker @ 60 Hz reads → normalize → deadband → push to buffered channel (size 1, drop stale). Separate emit ticker @ 30 Hz sends latest snapshot to subscribers. `TelemetryUpdate` wraps full snapshot + monotonic sequence (diff JSON deferred to thin wrapper type for plan 3 consumers).

**Tech Stack:** Go 1.22+, `context`, `internal/telemetry/normalizer`, `internal/telemetry/pipeline`, `internal/telemetry/lmu` (mock source)

**Prerequisite:** Plans normalizer + deadband pipeline complete.

---

## File map

| File | Responsibility |
|------|----------------|
| `internal/telemetry/service/service.go` | `Service`, `Run`, `Subscribe` |
| `internal/telemetry/service/source.go` | `Source` interface + `FuncSource` |
| `internal/telemetry/service/service_test.go` | Mock source + rate tests |
| `cmd/lmu-debug/main.go` | Optional: no change in this plan |

---

### Task 1: Source interface + config

**Files:**
- Create: `vantare-v2/internal/telemetry/service/source.go`
- Create: `vantare-v2/internal/telemetry/service/service.go` (partial)

- [ ] **Step 1: Write failing test**

`service_test.go`:
```go
package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

func TestServiceEmitsOnSubscribe(t *testing.T) {
	buf := lmu.BuildSyntheticBuffer()
	src := service.FuncSource(func() []byte { return buf })

	svc := service.New(service.Config{
		ReadHz:  60,
		EmitHz:  30,
		Source:  src,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = svc.Run(ctx) }()

	sub := svc.Subscribe()
	select {
	case upd := <-sub:
		if upd.Snapshot == nil || !upd.Snapshot.Connected {
			t.Fatal("expected connected snapshot")
		}
		if upd.Seq != 1 {
			t.Fatalf("seq: got %d want 1", upd.Seq)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timeout waiting for update")
	}
}
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd vantare-v2 && go test ./internal/telemetry/service/ -run ServiceEmits -v`

- [ ] **Step 3: Implement source.go + service skeleton**

`source.go`:
```go
package service

type Source interface {
	Read() []byte
}

type FuncSource func() []byte

func (f FuncSource) Read() []byte { return f() }
```

`service.go`:
```go
package service

import (
	"context"
	"sync"
	"time"

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
}

type Service struct {
	cfg        Config
	normalizer *normalizer.Normalizer
	filter     *pipeline.Filter
	subs       []chan Update
	subsMu     sync.Mutex
	latest     *models.Telemetry
	latestMu   sync.Mutex
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

func (s *Service) Subscribe() <-chan Update {
	ch := make(chan Update, 1)
	s.subsMu.Lock()
	s.subs = append(s.subs, ch)
	s.subsMu.Unlock()
	return ch
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
	s.latestMu.Unlock()
}

func (s *Service) flushEmit() {
	s.latestMu.Lock()
	snap := s.latest
	s.latestMu.Unlock()
	if snap == nil {
		return
	}
	s.seq++
	upd := Update{Seq: s.seq, Snapshot: snap}
	s.subsMu.Lock()
	defer s.subsMu.Unlock()
	for _, ch := range s.subs {
		select {
		case ch <- upd:
		default:
			// drop stale — buffer size 1
		}
	}
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd vantare-v2 && go test ./internal/telemetry/service/ -run ServiceEmits -v`

---

### Task 2: Throttle caps emit rate

**Files:**
- Modify: `vantare-v2/internal/telemetry/service/service_test.go`

- [ ] **Step 1: Write test**

```go
func TestServiceEmitRateCapped(t *testing.T) {
	buf := lmu.BuildSyntheticBuffer()
	src := service.FuncSource(func() []byte { return buf })

	svc := service.New(service.Config{
		ReadHz: 60,
		EmitHz: 10,
		Source: src,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = svc.Run(ctx) }()

	sub := svc.Subscribe()
	<-sub // first

	count := 0
	deadline := time.After(550 * time.Millisecond)
loop:
	for {
		select {
		case <-sub:
			count++
		case <-deadline:
			break loop
		}
	}
	// 10 Hz * 0.55s ≈ 5-6 emits max after first; allow 2-8
	if count < 2 || count > 8 {
		t.Fatalf("emit count %d outside expected ~5 for 10Hz/550ms", count)
	}
}
```

- [ ] **Step 2: Run test**

Run: `cd vantare-v2 && go test ./internal/telemetry/service/ -run EmitRate -v`

Expected: PASS (adjust bounds if flaky — use 2-10)

---

### Task 3: Benchmark end-to-end pipeline

**Files:**
- Create: `vantare-v2/internal/telemetry/service/bench_test.go`

- [ ] **Step 1: Add benchmark**

```go
func BenchmarkPipelineNormalizeFilter(b *testing.B) {
	buf := lmu.BuildSyntheticBuffer()
	n := normalizer.New()
	f := pipeline.NewFilter()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		snap, ok := f.ShouldPublish(n.FromBuffer(buf))
		if !ok && i > 0 {
			// first iter publishes
		}
		_ = snap
	}
}
```

- [ ] **Step 2: Run benchmark**

Run: `cd vantare-v2 && go test ./internal/telemetry/service/ -bench Pipeline -benchmem`

Expected: p99 well under 2 ms (likely µs range)

- [ ] **Step 3: Full suite**

Run: `cd vantare-v2 && go test ./...`

Expected: PASS

---

## Acceptance criteria

- [ ] `Subscribe()` receives updates within 500 ms on synthetic buffer
- [ ] Emit Hz configurable and roughly respected
- [ ] Channel buffer size 1 — no unbounded queue
- [ ] `go test ./...` green
- [ ] Benchmark normalize+filter << 2 ms

## Out of scope

- Wails event binding
- JSON diff `{ "t", "d" }` serialization (add `Update.ToDiffJSON()` in follow-up if needed)
- LMU live mmap in service (inject via `Source` — live wiring in Fase 3)

## Future hook (document only)

```go
// SSE / Wails will call:
// sub := svc.Subscribe()
// for upd := range sub { emit(upd.Snapshot) }
```
