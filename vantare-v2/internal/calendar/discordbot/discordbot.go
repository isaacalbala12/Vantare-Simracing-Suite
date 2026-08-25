// Package discordbot contains the restricted Discord reader for LMU schedule
// messages. It deliberately stops at a local pending inbox: an owner reviews
// and submits the candidate through the existing schedule draft flow.
package discordbot

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/calendar"
)

const discordAPIBaseURL = "https://discord.com/api/v10"

// maxInboxCandidates keeps the local handoff bounded. The owner only needs a
// small history to compare the latest official message; old candidates are
// dropped after the newest one has been persisted.
const maxInboxCandidates = 32

// Message is the subset of a Discord message needed by the importer.
type Message struct {
	ID        string  `json:"id"`
	GuildID   string  `json:"guild_id"`
	ChannelID string  `json:"channel_id"`
	Author    Author  `json:"author"`
	WebhookID string  `json:"webhook_id"`
	Content   string  `json:"content"`
	Embeds    []Embed `json:"embeds"`
}

type Author struct {
	ID string `json:"id"`
}

type Embed struct {
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Fields      []EmbedField `json:"fields"`
}

type EmbedField struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// SourcePolicy is the allowlist applied before parsing any message.
// At least one author or webhook identity is required; channel-only ingestion
// would make a copied schedule from another user an accepted source.
type SourcePolicy struct {
	GuildID    string
	ChannelID  string
	AuthorIDs  map[string]struct{}
	WebhookIDs map[string]struct{}
}

func (p SourcePolicy) Validate() error {
	if strings.TrimSpace(p.GuildID) == "" {
		return errors.New("discord policy: guild id is required")
	}
	if strings.TrimSpace(p.ChannelID) == "" {
		return errors.New("discord policy: channel id is required")
	}
	if len(p.AuthorIDs) == 0 && len(p.WebhookIDs) == 0 {
		return errors.New("discord policy: at least one author or webhook id is required")
	}
	return nil
}

func (p SourcePolicy) Allows(message Message) bool {
	if message.ChannelID != p.ChannelID {
		return false
	}
	// Discord's REST message object identifies the channel, while the guild
	// binding is verified once through GetChannel in Poller.Run. Honour a guild
	// value when a gateway/test payload supplies one, but do not reject the
	// normal REST response because it omits guild_id.
	if message.GuildID != "" && message.GuildID != p.GuildID {
		return false
	}
	if _, ok := p.AuthorIDs[message.Author.ID]; ok {
		return true
	}
	if _, ok := p.WebhookIDs[message.WebhookID]; ok {
		return true
	}
	return false
}

// Candidate is a parsed message waiting for owner review. SourceText stays
// alongside the parsed schedule so the owner can compare the exact Discord
// payload before saving a draft.
type Candidate struct {
	MessageID  string                    `json:"messageId"`
	SourceHash string                    `json:"sourceHash"`
	GuildID    string                    `json:"guildId"`
	ChannelID  string                    `json:"channelId"`
	AuthorID   string                    `json:"authorId,omitempty"`
	WebhookID  string                    `json:"webhookId,omitempty"`
	SourceText string                    `json:"sourceText"`
	Schedule   calendar.OfficialSchedule `json:"schedule"`
	ReceivedAt time.Time                 `json:"receivedAt"`
}

type IngestResult struct {
	Accepted  bool
	Duplicate bool
	Skipped   bool
	Candidate *Candidate
}

// Ingestor validates, parses and deduplicates messages into an Inbox.
type Ingestor struct {
	policy SourcePolicy
	inbox  *Inbox
	now    func() time.Time
}

func NewIngestor(policy SourcePolicy, inbox *Inbox, now func() time.Time) (*Ingestor, error) {
	if err := policy.Validate(); err != nil {
		return nil, err
	}
	if inbox == nil {
		return nil, errors.New("discord ingestor: inbox is required")
	}
	if now == nil {
		now = time.Now
	}
	return &Ingestor{policy: policy, inbox: inbox, now: now}, nil
}

