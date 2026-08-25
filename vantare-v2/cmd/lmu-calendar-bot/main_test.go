package main

import (
	"testing"
	"time"
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
