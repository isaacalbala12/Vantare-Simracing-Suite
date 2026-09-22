package server

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestUILocaleStreamSnapshotThenChangeAndDisconnect(t *testing.T) {
	svc := app.NewSettingsService(filepath.Join(t.TempDir(), "settings.json"), nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.InitializeUILocale("pt"); err != nil {
		t.Fatal(err)
	}
	server := New(ServerConfig{UILocale: svc})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	request := httptest.NewRequest("GET", UILocaleStreamRoute, nil).WithContext(ctx)
	request.RemoteAddr = "127.0.0.1:50000"
	response := newPolicyStreamRecorder()
	done := make(chan struct{})
	go func() { defer close(done); server.mux.ServeHTTP(response, request) }()
	response.waitPolicyEvents(t, 1)
	first := response.policyEvents(t)[0]
	if first.name != "ui-locale:snapshot" || string(first.data) != `{"locale":"pt","revision":1}` {
		t.Fatalf("snapshot %+v", first)
	}
	if _, err := svc.SetUILocale("it"); err != nil {
		t.Fatal(err)
	}
	response.waitPolicyEvents(t, 2)
	second := response.policyEvents(t)[1]
	if second.name != "ui-locale:changed" || string(second.data) != `{"locale":"it","revision":2}` {
		t.Fatalf("changed %+v", second)
	}
	cancel()
	<-done
}
