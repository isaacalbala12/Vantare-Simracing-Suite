package presentation

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
)

var approvedIntents = []struct {
	intent   string
	family   messagepolicy.Family
	priority messagepolicy.Priority
}{
	{messagepolicy.IntentSpotterCarLeft, messagepolicy.FamilySpotter, messagepolicy.PrioritySpotter},
	{messagepolicy.IntentSpotterCarRight, messagepolicy.FamilySpotter, messagepolicy.PrioritySpotter},
	{messagepolicy.IntentSpotterStillThere, messagepolicy.FamilySpotter, messagepolicy.PrioritySpotter},
	{messagepolicy.IntentSpotterClearLeft, messagepolicy.FamilySpotter, messagepolicy.PrioritySpotter},
	{messagepolicy.IntentSpotterClearRight, messagepolicy.FamilySpotter, messagepolicy.PrioritySpotter},
	{messagepolicy.IntentSpotterAllClear, messagepolicy.FamilySpotter, messagepolicy.PrioritySpotter},
	{messagepolicy.IntentSpotterThreeWide, messagepolicy.FamilySpotter, messagepolicy.PrioritySpotter},
	{messagepolicy.IntentFuelHalfTank, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource},
	{messagepolicy.IntentFuelOneLitre, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource},
	{messagepolicy.IntentFuelTwoLitres, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource},
	{messagepolicy.IntentFuelLapsFour, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource},
	{messagepolicy.IntentFuelLapsThree, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource},
	{messagepolicy.IntentFuelLapsTwo, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource},
	{messagepolicy.IntentFuelLapsOne, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource},
	{messagepolicy.IntentFuelPitNow, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource},
	{messagepolicy.IntentPenaltyCountIncreased, messagepolicy.FamilyPenalties, messagepolicy.PriorityPenalty},
	{messagepolicy.IntentLapCompleted, messagepolicy.FamilyLaps, messagepolicy.PriorityInformation},
	{messagepolicy.IntentTimingGapReport, messagepolicy.FamilyTimings, messagepolicy.PriorityInformation},
	{messagepolicy.IntentPitEntry, messagepolicy.FamilyPitStops, messagepolicy.PriorityInformation},
	{messagepolicy.IntentPitExit, messagepolicy.FamilyPitStops, messagepolicy.PriorityInformation},
}

func TestResolverCoversExactlyTwentyIntentsInEveryLocale(t *testing.T) {
	resolver, err := NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	locales := SupportedLocales()
	if want := []Locale{LocaleSpanish, LocaleEnglish, LocaleItalian, LocalePortugueseBrazil}; !reflect.DeepEqual(locales, want) {
		t.Fatalf("SupportedLocales() = %v, want %v", locales, want)
	}
	if len(approvedIntents) != 20 {
		t.Fatalf("test contract has %d intents, want 20", len(approvedIntents))
	}

	for _, locale := range locales {
		seen := make(map[string]struct{}, len(approvedIntents))
		for index, approved := range approvedIntents {
			decision := decisionFor(approved.intent, approved.family, approved.priority)
			decision.CandidateID = "candidate-" + string(rune('a'+index))
			got, err := resolver.Resolve(decision, locale)
			if err != nil {
				t.Fatalf("Resolve(%q, %q): %v", approved.intent, locale, err)
			}
			if got.Version != ContractVersionV1 || got.Intent != approved.intent || got.Locale != locale ||
				got.Family != approved.family || got.Priority != approved.priority || got.CreatedAtMS != 100 || got.ExpiresAtMS != 200 {
				t.Fatalf("Resolve(%q, %q) metadata = %+v", approved.intent, locale, got)
			}
			if got.VisualText == "" || got.VoiceText == "" || got.VisualText == got.Intent || got.VoiceText == got.Intent {
				t.Fatalf("Resolve(%q, %q) exposed raw/empty text: %+v", approved.intent, locale, got)
			}
			if strings.ContainsRune(got.VisualText, 0) || strings.ContainsRune(got.VoiceText, 0) {
				t.Fatalf("Resolve(%q, %q) contains NUL", approved.intent, locale)
			}
			seen[got.Intent] = struct{}{}
		}
		if len(seen) != 20 {
			t.Fatalf("locale %q resolved %d unique intents, want 20", locale, len(seen))
		}
	}
}

