package authsession

import (
	"errors"
	"testing"
)

func TestSessionRejectsMissingTokens(t *testing.T) {
	for _, session := range []Session{
		{},
		{AccessToken: "access"},
		{RefreshToken: "refresh"},
		// A token pair polluted with a session id, or an external id mixed
		// with a partial pair, is neither a Supabase session nor a Clerk one.
		{AccessToken: "access", RefreshToken: "refresh", SessionID: "sess"},
		{AccessToken: "access", SessionID: "sess"},
		{RefreshToken: "refresh", SessionID: "sess"},
	} {
		if _, err := marshal(session); err == nil {
			t.Fatalf("marshal(%+v) succeeded, want error", session)
		}
	}
}

func TestSessionRoundTrip(t *testing.T) {
	for _, want := range []Session{
		{AccessToken: "access", RefreshToken: "refresh"},
		{SessionID: "sess_clerk_1"},
	} {
		data, err := marshal(want)
		if err != nil {
			t.Fatal(err)
		}
		got, err := unmarshal(data)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("session = %+v, want %+v", got, want)
		}
	}
}

func TestUnmarshalClassifiesCorruptAndIncompleteCredentials(t *testing.T) {
	for _, data := range [][]byte{
		[]byte("not-json"),
		[]byte(`{"access_token":"only-access"}`),
	} {
		if _, err := unmarshal(data); !errors.Is(err, ErrInvalidSession) {
			t.Fatalf("unmarshal(%q) error = %v, want ErrInvalidSession", data, err)
		}
	}
}
