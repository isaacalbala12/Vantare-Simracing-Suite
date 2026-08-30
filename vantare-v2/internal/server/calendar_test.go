package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/calendar"
	"github.com/vantare/overlays/v2/internal/server"
)

func TestCalendarEndpointReturnsPersistedCalendar(t *testing.T) {
	dir := t.TempDir()
	service := calendar.NewService(dir, time.Now)
	if err := service.Load(); err != nil {
		t.Fatal(err)
	}

	srv := server.New(server.ServerConfig{CfgDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/calendar", nil)
	recorder := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /api/calendar = %d, want 200: %s", recorder.Code, recorder.Body.String())
	}
	var got calendar.Calendar
	if err := json.NewDecoder(recorder.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got.Version != 1 {
		t.Fatalf("version=%d, want 1", got.Version)
	}
}
