package launcher

// DefaultLMUAppID is the official Steam AppID for Le Mans Ultimate.
const DefaultLMUAppID uint32 = 2399420

// KnownSteamAppIDs maps the simulator identifiers that ship with a default
// Steam AppID. Additional simulators can be added here in a follow-up plan;
// the launcher itself only validates and launches the IDs the user provides.
var KnownSteamAppIDs = map[string]uint32{
	"lmu": DefaultLMUAppID,
}

// KnownLaunchMethods lists the launch methods accepted by Configure. Anything
// outside this set is rejected with ErrInvalidConfig.
var KnownLaunchMethods = map[string]struct{}{
	"steam-uri":  {},
	"executable": {},
}
