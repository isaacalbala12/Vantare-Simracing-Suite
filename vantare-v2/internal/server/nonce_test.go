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

func TestAuthTokenRejectsExpiredNonce(t *testing.T) {
	emitter := &concurrentTestEmitter{}
	srv := New(ServerConfig{Emitter: emitter})
	nonce := srv.GenerateNonce()

	srv.nonceStore.mu.Lock()
	srv.nonceStore.created[nonce] = time.Now().Add(-srv.nonceStore.ttl - time.Second)
	srv.nonceStore.mu.Unlock()

	req := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(`{"access_token":"tok","nonce":"`+nonce+`"}`))
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("POST /auth/token expired nonce = %d, want 401", rr.Code)
	}
	if emitter.callCount() != 0 {
		t.Fatal("expected 0 emit calls for expired nonce")
	}
}

func TestAuthTokenConsumesNonceAtomically(t *testing.T) {
	emitter := &concurrentTestEmitter{}
	srv := New(ServerConfig{Emitter: emitter})
	nonce := srv.GenerateNonce()
	body := `{"access_token":"tok","nonce":"` + nonce + `"}`

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
