package discordbot

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func scheduleMessage(t *testing.T, id, channel string) Message {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "testdata", "daily-schedule-2026-08-25.txt"))
	if err != nil {
		t.Fatalf("read schedule fixture: %v", err)
	}
	return Message{
		ID:        id,
		GuildID:   "guild-1",
		ChannelID: channel,
		Author:    Author{ID: "author-1"},
		Content:   string(raw),
	}
}

func TestSourcePolicyUsesExactChannelAsTrustBoundary(t *testing.T) {
	policy := SourcePolicy{GuildID: "guild-1", ChannelID: "channel-1"}
	if err := policy.Validate(); err != nil {
		t.Fatalf("channel-only policy should be valid: %v", err)
	}
	if !policy.Allows(Message{GuildID: "guild-1", ChannelID: "channel-1"}) {
		t.Fatal("expected a message from the configured channel without an author id")
	}
	if policy.Allows(Message{GuildID: "guild-2", ChannelID: "channel-1"}) {
		t.Fatal("wrong guild must be rejected")
	}
	if policy.Allows(Message{GuildID: "guild-1", ChannelID: "channel-2"}) {
		t.Fatal("wrong channel must be rejected")
	}
}

func TestSourcePolicyAppliesOptionalIdentityAllowlist(t *testing.T) {
	policy := SourcePolicy{
		GuildID:   "guild-1",
		ChannelID: "channel-1",
		AuthorIDs: map[string]struct{}{"author-1": {}},
	}
	if err := policy.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if !policy.Allows(Message{GuildID: "guild-1", ChannelID: "channel-1", Author: Author{ID: "author-1"}}) {
		t.Fatal("expected the configured author in the configured channel")
	}
	if policy.Allows(Message{GuildID: "guild-2", ChannelID: "channel-1", Author: Author{ID: "author-1"}}) {
		t.Fatal("wrong guild must be rejected")
	}
	if policy.Allows(Message{GuildID: "guild-1", ChannelID: "channel-2", Author: Author{ID: "author-1"}}) {
		t.Fatal("wrong channel must be rejected")
	}
	if policy.Allows(Message{GuildID: "guild-1", ChannelID: "channel-1", Author: Author{ID: "other-author"}}) {
		t.Fatal("configured identity filter must reject another author")
	}
}

func TestExtractScheduleTextFromEmbedAndMarkdown(t *testing.T) {
	source := "before\n```text\nDaily Race Schedule from: 25th August 2026\nBeginner [Bronze SR]"
	text, ok := ExtractScheduleText(Message{Embeds: []Embed{{Description: source}}})
	if !ok {
		t.Fatal("expected an embedded schedule")
	}
	if !strings.HasPrefix(text, "Daily Race Schedule from: 25th August 2026") {
		t.Fatalf("extracted text=%q", text)
	}
	text, ok = ExtractScheduleText(Message{Embeds: []Embed{{
		Title:       "Daily Race Schedule from: 25th August 2026",
		Description: "Beginner [Bronze SR]",
		Fields:      []EmbedField{{Name: "starts every 15min", Value: "LMGT3 Fixed: Fuji (WEC)"}},
	}}})
	if !ok || !strings.Contains(text, "LMGT3 Fixed: Fuji (WEC)") {
		t.Fatalf("split embed was not joined: ok=%v text=%q", ok, text)
	}
}

