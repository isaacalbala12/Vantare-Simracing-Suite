package roadmap

import (
	"context"
	"encoding/json"
	"errors"
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

func TestRemoteCurrentAndOwnerDraft(t *testing.T) {
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path+" "+r.Header.Get("Authorization"))
		switch r.URL.Path {
		case "/rest/v1/rpc/visual_roadmap_current":
			_ = json.NewEncoder(w).Encode([]Publication{})
		case "/rest/v1/rpc/visual_roadmap_draft_save":
			if r.Header.Get("Authorization") != "Bearer owner-session" {
				w.WriteHeader(http.StatusForbidden)
				_, _ = w.Write([]byte(`{"message":"owner role required"}`))
				return
			}
			_ = json.NewEncoder(w).Encode("22222222-2222-4222-8222-222222222222")
		case "/rest/v1/rpc/visual_roadmap_my_draft":
			_ = json.NewEncoder(w).Encode([]Publication{{ID: "draft", Document: document()}})
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
	if _, err := service.SaveDraft(context.Background(), "reader", document()); !errors.Is(err, ErrNotOwner) {
		t.Fatalf("non-owner save = %v", err)
	}
	id, err := service.SaveDraft(context.Background(), "owner-session", document())
	if err != nil || id != "22222222-2222-4222-8222-222222222222" {
		t.Fatalf("owner save = %q, %v", id, err)
	}
	draft, err := service.MyDraft(context.Background(), "owner-session")
	if err != nil || draft == nil || draft.Document.Items[0].Title.ES != "Ahora" {
		t.Fatalf("owner draft = %+v, %v", draft, err)
	}
	if calls[0] != "/rest/v1/rpc/visual_roadmap_current Bearer anon-key" {
		t.Fatalf("public read auth = %q", calls[0])
	}
}
