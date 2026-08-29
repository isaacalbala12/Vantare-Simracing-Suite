package sensor

import (
	"context"
	"testing"
	"time"
)

type fakeTicker struct{ ticks chan time.Time }

func (ticker *fakeTicker) C() <-chan time.Time { return ticker.ticks }
func (*fakeTicker) Stop()                      {}

type fakeClock struct{ ticker *fakeTicker }

func (*fakeClock) Now() time.Time                       { return time.Unix(1, 0) }
func (clock *fakeClock) NewTicker(time.Duration) Ticker { return clock.ticker }

func TestSamplerPublishesOnlyOnInjectedOneSecondTicks(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	ticker := &fakeTicker{ticks: make(chan time.Time, 1)}
	game := &FakeGameFrametimeSource{Current: GameSample{Available: true, Foreground: true, FrametimeMS: 8}}
	sampler := NewWithClock(HostSamplerFunc(func(context.Context) (HostSample, error) {
		return HostSample{CPUPct: 42, VantareRAMMB: 128}, nil
	}), game, &fakeClock{ticker: ticker})
	result := make(chan Sample, 1)
	done := make(chan error, 1)
	go func() { done <- sampler.Run(ctx, func(sample Sample) { result <- sample }) }()
	at := time.Unix(2, 0)
	ticker.ticks <- at
	got := <-result
	if got.At != at || got.Host.CPUPct != 42 || got.Game.FrametimeMS != 8 {
		t.Fatalf("sample = %+v", got)
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestSamplerDegradesGameWhenPresentMonCannotStart(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ticker := &fakeTicker{ticks: make(chan time.Time, 1)}
	game := &FakeGameFrametimeSource{Current: GameSample{Available: true, FrametimeMS: 7}, StartErr: ErrUnavailable}
	sampler := NewWithClock(HostSamplerFunc(func(context.Context) (HostSample, error) { return HostSample{}, nil }), game, &fakeClock{ticker: ticker})
	result := make(chan Sample, 1)
	go func() { _ = sampler.Run(ctx, func(sample Sample) { result <- sample }) }()
	ticker.ticks <- time.Unix(3, 0)
	if got := <-result; got.Game.Available {
		t.Fatalf("game should be unavailable: %+v", got.Game)
	}
}

func TestSamplerCancellationDoesNotWaitForBlockedHostCall(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	ticker := &fakeTicker{ticks: make(chan time.Time, 1)}
	blocked := make(chan struct{})
	sampler := NewWithClock(HostSamplerFunc(func(context.Context) (HostSample, error) {
		<-blocked
		return HostSample{}, nil
	}), &FakeGameFrametimeSource{}, &fakeClock{ticker: ticker})
	done := make(chan error, 1)
	go func() { done <- sampler.Run(ctx, func(Sample) {}) }()
	ticker.ticks <- time.Now()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("sampler cancellation waited for blocked host call")
	}
	close(blocked)
}
