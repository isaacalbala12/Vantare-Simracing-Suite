// Package sensor mide el coste del host sin mezclarlo con la política que lo consume.
package sensor

import (
	"context"
	"errors"
	"sync"
	"time"
)

var ErrUnavailable = errors.New("performance sensor unavailable")

type HostSample struct {
	CPUPct        float64 `json:"cpuPct"`
	VantareCPUPct float64 `json:"vantareCpuPct"`
	VantareRAMMB  float64 `json:"vantareRamMB"`
	GPUPct        float64 `json:"gpuPct"`
}

type GameSample struct {
	FrametimeMS float64
	Available   bool
	Foreground  bool
}

type Sample struct {
	At   time.Time
	Host HostSample
	Game GameSample
}

type HostSampler interface {
	Sample(context.Context) (HostSample, error)
}

type HostSamplerFunc func(context.Context) (HostSample, error)

func (fn HostSamplerFunc) Sample(ctx context.Context) (HostSample, error) { return fn(ctx) }

type GameFrametimeSource interface {
	Start(context.Context) error
	Sample() GameSample
	Close() error
}

type FakeGameFrametimeSource struct {
	mu       sync.RWMutex
	Current  GameSample
	StartErr error
	CloseErr error
}

func (source *FakeGameFrametimeSource) Start(context.Context) error { return source.StartErr }
func (source *FakeGameFrametimeSource) Close() error                { return source.CloseErr }
func (source *FakeGameFrametimeSource) Sample() GameSample {
	source.mu.RLock()
	defer source.mu.RUnlock()
	return source.Current
}
func (source *FakeGameFrametimeSource) Set(sample GameSample) {
	source.mu.Lock()
	source.Current = sample
	source.mu.Unlock()
}

type Ticker interface {
	C() <-chan time.Time
	Stop()
}

type Clock interface {
	Now() time.Time
	NewTicker(time.Duration) Ticker
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }
func (realClock) NewTicker(period time.Duration) Ticker {
	return realTicker{Ticker: time.NewTicker(period)}
}

type realTicker struct{ *time.Ticker }

func (ticker realTicker) C() <-chan time.Time { return ticker.Ticker.C }

type Sampler struct {
	host   HostSampler
	game   GameFrametimeSource
	clock  Clock
	period time.Duration
}

func New(host HostSampler, game GameFrametimeSource) *Sampler {
	return &Sampler{host: host, game: game, clock: realClock{}, period: time.Second}
}

func NewWithClock(host HostSampler, game GameFrametimeSource, clock Clock) *Sampler {
	return &Sampler{host: host, game: game, clock: clock, period: time.Second}
}

func (sampler *Sampler) Run(ctx context.Context, publish func(Sample)) error {
	if sampler == nil || sampler.host == nil || sampler.game == nil || sampler.clock == nil {
		return errors.New("performance sensor: incomplete sampler")
	}
	if publish == nil {
		return errors.New("performance sensor: nil publisher")
	}
	gameErr := sampler.game.Start(ctx)
	defer sampler.game.Close()
	ticker := sampler.clock.NewTicker(sampler.period)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case at := <-ticker.C():
			host, err := sampler.host.Sample(ctx)
			if err != nil {
				continue
			}
			game := sampler.game.Sample()
			if gameErr != nil {
				game.Available = false
			}
			publish(Sample{At: at, Host: host, Game: game})
		}
	}
}
