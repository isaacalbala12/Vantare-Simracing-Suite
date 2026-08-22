package spotter

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/radio"
)

func TestCatalogRegistersSevenExactLocalizedIntents(t *testing.T) {
	t.Parallel()
	resolver := radio.NewResolver()
	if err := RegisterCatalog(resolver); err != nil {
		t.Fatal(err)
	}
	want := map[string]map[radio.Locale]string{
		IntentCarLeft:    {radio.LocaleES: "Coche a la izquierda", radio.LocaleEN: "Car left", radio.LocaleIT: "Auto a sinistra", radio.LocalePTBR: "Carro à esquerda"},
		IntentCarRight:   {radio.LocaleES: "Coche a la derecha", radio.LocaleEN: "Car right", radio.LocaleIT: "Auto a destra", radio.LocalePTBR: "Carro à direita"},
		IntentStillThere: {radio.LocaleES: "Sigue ahí", radio.LocaleEN: "Still there", radio.LocaleIT: "È ancora lì", radio.LocalePTBR: "Ainda está aí"},
		IntentClearLeft:  {radio.LocaleES: "Libre por la izquierda", radio.LocaleEN: "Clear on the left", radio.LocaleIT: "Libero a sinistra", radio.LocalePTBR: "Livre à esquerda"},
		IntentClearRight: {radio.LocaleES: "Libre por la derecha", radio.LocaleEN: "Clear on the right", radio.LocaleIT: "Libero a destra", radio.LocalePTBR: "Livre à direita"},
		IntentAllClear:   {radio.LocaleES: "Todo libre", radio.LocaleEN: "All clear", radio.LocaleIT: "Tutto libero", radio.LocalePTBR: "Tudo livre"},
		IntentThreeWide:  {radio.LocaleES: "Tres coches en paralelo", radio.LocaleEN: "Three wide", radio.LocaleIT: "Tre auto affiancate", radio.LocalePTBR: "Três carros lado a lado"},
	}
	for intent, locales := range want {
		for locale, text := range locales {
			message := radio.RadioMessage{Version: radio.VersionV1, ID: "test", Source: "test", Intent: intent,
				Subject: "player", Priority: radio.PriorityP0, CreatedAtMS: 1, ExpiresAtMS: 1 + time.Second.Milliseconds(),
				Locale: locale, Payload: map[string]string{}}
			presentation, err := resolver.Resolve(message)
			if err != nil {
				t.Fatalf("Resolve(%s, %s): %v", intent, locale, err)
			}
			if presentation.VisualText != text || presentation.VoiceText != text {
				t.Errorf("Resolve(%s, %s) = %q/%q, want %q", intent, locale, presentation.VisualText, presentation.VoiceText, text)
			}
		}
	}
}
