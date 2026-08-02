package commands

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

func TestCatalogV1ValidatesAndRoundTrips(t *testing.T) {
	catalog := DefaultCatalogV1()
	if err := catalog.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}

	encoded, err := json.Marshal(catalog)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	decoded, err := ParseCatalog(encoded)
	if err != nil {
		t.Fatalf("ParseCatalog() error = %v", err)
	}
	if !reflect.DeepEqual(decoded, catalog) {
		t.Fatal("catalog changed during JSON roundtrip")
	}
}

func TestCatalogV1IsSymmetricAcrossLocales(t *testing.T) {
	catalog := DefaultCatalogV1()
	if len(catalog.Intents) != 20 {
		t.Fatalf("intent count = %d, want 20", len(catalog.Intents))
	}

	for _, intent := range catalog.Intents {
		for _, locale := range SupportedLocales() {
			if len(intent.Phrases[locale]) == 0 {
				t.Errorf("intent %q has no phrases for %q", intent.ID, locale)
			}
		}
	}
	for _, locale := range SupportedLocales() {
		if catalog.WakeWords[locale] == "" {
			t.Errorf("missing wake word for %q", locale)
		}
		if len(catalog.Dialogue.Confirm[locale]) == 0 || len(catalog.Dialogue.Cancel[locale]) == 0 {
			t.Errorf("missing dialogue terms for %q", locale)
		}
	}
}

func TestCatalogV1SeparatesQueriesAndConfirmableActions(t *testing.T) {
	catalog := DefaultCatalogV1()
	queries := 0
	actions := 0
	for _, intent := range catalog.Intents {
		switch intent.Kind {
		case KindQuery:
			queries++
			if intent.Mutable || intent.RequiresConfirmation {
				t.Errorf("query %q is mutable or confirmable", intent.ID)
			}
		case KindAction:
			actions++
			if !intent.Mutable || !intent.RequiresConfirmation {
				t.Errorf("action %q does not require confirmation", intent.ID)
			}
		default:
			t.Errorf("intent %q has unknown kind %q", intent.ID, intent.Kind)
		}
		if intent.ResponseKey == "" || len(intent.Preconditions) == 0 {
			t.Errorf("intent %q lacks response or preconditions", intent.ID)
		}
	}
	if queries != 14 || actions != 6 {
		t.Fatalf("query/action count = %d/%d, want 14/6", queries, actions)
	}
}

func TestCatalogV1RejectsUnsafeOrAmbiguousDefinitions(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Catalog)
		want   error
	}{
		{
			name: "duplicate phrase across intents",
			mutate: func(catalog *Catalog) {
				catalog.Intents[1].Phrases[LocaleEnglish][0] = catalog.Intents[0].Phrases[LocaleEnglish][0]
			},
			want: ErrAmbiguousCatalog,
		},
		{
			name: "action without confirmation",
			mutate: func(catalog *Catalog) {
				catalog.Intents[14].RequiresConfirmation = false
			},
			want: ErrInvalidCatalog,
		},
		{
			name: "unknown slot placeholder",
			mutate: func(catalog *Catalog) {
				catalog.Intents[4].Phrases[LocaleEnglish][0] = "what is the gap to {missing}"
			},
			want: ErrInvalidCatalog,
		},
		{
			name: "control character",
			mutate: func(catalog *Catalog) {
				catalog.Intents[0].Phrases[LocaleEnglish][0] += "\x00"
			},
			want: ErrInvalidCatalog,
		},
		{
			name: "intent outside v1",
			mutate: func(catalog *Catalog) {
				catalog.Intents[0].ID = "query.future"
			},
			want: ErrInvalidCatalog,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			catalog := DefaultCatalogV1()
			tt.mutate(&catalog)
			if err := catalog.Validate(); !errors.Is(err, tt.want) {
				t.Fatalf("Validate() error = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestDefaultCatalogV1ReturnsIndependentValues(t *testing.T) {
	first := DefaultCatalogV1()
	first.Intents[0].Phrases[LocaleSpanish][0] = "mutated"
	first.WakeWords[LocaleSpanish] = "mutated"

	second := DefaultCatalogV1()
	if second.Intents[0].Phrases[LocaleSpanish][0] == "mutated" || second.WakeWords[LocaleSpanish] == "mutated" {
		t.Fatal("DefaultCatalogV1 returned shared mutable state")
	}
}
