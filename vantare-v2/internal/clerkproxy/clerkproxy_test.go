package clerkproxy

import (
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func passthrough() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})
}

func TestFapiHost(t *testing.T) {
	// "clerk.example.dev$" base64-encoded.
	key := "pk_test_" + base64.StdEncoding.EncodeToString([]byte("clerk.example.dev$"))
	if got := FapiHost(key); got != "clerk.example.dev" {
		t.Fatalf("FapiHost = %q", got)
	}
	for _, bad := range []string{"", "pk_test_", "notakey", "pk_test_%%%"} {
		if got := FapiHost(bad); got != "" {
			t.Fatalf("FapiHost(%q) = %q, want empty", bad, got)
		}
	}
}

func TestNewHandlerEmptyHostPassesThrough(t *testing.T) {
	h := NewHandler(passthrough(), "")
	req := httptest.NewRequest(http.MethodGet, MountPath+"/v1/client", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusTeapot {
		t.Fatalf("empty host must pass through, got %d", rec.Code)
	}
}

func TestNewHandlerNonClerkPathPassesThrough(t *testing.T) {
	h := NewHandler(passthrough(), "clerk.example.dev")
	req := httptest.NewRequest(http.MethodGet, "/index.html", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusTeapot {
		t.Fatalf("non-clerk path must pass through, got %d", rec.Code)
	}
}

func TestNewHandlerStripsPrefixOriginAndCookies(t *testing.T) {
	var got struct {
		path        string
		query       string
		origin      string
		referer     string
		cookie      string
		host        string
		auth        string
		contentType string
		body        string
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.path = r.URL.Path
		got.query = r.URL.RawQuery
		got.origin = r.Header.Get("Origin")
		got.referer = r.Header.Get("Referer")
		got.cookie = r.Header.Get("Cookie")
		got.host = r.Host
		got.auth = r.Header.Get("Authorization")
		got.contentType = r.Header.Get("Content-Type")
		b, _ := io.ReadAll(r.Body)
		got.body = string(b)
		w.Header().Set("Authorization", "rotated-jwt")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	target, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	h := mount(passthrough(), target)

	req := httptest.NewRequest(http.MethodPost,
		MountPath+"/v1/client/sign_ins?_is_native=1",
		strings.NewReader("identifier=x"))
	req.Header.Set("Origin", "http://wails.localhost")
	req.Header.Set("Referer", "http://wails.localhost/")
	req.Header.Set("Cookie", "stale=1")
	req.Header.Set("Authorization", "client-jwt")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("proxied status = %d, want 201", rec.Code)
	}
	if got.path != "/v1/client/sign_ins" {
		t.Fatalf("upstream path = %q", got.path)
	}
	if got.query != "_is_native=1" {
		t.Fatalf("upstream query = %q", got.query)
	}
	if got.origin != "" || got.referer != "" || got.cookie != "" {
		t.Fatalf("Origin/Referer/Cookie must be stripped, got %q %q %q",
			got.origin, got.referer, got.cookie)
	}
	if got.auth != "client-jwt" {
		t.Fatalf("Authorization must be forwarded, got %q", got.auth)
	}
	if got.body != "identifier=x" {
		t.Fatalf("body must be forwarded, got %q", got.body)
	}
	if rec.Header().Get("Authorization") != "rotated-jwt" {
		t.Fatalf("response Authorization header must be visible to the WebView")
	}
}
