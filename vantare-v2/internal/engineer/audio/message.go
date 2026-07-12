package audio

type Priority int

const (
	PriorityNormal  Priority = 10
	PrioritySpotter Priority = 100
)

// Category classifies where a message originated. The frontend can use
// this to filter or style messages by source (e.g., engine vs tyre).
type Category string

const (
	CategorySpotter     Category = "spotter"
	CategoryEngine      Category = "engine"
	CategoryTyre        Category = "tyre"
	CategoryOpponents   Category = "opponents"
	CategoryMulticlass  Category = "multiclass"
	CategoryFlags       Category = "flags"
	CategoryFuel        Category = "fuel"
	CategoryPenalties   Category = "penalties"
	CategoryLaps        Category = "laps"
	CategoryPosition    Category = "position"
	CategoryPush        Category = "push"
	CategoryRaceTime    Category = "racetime"
	CategorySessionEnd  Category = "sessionend"
	CategoryTimings     Category = "timings"
	CategoryPearls      Category = "pearls"
	CategoryPitStops    Category = "pitstops"
	CategoryWatched     Category = "watched"
	CategoryStrategy    Category = "strategy"
	CategoryDriverSwaps Category = "driverswaps"
	CategoryDamage      Category = "damage"
	CategoryConditions  Category = "conditions"
)

// Severity classifies message urgency. Maps to CC's priority tiers
// (5=all-clear, 10=normal, 20=spotter).
type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityWarning  Severity = "warning"
	SeverityCritical Severity = "critical"
)

type Message struct {
	ID             string         `json:"id"`
	TextKey        string         `json:"textKey"`
	Text           string         `json:"text"`
	Category       Category       `json:"category,omitempty"`
	Channel        Channel        `json:"channel,omitempty"`
	Severity       Severity       `json:"severity,omitempty"`
	Priority       Priority       `json:"priority"`
	CreatedAt      int64          `json:"createdAt"`
	ExpiresAt      int64          `json:"expiresAt"`
	ValidityRule   string         `json:"validityRule,omitempty"`
	ValidationData map[string]any `json:"validationData,omitempty"`
}
