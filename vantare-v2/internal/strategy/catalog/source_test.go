package catalog_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
)

func TestHTTPSourceRequiresTimeoutAndRejectsStatusLimitAndRedirect(t *testing.T) {
	if _, err := catalog.NewHTTPSource(&http.Client{}, "https://example.invalid/catalog"); err == nil {
		t.Fatal("accepted client without timeout")
	}
	if _, err := catalog.NewHTTPSource(&http.Client{Timeout: time.Second}, "http://example.invalid/catalog"); err == nil {
		t.Fatal("product constructor accepted HTTP")
	}
	for _, tc := range []struct {
		name    string
		handler http.HandlerFunc
	}{
		{"status", func(writer http.ResponseWriter, _ *http.Request) { writer.WriteHeader(http.StatusTeapot) }},
		{"limit", func(writer http.ResponseWriter, _ *http.Request) {
			writer.Header().Set("Content-Length", "16777217")
			writer.WriteHeader(http.StatusOK)
		}},
		{"redirect", func(writer http.ResponseWriter, request *http.Request) {
			http.Redirect(writer, request, "/other", http.StatusFound)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(tc.handler)
			defer server.Close()
			source, err := catalog.NewHTTPSourceForTesting(&http.Client{Timeout: time.Second}, server.URL)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := source.Fetch(context.Background()); err == nil {
				t.Fatal("expected transport rejection")
			}
		})
	}
}

func TestHTTPSourceReturnsBoundedStatus200Body(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) { _, _ = writer.Write([]byte("catalog")) }))
	defer server.Close()
	source, err := catalog.NewHTTPSourceForTesting(&http.Client{Timeout: time.Second}, server.URL)
	if err != nil {
		t.Fatal(err)
	}
	document, err := source.Fetch(context.Background())
	if err != nil || string(document) != "catalog" {
		t.Fatalf("Fetch=%q, %v", document, err)
	}
}