func (i *Ingestor) Ingest(message Message) (IngestResult, error) {
	if !i.policy.Allows(message) {
		return IngestResult{Skipped: true}, nil
	}
	if strings.TrimSpace(message.ID) == "" {
		return IngestResult{}, errors.New("discord ingestor: message id is required")
	}

	sourceText, ok := ExtractScheduleText(message)
	if !ok {
		return IngestResult{Skipped: true}, nil
	}
	schedule, err := calendar.ParseAndValidate(sourceText)
	if err != nil {
		return IngestResult{}, fmt.Errorf("discord message %s: parse schedule: %w", message.ID, err)
	}

	hash := sha256.Sum256([]byte(sourceText))
	candidate := Candidate{
		MessageID:  message.ID,
		SourceHash: hex.EncodeToString(hash[:]),
		GuildID:    i.policy.GuildID,
		ChannelID:  message.ChannelID,
		AuthorID:   message.Author.ID,
		WebhookID:  message.WebhookID,
		SourceText: sourceText,
		Schedule:   schedule,
		ReceivedAt: i.now().UTC(),
	}
	added, err := i.inbox.Add(candidate)
	if err != nil {
		return IngestResult{}, err
	}
	return IngestResult{
		Accepted:  added,
		Duplicate: !added,
		Candidate: &candidate,
	}, nil
}

// ExtractScheduleText accepts a normal Discord message or an embed. It starts
// at the official header so bot chatter and Markdown fences do not become
// part of the parser input.
func ExtractScheduleText(message Message) (string, bool) {
	if text, ok := normalizeSchedulePart(message.Content); ok {
		return text, true
	}
	for _, embed := range message.Embeds {
		parts := make([]string, 0, 2+len(embed.Fields)*2)
		if embed.Title != "" {
			parts = append(parts, embed.Title)
		}
		if embed.Description != "" {
			parts = append(parts, embed.Description)
		}
		for _, field := range embed.Fields {
			if field.Name != "" {
				parts = append(parts, field.Name)
			}
			if field.Value != "" {
				parts = append(parts, field.Value)
			}
		}
		if text, ok := normalizeSchedulePart(strings.Join(parts, "\n")); ok {
			return text, true
		}
	}
	return "", false
}

func normalizeSchedulePart(part string) (string, bool) {
	lines := strings.Split(strings.ReplaceAll(part, "\r\n", "\n"), "\n")
	start := -1
	for index, raw := range lines {
		line := strings.TrimSpace(raw)
		line = strings.TrimSpace(strings.TrimPrefix(line, ">"))
		line = strings.TrimSpace(strings.TrimPrefix(line, "```"))
		lines[index] = line
		if strings.HasPrefix(line, "Daily Race Schedule from:") && start < 0 {
			start = index
		}
	}
	if start < 0 {
		return "", false
	}
	return strings.TrimSpace(strings.Join(lines[start:], "\n")), true
}

type inboxDocument struct {
	Version       int         `json:"version"`
	LastMessageID string      `json:"lastMessageId,omitempty"`
	Candidates    []Candidate `json:"candidates"`
}

// Inbox is a small local handoff between the Discord worker and the desktop
// owner screen. The worker never writes to Supabase and the desktop never
// needs the Discord token.
type Inbox struct {
	path string
	mu   sync.Mutex
}

func NewInbox(path string) (*Inbox, error) {
	path = strings.TrimSpace(path)
	if path == "" || !filepath.IsAbs(path) {
		return nil, errors.New("discord inbox: absolute path is required")
	}
	return &Inbox{path: filepath.Clean(path)}, nil
}

func (i *Inbox) Path() string { return i.path }

func (i *Inbox) List() ([]Candidate, error) {
	i.mu.Lock()
	defer i.mu.Unlock()
	document, err := i.loadLocked()
	if err != nil {
		return nil, err
	}
	return append([]Candidate(nil), document.Candidates...), nil
}

func (i *Inbox) LastMessageID() (string, error) {
	i.mu.Lock()
	defer i.mu.Unlock()
	document, err := i.loadLocked()
	if err != nil {
		return "", err
	}
	return document.LastMessageID, nil
}

