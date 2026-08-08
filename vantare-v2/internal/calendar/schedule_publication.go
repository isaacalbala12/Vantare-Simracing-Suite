package calendar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Remote schedule publication.
//
// LMU publishes the weekly schedule as plain text on Discord, so there is
// nothing to fetch automatically. The owner pastes it into Vantare, the parser
// here turns it into an OfficialSchedule, and it is stored centrally so every
// client picks it up without waiting for a release.
//
// Two steps: a paste becomes a draft only its author can see, and reaches users
// when the owner publishes it. Authority lives in the database functions, not
// here — hiding the button would not stop anyone calling the endpoint.

// ErrNotOwner is returned when the signed in user may not import schedules.
var ErrNotOwner = errors.New("owner role required")

// ErrNoPublishedSchedule is returned when nothing has been published yet, which
// is the normal state of a fresh project rather than a failure.
var ErrNoPublishedSchedule = errors.New("no published schedule")

// PublishedSchedule is the currently published schedule and its provenance.
type PublishedSchedule struct {
	ID          string           `json:"id"`
	Schedule    OfficialSchedule `json:"schedule"`
	ValidFrom   time.Time        `json:"valid_from"`
	SeriesCount int              `json:"series_count"`
	PublishedAt time.Time        `json:"published_at"`
}

// DraftSchedule is a parsed schedule awaiting review, plus the text it came
// from so it can be re-parsed after a parser fix.
type DraftSchedule struct {
	ID          string           `json:"id"`
	Schedule    OfficialSchedule `json:"schedule"`
	SourceText  string           `json:"source_text"`
	ValidFrom   time.Time        `json:"valid_from"`
	SeriesCount int              `json:"series_count"`
	CreatedAt   time.Time        `json:"created_at"`
}

// SchedulePublisher talks to the Supabase RPC endpoints that store and serve
// published schedules.
type SchedulePublisher struct {
	httpClient *http.Client
	baseURL    string
	anonKey    string
}

// NewSchedulePublisher builds a publisher for a Supabase project. Both baseURL
// and anonKey are the public values the rest of the app already uses.
func NewSchedulePublisher(baseURL, anonKey string) *SchedulePublisher {
	return &SchedulePublisher{
		httpClient: &http.Client{Timeout: 20 * time.Second},
		baseURL:    strings.TrimRight(baseURL, "/"),
		anonKey:    anonKey,
	}
}

// ParseAndValidate turns pasted schedule text into a schedule, without touching
// the network. The app shows the result for review before anything is stored.
func ParseAndValidate(text string) (OfficialSchedule, error) {
	return ImportDailySchedule(text)
}

// SaveDraft parses the text and stores it as the caller's draft, replacing any
// draft they already had. The database rejects the call unless the session
// belongs to an active owner.
func (p *SchedulePublisher) SaveDraft(ctx context.Context, sessionToken, text string) (string, error) {
	sched, err := ImportDailySchedule(text)
	if err != nil {
		return "", err
	}
	payload := map[string]any{
		"p_source_text":  text,
		"p_schedule":     sched,
		"p_valid_from":   sched.ValidFrom.Format(time.RFC3339),
		"p_series_count": len(sched.Series),
	}
	var id string
	if err := p.rpc(ctx, sessionToken, "race_schedule_draft_save", payload, &id); err != nil {
		return "", err
	}
	return id, nil
}

// Publish promotes a draft so every client sees it.
func (p *SchedulePublisher) Publish(ctx context.Context, sessionToken, draftID string) error {
	var id string
	return p.rpc(ctx, sessionToken, "race_schedule_publish", map[string]any{"p_draft_id": draftID}, &id)
}