func TestIngestParsesDiscordFormattedSchedule(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "testdata", "daily-schedule-2026-08-25.txt"))
	if err != nil {
		t.Fatalf("read schedule fixture: %v", err)
	}
	formatted := string(raw)
	for _, heading := range []string{
		"Daily Race Schedule from: 25th August 2026",
		"Beginner [Bronze SR]",
		"Intermediate [Silver SR]",
		"Advanced [Gold SR]",
		"Weekly Races (Solo)",
		"Special Events (Team)",
	} {
		formatted = strings.Replace(formatted, heading, "## **"+heading+"**", 1)
	}
	formatted = strings.Replace(formatted, "LMGT3 Fixed:", "__LMGT3 Fixed__:", 1)

	inbox, err := NewInbox(filepath.Join(t.TempDir(), "calendar-discord-inbox.json"))
	if err != nil {
		t.Fatalf("NewInbox: %v", err)
	}
	ingestor, err := NewIngestor(SourcePolicy{GuildID: "guild-1", ChannelID: "channel-1"}, inbox, time.Now)
	if err != nil {
		t.Fatalf("NewIngestor: %v", err)
	}
	result, err := ingestor.Ingest(Message{
		ID:        "formatted-1",
		GuildID:   "guild-1",
		ChannelID: "channel-1",
		Content:   formatted,
	})
	if err != nil {
		t.Fatalf("Ingest: %v", err)
	}
	if !result.Accepted || result.Candidate == nil || len(result.Candidate.Schedule.Series) != 11 {
		t.Fatalf("result=%+v, want one accepted 11-series candidate", result)
	}
	if result.Candidate.Schedule.Series[0].Name != "LMGT3 Fixed" {
		t.Fatalf("first series name=%q, want cleaned Discord markup", result.Candidate.Schedule.Series[0].Name)
	}
}

func TestIngestParsesAndDeduplicatesByMessageAndSource(t *testing.T) {
	inbox, err := NewInbox(filepath.Join(t.TempDir(), "calendar-discord-inbox.json"))
	if err != nil {
		t.Fatalf("NewInbox: %v", err)
	}
	policy := SourcePolicy{
		GuildID:   "guild-1",
		ChannelID: "channel-1",
		AuthorIDs: map[string]struct{}{"author-1": {}},
	}
	ingestor, err := NewIngestor(policy, inbox, func() time.Time {
		return time.Date(2026, time.August, 25, 12, 0, 0, 0, time.UTC)
	})
	if err != nil {
		t.Fatalf("NewIngestor: %v", err)
	}

	first, err := ingestor.Ingest(scheduleMessage(t, "100", "channel-1"))
	if err != nil {
		t.Fatalf("first ingest: %v", err)
	}
	if !first.Accepted || first.Candidate == nil || len(first.Candidate.Schedule.Series) != 11 {
		t.Fatalf("first result=%+v, want one accepted 11-series candidate", first)
	}
	second, err := ingestor.Ingest(scheduleMessage(t, "100", "channel-1"))
	if err != nil {
		t.Fatalf("message duplicate: %v", err)
	}
	if !second.Duplicate {
		t.Fatal("same Discord message must be deduplicated")
	}
	thirdMessage := scheduleMessage(t, "101", "channel-1")
	third, err := ingestor.Ingest(thirdMessage)
	if err != nil {
		t.Fatalf("source duplicate: %v", err)
	}
	if !third.Duplicate {
		t.Fatal("same source text must be deduplicated even with a new message id")
	}

	candidates, err := inbox.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(candidates) != 1 {
		t.Fatalf("candidates=%d, want 1", len(candidates))
	}
}

func TestInboxKeepsOnlyTheNewestCandidates(t *testing.T) {
	inbox, err := NewInbox(filepath.Join(t.TempDir(), "calendar-discord-inbox.json"))
	if err != nil {
		t.Fatalf("NewInbox: %v", err)
	}

	for index := 0; index < maxInboxCandidates+2; index++ {
		messageID := strconv.Itoa(index + 1)
		added, err := inbox.Add(Candidate{MessageID: messageID, SourceHash: "hash-" + messageID})
		if err != nil {
			t.Fatalf("Add(%s): %v", messageID, err)
		}
		if !added {
			t.Fatalf("Add(%s) was unexpectedly deduplicated", messageID)
		}
	}

	candidates, err := inbox.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(candidates) != maxInboxCandidates {
		t.Fatalf("candidates=%d, want %d", len(candidates), maxInboxCandidates)
	}
	if candidates[0].MessageID != "3" || candidates[len(candidates)-1].MessageID != "34" {
		t.Fatalf("retained ids=%q..%q, want 3..34", candidates[0].MessageID, candidates[len(candidates)-1].MessageID)
	}
}