func (i *Inbox) Add(candidate Candidate) (bool, error) {
	i.mu.Lock()
	defer i.mu.Unlock()
	document, err := i.loadLocked()
	if err != nil {
		return false, err
	}
	for _, existing := range document.Candidates {
		if existing.MessageID == candidate.MessageID || existing.SourceHash == candidate.SourceHash {
			return false, nil
		}
	}
	document.Candidates = append(document.Candidates, candidate)
	if len(document.Candidates) > maxInboxCandidates {
		first := len(document.Candidates) - maxInboxCandidates
		document.Candidates = append([]Candidate(nil), document.Candidates[first:]...)
	}
	return true, i.writeLocked(document)
}

func (i *Inbox) AdvanceMessageID(messageID string) error {
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return nil
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	document, err := i.loadLocked()
	if err != nil {
		return err
	}
	if snowflakeAfter(messageID, document.LastMessageID) {
		document.LastMessageID = messageID
		return i.writeLocked(document)
	}
	return nil
}

func (i *Inbox) loadLocked() (inboxDocument, error) {
	raw, err := os.ReadFile(i.path)
	if errors.Is(err, os.ErrNotExist) {
		return inboxDocument{Version: 1, Candidates: []Candidate{}}, nil
	}
	if err != nil {
		return inboxDocument{}, fmt.Errorf("discord inbox: read %s: %w", i.path, err)
	}
	var document inboxDocument
	if err := json.Unmarshal(raw, &document); err != nil {
		return inboxDocument{}, fmt.Errorf("discord inbox: decode %s: %w", i.path, err)
	}
	if document.Version == 0 {
		document.Version = 1
	}
	if document.Candidates == nil {
		document.Candidates = []Candidate{}
	}
	return document, nil
}

func (i *Inbox) writeLocked(document inboxDocument) error {
	if err := os.MkdirAll(filepath.Dir(i.path), 0o700); err != nil {
		return fmt.Errorf("discord inbox: create directory: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(i.path), ".calendar-discord-inbox-*.tmp")
	if err != nil {
		return fmt.Errorf("discord inbox: create temporary file: %w", err)
	}
	temporaryName := temporary.Name()
	defer func() { _ = os.Remove(temporaryName) }()
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("discord inbox: protect temporary file: %w", err)
	}
	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(document); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("discord inbox: encode: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("discord inbox: sync: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("discord inbox: close temporary file: %w", err)
	}
	if err := os.Rename(temporaryName, i.path); err != nil {
		return fmt.Errorf("discord inbox: replace %s: %w", i.path, err)
	}
	return nil
}

func snowflakeAfter(candidate, current string) bool {
	if current == "" {
		return true
	}
	if candidate == current {
		return false
	}
	if candidateNumber, err := strconv.ParseUint(candidate, 10, 64); err == nil {
		if currentNumber, currentErr := strconv.ParseUint(current, 10, 64); currentErr == nil {
			return candidateNumber > currentNumber
		}
	}
	if len(candidate) != len(current) {
		return len(candidate) > len(current)
	}
	return candidate > current
}

// Client is the minimal Discord REST client used by the polling worker.
type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

func NewClient(token string, httpClient *http.Client) (*Client, error) {
	return NewClientWithBaseURL(token, discordAPIBaseURL, httpClient)
}

func NewClientWithBaseURL(token, baseURL string, httpClient *http.Client) (*Client, error) {
	if strings.TrimSpace(token) == "" {
		return nil, errors.New("discord client: bot token is required")
	}
	if strings.TrimSpace(baseURL) == "" {
		return nil, errors.New("discord client: base url is required")
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), token: token, httpClient: httpClient}, nil
}

type Channel struct {
	ID      string `json:"id"`
	GuildID string `json:"guild_id"`
}

func (c *Client) GetChannel(ctx context.Context, channelID string) (Channel, error) {
	var channel Channel
	if err := c.getJSON(ctx, "/channels/"+url.PathEscape(channelID), nil, &channel); err != nil {
		return Channel{}, err
	}
	return channel, nil
}

