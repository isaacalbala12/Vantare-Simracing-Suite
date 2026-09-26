package main

import (
	"reflect"
	"testing"
)

func TestLauncherStartupQueuesEveryProfileForOneInstance(t *testing.T) {
	var queue launcherStartupQueue
	var launched []string
	queue.Offer([]string{"--launch=stream"})
	queue.Offer([]string{"--launch=race"})
	queue.Offer([]string{"--launch=invalid name"})
	if len(launched) != 0 {
		t.Fatal("profile launched before the service was ready")
	}
	queue.Ready(func(id string) { launched = append(launched, id) })
	queue.Offer([]string{"--launch=notes"})
	if want := []string{"stream", "race", "notes"}; !reflect.DeepEqual(launched, want) {
		t.Fatalf("startup profiles = %v, want %v", launched, want)
	}
}

func TestSecondInstanceWithoutProfileReopensHub(t *testing.T) {
	var queue launcherStartupQueue
	opened := 0
	queue.Open()
	queue.Open()
	queue.ReadyOpen(func() { opened++ })
	if opened != 1 {
		t.Fatalf("queued manual launches opened Hub %d times, want 1", opened)
	}
	queue.Open()
	if opened != 2 {
		t.Fatalf("manual launch did not reopen existing Hub: %d", opened)
	}
}
