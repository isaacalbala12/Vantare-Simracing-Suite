package main

import (
	"time"

	"github.com/vantare/overlays/v2/internal/discordpresence"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

const discordPresenceClientID = "1546608423485972571"

func discordPresenceActivity(status driver.SourceStatus, startedAt time.Time) discordpresence.Activity {
	state := "Hub activo"
	if status.Live && status.Available {
		state = "Telemetría conectada"
	} else if status.Live {
		state = "Telemetría desconectada"
	}

	activity := discordpresence.Activity{
		Details: "Vantare Simracing Suite",
		State:   state,
	}
	if !startedAt.IsZero() {
		activity.StartTimestamp = startedAt.Unix()
	}
	return activity
}
