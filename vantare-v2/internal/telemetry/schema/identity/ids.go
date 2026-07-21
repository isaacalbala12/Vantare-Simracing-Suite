package identity

type EventID string
type SessionID string
type VehicleID string
type TeamID string
type DriverID string

// RunIdentity keeps stable boundaries separate from participant identity.
// Team and driver changes therefore do not create a new run by themselves.
type RunIdentity struct {
	Event   EventID
	Session SessionID
	Vehicle VehicleID
	Team    TeamID
	Driver  DriverID
}

func (identity RunIdentity) Complete() bool {
	return identity.Event != "" && identity.Session != "" && identity.Vehicle != ""
}

func (identity RunIdentity) SameRun(other RunIdentity) bool {
	return identity.Complete() && other.Complete() &&
		identity.Event == other.Event &&
		identity.Session == other.Session &&
		identity.Vehicle == other.Vehicle
}