// MyDraft returns the caller's pending draft, or nil when there is none.
func (p *SchedulePublisher) MyDraft(ctx context.Context, sessionToken string) (*DraftSchedule, error) {
	var rows []DraftSchedule
	if err := p.rpc(ctx, sessionToken, "race_schedule_my_draft", map[string]any{}, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

// Current returns the published schedule. It reports ErrNoPublishedSchedule
// when nothing has been published, which callers treat as "keep the bundled
// seed" rather than as an error worth surfacing.
func (p *SchedulePublisher) Current(ctx context.Context, sessionToken string) (*PublishedSchedule, error) {
	var rows []PublishedSchedule
	if err := p.rpc(ctx, sessionToken, "race_schedule_current", map[string]any{}, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNoPublishedSchedule
	}
	if err := validateSchedule(rows[0].Schedule); err != nil {
		// Never let a malformed remote schedule replace a good local one.
		return nil, fmt.Errorf("published schedule is invalid: %w", err)
	}
	return &rows[0], nil
}

func (p *SchedulePublisher) rpc(ctx context.Context, sessionToken, fn string, payload any, out any) error {
	if p.baseURL == "" || p.anonKey == "" {
		return fmt.Errorf("schedule publisher is not configured")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encoding %s payload: %w", fn, err)
	}
	url := p.baseURL + "/rest/v1/rpc/" + fn
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", p.anonKey)
	if sessionToken != "" {
		req.Header.Set("Authorization", "Bearer "+sessionToken)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("calling %s: %w", fn, err)
	}
	defer resp.Body.Close()

	const maxResponseBytes = 4 << 20
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return fmt.Errorf("reading %s response: %w", fn, err)
	}

	if resp.StatusCode != http.StatusOK {
		// The owner check lives in the database function and surfaces as a
		// raised exception, so match on it rather than on the status alone.
		if strings.Contains(strings.ToLower(string(data)), "owner role required") {
			return ErrNotOwner
		}
		return fmt.Errorf("%s failed: status %d", fn, resp.StatusCode)
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("decoding %s response: %w", fn, err)
	}
	return nil
}

// PreferSchedule chooses between the schedule bundled in the binary and the one
// published centrally. The published schedule wins unless it is older, which
// happens when a client updates to a build carrying a newer seed than whatever
// was last published — then the seed is the better answer.
func PreferSchedule(bundled, published OfficialSchedule) OfficialSchedule {
	if published.ValidFrom.Before(bundled.ValidFrom) {
		return bundled
	}
	return published
}

// ScheduleSource says where the calendar's current schedule came from, so the
// UI can be honest about whether it is showing the published one.
type ScheduleSource string

const (
	ScheduleSourceBundled   ScheduleSource = "bundled"
	ScheduleSourcePublished ScheduleSource = "published"
)

// RefreshPublishedSchedule fetches the published schedule and applies it when
// it is the better of the two. It is called when the app opens and when the
// user asks for it, not on a timer: LMU publishes once a week, so anything more
// frequent is noise.
//
// A failure here is never fatal. If the network is down, the project has
// nothing published, or what comes back does not validate, the calendar keeps
// the bundled schedule and the caller is told which one is in play.
func (s *Service) RefreshPublishedSchedule(
	ctx context.Context,
	pub *SchedulePublisher,
	sessionToken string,
	now time.Time,
) (ScheduleSource, error) {
	bundled, err := LoadWeeklySchedule()
	if err != nil {
		return "", fmt.Errorf("official schedule: %w", err)
	}
	if pub == nil {
		return ScheduleSourceBundled, s.applySchedule(bundled, now)
	}

	current, err := pub.Current(ctx, sessionToken)
	if err != nil {
		// Apply the bundled schedule anyway so the calendar is never empty just
		// because the network was.
		if applyErr := s.applySchedule(bundled, now); applyErr != nil {
			return "", applyErr
		}
		if errors.Is(err, ErrNoPublishedSchedule) {
			return ScheduleSourceBundled, nil
		}
		return ScheduleSourceBundled, err
	}

	chosen := PreferSchedule(bundled, current.Schedule)
	source := ScheduleSourcePublished
	if current.Schedule.ValidFrom.Before(bundled.ValidFrom) {
		source = ScheduleSourceBundled
	}
	return source, s.applySchedule(chosen, now)
}