func TestResolverDerivesRoleChannelAndSeverity(t *testing.T) {
	resolver, err := NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name     string
		decision messagepolicy.Decision
		role     Role
		channel  Channel
		severity Severity
	}{
		{"spotter", decisionFor(messagepolicy.IntentSpotterCarLeft, messagepolicy.FamilySpotter, messagepolicy.PrioritySpotter), RoleSpotter, ChannelSpotter, SeverityCritical},
		{"fuel", decisionFor(messagepolicy.IntentFuelHalfTank, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource), RoleEngineer, ChannelEngineer, SeverityWarning},
		{"penalty", decisionFor(messagepolicy.IntentPenaltyCountIncreased, messagepolicy.FamilyPenalties, messagepolicy.PriorityPenalty), RoleEngineer, ChannelEngineer, SeverityWarning},
		{"information", decisionFor(messagepolicy.IntentLapCompleted, messagepolicy.FamilyLaps, messagepolicy.PriorityInformation), RoleEngineer, ChannelEngineer, SeverityInfo},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := resolver.Resolve(test.decision, LocaleSpanish)
			if err != nil {
				t.Fatal(err)
			}
			if got.Role != test.role || got.Channel != test.channel || got.Severity != test.severity {
				t.Fatalf("metadata = role %q channel %q severity %q", got.Role, got.Channel, got.Severity)
			}
		})
	}
}

func TestPenaltyPresentationIsNeutralInEveryLocale(t *testing.T) {
	resolver, err := NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	decision := decisionFor(messagepolicy.IntentPenaltyCountIncreased, messagepolicy.FamilyPenalties, messagepolicy.PriorityPenalty)
	for _, locale := range SupportedLocales() {
		got, err := resolver.Resolve(decision, locale)
		if err != nil {
			t.Fatal(err)
		}
		text := strings.ToLower(got.VisualText + " " + got.VoiceText)
		for _, forbidden := range []string{"drive-through", "drive through", "stop & go", "stop and go"} {
			if strings.Contains(text, forbidden) {
				t.Fatalf("locale %q invented penalty type: %q", locale, text)
			}
		}
	}
}

func TestChangingLocaleCannotChangeDecisionSemantics(t *testing.T) {
	resolver, err := NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	decision := decisionFor(messagepolicy.IntentFuelPitNow, messagepolicy.FamilyFuel, messagepolicy.PriorityFailureResource)
	decision.Payload = map[string]string{"fuelLitres": "1.2", "estimatedLapsRemaining": "0.8"}
	var first Presentation
	for index, locale := range SupportedLocales() {
		got, err := resolver.Resolve(decision, locale)
		if err != nil {
			t.Fatal(err)
		}
		if index == 0 {
			first = got
			continue
		}
		if got.Intent != first.Intent || got.Family != first.Family || got.Priority != first.Priority ||
			got.Role != first.Role || got.Channel != first.Channel || got.Severity != first.Severity ||
			got.CreatedAtMS != first.CreatedAtMS || got.ExpiresAtMS != first.ExpiresAtMS {
			t.Fatalf("locale %q changed decision semantics: first=%+v got=%+v", locale, first, got)
		}
	}
}

func TestResolverFailsClosedForUnsupportedOrMalformedInput(t *testing.T) {
	resolver, err := NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	valid := decisionFor(messagepolicy.IntentPitEntry, messagepolicy.FamilyPitStops, messagepolicy.PriorityInformation)
	tests := []struct {
		name    string
		locale  Locale
		mutate  func(messagepolicy.Decision) messagepolicy.Decision
		wantErr error
	}{
		{"unknown locale", Locale("fr"), identityDecision, ErrUnsupportedLocale},
		{"locale NUL", Locale("es\x00"), identityDecision, ErrInvalidInput},
		{"unknown intent", LocaleSpanish, func(d messagepolicy.Decision) messagepolicy.Decision { d.Intent = "future.intent"; return d }, ErrUnsupportedIntent},
		{"intent NUL", LocaleSpanish, func(d messagepolicy.Decision) messagepolicy.Decision { d.Intent += "\x00"; return d }, ErrInvalidInput},
		{"wrong family", LocaleSpanish, func(d messagepolicy.Decision) messagepolicy.Decision { d.Family = messagepolicy.FamilyFuel; return d }, ErrInvalidDecision},
		{"wrong priority", LocaleSpanish, func(d messagepolicy.Decision) messagepolicy.Decision {
			d.Priority = messagepolicy.PrioritySpotter
			return d
		}, ErrInvalidDecision},
		{"wrong version", LocaleSpanish, func(d messagepolicy.Decision) messagepolicy.Decision { d.Version++; return d }, ErrInvalidDecision},
		{"invalid expiry", LocaleSpanish, func(d messagepolicy.Decision) messagepolicy.Decision { d.ExpiresAtMS = d.CreatedAtMS; return d }, ErrInvalidDecision},
		{"unknown parameter", LocaleSpanish, func(d messagepolicy.Decision) messagepolicy.Decision {
			d.Payload = map[string]string{"secret": "value"}
			return d
		}, ErrUnsupportedParameter},
		{"parameter NUL", LocaleSpanish, func(d messagepolicy.Decision) messagepolicy.Decision {
			d.Payload = map[string]string{"lap": "1\x00"}
			return d
		}, ErrInvalidInput},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := resolver.Resolve(test.mutate(valid), test.locale)
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("Resolve() error = %v, want %v", err, test.wantErr)
			}
		})
	}
}

