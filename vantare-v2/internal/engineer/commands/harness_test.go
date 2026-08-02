package commands

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestTextHarnessMatchesOwnPhrasesAcrossLocales(t *testing.T) {
	tests := []struct {
		name       string
		locale     Locale
		text       string
		wantIntent string
	}{
		{"Spanish fuel", LocaleSpanish, "¿Cuánto combustible queda?", "query.fuel"},
		{"English energy", LocaleEnglish, "How much virtual energy is left.", "query.virtual_energy"},
		{"Italian position", LocaleItalian, "qual è la mia posizione", "query.position"},
		{"Brazilian Portuguese tyres", LocalePortugueseBrazil, "como estão os pneus", "query.tyres"},
	}

	harness := newTestHarness(t)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match, err := harness.Match(tt.locale, tt.text)
			if err != nil {
				t.Fatalf("Match() error = %v", err)
			}
			if match.IntentID != tt.wantIntent || match.Kind != KindQuery || match.RequiresConfirmation {
				t.Fatalf("Match() = %+v", match)
			}
		})
	}
}

func TestTextHarnessMatchesEveryCatalogPhrase(t *testing.T) {
	catalog := DefaultCatalogV1()
	harness := newTestHarness(t)
	for _, intent := range catalog.Intents {
		for _, locale := range SupportedLocales() {
			for _, phrase := range intent.Phrases[locale] {
				text := phrase
				for _, slot := range intent.Slots {
					text = strings.ReplaceAll(text, "{"+slot.Name+"}", exampleSlotValue(locale, slot))
				}
				match, err := harness.Match(locale, text)
				if err != nil {
					t.Errorf("Match(%q, %q) error = %v", locale, text, err)
					continue
				}
				if match.IntentID != intent.ID || match.Kind != intent.Kind {
					t.Errorf("Match(%q, %q) = %+v, want %q/%q", locale, text, match, intent.ID, intent.Kind)
				}
			}
		}
	}
}

func TestTextHarnessParsesTypedSlotsAndCanonicalUnits(t *testing.T) {
	tests := []struct {
		name       string
		locale     Locale
		text       string
		wantIntent string
		wantSlot   string
		wantValue  string
	}{
		{"decimal comma litres", LocaleSpanish, "configura 25,5 litros de combustible", "action.pit.set_fuel", "amount", "25.5"},
		{"decimal point litres", LocaleEnglish, "set pit fuel to 25.5 litres", "action.pit.set_fuel", "amount", "25.5"},
		{"enum alias", LocaleItalian, "qual è il distacco da davanti", "query.gap", "target", "ahead"},
		{"Spanish class leader", LocaleSpanish, "cuál es la diferencia con líder de clase", "query.gap", "target", "class_leader"},
		{"English class leader", LocaleEnglish, "what is the gap to class leader", "query.gap", "target", "class_leader"},
		{"Italian class leader", LocaleItalian, "qual è il distacco da leader di classe", "query.gap", "target", "class_leader"},
		{"Portuguese class leader", LocalePortugueseBrazil, "qual é a diferença para líder da classe", "query.gap", "target", "class_leader"},
		{"car number", LocalePortugueseBrazil, "fale sobre o carro 51", "query.rival.by_number", "car_number", "51"},
		{"Spanish leading-zero car number", LocaleSpanish, "dime cómo va el coche 007", "query.rival.by_number", "car_number", "007"},
		{"English leading-zero car number", LocaleEnglish, "tell me about car 007", "query.rival.by_number", "car_number", "007"},
		{"Italian leading-zero car number", LocaleItalian, "dimmi come va la macchina 007", "query.rival.by_number", "car_number", "007"},
		{"Portuguese leading-zero car number", LocalePortugueseBrazil, "fale sobre o carro 007", "query.rival.by_number", "car_number", "007"},
		{"sensitive name", LocaleEnglish, "tell me about driver Jamie Smith", "query.rival.by_name", "driver_name", "jamie smith"},
	}

	harness := newTestHarness(t)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match, err := harness.Match(tt.locale, tt.text)
			if err != nil {
				t.Fatalf("Match() error = %v", err)
			}
			if match.IntentID != tt.wantIntent || match.Slots[tt.wantSlot] != tt.wantValue {
				t.Fatalf("Match() = %+v", match)
			}
			if match.Kind == KindAction && !match.RequiresConfirmation {
				t.Fatalf("mutable action bypassed confirmation: %+v", match)
			}
		})
	}
}

