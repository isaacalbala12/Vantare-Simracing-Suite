package launcher

import "github.com/vantare/overlays/v2/internal/app"

// Availability is the canonical availability contract exposed by the
// launcher. The wire representation lives in internal/app so settings can
// store it without introducing an import cycle.
type Availability = app.LauncherAvailability

// DetectionEvidence contains facts collected by discovery. It deliberately
// does not contain derived availability state.
type DetectionEvidence struct {
	Catalogued       bool
	Found            bool
	ExecutableExists bool
	SteamInstalled   bool
	SteamAppID       uint32
}

// DeriveAvailability converts discovery facts into the four canonical
// availability flags used by the launcher.
func DeriveAvailability(e DetectionEvidence) Availability {
	installed := e.ExecutableExists || (e.SteamInstalled && e.SteamAppID != 0)
	return Availability{
		Catalogued: e.Catalogued,
		Found:      e.Found,
		Installed:  installed,
		Launchable: installed,
	}
}
