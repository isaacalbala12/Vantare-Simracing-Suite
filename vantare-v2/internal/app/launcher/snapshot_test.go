package launcher

import (
	"encoding/json"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestSnapshotOrdersAppsSeparatesProfilesAndStartsWithoutChains(t *testing.T) {
	backend := &fakeSettingsBackend{
		apps: map[string]app.LauncherAppEntry{
			"zeta":  {ID: "zeta", DisplayName: "Zeta"},
			"alpha": {ID: "alpha", DisplayName: "Alpha"},
		},
		profiles: []app.LaunchProfile{
			{ID: "user-z", Name: "User Z"},
			{ID: "pro", Name: "Pro"},
			{ID: "creator", Name: "Creator"},
		},
	}
	svc := NewService(backend, &spyEmitter{}, nil)

	snapshot := svc.Snapshot()
	if got := []string{snapshot.Apps[0].ID, snapshot.Apps[1].ID}; got[0] != "alpha" || got[1] != "zeta" {
		t.Fatalf("apps are not ordered by ID: %v", got)
	}
	if len(snapshot.VantareProfiles) != 2 || snapshot.VantareProfiles[0].ID != "creator" || snapshot.VantareProfiles[1].ID != "pro" {
		t.Fatalf("unexpected Vantare profiles: %+v", snapshot.VantareProfiles)
	}
	if len(snapshot.UserProfiles) != 1 || snapshot.UserProfiles[0].ID != "user-z" {
		t.Fatalf("unexpected user profiles: %+v", snapshot.UserProfiles)
	}
	if snapshot.ActiveChains == nil || len(snapshot.ActiveChains) != 0 {
		t.Fatalf("new snapshot must expose an empty activeChains list: %+v", snapshot.ActiveChains)
	}
	if snapshot.Discovery.Scanning {
		t.Fatal("snapshot should not report an active discovery scan")
	}
}

func TestSnapshotRevisionIsMonotonicAndWireSerializable(t *testing.T) {
	backend := &fakeSettingsBackend{}
	svc := NewService(backend, &spyEmitter{}, nil)

	first := svc.Snapshot()
	second := svc.Snapshot()
	if second.Revision <= first.Revision {
		t.Fatalf("snapshot revision did not advance: first=%d second=%d", first.Revision, second.Revision)
	}
	data, err := json.Marshal(second)
	if err != nil {
		t.Fatalf("marshal snapshot: %v", err)
	}
	var wire map[string]any
	if err := json.Unmarshal(data, &wire); err != nil {
		t.Fatalf("unmarshal snapshot: %v", err)
	}
	for _, key := range []string{"revision", "apps", "vantareProfiles", "userProfiles", "activeChains", "discovery"} {
		if _, ok := wire[key]; !ok {
			t.Fatalf("snapshot wire payload missing %q: %s", key, data)
		}
	}
}