func TestTextHarnessFailsClosed(t *testing.T) {
	tests := []struct {
		name   string
		locale Locale
		text   string
		want   error
	}{
		{"unknown", LocaleEnglish, "make me faster", ErrUnknownUtterance},
		{"legacy prefix no longer matches", LocaleEnglish, "fuel to the end", ErrUnknownUtterance},
		{"wrong unit", LocaleEnglish, "set pit fuel to 25 gallons", ErrUnknownUtterance},
		{"out of range number", LocaleEnglish, "set pit fuel to 999 litres", ErrInvalidSlot},
		{"invalid number", LocaleEnglish, "set pit fuel to many litres", ErrInvalidSlot},
		{"unsupported locale", Locale("fr"), "combien de carburant", ErrInvalidInput},
		{"control character", LocaleEnglish, "how much fuel\x00", ErrInvalidInput},
		{"oversized", LocaleEnglish, strings.Repeat("a", maxInputBytes+1), ErrInvalidInput},
	}

	harness := newTestHarness(t)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := harness.Match(tt.locale, tt.text); !errors.Is(err, tt.want) {
				t.Fatalf("Match() error = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestTextHarnessRejectsNonCanonicalNumericForms(t *testing.T) {
	harness := newTestHarness(t)
	for _, tt := range []struct {
		locale Locale
		text   string
	}{
		{LocaleEnglish, "set pit fuel to -1 litres"},
		{LocaleEnglish, "set pit fuel to −1 litres"},
		{LocaleEnglish, "set pit fuel to +1 litres"},
		{LocaleEnglish, "set pit fuel to 1e2 litres"},
		{LocaleSpanish, "configura -1 litros de combustible"},
		{LocaleSpanish, "configura 1e2 litros de combustible"},
	} {
		if _, err := harness.Match(tt.locale, tt.text); !errors.Is(err, ErrInvalidSlot) {
			t.Fatalf("Match(%q, %q) error = %v, want ErrInvalidSlot", tt.locale, tt.text, err)
		}
	}

	for _, tt := range []struct {
		locale Locale
		text   string
		want   string
	}{
		{LocaleEnglish, "set pit fuel to 25.5 litres", "25.5"},
		{LocaleSpanish, "configura 25,5 litros de combustible", "25.5"},
	} {
		match, err := harness.Match(tt.locale, tt.text)
		if err != nil {
			t.Fatalf("Match(%q, %q) error = %v", tt.locale, tt.text, err)
		}
		if got := match.Slots["amount"]; got != tt.want {
			t.Fatalf("Match(%q, %q) amount = %q, want %q", tt.locale, tt.text, got, tt.want)
		}
	}
}

func TestTextHarnessDoesNotGuessGenericLeaderInMulticlass(t *testing.T) {
	harness := newTestHarness(t)
	for _, tt := range []struct {
		locale Locale
		text   string
	}{
		{LocaleSpanish, "cuál es la diferencia con líder"},
		{LocaleEnglish, "what is the gap to leader"},
		{LocaleItalian, "qual è il distacco da leader"},
		{LocalePortugueseBrazil, "qual é a diferença para líder"},
	} {
		if _, err := harness.Match(tt.locale, tt.text); !errors.Is(err, ErrUnknownUtterance) {
			t.Fatalf("Match(%q, %q) error = %v, want ErrUnknownUtterance", tt.locale, tt.text, err)
		}
	}
}

func TestTextHarnessRejectsAmbiguousCatalogBeforeMatching(t *testing.T) {
	catalog := DefaultCatalogV1()
	catalog.Intents[1].Phrases[LocaleEnglish][0] = catalog.Intents[0].Phrases[LocaleEnglish][0]
	if _, err := NewTextHarness(catalog); !errors.Is(err, ErrAmbiguousCatalog) {
		t.Fatalf("NewTextHarness() error = %v, want %v", err, ErrAmbiguousCatalog)
	}
}

func TestTextHarnessClassifiesDialogueWithoutExecutingAction(t *testing.T) {
	harness := newTestHarness(t)
	for _, tt := range []struct {
		locale Locale
		text   string
		want   DialogueIntent
	}{
		{LocaleSpanish, "confirmar", DialogueConfirm},
		{LocaleEnglish, "cancel", DialogueCancel},
		{LocaleItalian, "conferma", DialogueConfirm},
		{LocalePortugueseBrazil, "cancelar", DialogueCancel},
	} {
		got, err := harness.MatchDialogue(tt.locale, tt.text)
		if err != nil {
			t.Fatalf("MatchDialogue(%q) error = %v", tt.locale, err)
		}
		if got != tt.want {
			t.Fatalf("MatchDialogue(%q) = %q, want %q", tt.locale, got, tt.want)
		}
	}
}

func TestSanitizedResultContainsNoTranscriptPIIOrSlotValues(t *testing.T) {
	harness := newTestHarness(t)
	const transcript = "tell me about driver Jamie Smith"
	match, err := harness.Match(LocaleEnglish, transcript)
	if err != nil {
		t.Fatalf("Match() error = %v", err)
	}

	result := NewSanitizedResult("a01816de-6c66-4723-a99d-8d402b1b15cc", LocaleEnglish, "query.rival.by_name", match, nil)
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	text := strings.ToLower(string(encoded))
	for _, forbidden := range []string{"jamie", "smith", "transcript", "driver_name\":\""} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("sanitized result leaked %q: %s", forbidden, encoded)
		}
	}
	if !result.Synthetic || result.CommandReadiness != ReadinessNoGo || len(result.SlotNames) != 1 || result.SlotNames[0] != "driver_name" {
		t.Fatalf("NewSanitizedResult() = %+v", result)
	}
}

