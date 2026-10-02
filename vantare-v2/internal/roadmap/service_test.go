package roadmap

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func document() Document {
	return Document{SchemaVersion: 1, Items: []Item{{
		ID: "11111111-1111-4111-8111-111111111111", Section: "now",
		Title: Localized{ES: "Ahora", EN: "Now", PT: "Agora", IT: "Ora"},
	}}}
}

func TestDocumentValidate(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Document)
	}{
		{"missing Spanish title", func(d *Document) { d.Items[0].Title.ES = "" }},
		{"invalid section", func(d *Document) { d.Items[0].Section = "invented" }},
		{"duplicate ID", func(d *Document) { d.Items = append(d.Items, d.Items[0]) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := document()
			tc.mutate(&d)
			if d.Validate() == nil {
				t.Fatal("invalid public document was accepted")
			}
		})
	}
	if err := document().Validate(); err != nil {
		t.Fatalf("valid document: %v", err)
	}
	withoutTranslation := document()
	withoutTranslation.Items[0].Title.IT = ""
	if err := withoutTranslation.Validate(); err != nil {
		t.Fatalf("optional translation: %v", err)
	}
}

func TestRemoteCurrentReadOnly(t *testing.T) {
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path+" "+r.Header.Get("Authorization"))
		switch r.URL.Path {
		case "/rest/v1/rpc/visual_roadmap_current":
			_ = json.NewEncoder(w).Encode([]Publication{})
		default:
			t.Errorf("unexpected RPC %s", r.URL.Path)
		}
	}))
	defer server.Close()
	service := NewService(server.URL, "anon-key")
	current, err := service.Current(context.Background())
	if err != nil || current != nil {
		t.Fatalf("no publication = %v, %v", current, err)
	}
	if calls[0] != "/rest/v1/rpc/visual_roadmap_current Bearer anon-key" {
		t.Fatalf("public read auth = %q", calls[0])
	}
}
