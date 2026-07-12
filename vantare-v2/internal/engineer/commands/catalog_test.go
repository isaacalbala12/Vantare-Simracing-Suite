package commands

import (
	"testing"
)

func TestCatalog_ContainsExpectedCommands(t *testing.T) {
	expected := []struct {
		phrase string
		action string
	}{
		{"request pit stop", "request"},
		{"confirm pit stop", "confirm"},
		{"abort pit stop", "abort"},
		{"box this lap", "request"},
		{"fuel", "fuel"},
		{"tyres", "tyres"},
		{"front wing", "front_wing"},
		{"rear wing", "rear_wing"},
		{"engine mode", "engine_mode"},
		{"brake bias", "brake_bias"},
		{"headlights", "headlights"},
		{"wiper", "wiper"},
		{"rain light", "rain_light"},
		{"driver swap", "driver_swap"},
	}

	if len(Catalog) != len(expected) {
		t.Fatalf("Catalog length: got %d want %d", len(Catalog), len(expected))
	}

	for i, exp := range expected {
		cmd := Catalog[i]
		if cmd.Phrase != exp.phrase {
			t.Errorf("Catalog[%d].Phrase: got %q want %q", i, cmd.Phrase, exp.phrase)
		}
		if cmd.Action != exp.action {
			t.Errorf("Catalog[%d].Action: got %q want %q", i, cmd.Action, exp.action)
		}
	}
}

func TestFindCommand_ExactMatch(t *testing.T) {
	cmd := FindCommand("request pit stop")
	if cmd == nil {
		t.Fatal("expected non-nil command")
	}
	if cmd.Action != "request" {
		t.Fatalf("Action: got %q want %q", cmd.Action, "request")
	}
}

func TestFindCommand_CaseInsensitive(t *testing.T) {
	cmd := FindCommand("BOX THIS LAP")
	if cmd == nil {
		t.Fatal("expected non-nil command")
	}
	if cmd.Action != "request" {
		t.Fatalf("Action: got %q want %q", cmd.Action, "request")
	}
}

func TestFindCommand_PrefixMatch(t *testing.T) {
	// "fuel" should match "fuel" even with extra text
	cmd := FindCommand("fuel to end")
	if cmd == nil {
		t.Fatal("expected non-nil command")
	}
	if cmd.Action != "fuel" {
		t.Fatalf("Action: got %q want %q", cmd.Action, "fuel")
	}
}

func TestFindCommand_NoMatch(t *testing.T) {
	cmd := FindCommand("nonexistent command")
	if cmd != nil {
		t.Fatalf("expected nil for unmatched phrase, got %+v", cmd)
	}
}

func TestFindCommand_EmptyPhrase(t *testing.T) {
	cmd := FindCommand("")
	if cmd != nil {
		t.Fatalf("expected nil for empty phrase, got %+v", cmd)
	}
}

func TestFindCommand_WhitespaceTrimmed(t *testing.T) {
	cmd := FindCommand("  tyres  ")
	if cmd == nil {
		t.Fatal("expected non-nil command")
	}
	if cmd.Action != "tyres" {
		t.Fatalf("Action: got %q want %q", cmd.Action, "tyres")
	}
}

func TestFindCommand_PrefixPriority(t *testing.T) {
	// "fuel" comes before other F-prefixed entries in catalog order.
	// FindCommand returns the first match.
	cmd := FindCommand("fuel")
	if cmd == nil {
		t.Fatal("expected non-nil command")
	}
	if cmd.Action != "fuel" {
		t.Fatalf("Action: got %q want %q", cmd.Action, "fuel")
	}
}

func TestFindCommand_PrefixFindsCorrectEntry(t *testing.T) {
	// "front wing" should match exactly
	cmd := FindCommand("front wing")
	if cmd == nil {
		t.Fatal("expected non-nil command")
	}
	if cmd.Action != "front_wing" {
		t.Fatalf("Action: got %q want %q", cmd.Action, "front_wing")
	}
}

func TestFindCommand_TrailingTextAfterMatch(t *testing.T) {
	// "driver swap please" should match "driver swap"
	cmd := FindCommand("driver swap please")
	if cmd == nil {
		t.Fatal("expected non-nil command")
	}
	if cmd.Action != "driver_swap" {
		t.Fatalf("Action: got %q want %q", cmd.Action, "driver_swap")
	}
}
