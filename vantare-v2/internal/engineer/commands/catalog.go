package commands

import "strings"

// Command represents a single PTT voice command mapped to a pit menu action.
type Command struct {
	Phrase      string // Voice phrase, e.g. "box now"
	Action      string // Pit action identifier, e.g. "request"
	Description string // Human-readable description
}

// Catalog is the master list of all supported PTT commands.
var Catalog = []Command{
	{Phrase: "request pit stop", Action: "request", Description: "Request pit stop"},
	{Phrase: "confirm pit stop", Action: "confirm", Description: "Confirm pit stop"},
	{Phrase: "abort pit stop", Action: "abort", Description: "Abort pit stop"},
	{Phrase: "box this lap", Action: "request", Description: "Pit this lap"},
	{Phrase: "fuel", Action: "fuel", Description: "Fuel only"},
	{Phrase: "tyres", Action: "tyres", Description: "Change tyres"},
	{Phrase: "front wing", Action: "front_wing", Description: "Front wing adjustment"},
	{Phrase: "rear wing", Action: "rear_wing", Description: "Rear wing adjustment"},
	{Phrase: "engine mode", Action: "engine_mode", Description: "Change engine mode"},
	{Phrase: "brake bias", Action: "brake_bias", Description: "Change brake bias"},
	{Phrase: "headlights", Action: "headlights", Description: "Toggle headlights"},
	{Phrase: "wiper", Action: "wiper", Description: "Toggle wiper"},
	{Phrase: "rain light", Action: "rain_light", Description: "Toggle rain light"},
	{Phrase: "driver swap", Action: "driver_swap", Description: "Request driver swap"},
}

// FindCommand finds a command by prefix match on the phrase.
// Returns nil if no match is found.
func FindCommand(phrase string) *Command {
	lower := strings.ToLower(strings.TrimSpace(phrase))
	for i := range Catalog {
		if strings.HasPrefix(lower, Catalog[i].Phrase) {
			return &Catalog[i]
		}
	}
	return nil
}
