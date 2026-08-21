package spotter

import (
	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/radio"
)

const (
	IntentCarLeft    = "spotter.car_left"
	IntentCarRight   = "spotter.car_right"
	IntentStillThere = "spotter.still_there"
	IntentClearLeft  = "spotter.clear_left"
	IntentClearRight = "spotter.clear_right"
	IntentAllClear   = "spotter.all_clear"
	IntentThreeWide  = "spotter.three_wide"
)

var catalog = map[string]map[radio.Locale]radio.Phrase{
	IntentCarLeft:    phrases("Coche a la izquierda", "Car left", "Auto a sinistra", "Carro à esquerda"),
	IntentCarRight:   phrases("Coche a la derecha", "Car right", "Auto a destra", "Carro à direita"),
	IntentStillThere: phrases("Sigue ahí", "Still there", "È ancora lì", "Ainda está aí"),
	IntentClearLeft:  phrases("Libre por la izquierda", "Clear on the left", "Libero a sinistra", "Livre à esquerda"),
	IntentClearRight: phrases("Libre por la derecha", "Clear on the right", "Libero a destra", "Livre à direita"),
	IntentAllClear:   phrases("Todo libre", "All clear", "Tutto libero", "Tudo livre"),
	IntentThreeWide:  phrases("Tres coches en paralelo", "Three wide", "Tre auto affiancate", "Três carros lado a lado"),
}

func RegisterCatalog(resolver *radio.Resolver) error {
	definition := radio.Definition{
		Family: "spotter", Priority: radio.PriorityP0, Role: "spotter",
		Channel: audio.ChannelSpotter, Severity: "critical",
	}
	for _, intent := range allIntents() {
		if err := resolver.Register(intent, definition, catalog[intent]); err != nil {
			return err
		}
	}
	return nil
}

func phrases(es, en, it, ptBR string) map[radio.Locale]radio.Phrase {
	return map[radio.Locale]radio.Phrase{
		radio.LocaleES: {Visual: es, Voice: es}, radio.LocaleEN: {Visual: en, Voice: en},
		radio.LocaleIT: {Visual: it, Voice: it}, radio.LocalePTBR: {Visual: ptBR, Voice: ptBR},
	}
}

func allIntents() []string {
	return []string{IntentCarLeft, IntentCarRight, IntentStillThere, IntentClearLeft, IntentClearRight, IntentAllClear, IntentThreeWide}
}
