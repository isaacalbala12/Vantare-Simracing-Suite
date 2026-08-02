package authsession

import "testing"

func TestSessionRejectsMissingTokens(t *testing.T) {
	for _, session := range []Session{
		{},
		{AccessToken: "access"},
		{RefreshToken: "refresh"},
	} {
		if _, err := marshal(session); err == nil {
			t.Fatalf("marshal(%+v) succeeded, want error", session)
		}
	}
}

func TestSessionRoundTrip(t *testing.T) {
	want := Session{AccessToken: "access", RefreshToken: "refresh"}
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
