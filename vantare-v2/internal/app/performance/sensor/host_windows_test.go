//go:build windows

package sensor

import (
	"context"
	"os"
	"reflect"
	"testing"
	"time"
)

func TestOwnProcessTreeIgnoresAnotherVantareWithSharedWebViewProfile(t *testing.T) {
	const sharedProfile = `--user-data-dir="C:\Users\isaac\AppData\Roaming\webview_v0.1.0.5"`
	processes := []processRecord{
		{pid: 100, parentPID: 10, name: "vantare-first.exe", commandLine: "vantare-first.exe"},
		{pid: 110, parentPID: 100, name: "msedgewebview2.exe", commandLine: "msedgewebview2.exe --type=browser " + sharedProfile},
		{pid: 111, parentPID: 110, name: "msedgewebview2.exe", commandLine: "msedgewebview2.exe --type=renderer " + sharedProfile},
		{pid: 200, parentPID: 10, name: "vantare-second.exe", commandLine: "vantare-second.exe"},
		{pid: 210, parentPID: 200, name: "msedgewebview2.exe", commandLine: "msedgewebview2.exe --type=browser " + sharedProfile},
		{pid: 211, parentPID: 210, name: "msedgewebview2.exe", commandLine: "msedgewebview2.exe --type=renderer " + sharedProfile},
	}

	if got, want := ownProcessTreeIDs(100, processes), []uint32{100, 110, 111}; !reflect.DeepEqual(got, want) {
		t.Fatalf("own process tree = %v, want %v", got, want)
	}
}

func TestHostSamplerCachesProcessInventoryUntilTTL(t *testing.T) {
	now := time.Unix(1000, 0)
	calls := 0
	sampler := NewHostSampler()
	sampler.now = func() time.Time { return now }
	sampler.inventoryTTL = 5 * time.Second
	sampler.inventory = func(context.Context) ([]processRecord, error) {
		calls++
		return []processRecord{{pid: 110, parentPID: int32(os.Getpid()), name: "msedgewebview2.exe"}}, nil
	}

	for attempt := 0; attempt < 2; attempt++ {
		if _, err := sampler.ownProcessIDs(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 1 {
		t.Fatalf("inventory calls inside TTL = %d, want 1", calls)
	}
	now = now.Add(5 * time.Second)
	if _, err := sampler.ownProcessIDs(context.Background()); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("inventory calls after TTL = %d, want 2", calls)
	}
}
