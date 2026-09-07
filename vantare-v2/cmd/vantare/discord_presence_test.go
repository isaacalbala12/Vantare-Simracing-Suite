package main

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

func TestDiscordPresenceActivityReflectsTelemetryAvailability(t *testing.T) {
	startedAt := time.Unix(123, 0)

	connected := discordPresenceActivity(driver.SourceStatus{Live: true, Available: true}, startedAt)
	if connected.Details != "Vantare Simracing Suite" || connected.State != "Telemetría conectada" || connected.StartTimestamp != 123 {
		t.Fatalf("connected activity = %#v", connected)
	}

	disconnected := discordPresenceActivity(driver.SourceStatus{Live: true, Available: false}, startedAt)
	if disconnected.State != "Telemetría desconectada" {
		t.Fatalf("disconnected state = %q", disconnected.State)
	}

	hubOnly := discordPresenceActivity(driver.UnknownSourceStatus(), time.Time{})
	if hubOnly.State != "Hub activo" || hubOnly.StartTimestamp != 0 {
		t.Fatalf("hub-only activity = %#v", hubOnly)
	}
}
