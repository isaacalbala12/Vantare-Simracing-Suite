package calendar

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixtureText(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "daily-schedule-2026-08-04.txt"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return string(data)
}

func TestSaveDraftSendsTheParsedScheduleAndItsSource(t *testing.T) {
	var got struct {
		SourceText  string           `json:"p_source_text"`
		Schedule    OfficialSchedule `json:"p_schedule"`
		SeriesCount int              `json:"p_series_count"`
		ValidFrom   string           `json:"p_valid_from"`
	}
	var authHeader, apiKey string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/rpc/race_schedule_draft_save") {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		authHeader = r.Header.Get("Authorization")
		apiKey = r.Header.Get("apikey")
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Errorf("decode payload: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`"draft-1"`))
	}))
	defer server.Close()

	pub := NewSchedulePublisher(server.URL, "anon-key")
	text := fixtureText(t)
	id, err := pub.SaveDraft(context.Background(), "session-token", text)
	if err != nil {
		t.Fatalf("SaveDraft: %v", err)
	}
	if id != "draft-1" {
		t.Fatalf("id=%q", id)
	}
	if authHeader != "Bearer session-token" || apiKey != "anon-key" {
		t.Fatalf("auth=%q apikey=%q", authHeader, apiKey)
	}
	// The pasted text travels with the parse so a later parser fix can redo it
	// without hunting the message down again.
	if got.SourceText != text {
		t.Fatal("the original text must be stored alongside the parse")
	}
	if got.SeriesCount != len(got.Schedule.Series) || got.SeriesCount != 11 {
		t.Fatalf("seriesCount=%d, schedule has %d", got.SeriesCount, len(got.Schedule.Series))
	}
	if !strings.HasPrefix(got.ValidFrom, "2026-08-04") {
		t.Fatalf("validFrom=%q", got.ValidFrom)
	}
}

func TestSaveDraftRejectsUnparseableTextBeforeTouchingTheNetwork(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	pub := NewSchedulePublisher(server.URL, "anon-key")
	if _, err := pub.SaveDraft(context.Background(), "token", "this is not a schedule"); err == nil {
		t.Fatal("expected a parse error")
	}
	if called {
		t.Fatal("nothing should be sent when the text does not parse")
	}
}

func TestSaveDraftSurfacesTheOwnerCheck(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message":"owner role required to import a race schedule"}`))
	}))
	defer server.Close()

	pub := NewSchedulePublisher(server.URL, "anon-key")
	_, err := pub.SaveDraft(context.Background(), "token", fixtureText(t))
	if !errors.Is(err, ErrNotOwner) {
		t.Fatalf("err=%v, want ErrNotOwner", err)
	}
}

func TestCurrentReturnsThePublishedSchedule(t *testing.T) {
	sched, err := ImportDailySchedule(fixtureText(t))
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]PublishedSchedule{{
			ID:          "pub-1",
			Schedule:    sched,
			SeriesCount: len(sched.Series),
		}})
	}))
	defer server.Close()

	pub := NewSchedulePublisher(server.URL, "anon-key")
	got, err := pub.Current(context.Background(), "token")
	if err != nil {
		t.Fatalf("Current: %v", err)
	}
	if got.ID != "pub-1" || len(got.Schedule.Series) != len(sched.Series) {
		t.Fatalf("got %+v", got)
	}
}

func TestCurrentReportsAnEmptyProjectDistinctly(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	pub := NewSchedulePublisher(server.URL, "anon-key")
	_, err := pub.Current(context.Background(), "token")
	if !errors.Is(err, ErrNoPublishedSchedule) {
		t.Fatalf("err=%v, want ErrNoPublishedSchedule", err)
	}
}

func TestCurrentRefusesAnInvalidRemoteSchedule(t *testing.T) {
	// A published row whose schedule lost its series must never replace a good
	// local one.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"id":"pub-1","schedule":{"version":1,"timezone":"UTC","series":[]}}]`))
	}))
	defer server.Close()

	pub := NewSchedulePublisher(server.URL, "anon-key")
	_, err := pub.Current(context.Background(), "token")
	if err == nil || errors.Is(err, ErrNoPublishedSchedule) {
		t.Fatalf("err=%v, want a validation failure", err)
	}
}

func TestMyDraftReturnsNilWhenThereIsNone(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	pub := NewSchedulePublisher(server.URL, "anon-key")
	draft, err := pub.MyDraft(context.Background(), "token")
	if err != nil {
		t.Fatalf("MyDraft: %v", err)
	}
	if draft != nil {
		t.Fatalf("draft=%+v, want nil", draft)
	}
}

func TestPublisherRequiresConfiguration(t *testing.T) {
	pub := NewSchedulePublisher("", "")
	if _, err := pub.Current(context.Background(), "token"); err == nil {
		t.Fatal("an unconfigured publisher must say so")
	}
}
