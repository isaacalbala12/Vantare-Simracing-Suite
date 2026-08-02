package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type concurrentTestEmitter struct {
	mu    sync.Mutex
	calls int
}

func (e *concurrentTestEmitter) Emit(string, any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.calls++
}

func (e *concurrentTestEmitter) callCount() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.calls
}

func TestAuthTokenRejectsExpiredAttempt(t *testing.T) {
	emitter := &concurrentTestEmitter{}
	srv := New(ServerConfig{Emitter: emitter})
	attempt, err := srv.CreateAuthAttempt("google")
	if err != nil {
		t.Fatal(err)
	}

	srv.authAttempts.mu.Lock()
	stored := srv.authAttempts.attempts[attempt.ID]
	stored.createdAt = time.Now().Add(-srv.authAttempts.ttl - time.Second)
	srv.authAttempts.attempts[attempt.ID] = stored
	srv.authAttempts.mu.Unlock()

	body := `{"access_token":"tok","attempt_id":"` + attempt.ID + `","provider":"google","state":"` + attempt.State + `"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(body))
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("POST /auth/token expired attempt = %d, want 401", rr.Code)
	}
	if emitter.callCount() != 0 {
		t.Fatal("expected 0 emit calls for expired nonce")
	}
}

func TestAuthTokenConsumesAttemptAtomically(t *testing.T) {
	emitter := &concurrentTestEmitter{}
	srv := New(ServerConfig{Emitter: emitter})
	attempt, err := srv.CreateAuthAttempt("google")
	if err != nil {
		t.Fatal(err)
	}
	body := `{"access_token":"tok","attempt_id":"` + attempt.ID + `","provider":"google","state":"` + attempt.State + `"}`

	start := make(chan struct{})
	statuses := make(chan int, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			req := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(body))
			rr := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rr, req)
			statuses <- rr.Code
		}()
	}
	close(start)
	wg.Wait()
	close(statuses)

	counts := map[int]int{}
	for status := range statuses {
		counts[status]++
	}
	if counts[http.StatusOK] != 1 || counts[http.StatusUnauthorized] != 1 {
		t.Fatalf("concurrent statuses = %#v, want one 200 and one 401", counts)
	}
	if emitter.callCount() != 1 {
		t.Fatalf("emit calls = %d, want 1", emitter.callCount())
	}
}
