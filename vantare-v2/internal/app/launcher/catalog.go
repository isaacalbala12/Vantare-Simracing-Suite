package launcher

import "time"

// CatalogApp is the authoritative metadata for an official launcher app.
// Runtime discovery and process readiness consume this catalog; UI-specific
// fields remain here during the compatibility migration to avoid duplicate
// official-app lists.
type CatalogApp struct {
	ID                  string
	DisplayName         string
	Abbreviation        string
	Category            string
	LaunchMethod        string
	SteamAppID          uint32
	ExecutableNames     []string
	ProcessNames        []string
	DisplayNameMatchers []string
	KnownPaths          []string
	IconAsset           string
	ReadyGrace          time.Duration
	GradientFrom        string
	GradientTo          string
}

// OfficialCatalog is the single source of truth for official launcher apps.
var OfficialCatalog = []CatalogApp{
	{
		ID: "lmu", DisplayName: "Le Mans Ultimate", Abbreviation: "LMU",
		Category: "simulator", LaunchMethod: "steam-uri", SteamAppID: DefaultLMUSteamAppID,
		ExecutableNames:     []string{"Le Mans Ultimate.exe", "LMU.exe"},
		ProcessNames:        []string{"Le Mans Ultimate.exe", "LMU.exe"},
		DisplayNameMatchers: []string{"le mans ultimate"},
		IconAsset:           "launcher/apps/lmu.webp", ReadyGrace: 5 * time.Second,
		GradientFrom: "#ff3b3b", GradientTo: "#9a0606",
	},
	{
		ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS",
		Category: "streaming", LaunchMethod: "executable",
		ExecutableNames:     []string{"obs64.exe", "obs32.exe"},
		ProcessNames:        []string{"obs64.exe", "obs32.exe"},
		DisplayNameMatchers: []string{"obs studio"},
		KnownPaths:          []string{`%PROGRAMFILES%\obs-studio\bin\64bit`, `%PROGRAMFILES(X86)%\obs-studio\bin\64bit`},
		IconAsset:           "launcher/apps/obs.webp", ReadyGrace: 3 * time.Second,
		GradientFrom: "#302e31", GradientTo: "#0a0a0a",
	},
	{
		ID: "crewchief", DisplayName: "CrewChief", Abbreviation: "CC",
		Category: "utility", LaunchMethod: "executable",
		ExecutableNames:     []string{"CrewChiefV4.exe", "CrewChief.exe"},
		ProcessNames:        []string{"CrewChiefV4.exe", "CrewChief.exe"},
		DisplayNameMatchers: []string{"crewchief", "crew chief"},
		KnownPaths:          []string{`%LOCALAPPDATA%\CrewChief`},
		IconAsset:           "launcher/apps/crewchief.webp", ReadyGrace: 3 * time.Second,
		GradientFrom: "#3b82f6", GradientTo: "#1d4ed8",
	},
	{
		ID: "discord", DisplayName: "Discord", Abbreviation: "DC",
		Category: "utility", LaunchMethod: "executable",
		ExecutableNames:     []string{"Discord.exe", "Update.exe"},
		ProcessNames:        []string{"Discord.exe"},
		DisplayNameMatchers: []string{"discord"},
		KnownPaths:          []string{`%LOCALAPPDATA%\Discord`, `%PROGRAMFILES%\Discord`},
		IconAsset:           "launcher/apps/discord.webp", ReadyGrace: 3 * time.Second,
		GradientFrom: "#5865F2", GradientTo: "#404EED",
	},
	{
		ID: "spotify", DisplayName: "Spotify", Abbreviation: "Sp",
		Category: "audio", LaunchMethod: "executable",
		ExecutableNames:     []string{"Spotify.exe"},
		ProcessNames:        []string{"Spotify.exe"},
		DisplayNameMatchers: []string{"spotify"},
		KnownPaths:          []string{`%APPDATA%\Spotify`, `%LOCALAPPDATA%\Spotify`},
		IconAsset:           "launcher/apps/spotify.webp", ReadyGrace: 3 * time.Second,
		GradientFrom: "#10b981", GradientTo: "#059669",
	},
	{
		ID: "motec", DisplayName: "MoTeC", Abbreviation: "MT",
		Category: "telemetry", LaunchMethod: "executable",
		ExecutableNames:     []string{"app.exe", "i2.exe", "MoTeC.exe"},
		ProcessNames:        []string{"app.exe", "i2.exe", "MoTeC.exe"},
		DisplayNameMatchers: []string{"motec"},
		KnownPaths:          []string{`%PROGRAMFILES%\MoTeC`, `%PROGRAMFILES(X86)%\MoTeC`},
		IconAsset:           "launcher/apps/motec.webp", ReadyGrace: 3 * time.Second,
		GradientFrom: "#f59e0b", GradientTo: "#b45309",
	},
	{
		ID: "simhub", DisplayName: "SimHub", Abbreviation: "SH",
		Category: "telemetry", LaunchMethod: "executable",
		ExecutableNames:     []string{"SimHubWPF.exe", "SimHub.exe"},
		ProcessNames:        []string{"SimHubWPF.exe", "SimHub.exe"},
		DisplayNameMatchers: []string{"simhub"},
		KnownPaths:          []string{`%PROGRAMFILES%\SimHub`, `%PROGRAMFILES(X86)%\SimHub`, `%LOCALAPPDATA%\SimHub`},
		IconAsset:           "launcher/apps/simhub.webp", ReadyGrace: 3 * time.Second,
		GradientFrom: "#8b5cf6", GradientTo: "#6d28d9",
	},
}

func catalogToKnownApps(catalog []CatalogApp) []KnownApp {
	known := make([]KnownApp, len(catalog))
	for i, official := range catalog {
		known[i] = official
		known[i].ExecutableNames = append([]string(nil), official.ExecutableNames...)
		known[i].ProcessNames = append([]string(nil), official.ProcessNames...)
		known[i].DisplayNameMatchers = append([]string(nil), official.DisplayNameMatchers...)
		known[i].KnownPaths = append([]string(nil), official.KnownPaths...)
	}
	return known
}

func indexKnownApps(apps []KnownApp) map[string]KnownApp {
	byID := make(map[string]KnownApp, len(apps))
	for _, app := range apps {
		byID[app.ID] = app
	}
	return byID
}
