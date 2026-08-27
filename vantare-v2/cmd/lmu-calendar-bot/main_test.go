package main

import (
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/protectedstore"
)

func TestParseIDSetTrimsAndDeduplicates(t *testing.T) {
	got := parseIDSet(" one, two,one ,, ")
	if len(got) != 2 {
		t.Fatalf("ids=%v, want two entries", got)
	}
	if _, ok := got["one"]; !ok {
		t.Fatal("missing one")
	}
	if _, ok := got["two"]; !ok {
		t.Fatal("missing two")
	}
}

func TestParsePollInterval(t *testing.T) {
	got, err := parsePollInterval("2m")
	if err != nil || got != 2*time.Minute {
		t.Fatalf("interval=%s err=%v", got, err)
	}
	if _, err := parsePollInterval("500ms"); err == nil {
		t.Fatal("sub-second polling must be rejected")
	}
}

func TestResolveDiscordTokenPrefersEnvironment(t *testing.T) {
	called := false
	token, err := resolveDiscordToken(" environment-token ", func() ([]byte, error) {
		called = true
		return nil, errors.New("stored token must not be loaded")
	})
	if err != nil || token != "environment-token" {
		t.Fatalf("token=%q err=%v", token, err)
	}
	if called {
		t.Fatal("stored token loader was called despite an environment token")
	}
}

func TestResolveDiscordTokenLoadsProtectedValue(t *testing.T) {
	token, err := resolveDiscordToken("", func() ([]byte, error) {
		return []byte(" stored-token\n"), nil
	})
	if err != nil || token != "stored-token" {
		t.Fatalf("token=%q err=%v", token, err)
	}
}

func TestResolveDiscordTokenReportsMissingValueWithoutLeakingIt(t *testing.T) {
	_, err := resolveDiscordToken("", func() ([]byte, error) {
		return nil, protectedstore.ErrNotFound
	})
	if err == nil {
		t.Fatal("missing token must fail")
	}
}
