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

func (identity RunIdentity) SessionKnown() bool {
	return identity.Event != "" && identity.Session != ""
}

func (identity RunIdentity) SameSession(other RunIdentity) bool {
	return identity.SessionKnown() && other.SessionKnown() &&
		identity.Event == other.Event && identity.Session == other.Session
}

func (identity RunIdentity) SameRun(other RunIdentity) bool {
	return identity.SameSession(other) && identity.Vehicle == other.Vehicle
}