func TestClientAndPollerVerifyChannelAndStoreCandidate(t *testing.T) {
	var requests int
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bot test-token" {
			http.Error(writer, "missing bot auth", http.StatusUnauthorized)
			return
		}
		requests++
		writer.Header().Set("Content-Type", "application/json")
		switch {
		case request.URL.Path == "/channels/channel-1":
			_ = json.NewEncoder(writer).Encode(Channel{ID: "channel-1", GuildID: "guild-1"})
		case request.URL.Path == "/channels/channel-1/messages":
			officialMessage := scheduleMessage(t, "102", "channel-1")
			// REST message payloads bind to the guild through channel_id; the
			// channel verification above supplies the guild identity.
			officialMessage.GuildID = ""
			messages := []Message{
				officialMessage,
				{ID: "101", GuildID: "guild-1", ChannelID: "channel-1", Author: Author{ID: "author-1"}, Content: "not a schedule"},
			}
			_ = json.NewEncoder(writer).Encode(messages)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	client, err := NewClientWithBaseURL("test-token", server.URL, server.Client())
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	inbox, err := NewInbox(filepath.Join(t.TempDir(), "calendar-discord-inbox.json"))
	if err != nil {
		t.Fatalf("NewInbox: %v", err)
	}
	policy := SourcePolicy{
		GuildID:   "guild-1",
		ChannelID: "channel-1",
		AuthorIDs: map[string]struct{}{"author-1": {}},
	}
	ingestor, err := NewIngestor(policy, inbox, time.Now)
	if err != nil {
		t.Fatalf("NewIngestor: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	accepted := make(chan struct{}, 1)
	poller, err := NewPoller(client, "channel-1", policy, ingestor, time.Hour, func(message string, args ...any) {
		if strings.Contains(message, "stored as pending") {
			accepted <- struct{}{}
			cancel()
		}
	})
	if err != nil {
		t.Fatalf("NewPoller: %v", err)
	}
	if err := poller.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}
	select {
	case <-accepted:
	default:
		t.Fatal("poller did not store the schedule candidate")
	}
	candidates, err := inbox.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(candidates) != 1 || candidates[0].MessageID != "102" {
		t.Fatalf("candidates=%+v, want message 102", candidates)
	}
	if got, want := requests, 2; got != want {
		t.Fatalf("requests=%d, want channel verification plus message poll", got)
	}
}

func TestPollerRunOnceStopsAfterOnePoll(t *testing.T) {
	var messageRequests int
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bot test-token" {
			http.Error(writer, "missing bot auth", http.StatusUnauthorized)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/channels/channel-1":
			_ = json.NewEncoder(writer).Encode(Channel{ID: "channel-1", GuildID: "guild-1"})
		case "/channels/channel-1/messages":
			messageRequests++
			message := scheduleMessage(t, "103", "channel-1")
			message.GuildID = ""
			_ = json.NewEncoder(writer).Encode([]Message{message})
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	client, err := NewClientWithBaseURL("test-token", server.URL, server.Client())
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	inbox, err := NewInbox(filepath.Join(t.TempDir(), "calendar-discord-inbox.json"))
	if err != nil {
		t.Fatalf("NewInbox: %v", err)
	}
	policy := SourcePolicy{GuildID: "guild-1", ChannelID: "channel-1"}
	ingestor, err := NewIngestor(policy, inbox, time.Now)
	if err != nil {
		t.Fatalf("NewIngestor: %v", err)
	}
	poller, err := NewPoller(client, "channel-1", policy, ingestor, time.Hour, nil)
	if err != nil {
		t.Fatalf("NewPoller: %v", err)
	}
	if err := poller.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if messageRequests != 1 {
		t.Fatalf("message requests=%d, want 1", messageRequests)
	}
	candidates, err := inbox.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(candidates) != 1 || candidates[0].MessageID != "103" {
		t.Fatalf("candidates=%+v, want message 103", candidates)
	}
}
