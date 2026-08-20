// Package simx is a synthetic simulator driver. It exists to prove the
// multi-simulator contract end to end: SimX publishes player telemetry,
// official standings and fuel, and publishes no rival world positions, no
// weather and no native delta. Adding it must not touch a single widget.
//
// The source is deterministic and lives in memory. There is no process to
// attach to, no shared memory and no network, so the driver runs identically
// on every platform and in CI.
package simx

import (
	"fmt"

	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/fusion"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

const (
	// DriverID is the stable identifier of the synthetic driver.
	DriverID drivercontract.ID = "simx"
	// CapabilitySynthetic is the single acquisition channel. SimX has one
	// source, so its fusion declares exactly one slot; the shared fusion
	// package supports that without any driver-side code.
	CapabilitySynthetic drivercontract.Capability = "synthetic"

	// SlotSynthetic is the fusion slot backing CapabilitySynthetic.
	SlotSynthetic fusion.SlotID = "synthetic"

	batchSource  envelope.SourceID = "simx"
	batchEventID identity.EventID  = "simx"

	// VehicleCount is the size of the synthetic grid.
	VehicleCount = 12
	// PlayerSlot is the grid slot the player occupies.
	PlayerSlot = 0
	// TrackLengthMeters is the synthetic circuit length.
	TrackLengthMeters = 5000.0
	// TrackName is the synthetic circuit name.
	TrackName = "SimX Proving Ground"
)

func sessionID(counter uint64) identity.SessionID {
	return identity.SessionID(fmt.Sprintf("simx-session-%d", counter))
}

func vehicleID(slot int) identity.VehicleID {
	return identity.VehicleID(fmt.Sprintf("simx-car-%02d", slot))
}

func driverName(slot int) identity.DriverName {
	if slot == PlayerSlot {
		return "SimX Player"
	}
	return identity.DriverName(fmt.Sprintf("SimX Rival %02d", slot))
}