func TestSanitizedResultRequiresOpaqueUUIDV4CaseReference(t *testing.T) {
	match := Match{IntentID: "query.fuel", Kind: KindQuery}
	for _, unsafe := range []string{"speaker Jamie Smith/run-7", "A01816DE-6C66-3723-A99D-8D402B1B15CC", ""} {
		result := NewSanitizedResult(unsafe, LocaleEnglish, "query.fuel", match, nil)
		if result.CaseRef != "" || result.Outcome != "invalid" {
			t.Fatalf("NewSanitizedResult(%q) = %+v, want empty invalid reference", unsafe, result)
		}
	}

	const opaque = "A01816DE-6C66-4723-A99D-8D402B1B15CC"
	result := NewSanitizedResult(opaque, LocaleEnglish, "query.fuel", match, nil)
	if result.CaseRef != strings.ToLower(opaque) || result.Outcome != "matched" {
		t.Fatalf("NewSanitizedResult(valid UUID v4) = %+v", result)
	}
}

func TestSanitizedResultRejectsForgedMetadata(t *testing.T) {
	result := NewSanitizedResult(
		"a01816de-6c66-4723-a99d-8d402b1b15cc", Locale("Jamie Smith"), "Jamie Smith",
		Match{IntentID: "Jamie Smith", Slots: map[string]string{"Jamie Smith": "secret"}}, nil,
	)
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if strings.Contains(strings.ToLower(string(encoded)), "jamie") || result.Outcome != "invalid" {
		t.Fatalf("forged metadata was not sanitized: %s", encoded)
	}
}

func TestSanitizedResultRestrictsIntentAndSlotsToCatalog(t *testing.T) {
	const caseID = "a01816de-6c66-4723-a99d-8d402b1b15cc"
	result := NewSanitizedResult(
		caseID, LocaleEnglish, "query.fuel",
		Match{IntentID: "query.fuel", Kind: KindQuery, Slots: map[string]string{"jamie_smith": "secret"}}, nil,
	)
	if result.Outcome != "invalid" || len(result.SlotNames) != 0 {
		t.Fatalf("forged slot metadata was not rejected: %+v", result)
	}

	result = NewSanitizedResult(
		caseID, LocaleEnglish, "query.not_in_v1",
		Match{IntentID: "query.fuel", Kind: KindQuery}, nil,
	)
	if result.Outcome != "invalid" || result.ExpectedIntent != "" {
		t.Fatalf("forged expected intent was not rejected: %+v", result)
	}
}

func FuzzTextHarnessFailsClosed(f *testing.F) {
	harness, err := NewTextHarness(DefaultCatalogV1())
	if err != nil {
		f.Fatalf("NewTextHarness() error = %v", err)
	}
	for _, seed := range []string{"how much fuel is left", "set pit fuel to 25 litres", "unknown", "\x00"} {
		f.Add("en", seed)
	}
	f.Fuzz(func(t *testing.T, localeValue, text string) {
		match, err := harness.Match(Locale(localeValue), text)
		if err != nil {
			return
		}
		if match.IntentID == "" {
			t.Fatal("successful match has no intent")
		}
		if match.Kind == KindAction && !match.RequiresConfirmation {
			t.Fatalf("action bypassed confirmation: %+v", match)
		}
	})
}

func newTestHarness(t *testing.T) *TextHarness {
	t.Helper()
	harness, err := NewTextHarness(DefaultCatalogV1())
	if err != nil {
		t.Fatalf("NewTextHarness() error = %v", err)
	}
	return harness
}

func exampleSlotValue(locale Locale, slot SlotDefinition) string {
	switch slot.Type {
	case SlotEnum:
		return slot.EnumValues[0].Aliases[locale][0]
	case SlotInteger:
		return "51"
	case SlotDecimal:
		if locale == LocaleEnglish {
			return "25.5"
		}
		return "25,5"
	case SlotText:
		return "Jamie Smith"
	default:
		return "invalid"
	}
}
