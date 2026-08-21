package families

import (
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/radio"
)

const (
	IntentFuelHalfTank          = "fuel.low_half_tank"
	IntentFuelOneLitre          = "fuel.low_1l"
	IntentFuelTwoLitres         = "fuel.low_2l"
	IntentFuelLapsFour          = "fuel.laps_remaining_4"
	IntentFuelLapsThree         = "fuel.laps_remaining_3"
	IntentFuelLapsTwo           = "fuel.laps_remaining_2"
	IntentFuelLapsOne           = "fuel.laps_remaining_1"
	IntentFuelPitNow            = "fuel.for_pit_now"
	IntentPenaltyCountIncreased = "penalties.count_increased"
	IntentLapCompleted          = "laps.lap_completed"
	IntentTimingGapReport       = "timings.gap_report"
	IntentPitEntry              = "pitstops.entry"
	IntentPitExit               = "pitstops.exit"
)

type intentDefinition struct {
	Family   string
	Priority radio.Priority
	Cooldown time.Duration
	TTL      time.Duration
	Subject  string
	Severity string
	Phrases  map[radio.Locale]radio.Phrase
}

var intentTable = map[string]intentDefinition{
	IntentFuelHalfTank:          fuelIntent(30*time.Second, 30*time.Second, phrases("Queda medio depósito", "Half a tank remaining", "Rimane metà serbatoio", "Resta meio tanque")),
	IntentFuelTwoLitres:         fuelIntent(30*time.Second, 25*time.Second, phrases("Quedan dos litros", "Two litres remaining", "Rimangono due litri", "Restam dois litros")),
	IntentFuelOneLitre:          fuelIntent(30*time.Second, 20*time.Second, phrases("Queda un litro", "One litre remaining", "Rimane un litro", "Resta um litro")),
	IntentFuelLapsFour:          fuelIntent(30*time.Second, 30*time.Second, phrases("Queda combustible para cuatro vueltas", "Four laps of fuel remaining", "Carburante per quattro giri", "Combustível para quatro voltas")),
	IntentFuelLapsThree:         fuelIntent(30*time.Second, 30*time.Second, phrases("Queda combustible para tres vueltas", "Three laps of fuel remaining", "Carburante per tre giri", "Combustível para três voltas")),
	IntentFuelLapsTwo:           fuelIntent(30*time.Second, 25*time.Second, phrases("Queda combustible para dos vueltas", "Two laps of fuel remaining", "Carburante per due giri", "Combustível para duas voltas")),
	IntentFuelLapsOne:           fuelIntent(30*time.Second, 20*time.Second, phrases("Queda combustible para una vuelta", "One lap of fuel remaining", "Carburante per un giro", "Combustível para uma volta")),
	IntentFuelPitNow:            fuelIntent(30*time.Second, 15*time.Second, phrases("Combustible crítico, entra en boxes", "Fuel critical, pit now", "Carburante critico, rientra ai box", "Combustível crítico, entre nos boxes")),
	IntentPenaltyCountIncreased: informationIntent("penalties", 30*time.Second, 20*time.Second, phrases("Hay una nueva penalización pendiente", "A new penalty is pending", "C'è una nuova penalità da scontare", "Há uma nova penalização pendente")),
	IntentLapCompleted:          informationIntent("laps", 0, 10*time.Second, phrases("Vuelta completada", "Lap completed", "Giro completato", "Volta concluída")),
	IntentTimingGapReport:       informationIntent("timings", 60*time.Second, 15*time.Second, phrases("Diferencias actualizadas", "Gaps updated", "Distacchi aggiornati", "Diferenças atualizadas")),
	IntentPitEntry:              pitIntent(5*time.Second, 10*time.Second, phrases("Entrando en boxes", "Entering the pits", "Ingresso ai box", "Entrando nos boxes")),
	IntentPitExit:               pitIntent(5*time.Second, 10*time.Second, phrases("Saliendo de boxes", "Leaving the pits", "Uscita dai box", "Saindo dos boxes")),
}

func fuelIntent(cooldown, ttl time.Duration, localized map[radio.Locale]radio.Phrase) intentDefinition {
	return intentDefinition{Family: "fuel", Priority: radio.PriorityP2, Cooldown: cooldown, TTL: ttl, Subject: "player", Severity: "warning", Phrases: localized}
}

func pitIntent(cooldown, ttl time.Duration, localized map[radio.Locale]radio.Phrase) intentDefinition {
	return intentDefinition{Family: "pitstops", Priority: radio.PriorityP2, Cooldown: cooldown, TTL: ttl, Subject: "player", Severity: "warning", Phrases: localized}
}

func informationIntent(family string, cooldown, ttl time.Duration, localized map[radio.Locale]radio.Phrase) intentDefinition {
	return intentDefinition{Family: family, Priority: radio.PriorityP3, Cooldown: cooldown, TTL: ttl, Subject: "player", Severity: "info", Phrases: localized}
}

func RegisterCatalog(resolver *radio.Resolver) error {
	for intent, entry := range intentTable {
		definition := radio.Definition{Family: entry.Family, Priority: entry.Priority, Role: "engineer", Channel: audio.ChannelEngineer, Severity: entry.Severity}
		if err := resolver.Register(intent, definition, entry.Phrases); err != nil {
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
