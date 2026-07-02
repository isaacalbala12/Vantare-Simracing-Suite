package lmuapi

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Vector is a 3D vector with velocity magnitude.
type Vector struct {
	Velocity float64 `json:"velocity"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Z        float64 `json:"z"`
}

// StandingRow is one entry in the LMU live standings.
type StandingRow struct {
	SlotID                int32   `json:"slotID"`
	DriverName            string  `json:"driverName"`
	CarNumber             string  `json:"carNumber"`
	CarClass              string  `json:"carClass"`
	FullTeamName          string  `json:"fullTeamName"`
	VehicleName           string  `json:"vehicleName"`
	Position              int32   `json:"position"`
	Qualification         int32   `json:"qualification"`
	Player                bool    `json:"player"`
	LapsCompleted         int16   `json:"lapsCompleted"`
	LapsBehindLeader      int32   `json:"lapsBehindLeader"`
	LapsBehindClassLeader int32   `json:"lapsBehindClassLeader"`
	LapsBehindNext        int32   `json:"lapsBehindNext"`
	TimeBehindLeader      float64 `json:"timeBehindLeader"`
	TimeBehindNext        float64 `json:"timeBehindNext"`
	LapDistance           float64 `json:"lapDistance"`
	TimeIntoLap           float64 `json:"timeIntoLap"`
	BestLapTime           float64 `json:"bestLapTime"`
	LastLapTime           float64 `json:"lastLapTime"`
	EstimatedLapTime      float64 `json:"estimatedLapTime"`
	CurrentSectorTime1    float64 `json:"currentSectorTime1"`
	CurrentSectorTime2    float64 `json:"currentSectorTime2"`
	PitState              string  `json:"pitState"`
	Pitting               bool    `json:"pitting"`
	InGarageStall         bool    `json:"inGarageStall"`
	Sector                string  `json:"sector"`
	Flag                  string  `json:"flag"`
	FinishStatus          string  `json:"finishStatus"`
	Penalties             int32   `json:"penalties"`
	Pitstops              int32   `json:"pitstops"`
	FuelFraction          float64 `json:"fuelFraction"`
	CarVelocity           Vector  `json:"carVelocity"`
}

// SlotIDOrPositionID returns a stable identifier for the row.
func (r StandingRow) SlotIDOrPositionID() int32 {
	if r.SlotID != 0 {
		return r.SlotID
	}
	return r.Position
}

// SessionInfo is the LMU live session metadata.
type SessionInfo struct {
	TrackName                string   `json:"trackName"`
	Session                  string   `json:"session"`
	GamePhase                uint8    `json:"gamePhase"`
	NumberOfVehicles         int32    `json:"numberOfVehicles"`
	PlayerName               string   `json:"playerName"`
	CurrentEventTime         float64  `json:"currentEventTime"`
	TimeRemainingInGamePhase float64  `json:"timeRemainingInGamePhase"`
	YellowFlagState          string   `json:"yellowFlagState"`
	SectorFlag               []string `json:"sectorFlag"`
}

// MultiplayerTeamsResponse is the LMU multiplayer teams endpoint response.
type MultiplayerTeamsResponse struct {
	CoherenceID int64                 `json:"coherenceId"`
	Drivers     map[string]DriverInfo `json:"drivers"`
	Teams       map[string]TeamInfo   `json:"teams"`
}

// DriverInfo contains a driver's multiplayer profile data.
type DriverInfo struct {
	Badge        string   `json:"badge"`
	IsConnected  bool     `json:"isConnected"`
	Nationality  string   `json:"nationality"`
	Roles        []string `json:"roles"`
	TeamID       string   `json:"teamId"`
	TeamName     string   `json:"teamName"`
	UniqueTeamID string   `json:"uniqueTeamId"`
}

// TeamInfo contains a team's multiplayer data.
type TeamInfo struct {
	ID        string                `json:"Id"`
	CarNumber string                `json:"carNumber"`
	Drivers   map[string]DriverInfo `json:"drivers"`
	Name      string                `json:"name"`
	Vehicle   string                `json:"vehicle"`
}

// RatingField is a discovered rating/safety/rank field in raw JSON.
type RatingField struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// ratingFieldKeys is the set of case-insensitive field names to search for.
var ratingFieldKeys = map[string]bool{
	"safetyrank":         true,
	"safetybadge":        true,
	"driverrank":         true,
	"driverrankprogress": true,
	"driverrankshort":    true,
	"elo":                true,
	"rating":             true,
	"badge":              true,
	"rank":               true,
}

// FindRatingFields walks raw JSON safely and returns any discovered
// rating/safety/rank/badge/elo fields. It is case-insensitive and does
// not panic on malformed input, arrays, nulls, or primitives.
func FindRatingFields(raw json.RawMessage) []RatingField {
	var out []RatingField
	walkJSON(raw, "", &out)
	return out
}

// walkJSON recursively walks decoded JSON values looking for rating fields.
func walkJSON(raw json.RawMessage, prefix string, out *[]RatingField) {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return
	}
	switch val := v.(type) {
	case map[string]any:
		for k, child := range val {
			childRaw, _ := json.Marshal(child)
			childPrefix := k
			if prefix != "" {
				childPrefix = prefix + "." + k
			}
			// Case-insensitive lookup: convert key to lowercase
			lowerK := strings.ToLower(k)
			if ratingFieldKeys[lowerK] {
				*out = append(*out, RatingField{Key: childPrefix, Value: fmtValue(child)})
			}
			walkJSON(childRaw, childPrefix, out)
		}
	case []any:
		for i, child := range val {
			childRaw, _ := json.Marshal(child)
			childPrefix := fmt.Sprintf("%s[%d]", prefix, i)
			walkJSON(childRaw, childPrefix, out)
		}
	}
}

// fmtValue converts a decoded JSON value to a short string for display.
func fmtValue(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		if x == float64(int64(x)) {
			return fmt.Sprintf("%.0f", x)
		}
		return fmt.Sprintf("%.2f", x)
	case bool:
		if x {
			return "true"
		}
		return "false"
	case nil:
		return "null"
	default:
		return fmt.Sprintf("%v", x)
	}
}