func (c *Client) ListMessages(ctx context.Context, channelID, after string, limit int) ([]Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	query := url.Values{"limit": {strconv.Itoa(limit)}}
	if after != "" {
		query.Set("after", after)
	}
	var messages []Message
	if err := c.getJSON(ctx, "/channels/"+url.PathEscape(channelID)+"/messages", query, &messages); err != nil {
		return nil, err
	}
	return messages, nil
}

func (c *Client) getJSON(ctx context.Context, path string, query url.Values, destination any) error {
	endpoint := c.baseURL + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("discord request: build: %w", err)
	}
	request.Header.Set("Authorization", "Bot "+c.token)
	request.Header.Set("Accept", "application/json")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("discord request: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		body, err := io.ReadAll(io.LimitReader(response.Body, 1024))
		if err != nil {
			return fmt.Errorf("discord request: status %d: read error body: %w", response.StatusCode, err)
		}
		return fmt.Errorf("discord request: status %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	if err := json.NewDecoder(response.Body).Decode(destination); err != nil {
		return fmt.Errorf("discord request: decode: %w", err)
	}
	return nil
}

// Poller verifies the configured channel, then polls only messages newer than
// the cursor stored in the inbox. It has one synchronous loop and exits on
// context cancellation, so it is safe to run as a small service process.
type Poller struct {
	client    *Client
	channelID string
	policy    SourcePolicy
	ingestor  *Ingestor
	interval  time.Duration
	logf      func(string, ...any)
}

func NewPoller(client *Client, channelID string, policy SourcePolicy, ingestor *Ingestor, interval time.Duration, logf func(string, ...any)) (*Poller, error) {
	if client == nil || ingestor == nil {
		return nil, errors.New("discord poller: client and ingestor are required")
	}
	if err := policy.Validate(); err != nil {
		return nil, err
	}
	if strings.TrimSpace(channelID) == "" || channelID != policy.ChannelID {
		return nil, errors.New("discord poller: channel id does not match policy")
	}
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &Poller{
		client:    client,
		channelID: channelID,
		policy:    policy,
		ingestor:  ingestor,
		interval:  interval,
		logf:      logf,
	}, nil
}

func (p *Poller) Run(ctx context.Context) error {
	channel, err := p.client.GetChannel(ctx, p.channelID)
	if err != nil {
		return fmt.Errorf("discord poller: verify channel: %w", err)
	}
	if channel.ID != p.channelID {
		return fmt.Errorf("discord poller: verified channel %q, want %q", channel.ID, p.channelID)
	}
	if channel.GuildID != p.policy.GuildID {
		return fmt.Errorf("discord poller: channel guild %q is not the configured guild", channel.GuildID)
	}

	cursor, err := p.ingestor.inbox.LastMessageID()
	if err != nil {
		return err
	}
	if err := p.poll(ctx, &cursor); err != nil {
		return err
	}

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := p.poll(ctx, &cursor); err != nil {
				p.logf("discord poll failed: %v", err)
			}
		}
	}
}

func (p *Poller) poll(ctx context.Context, cursor *string) error {
	messages, err := p.client.ListMessages(ctx, p.channelID, *cursor, 100)
	if err != nil {
		return err
	}
	maxMessageID := *cursor
	for index := len(messages) - 1; index >= 0; index-- {
		message := messages[index]
		result, ingestErr := p.ingestor.Ingest(message)
		if ingestErr != nil {
			p.logf("discord message %s rejected: %v", message.ID, ingestErr)
		} else if result.Accepted {
			p.logf("discord message %s stored as pending calendar candidate", message.ID)
		} else if result.Duplicate {
			p.logf("discord message %s already exists in the calendar inbox", message.ID)
		}
		if snowflakeAfter(message.ID, maxMessageID) {
			maxMessageID = message.ID
		}
	}
	if maxMessageID != *cursor {
		*cursor = maxMessageID
		if err := p.ingestor.inbox.AdvanceMessageID(*cursor); err != nil {
			return err
		}
	}
	return nil
}
