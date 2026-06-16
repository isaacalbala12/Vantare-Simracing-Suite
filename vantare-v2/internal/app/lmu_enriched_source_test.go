package app

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/lmuapi"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

func TestEnrichedLMUSourceReadTelemetryDoesNotBlockOnREST(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/rest/watch/standings":
			_, _ = w.Write([]byte(`[]`))
		case "/rest/watch/sessionInfo":
			_, _ = w.Write([]byte(`{}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cache := newLMURESTCache(lmuapi.NewClient(srv.URL, 750*time.Millisecond), time.Hour, time.Second)
	defer cache.Close()
	src := &EnrichedLMUSource{
		mmap:  service.FuncSource{ReadFunc: func() []byte { return lmu.BuildSyntheticBuffer() }},
		cache: cache,
	}

	start := time.Now()
	tele := src.ReadTelemetry()
	elapsed := time.Since(start)
	if tele == nil || !tele.Connected {
		t.Fatalf("expected connected telemetry, got %#v", tele)
	}
	if elapsed > 50*time.Millisecond {
		t.Fatalf("ReadTelemetry blocked on REST for %s", elapsed)
	}
}