func TestCatalogValidationRejectsInvalidRoleChannelSeverityAndParity(t *testing.T) {
	valid := definition{Family: messagepolicy.FamilyLaps, Priority: messagepolicy.PriorityInformation, Role: RoleEngineer, Channel: ChannelEngineer, Severity: SeverityInfo}
	for _, test := range []struct {
		name string
		def  definition
	}{
		{"role", definition{Family: messagepolicy.FamilyLaps, Priority: messagepolicy.PriorityInformation, Role: Role("future"), Channel: ChannelEngineer, Severity: SeverityInfo}},
		{"channel", definition{Family: messagepolicy.FamilyLaps, Priority: messagepolicy.PriorityInformation, Role: RoleEngineer, Channel: Channel("future"), Severity: SeverityInfo}},
		{"severity", definition{Family: messagepolicy.FamilyLaps, Priority: messagepolicy.PriorityInformation, Role: RoleEngineer, Channel: ChannelEngineer, Severity: Severity("future")}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := validateDefinition(test.def); err == nil {
				t.Fatal("invalid definition accepted")
			}
		})
	}
	if err := validateDefinition(valid); err != nil {
		t.Fatalf("valid definition rejected: %v", err)
	}
}

func FuzzResolverRejectsUntrustedStrings(f *testing.F) {
	f.Add("future.intent", "fr", "key", "value")
	f.Add(messagepolicy.IntentLapCompleted, "es", "lap", "1")
	resolver, err := NewResolver()
	if err != nil {
		f.Fatal(err)
	}
	f.Fuzz(func(t *testing.T, intent, locale, key, value string) {
		decision := decisionFor(intent, messagepolicy.FamilyLaps, messagepolicy.PriorityInformation)
		decision.Payload = map[string]string{key: value}
		got, err := resolver.Resolve(decision, Locale(locale))
		if err != nil {
			return
		}
		if got.VisualText == "" || got.VoiceText == "" || got.VisualText == got.Intent || got.VoiceText == got.Intent ||
			strings.ContainsRune(got.VisualText, 0) || strings.ContainsRune(got.VoiceText, 0) {
			t.Fatalf("unsafe successful presentation: %+v", got)
		}
	})
}

func BenchmarkResolver(b *testing.B) {
	resolver, err := NewResolver()
	if err != nil {
		b.Fatal(err)
	}
	decision := decisionFor(messagepolicy.IntentSpotterCarLeft, messagepolicy.FamilySpotter, messagepolicy.PrioritySpotter)
	b.ReportAllocs()
	for index := 0; index < b.N; index++ {
		if _, err := resolver.Resolve(decision, LocaleSpanish); err != nil {
			b.Fatal(err)
		}
	}
}

func decisionFor(intent string, family messagepolicy.Family, priority messagepolicy.Priority) messagepolicy.Decision {
	return messagepolicy.Decision{
		Version: messagepolicy.ContractVersionV1, CandidateID: "candidate", Family: family,
		Intent: intent, Priority: priority, CreatedAtMS: 100, ExpiresAtMS: 200,
	}
}

func identityDecision(decision messagepolicy.Decision) messagepolicy.Decision { return decision }
