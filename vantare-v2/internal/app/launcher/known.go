package launcher

// DefaultLMUSteamAppID is the official Steam AppID for Le Mans Ultimate.
const DefaultLMUSteamAppID uint32 = 2399420

// KnownApp describes a detectable/launchable application.
type KnownApp struct {
	ID                  string
	DisplayName         string
	Abbreviation        string
	Category            string
	LaunchMethod        string
	SteamAppID          uint32
	ExecutableNames     []string // candidate .exe names, ordered by preference
	DisplayNameMatchers []string // substrings to match in the registry DisplayName
	KnownPaths          []string // known absolute paths or %env%-templated paths to probe
	GradientFrom        string
	GradientTo          string
}

var KnownApps = []KnownApp{
	{
		ID: "lmu", DisplayName: "Le Mans Ultimate", Abbreviation: "LMU",
		Category: "simulator", LaunchMethod: "steam-uri", SteamAppID: DefaultLMUSteamAppID,
		DisplayNameMatchers: []string{"le mans ultimate"},
		GradientFrom:        "#ff3b3b", GradientTo: "#9a0606",
	},
	{
		ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS",
		Category: "streaming", LaunchMethod: "executable",
		ExecutableNames:     []string{"obs64.exe", "obs32.exe"},
		DisplayNameMatchers: []string{"obs studio"},
		KnownPaths:          []string{`%PROGRAMFILES%\obs-studio\bin\64bit`, `%PROGRAMFILES(X86)%\obs-studio\bin\64bit`},
		GradientFrom:        "#302e31", GradientTo: "#0a0a0a",
	},
	{
		ID: "crewchief", DisplayName: "CrewChief", Abbreviation: "CC",
		Category: "utility", LaunchMethod: "executable",
		ExecutableNames:     []string{"CrewChiefV4.exe", "CrewChief.exe"},
		DisplayNameMatchers: []string{"crewchief"},
		KnownPaths:          []string{`%LOCALAPPDATA%\CrewChief`},
		GradientFrom:        "#3b82f6", GradientTo: "#1d4ed8",
	},
	{
		ID: "discord", DisplayName: "Discord", Abbreviation: "DC",
		Category: "utility", LaunchMethod: "executable",
		ExecutableNames:     []string{"Discord.exe", "Update.exe"},
		DisplayNameMatchers: []string{"discord"},
		KnownPaths:          []string{`%LOCALAPPDATA%\Discord`, `%PROGRAMFILES%\Discord`},
		GradientFrom:        "#5865F2", GradientTo: "#404EED",
	},
	{
		ID: "spotify", DisplayName: "Spotify", Abbreviation: "Sp",
		Category: "audio", LaunchMethod: "executable",
		ExecutableNames:     []string{"Spotify.exe"},
		DisplayNameMatchers: []string{"spotify"},
		KnownPaths:          []string{`%APPDATA%\Spotify`, `%LOCALAPPDATA%\Spotify`},
		GradientFrom:        "#10b981", GradientTo: "#059669",
	},
	{
		ID: "motec", DisplayName: "MoTeC", Abbreviation: "MT",
		Category: "telemetry", LaunchMethod: "executable",
		ExecutableNames:     []string{"MoTeC.exe"},
		DisplayNameMatchers: []string{"motec"},
		KnownPaths:          []string{`%PROGRAMFILES%\MoTeC`},
		GradientFrom:        "#f59e0b", GradientTo: "#b45309",
	},
	{
		ID: "simhub", DisplayName: "SimHub", Abbreviation: "SH",
		Category: "telemetry", LaunchMethod: "executable",
		ExecutableNames:     []string{"SimHub.exe"},
		DisplayNameMatchers: []string{"simhub"},
		KnownPaths:          []string{`%PROGRAMFILES%\SimHub`, `%LOCALAPPDATA%\SimHub`},
		GradientFrom:        "#8b5cf6", GradientTo: "#6d28d9",
	},
}

var KnownAppsByID = map[string]KnownApp{}

func init() {
	for _, a := range KnownApps {
		KnownAppsByID[a.ID] = a
	}
}
