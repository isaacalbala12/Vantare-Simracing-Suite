package identity

import "fmt"

type StintID string

func NewStintID(session SessionID, vehicle VehicleID, generation uint64) StintID {
	return StintID(fmt.Sprintf("%s/%s/stint-%d", session, vehicle, generation))
}
