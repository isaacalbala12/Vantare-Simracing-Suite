package calendar

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestPublishedScheduleSurvivesRefreshAndStartup(t *testing.T) {
	for _, scenario := range []string{"network-error", "empty-remote", "older-remote", "future-remote", "restart"} {
		t.Run(scenario, func(t *testing.T) {
			seed, err := LoadWeeklySchedule()
			if err != nil {
				t.Fatal(err)
			}
			published := seed
			published.ValidFrom = seed.ValidFrom.AddDate(0, 0, 7)
			published.ValidUntil = seed.ValidUntil.AddDate(0, 0, 7)
			published.Series = append([]RaceSeries(nil), seed.Series[:len(seed.Series)-1]...)
			now := published.ValidFrom.Add(2 * time.Hour)
			mode := "published"
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				if mode == "network-error" {
					w.WriteHeader(http.StatusServiceUnavailable)
					return
				}
				doc := published
				if mode == "older-remote" {
					doc = seed
				}
				if mode == "future-remote" {
					doc.ValidFrom = published.ValidUntil
					doc.ValidUntil = doc.ValidFrom.AddDate(0, 0, 7)
				}
				rows := []PublishedSchedule{{ID: "retention-test", Schedule: doc}}
				if mode == "empty-remote" {
					rows = nil
				}
				if err := json.NewEncoder(w).Encode(rows); err != nil {
					t.Error(err)
				}
			}))
			defer server.Close()
			svc := newTempService(t, now)
			if err := svc.Load(); err != nil {
				t.Fatal(err)
			}
			pub := NewSchedulePublisher(server.URL, "test-key")
			if _, err := svc.RefreshPublishedSchedule(context.Background(), pub, "test-token", now); err != nil {
				t.Fatal(err)
			}
			if _, err := svc.FollowSeries(published.Series[0].ID); err != nil {
				t.Fatal(err)
			}
			before := svc.Calendar()
			mode = scenario
			if scenario == "restart" {
				svc = NewService(filepath.Dir(svc.Path()), func() time.Time { return now })
				if err := svc.Load(); err != nil {
					t.Fatal(err)
				}
				legacy, err := LoadBundledSeed()
				if err != nil {
					t.Fatal(err)
				}
				if err := svc.ApplyBundledSeed(legacy); err != nil {
					t.Fatal(err)
				}
				if err := svc.ApplyOfficialSchedule(now); err != nil {
					t.Fatal(err)
				}
				mode = "network-error"
			}
			source, err := svc.RefreshPublishedSchedule(context.Background(), pub, "test-token", now)
			if mode == "network-error" && err == nil {
				t.Fatal("network failure must remain observable")
			}
			if mode != "network-error" && err != nil {
				t.Fatal(err)
			}
			if source != ScheduleSourcePublished {
				t.Errorf("source=%s, want published", source)
			}
			if after := svc.Calendar(); !reflect.DeepEqual(after, before) {
				t.Errorf("%s replaced the saved calendar", scenario)
			}
		})
	}
}

func TestScheduleMetadataSurvivesDisk(t *testing.T) {
	seed, err := LoadWeeklySchedule()
	if err != nil {
		t.Fatal(err)
	}
	now := seed.ValidFrom.Add(time.Hour)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	if err := svc.ApplyOfficialSchedule(now); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(svc.Path())
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Schedule struct {
			ValidFrom, ValidUntil time.Time
			Source                string
		}
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatal(err)
	}
	if !doc.Schedule.ValidFrom.Equal(seed.ValidFrom) || !doc.Schedule.ValidUntil.Equal(seed.ValidUntil) || doc.Schedule.Source != "bundled" {
		t.Fatal("persisted calendar lost schedule validity or source")
	}
}

func TestScheduleWriteFailurePreservesMemory(t *testing.T) {
	seed, err := LoadWeeklySchedule()
	if err != nil {
		t.Fatal(err)
	}
	now := seed.ValidFrom.Add(time.Hour)
	svc := newTempService(t, now)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	before := svc.Calendar()
	// A file cannot be the parent directory of the calendar; deterministic on Windows too.
	parent := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(parent, []byte("test"), 0600); err != nil {
		t.Fatal(err)
	}
	svc.path = filepath.Join(parent, FileName)
	if err := svc.ApplyOfficialSchedule(now); err == nil {
		t.Fatal("expected persistence failure")
	}
	if !reflect.DeepEqual(svc.Calendar(), before) {
		t.Fatal("failed write changed the in-memory calendar")
	}
}
