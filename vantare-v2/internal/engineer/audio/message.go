package audio

type Priority int

const (
	PriorityNormal  Priority = 10
	PrioritySpotter Priority = 100
)

type Message struct {
	ID             string         `json:"id"`
	TextKey        string         `json:"textKey"`
	Text           string         `json:"text"`
	Priority       Priority       `json:"priority"`
	CreatedAt      int64          `json:"createdAt"`
	ExpiresAt      int64          `json:"expiresAt"`
	ValidityRule   string         `json:"validityRule,omitempty"`
	ValidationData map[string]any `json:"validationData,omitempty"`
}
