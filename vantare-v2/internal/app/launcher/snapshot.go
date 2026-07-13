package launcher

import (
	"sort"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

type LauncherActiveChain struct {
	ProfileID string               `json:"profileId"`
	Status    string               `json:"status"`
	StartedAt time.Time            `json:"startedAt"`
	Steps     []LauncherActiveStep `json:"steps,omitempty"`
}

type LauncherActiveStep struct {
	AppID   string `json:"appId"`
	Status  string `json:"status"`
	PID     int    `json:"pid,omitempty"`
	Message string `json:"message,omitempty"`
}

type LauncherDiscovery struct {
	Scanning   bool       `json:"scanning"`
	LastScanAt *time.Time `json:"lastScanAt"`
	Error      *string    `json:"error"`
}

type LauncherDiscoveryPhase string

const (
	DiscoveryStarting       LauncherDiscoveryPhase = "starting"
	DiscoveryDiscovering    LauncherDiscoveryPhase = "discovering"
	DiscoveryMerging        LauncherDiscoveryPhase = "merging"
	DiscoveryResolvingIcons LauncherDiscoveryPhase = "resolving-icons"
	DiscoveryComplete       LauncherDiscoveryPhase = "complete"
	DiscoveryError          LauncherDiscoveryPhase = "error"
)

type LauncherDiscoveryProgress struct {
	Scanning bool                   `json:"scanning"`
	Progress int                    `json:"progress"`
	Phase    LauncherDiscoveryPhase `json:"phase"`
	Error    *string                `json:"error"`
}

// LauncherSnapshot is the aggregate wire payload consumed by the future
// frontend bridge. Legacy events remain available during migration.
type LauncherSnapshot struct {
	Revision        uint64                 `json:"revision"`
	Apps            []app.LauncherAppEntry `json:"apps"`
	VantareProfiles []app.LaunchProfile    `json:"vantareProfiles"`
	UserProfiles    []app.LaunchProfile    `json:"userProfiles"`
	ActiveChains    []LauncherActiveChain  `json:"activeChains"`
	Discovery       LauncherDiscovery      `json:"discovery"`
}

var officialProfileIDs = map[string]struct{}{
	"creator": {},
	"pro":     {},
}

func isOfficialProfile(id string) bool {
	_, ok := officialProfileIDs[id]
	return ok
}

func sortApps(apps []app.LauncherAppEntry) {
	sort.SliceStable(apps, func(i, j int) bool {
		return apps[i].ID < apps[j].ID
	})
}

func sortProfiles(profiles []app.LaunchProfile) {
	sort.SliceStable(profiles, func(i, j int) bool {
		return profiles[i].ID < profiles[j].ID
	})
}
