package service

import "testing"

func TestPresentationStreamOrdersNotificationBeforeLaterClear(t *testing.T) {
	service := NewEngineerService(nil)
	stream, unsubscribe := service.SubscribeStream()
	defer unsubscribe()
	initial := <-stream
	if initial.Kind != EngineerStreamSnapshot || initial.Active {
		t.Fatalf("initial=%+v want explicit empty snapshot", initial)
	}

	notification := EngineerNotification{
		Version: 1, ID: "fuel-1", Category: "fuel", Severity: "warning",
		TextKey: "fuel.low", Text: "Fuel low", VoiceText: "Fuel low", Locale: "en",
		Role: "engineer", Channel: "engineer", Priority: 50,
		CreatedAt: service.policyClock.NowMS(), ExpiresAt: service.policyClock.NowMS() + 10_000,
		Source: "telemetry-core",
	}
	service.publishNotification(notification)
	service.mu.Lock()
	service.advancePresentationLifecycleLocked()
	service.emitStatusLocked()
	service.mu.Unlock()

	presentation := <-stream
	clear := <-stream
	if presentation.Kind != EngineerStreamPresentation || !presentation.Active || presentation.Presentation == nil {
		t.Fatalf("presentation=%+v", presentation)
	}
	if clear.Kind != EngineerStreamStatus || clear.Active || clear.Presentation != nil {
		t.Fatalf("clear=%+v", clear)
	}
	if clear.Sequence <= presentation.Sequence || clear.Generation <= presentation.Generation {
		t.Fatalf("unordered lifecycle: presentation=%+v clear=%+v", presentation, clear)
	}
}

func TestPresentationStreamReconnectRehydratesExactActiveOrEmptySnapshot(t *testing.T) {
	service := NewEngineerService(nil)
	notification := EngineerNotification{
		Version: 1, ID: "spotter-left", Category: "spotter", Severity: "critical",
		TextKey: "spotter.car_left", Text: "Car left", VoiceText: "Car left", Locale: "en",
		Role: "spotter", Channel: "spotter", Priority: 100,
		CreatedAt: service.policyClock.NowMS(), ExpiresAt: service.policyClock.NowMS() + 10_000,
		Source: "telemetry-core",
	}
	service.publishNotification(notification)

	activeStream, unsubscribeActive := service.SubscribeStream()
	active := <-activeStream
	unsubscribeActive()
	if !active.Active || active.Presentation == nil || *active.Presentation != notification {
		t.Fatalf("active snapshot=%+v want exact notification", active)
	}

	service.mu.Lock()
	service.advancePresentationLifecycleLocked()
	service.mu.Unlock()
	emptyStream, unsubscribeEmpty := service.SubscribeStream()
	defer unsubscribeEmpty()
	empty := <-emptyStream
	if empty.Active || empty.Presentation != nil || empty.Generation != service.Status().PresentationLifecycle {
		t.Fatalf("empty snapshot=%+v", empty)
	}
}

func TestSubtitleRoutingIsIndependentAndIncludedInOrderedStatus(t *testing.T) {
	service := NewEngineerService(nil)
	stream, unsubscribe := service.SubscribeStream()
	defer unsubscribe()
	initial := <-stream
	if initial.Status == nil || !initial.Status.SubtitlesEnabled {
		t.Fatalf("initial=%+v want subtitles enabled", initial)
	}

	service.SetSubtitlesEnabled(false)
	status := <-stream
	if status.Kind != EngineerStreamStatus || status.Status == nil || status.Status.SubtitlesEnabled {
		t.Fatalf("status=%+v want independent subtitles disabled", status)
	}
	if service.Status().OutputModes["spotter"] != OutputBoth {
		t.Fatal("subtitle routing changed category output mode")
	}
}
