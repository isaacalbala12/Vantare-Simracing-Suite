package launcher

import (
	"context"
	"testing"
)

type sequenceInspector struct {
	values []bool
	index  int
}

func (s *sequenceInspector) Find(context.Context, ProcessIdentity) (ProcessInfo, bool) {
	if s.index >= len(s.values) {
		return ProcessInfo{}, false
	}
	open := s.values[s.index]
	s.index++
	return ProcessInfo{PID: 10, ProcessName: "Le Mans Ultimate.exe", Alive: open}, open
}

func TestLMUTriggerOnlyFiresOnClosedToOpen(t *testing.T) {
	trigger := NewLMUTrigger(true, "creator")
	inspector := &sequenceInspector{values: []bool{false, true, true, false, true}}
	for i, want := range []bool{false, true, false, false, true} {
		_, got, err := trigger.Observe(context.Background(), inspector, ProcessIdentity{ProcessName: "Le Mans Ultimate.exe"})
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("poll %d: got %v want %v", i, got, want)
		}
	}
}

func TestLMUTriggerDisabledDoesNothing(t *testing.T) {
	_, launch, err := NewLMUTrigger(false, "creator").Observe(context.Background(), &sequenceInspector{values: []bool{true}}, ProcessIdentity{})
	if err != nil || launch {
		t.Fatalf("disabled trigger got launch=%v err=%v", launch, err)
	}
}
