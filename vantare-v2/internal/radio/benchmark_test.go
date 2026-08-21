package radio

import (
	"context"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
)

const fastLaneBudgetNS = int64(10 * time.Millisecond)

func runFastLane(tb testing.TB) {
	clock := newFakeClock(100)
	bus := newTestBus(tb, DefaultLimits(), clock)
	resolver := NewResolver()
	phrases := validPhrases()
	if err := resolver.Register("engineer.info", Definition{Family: "engineer", Priority: PriorityP1, Role: "advice", Channel: audio.ChannelEngineer, Severity: "info", ParamKeys: []string{"side"}}, phrases); err != nil {
		tb.Fatal(err)
	}
	if err := resolver.Register("spotter.car", Definition{Family: "spotter", Priority: PriorityP0, Role: "safety", Channel: audio.ChannelSpotter, Severity: "critical", ParamKeys: []string{"side"}}, phrases); err != nil {
		tb.Fatal(err)
	}
	active := testMessage("active", "engineer.info", "driver", PriorityP1, 100)
	active.Payload = map[string]string{"side": "left"}
	_, _ = bus.Submit(active)
	item, _ := bus.Next(context.Background())
	started := make(chan struct{})
	activePort := DualPort{Resolver: resolver, UI: &recordingUI{}, Audio: fakeAudioResolver{path: "cached.wav"}, Player: blockingPlayer{started: started}, Clock: clock}
	activeSession, _ := NewSession(Request{Version: VersionV1, DeliveryID: "active", DecidedAtMS: 100, Message: item.Message}, clock, NewMetrics(8), nil)
	done := make(chan error, 1)
	go func() { done <- activePort.Deliver(item.Context, activeSession.request, activeSession) }()
	<-started
	var wg sync.WaitGroup
	for index := 0; index < 8; index++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			priority := PriorityP2
			intent := "info." + strconv.Itoa(index)
			if index == 0 {
				priority = PriorityP0
				intent = "spotter.car"
			}
			message := testMessage(strconv.Itoa(index), intent, strconv.Itoa(index), priority, 100)
			message.Payload = map[string]string{"side": "left"}
			if _, err := bus.Submit(message); err != nil {
				tb.Errorf("Submit error = %v", err)
			}
		}(index)
	}
	wg.Wait()
	if err := <-done; err != nil {
		tb.Fatalf("active Deliver = %v", err)
	}
	item.Done()
	spotter, ok := bus.Next(context.Background())
	if !ok || spotter.Message.Priority != PriorityP0 {
		tb.Fatalf("Next priority = %v", spotter)
	}
	metrics := NewMetrics(8)
	session, _ := NewSession(Request{Version: VersionV1, DeliveryID: "spotter", DecidedAtMS: 100, Message: spotter.Message}, clock, metrics, nil)
	port := DualPort{Resolver: resolver, UI: &recordingUI{}, Clock: clock}
	if err := port.Deliver(spotter.Context, session.request, session); err != nil {
		tb.Fatalf("spotter Deliver = %v", err)
	}
	spotter.Done()
	if metrics.Snapshot().Samples != 1 {
		tb.Fatal("missing started ACK")
	}
}

func BenchmarkSpotterFastLane8Concurrent(b *testing.B) {
	for index := 0; index < b.N; index++ {
		runFastLane(b)
	}
}

func TestSpotterFastLaneBudget(t *testing.T) {
	result := testing.Benchmark(BenchmarkSpotterFastLane8Concurrent)
	t.Logf("presupuesto Go Submit->Next->Deliver->ACK started: %d ns/op (p95 Wails real pendiente F3)", result.NsPerOp())
	if result.NsPerOp() > fastLaneBudgetNS {
		t.Fatalf("fast lane = %d ns/op, budget = %d ns/op", result.NsPerOp(), fastLaneBudgetNS)
	}
}
