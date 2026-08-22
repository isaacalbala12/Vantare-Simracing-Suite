package radio

import (
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
)

func validPhrases() map[Locale]Phrase {
	return map[Locale]Phrase{
		LocaleES: {Visual: "Coche a {side}", Voice: "Coche a {side}"}, LocaleEN: {Visual: "Car {side}", Voice: "Car {side}"},
		LocaleIT: {Visual: "Auto a {side}", Voice: "Auto a {side}"}, LocalePTBR: {Visual: "Carro a {side}", Voice: "Carro a {side}"},
	}
}

func registerTestIntent(t testing.TB, resolver *Resolver) {
	t.Helper()
	err := resolver.Register("spotter.car", Definition{Family: "spotter", Priority: PriorityP0, Role: "safety", Channel: audio.ChannelSpotter, Severity: "critical", ParamKeys: []string{"side"}}, validPhrases())
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
}

func TestRegisterFailsClosed(t *testing.T) {
	cases := []struct {
		name   string
		change func(*Definition, map[Locale]Phrase)
	}{
		{"missing locale", func(_ *Definition, p map[Locale]Phrase) { delete(p, LocaleIT) }},
		{"unknown parameter", func(_ *Definition, p map[Locale]Phrase) {
			phrase := p[LocaleES]
			phrase.Visual = "{unknown}"
			p[LocaleES] = phrase
		}},
		{"duplicate parameter", func(d *Definition, _ map[Locale]Phrase) { d.ParamKeys = append(d.ParamKeys, "side") }},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			resolver := NewResolver()
			definition := Definition{Family: "spotter", Priority: PriorityP0, Role: "safety", Channel: audio.ChannelSpotter, Severity: "critical", ParamKeys: []string{"side"}}
			phrases := validPhrases()
			test.change(&definition, phrases)
			if err := resolver.Register("spotter.car", definition, phrases); !errors.Is(err, ErrInvalidDefinition) {
				t.Fatalf("Register error = %v", err)
			}
		})
	}
	resolver := NewResolver()
	registerTestIntent(t, resolver)
	if err := resolver.Register("spotter.car", Definition{}, validPhrases()); !errors.Is(err, ErrInvalidDefinition) {
		t.Fatalf("duplicate error = %v", err)
	}
}

func TestResolveLocalesAndInvalidInput(t *testing.T) {
	resolver := NewResolver()
	registerTestIntent(t, resolver)
	wants := map[Locale]string{LocaleES: "Coche a izquierda", LocaleEN: "Car izquierda", LocaleIT: "Auto a izquierda", LocalePTBR: "Carro a izquierda"}
	for locale, want := range wants {
		t.Run(string(locale), func(t *testing.T) {
			message := testMessage("id", "spotter.car", "car", PriorityP0, 100)
			message.Locale = locale
			message.Payload = map[string]string{"side": "izquierda"}
			got, err := resolver.Resolve(message)
			if err != nil || got.VisualText != want || got.VoiceText != want {
				t.Fatalf("Resolve() = %+v, %v", got, err)
			}
		})
	}
	cases := []struct {
		name   string
		mutate func(*RadioMessage)
		target error
	}{
		{"unknown intent", func(m *RadioMessage) { m.Intent = "unknown" }, ErrNotRegistered},
		{"locale", func(m *RadioMessage) { m.Locale = "fr" }, ErrNotRegistered},
		{"missing param", func(m *RadioMessage) { m.Payload = map[string]string{} }, ErrInvalidParameters},
		{"extra param", func(m *RadioMessage) { m.Payload["extra"] = "x" }, ErrInvalidParameters},
		{"priority mismatch", func(m *RadioMessage) { m.Priority = PriorityP1 }, ErrInvalidParameters},
		{"oversized param", func(m *RadioMessage) { m.Payload["side"] = string(make([]byte, 257)) }, ErrInvalidParameters},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			message := testMessage("id", "spotter.car", "car", PriorityP0, 100)
			message.Payload = map[string]string{"side": "left"}
			test.mutate(&message)
			if _, err := resolver.Resolve(message); !errors.Is(err, test.target) {
				t.Fatalf("Resolve error = %v, want %v", err, test.target)
			}
		})
	}
}
