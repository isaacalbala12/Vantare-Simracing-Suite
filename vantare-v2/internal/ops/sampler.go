package ops

import (
	"context"
	"os"
	"runtime"
	"sync/atomic"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

const DefaultInterval = time.Second

type Sampler interface {
	Sample() MetricsSnapshot
}

type RuntimeSampler struct {
	source     service.SourceInfo
	cpuEnabled atomic.Bool
	cpuPercent atomic.Value // stores float64; valid only when cpuValid is true
	cpuValid   atomic.Bool
	cancel     context.CancelFunc
}

func NewRuntimeSampler(source service.SourceInfo) *RuntimeSampler {
	return &RuntimeSampler{source: source}
}

func (s *RuntimeSampler) SetCPUEnabled(enabled bool) {
	was := s.cpuEnabled.Swap(enabled)
	if enabled && !was {
		s.startCPU()
	} else if !enabled && was {
		s.stopCPU()
	}
}

func (s *RuntimeSampler) startCPU() {
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel

	go func() {
		p, err := process.NewProcess(int32(os.Getpid()))
		if err != nil {
			return
		}
		// First call establishes baseline (returns 0).
		_, _ = p.Percent(0)

		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cpu, err := p.Percent(0)
				if err == nil {
					s.cpuPercent.Store(cpu)
					s.cpuValid.Store(true)
				}
			}
		}
	}()
}

func (s *RuntimeSampler) stopCPU() {
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	s.cpuPercent.Store(float64(0))
	s.cpuValid.Store(false)
}

func (s *RuntimeSampler) Sample() MetricsSnapshot {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	memoryMB := float64(mem.Alloc) / 1024 / 1024

	var cpuPercent *float64
	if s.cpuValid.Load() {
		v := s.cpuPercent.Load().(float64)
		cpuPercent = &v
	}

	return MetricsSnapshot{
		Timestamp: time.Now(),
		App: ProcessMetrics{
			MemoryMB:   memoryMB,
			CPUPercent: cpuPercent,
			Goroutines: runtime.NumGoroutine(),
		},
		Source: s.source,
	}
}
