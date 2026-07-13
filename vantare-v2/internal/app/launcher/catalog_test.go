package launcher

import (
	"strings"
	"testing"
	"time"
)

func TestOfficialCatalogInvariants(t *testing.T) {
	wantIDs := map[string]struct{}{
		"lmu": {}, "obs": {}, "crewchief": {}, "discord": {},
		"spotify": {}, "motec": {}, "simhub": {},
	}
	seen := make(map[string]struct{}, len(OfficialCatalog))

	if len(OfficialCatalog) != len(wantIDs) {
		t.Fatalf("official catalog has %d apps, want %d", len(OfficialCatalog), len(wantIDs))
	}

	for _, app := range OfficialCatalog {
		t.Run(app.ID, func(t *testing.T) {
			if _, ok := wantIDs[app.ID]; !ok {
				t.Fatalf("unexpected official app ID %q", app.ID)
			}
			if _, ok := seen[app.ID]; ok {
				t.Fatalf("duplicate official app ID %q", app.ID)
			}
			seen[app.ID] = struct{}{}
			if app.DisplayName == "" || app.LaunchMethod == "" {
				t.Fatal("official app must have display name and launch method")
			}
			if _, ok := KnownLaunchMethods[app.LaunchMethod]; !ok {
				t.Fatalf("unsupported launch method %q", app.LaunchMethod)
			}
			if len(app.ProcessNames) == 0 {
				t.Fatal("official app must define at least one process name")
			}
			if app.ReadyGrace <= 0 {
				t.Fatalf("ready grace must be positive, got %s", app.ReadyGrace)
			}
			if strings.HasPrefix(app.IconAsset, "http://") || strings.HasPrefix(app.IconAsset, "https://") || app.IconAsset == "" {
				t.Fatalf("icon asset must be a non-empty local path, got %q", app.IconAsset)
			}
			if app.LaunchMethod == "executable" && len(app.ExecutableNames) == 0 {
				t.Fatal("executable app must define executable names")
			}
			if app.LaunchMethod == "steam-uri" && app.SteamAppID == 0 {
				t.Fatal("steam-uri app must define a Steam AppID")
			}
		})
	}

	for id := range wantIDs {
		if _, ok := seen[id]; !ok {
			t.Errorf("missing official app ID %q", id)
		}
	}
}

func TestKnownAppsDeriveFromOfficialCatalog(t *testing.T) {
	if len(KnownApps) != len(OfficialCatalog) {
		t.Fatalf("known apps has %d entries, want %d", len(KnownApps), len(OfficialCatalog))
	}

	for _, official := range OfficialCatalog {
		known, ok := KnownAppsByID[official.ID]
		if !ok {
			t.Fatalf("known apps missing official ID %q", official.ID)
		}
		if known.DisplayName != official.DisplayName || known.LaunchMethod != official.LaunchMethod {
			t.Fatalf("known app %q is not derived from official metadata: %+v", official.ID, known)
		}
		if known.ReadyGrace != official.ReadyGrace {
			t.Fatalf("known app %q readiness mismatch: got %s want %s", official.ID, known.ReadyGrace, official.ReadyGrace)
		}
	}
}

func TestOfficialCatalogReadinessUsesDurations(t *testing.T) {
	for _, app := range OfficialCatalog {
		if app.ReadyGrace < time.Millisecond {
			t.Errorf("%s readiness is too small to represent a real grace period: %s", app.ID, app.ReadyGrace)
		}
	}
}
