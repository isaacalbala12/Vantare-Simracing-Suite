package app_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/calendar"
)

func scheduleFixture(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "calendar", "testdata", "daily-schedule-2026-08-04.txt"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return string(data)
}

func scheduleAug25Fixture(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "calendar", "testdata", "daily-schedule-2026-08-25.txt"))
	if err != nil {
		t.Fatalf("read schedule fixture: %v", err)
	}
	return string(data)
}

// lastEvent returns the payload of the most recent event with the given name.
func lastEvent(t *testing.T, spy *spyEmitter, name string) map[string]any {
	t.Helper()
	for i := len(spy.events) - 1; i >= 0; i-- {
		if spy.events[i] != name {
			continue
		}
		raw, err := json.Marshal(spy.data[i])
		if err != nil {
			t.Fatalf("marshal %s: %v", name, err)
		}
		var out map[string]any
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("unmarshal %s: %v", name, err)
		}
		return out
	}
	t.Fatalf("no %s event; got %+v", name, spy.events)
	return nil
}

func TestParseEmitsAReviewablePreview(t *testing.T) {
	spy := &spyEmitter{}
	svc := app.NewScheduleImportService(nil, spy)

	svc.Parse(scheduleFixture(t))

	preview := lastEvent(t, spy, "schedule:preview")
	if preview["validFrom"] != "2026-08-04" {
		t.Fatalf("validFrom=%v", preview["validFrom"])
	}
	if preview["seriesCount"].(float64) != 11 {
		t.Fatalf("seriesCount=%v", preview["seriesCount"])
	}

	series, ok := preview["series"].([]any)
	if !ok || len(series) != 11 {
		t.Fatalf("series=%v", preview["series"])
	}
	// The preview exists so the owner can spot a misread before publishing, so
	// it has to carry the parts most likely to go wrong.
	first := series[0].(map[string]any)
	for _, field := range []string{"name", "tier", "track", "classes", "cadence", "raceMin"} {
		if _, present := first[field]; !present {
			t.Fatalf("preview row is missing %q: %+v", field, first)
		}
	}
	if first["cadence"] != "cada 15min" {
		t.Fatalf("cadence=%v", first["cadence"])
	}
}

func TestParseReportsUnreadableTextInsteadOfPublishingIt(t *testing.T) {
	spy := &spyEmitter{}
	svc := app.NewScheduleImportService(nil, spy)

	svc.Parse("esto no es un horario")

	if msg := lastEvent(t, spy, "schedule:error")["message"]; msg == "" {
		t.Fatal("an unreadable paste must explain itself")
	}
	for _, name := range spy.events {
		if name == "schedule:preview" {
			t.Fatal("nothing should be previewed when the parse failed")
		}
	}
}

func TestParsePreviewCarriesSpecialEventConstraints(t *testing.T) {
	spy := &spyEmitter{}
	svc := app.NewScheduleImportService(nil, spy)

	svc.Parse(scheduleAug25Fixture(t))

	preview := lastEvent(t, spy, "schedule:preview")
	if preview["sourceNotesCount"].(float64) != 1 {
		t.Fatalf("sourceNotesCount=%v", preview["sourceNotesCount"])
	}
	series := preview["series"].([]any)
	var special map[string]any
	for _, item := range series {
		row := item.(map[string]any)
		if row["eventKind"] == "special" {
			special = row
			break
		}
	}
	if special == nil {
		t.Fatal("special event missing from preview")
	}
	if special["format"] != "team" || special["fairShare"] != true {
		t.Fatalf("special metadata=%v", special)
	}
	if got := special["forbiddenBadges"].([]any); len(got) != 2 {
		t.Fatalf("forbiddenBadges=%v", got)
	}
}

func TestSaveDraftAndPublishReportBackToTheScreen(t *testing.T) {
	var published bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/rest/v1/rpc/race_schedule_draft_save":
			_, _ = w.Write([]byte(`"draft-9"`))
		case r.URL.Path == "/rest/v1/rpc/race_schedule_publish":
			published = true
			_, _ = w.Write([]byte(`"draft-9"`))
		default:
			t.Errorf("unexpected path %q", r.URL.Path)
		}
	}))
	defer server.Close()

	spy := &spyEmitter{}
	svc := app.NewScheduleImportService(calendar.NewSchedulePublisher(server.URL, "anon"), spy)

	svc.SaveDraft(context.Background(), "token", scheduleFixture(t))
	if id := lastEvent(t, spy, "schedule:draft-saved")["draftId"]; id != "draft-9" {
		t.Fatalf("draftId=%v", id)
	}

	svc.Publish(context.Background(), "token", "draft-9")
	if !published {
		t.Fatal("publish never reached the server")
	}
	if id := lastEvent(t, spy, "schedule:published")["draftId"]; id != "draft-9" {
		t.Fatalf("published draftId=%v", id)
	}
}

func TestPublishRefusesWithoutADraft(t *testing.T) {
	spy := &spyEmitter{}
	svc := app.NewScheduleImportService(calendar.NewSchedulePublisher("https://example.test", "anon"), spy)

	svc.Publish(context.Background(), "token", "")

	if msg := lastEvent(t, spy, "schedule:error")["message"]; msg != "no hay borrador que publicar" {
		t.Fatalf("message=%v", msg)
	}
}

func TestOwnerRejectionIsExplainedInPlainWords(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message":"owner role required to import a race schedule"}`))
	}))
	defer server.Close()

	spy := &spyEmitter{}
	svc := app.NewScheduleImportService(calendar.NewSchedulePublisher(server.URL, "anon"), spy)

	svc.SaveDraft(context.Background(), "token", scheduleFixture(t))

	msg := lastEvent(t, spy, "schedule:error")["message"]
	if msg != "Necesitas rol owner para importar el horario" {
		t.Fatalf("message=%v", msg)
	}
}

func TestAnUnconfiguredBuildSaysSoRatherThanFailingSilently(t *testing.T) {
	spy := &spyEmitter{}
	svc := app.NewScheduleImportService(nil, spy)

	svc.SaveDraft(context.Background(), "token", scheduleFixture(t))

	if msg := lastEvent(t, spy, "schedule:error")["message"]; msg == "" {
		t.Fatal("an unconfigured build must explain itself")
	}
}

func TestLoadDraftReportsTheAbsenceOfOne(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	spy := &spyEmitter{}
	svc := app.NewScheduleImportService(calendar.NewSchedulePublisher(server.URL, "anon"), spy)

	svc.LoadDraft(context.Background(), "token")

	payload := lastEvent(t, spy, "schedule:draft")
	if payload["draft"] != nil {
		t.Fatalf("draft=%v, want an explicit nothing", payload["draft"])
	}
}
