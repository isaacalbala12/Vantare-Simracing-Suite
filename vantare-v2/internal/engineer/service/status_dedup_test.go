package service

import "testing"

type statusCountingEmitter map[string]int

func (counts statusCountingEmitter) Emit(name string, _ any) { counts[name]++ }

func TestUnchangedEngineerStatusDoesNotFloodEitherTransport(t *testing.T) {
	emitter := statusCountingEmitter{}
	service := NewEngineerService(emitter)
	statuses, closeStatus := service.SubscribeStatus()
	defer closeStatus()
	<-statuses
	stream, closeStream := service.SubscribeStream()
	defer closeStream()
	<-stream
	service.mu.Lock()
	for range 64 {
		service.emitStatusLocked()
	}
	service.mu.Unlock()
	first := <-stream
	if first.Kind != EngineerStreamStatus {
		t.Fatalf("kind %q", first.Kind)
	}
	if emitter["engineer:status"] != 1 || emitter["engineer:stream"] != 1 {
		t.Fatalf("duplicate Wails events: %v", emitter)
	}
	select {
	case <-stream:
		t.Fatal("unchanged status flooded ordered stream")
	default:
	}
	<-statuses
	// A subscriber cannot mutate the remembered status through a payload alias.
	first.Status.OutputModes["spotter"] = OutputMode("subscriber-mutation")
	service.mu.Lock()
	service.emitStatusLocked()
	service.mu.Unlock()
	select {
	case <-stream:
		t.Fatal("subscriber mutation poisoned equality snapshot")
	default:
	}
	newStream, closeNew := service.SubscribeStream()
	defer closeNew()
	if initial := <-newStream; initial.Kind != EngineerStreamSnapshot || initial.Status == nil {
		t.Fatal("new subscriber lost its snapshot")
	}
	service.SetSubtitlesEnabled(false)
	changed := <-stream
	if changed.Status == nil || changed.Status.SubtitlesEnabled || changed.Sequence <= first.Sequence {
		t.Fatal("real status change lost")
	}
	service.mu.Lock()
	service.advancePresentationLifecycleLocked()
	service.emitStatusLocked()
	service.mu.Unlock()
	if reset := <-stream; reset.Generation <= changed.Generation {
		t.Fatal("lifecycle boundary lost")
	}
}

func TestStatusStreamStillPublishesActivePresentationChanges(t *testing.T) {
	service := NewEngineerService(nil)
	stream, closeStream := service.SubscribeStream()
	defer closeStream()
	<-stream
	service.mu.Lock()
	service.emitStatusLocked()
	service.mu.Unlock()
	<-stream
	service.mu.Lock()
	service.activePresentation = &EngineerNotification{ID: "active"}
	service.emitStatusLocked()
	service.mu.Unlock()
	if event := <-stream; !event.Active {
		t.Fatal("active transition lost")
	}
	service.mu.Lock()
	service.activePresentation = nil
	service.emitStatusLocked()
	service.mu.Unlock()
	if event := <-stream; event.Active {
		t.Fatal("clear transition lost")
	}
}
