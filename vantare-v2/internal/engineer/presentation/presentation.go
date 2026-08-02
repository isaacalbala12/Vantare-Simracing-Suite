// Package presentation turns approved Engineer decisions into bounded,
// localized text for every user-facing transport. It performs no I/O and does
// not acquire telemetry, schedule messages or synthesize audio.
package presentation

import (
	"errors"
	"fmt"
	"strings"

	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
)

const ContractVersionV1 uint16 = 1

const (
	maxIntentBytes      = 128
	maxParameterItems   = 8
	maxParameterBytes   = 512
	maxParameterPart    = 128
	maxPresentationText = 256
)

var (
	ErrInvalidInput         = errors.New("engineer presentation input is invalid")
	ErrUnsupportedLocale    = errors.New("engineer presentation locale is unsupported")
	ErrUnsupportedIntent    = errors.New("engineer presentation intent is unsupported")
	ErrInvalidDecision      = errors.New("engineer presentation decision is invalid")
	ErrUnsupportedParameter = errors.New("engineer presentation parameter is unsupported")
)

type Locale string

const (
	LocaleSpanish          Locale = "es"
	LocaleEnglish          Locale = "en"
	LocaleItalian          Locale = "it"
	LocalePortugueseBrazil Locale = "pt-BR"
)

var supportedLocales = [...]Locale{
	LocaleSpanish,
	LocaleEnglish,
	LocaleItalian,
	LocalePortugueseBrazil,
}

type Role string

const (
	RoleSpotter  Role = "spotter"
	RoleEngineer Role = "engineer"
)

type Channel string

const (
	ChannelSpotter  Channel = "spotter"
	ChannelEngineer Channel = "engineer"
)

type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityWarning  Severity = "warning"
	SeverityCritical Severity = "critical"
)

// Presentation is the single, immutable user-facing representation of one
// policy decision. It deliberately excludes subject, telemetry and identity.
type Presentation struct {
	Version     uint16                 `json:"version"`
	Intent      string                 `json:"intent"`
	Locale      Locale                 `json:"locale"`
	Family      messagepolicy.Family   `json:"family"`
	Role        Role                   `json:"role"`
	Channel     Channel                `json:"channel"`
	Severity    Severity               `json:"severity"`
	VisualText  string                 `json:"visualText"`
	VoiceText   string                 `json:"voiceText"`
	Priority    messagepolicy.Priority `json:"priority"`
	CreatedAtMS int64                  `json:"createdAtMs"`
	ExpiresAtMS int64                  `json:"expiresAtMs"`
}

type phrase struct {
	visual string
	voice  string
}

type definition struct {
	Family        messagepolicy.Family
	Priority      messagepolicy.Priority
	Role          Role
	Channel       Channel
	Severity      Severity
	ParameterKeys map[string]struct{}
}

// Resolver owns a validated, immutable catalog. Its maps are never exposed or
// mutated after construction, so Resolve is safe for concurrent readers.
type Resolver struct {
	definitions map[string]definition
	catalogs    map[Locale]map[string]phrase
}

func NewResolver() (*Resolver, error) {
	resolver := &Resolver{definitions: definitions(), catalogs: catalogs()}
	if err := resolver.validate(); err != nil {
		return nil, err
	}
	return resolver, nil
}

func SupportedLocales() []Locale {
	result := make([]Locale, len(supportedLocales))
	copy(result, supportedLocales[:])
	return result
}

func ParseLocale(value string) (Locale, error) {
	locale := Locale(value)
	if err := validateToken(value, maxIntentBytes); err != nil {
		return "", err
	}
	if !locale.Supported() {
		return "", fmt.Errorf("%w: %q", ErrUnsupportedLocale, value)
	}
	return locale, nil
}

func (locale Locale) Supported() bool {
	for _, supported := range supportedLocales {
		if locale == supported {
			return true
		}
	}
	return false
}

func (resolver *Resolver) Resolve(decision messagepolicy.Decision, locale Locale) (Presentation, error) {
	if resolver == nil {
		return Presentation{}, fmt.Errorf("%w: resolver unavailable", ErrInvalidInput)
	}
	if err := validateToken(string(locale), maxIntentBytes); err != nil {
		return Presentation{}, err
	}
	if !locale.Supported() {
		return Presentation{}, fmt.Errorf("%w: %q", ErrUnsupportedLocale, locale)
	}
	if err := validateToken(decision.Intent, maxIntentBytes); err != nil {
		return Presentation{}, err
	}
	definition, ok := resolver.definitions[decision.Intent]
	if !ok {
		return Presentation{}, fmt.Errorf("%w: %q", ErrUnsupportedIntent, decision.Intent)
	}
	if decision.Version != messagepolicy.ContractVersionV1 || decision.Family != definition.Family ||
		decision.Priority != definition.Priority || decision.CreatedAtMS < 0 || decision.ExpiresAtMS <= decision.CreatedAtMS {
		return Presentation{}, fmt.Errorf("%w: metadata mismatch", ErrInvalidDecision)
	}
	if err := validateParameters(decision.Payload, definition.ParameterKeys); err != nil {
		return Presentation{}, err
	}
	localized, ok := resolver.catalogs[locale][decision.Intent]
	if !ok {
		return Presentation{}, fmt.Errorf("%w: catalog is incomplete", ErrUnsupportedIntent)
	}
	return Presentation{
		Version: ContractVersionV1, Intent: decision.Intent, Locale: locale,
		Family: definition.Family, Role: definition.Role, Channel: definition.Channel,
		Severity: definition.Severity, VisualText: localized.visual, VoiceText: localized.voice,
		Priority: decision.Priority, CreatedAtMS: decision.CreatedAtMS, ExpiresAtMS: decision.ExpiresAtMS,
	}, nil
}

func (resolver *Resolver) validate() error {
	if len(resolver.definitions) != 20 || len(resolver.catalogs) != len(supportedLocales) {
		return fmt.Errorf("%w: incomplete catalog", ErrInvalidInput)
	}
	for intent, definition := range resolver.definitions {
		if err := validateToken(intent, maxIntentBytes); err != nil {
			return err
		}
		if err := validateDefinition(definition); err != nil {
			return fmt.Errorf("%w: %s", err, intent)
		}
	}
	for _, locale := range supportedLocales {
		catalog, ok := resolver.catalogs[locale]
		if !ok || len(catalog) != len(resolver.definitions) {
			return fmt.Errorf("%w: locale %q", ErrInvalidInput, locale)
		}
		for intent := range resolver.definitions {
			localized, exists := catalog[intent]
			if !exists || validateText(localized.visual) != nil || validateText(localized.voice) != nil {
				return fmt.Errorf("%w: locale %q intent %q", ErrInvalidInput, locale, intent)
			}
		}
		for intent := range catalog {
			if _, exists := resolver.definitions[intent]; !exists {
				return fmt.Errorf("%w: extra intent %q", ErrInvalidInput, intent)
			}
		}
	}
	return nil
}

func validateDefinition(value definition) error {
	if value.Role != RoleSpotter && value.Role != RoleEngineer {
		return fmt.Errorf("%w: role", ErrInvalidInput)
	}
	if value.Channel != ChannelSpotter && value.Channel != ChannelEngineer {
		return fmt.Errorf("%w: channel", ErrInvalidInput)
	}
	if value.Severity != SeverityInfo && value.Severity != SeverityWarning && value.Severity != SeverityCritical {
		return fmt.Errorf("%w: severity", ErrInvalidInput)
	}
	if value.Family == messagepolicy.FamilySpotter {
		if value.Role != RoleSpotter || value.Channel != ChannelSpotter || value.Priority != messagepolicy.PrioritySpotter || value.Severity != SeverityCritical {
			return fmt.Errorf("%w: spotter metadata", ErrInvalidInput)
		}
		return nil
	}
	if value.Role != RoleEngineer || value.Channel != ChannelEngineer || value.Severity != severityFor(value.Priority) {
		return fmt.Errorf("%w: engineer metadata", ErrInvalidInput)
	}
	return nil
}

func validateParameters(values map[string]string, allowed map[string]struct{}) error {
	if len(values) > maxParameterItems {
		return fmt.Errorf("%w: too many parameters", ErrInvalidInput)
	}
	total := 0
	for key, value := range values {
		if err := validateToken(key, maxParameterPart); err != nil {
			return err
		}
		if err := validateToken(value, maxParameterPart); err != nil {
			return err
		}
		if _, ok := allowed[key]; !ok {
			return fmt.Errorf("%w: %q", ErrUnsupportedParameter, key)
		}
		total += len(key) + len(value)
		if total > maxParameterBytes {
			return fmt.Errorf("%w: parameters too large", ErrInvalidInput)
		}
	}
	return nil
}

func validateToken(value string, max int) error {
	if value == "" || len(value) > max || strings.ContainsRune(value, 0) {
		return fmt.Errorf("%w: bounded string", ErrInvalidInput)
	}
	return nil
}

func validateText(value string) error {
	if len(value) == 0 || len(value) > maxPresentationText || strings.ContainsRune(value, 0) {
		return ErrInvalidInput
	}
	return nil
}

func severityFor(priority messagepolicy.Priority) Severity {
	if priority == messagepolicy.PrioritySpotter {
		return SeverityCritical
	}
	if priority >= messagepolicy.PriorityPenalty {
		return SeverityWarning
	}
	return SeverityInfo
}

func keySet(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

func definitions() map[string]definition {
	spotter := definition{Family: messagepolicy.FamilySpotter, Priority: messagepolicy.PrioritySpotter, Role: RoleSpotter, Channel: ChannelSpotter, Severity: SeverityCritical, ParameterKeys: keySet()}
	fuel := func(keys ...string) definition {
		return definition{Family: messagepolicy.FamilyFuel, Priority: messagepolicy.PriorityFailureResource, Role: RoleEngineer, Channel: ChannelEngineer, Severity: SeverityWarning, ParameterKeys: keySet(keys...)}
	}
	info := func(family messagepolicy.Family, keys ...string) definition {
		return definition{Family: family, Priority: messagepolicy.PriorityInformation, Role: RoleEngineer, Channel: ChannelEngineer, Severity: SeverityInfo, ParameterKeys: keySet(keys...)}
	}
	return map[string]definition{
		messagepolicy.IntentSpotterCarLeft: spotter, messagepolicy.IntentSpotterCarRight: spotter,
		messagepolicy.IntentSpotterStillThere: spotter, messagepolicy.IntentSpotterClearLeft: spotter,
		messagepolicy.IntentSpotterClearRight: spotter, messagepolicy.IntentSpotterAllClear: spotter,
		messagepolicy.IntentSpotterThreeWide: spotter,
		messagepolicy.IntentFuelHalfTank:     fuel("fuelLitres", "capacity"),
		messagepolicy.IntentFuelOneLitre:     fuel("fuelLitres"), messagepolicy.IntentFuelTwoLitres: fuel("fuelLitres"),
		messagepolicy.IntentFuelLapsFour: fuel("estimatedLapsRemaining"), messagepolicy.IntentFuelLapsThree: fuel("estimatedLapsRemaining"),
		messagepolicy.IntentFuelLapsTwo: fuel("estimatedLapsRemaining"), messagepolicy.IntentFuelLapsOne: fuel("estimatedLapsRemaining"),
		messagepolicy.IntentFuelPitNow:            fuel("fuelLitres", "estimatedLapsRemaining"),
		messagepolicy.IntentPenaltyCountIncreased: {Family: messagepolicy.FamilyPenalties, Priority: messagepolicy.PriorityPenalty, Role: RoleEngineer, Channel: ChannelEngineer, Severity: SeverityWarning, ParameterKeys: keySet()},
		messagepolicy.IntentLapCompleted:          info(messagepolicy.FamilyLaps, "lap"),
		messagepolicy.IntentTimingGapReport:       info(messagepolicy.FamilyTimings, "gapToLeaderSec", "gapToNextSec", "gapStatusAhead", "gapStatusBehind", "sector"),
		messagepolicy.IntentPitEntry:              info(messagepolicy.FamilyPitStops, "lap"),
		messagepolicy.IntentPitExit:               info(messagepolicy.FamilyPitStops, "lap"),
	}
}

func same(value string) phrase { return phrase{visual: value, voice: value} }

func catalogs() map[Locale]map[string]phrase {
	return map[Locale]map[string]phrase{
		LocaleSpanish: {
			messagepolicy.IntentSpotterCarLeft: same("Coche a la izquierda"), messagepolicy.IntentSpotterCarRight: same("Coche a la derecha"),
			messagepolicy.IntentSpotterStillThere: same("Sigue ahí"), messagepolicy.IntentSpotterClearLeft: same("Libre por la izquierda"),
			messagepolicy.IntentSpotterClearRight: same("Libre por la derecha"), messagepolicy.IntentSpotterAllClear: same("Pista libre"),
			messagepolicy.IntentSpotterThreeWide: same("Tres coches en paralelo"), messagepolicy.IntentFuelHalfTank: same("Queda medio depósito"),
			messagepolicy.IntentFuelOneLitre: same("Queda un litro"), messagepolicy.IntentFuelTwoLitres: same("Quedan dos litros"),
			messagepolicy.IntentFuelLapsFour: same("Queda combustible para cuatro vueltas"), messagepolicy.IntentFuelLapsThree: same("Queda combustible para tres vueltas"),
			messagepolicy.IntentFuelLapsTwo: same("Queda combustible para dos vueltas"), messagepolicy.IntentFuelLapsOne: same("Queda combustible para una vuelta"),
			messagepolicy.IntentFuelPitNow: same("Combustible crítico, entra en boxes"), messagepolicy.IntentPenaltyCountIncreased: same("Hay una nueva penalización pendiente"),
			messagepolicy.IntentLapCompleted: same("Vuelta completada"), messagepolicy.IntentTimingGapReport: same("Diferencias actualizadas"),
			messagepolicy.IntentPitEntry: same("Entrando en boxes"), messagepolicy.IntentPitExit: same("Saliendo de boxes"),
		},
		LocaleEnglish: {
			messagepolicy.IntentSpotterCarLeft: same("Car left"), messagepolicy.IntentSpotterCarRight: same("Car right"),
			messagepolicy.IntentSpotterStillThere: same("Still there"), messagepolicy.IntentSpotterClearLeft: same("Clear on the left"),
			messagepolicy.IntentSpotterClearRight: same("Clear on the right"), messagepolicy.IntentSpotterAllClear: same("All clear"),
			messagepolicy.IntentSpotterThreeWide: same("Three wide"), messagepolicy.IntentFuelHalfTank: same("Half a tank remaining"),
			messagepolicy.IntentFuelOneLitre: same("One litre remaining"), messagepolicy.IntentFuelTwoLitres: same("Two litres remaining"),
			messagepolicy.IntentFuelLapsFour: same("Four laps of fuel remaining"), messagepolicy.IntentFuelLapsThree: same("Three laps of fuel remaining"),
			messagepolicy.IntentFuelLapsTwo: same("Two laps of fuel remaining"), messagepolicy.IntentFuelLapsOne: same("One lap of fuel remaining"),
			messagepolicy.IntentFuelPitNow: same("Fuel critical, pit now"), messagepolicy.IntentPenaltyCountIncreased: same("A new penalty is pending"),
			messagepolicy.IntentLapCompleted: same("Lap completed"), messagepolicy.IntentTimingGapReport: same("Gaps updated"),
			messagepolicy.IntentPitEntry: same("Entering the pits"), messagepolicy.IntentPitExit: same("Leaving the pits"),
		},
		LocaleItalian: {
			messagepolicy.IntentSpotterCarLeft: same("Auto a sinistra"), messagepolicy.IntentSpotterCarRight: same("Auto a destra"),
			messagepolicy.IntentSpotterStillThere: same("È ancora lì"), messagepolicy.IntentSpotterClearLeft: same("Libero a sinistra"),
			messagepolicy.IntentSpotterClearRight: same("Libero a destra"), messagepolicy.IntentSpotterAllClear: same("Tutto libero"),
			messagepolicy.IntentSpotterThreeWide: same("Tre auto affiancate"), messagepolicy.IntentFuelHalfTank: same("Rimane metà serbatoio"),
			messagepolicy.IntentFuelOneLitre: same("Rimane un litro"), messagepolicy.IntentFuelTwoLitres: same("Rimangono due litri"),
			messagepolicy.IntentFuelLapsFour: same("Carburante per quattro giri"), messagepolicy.IntentFuelLapsThree: same("Carburante per tre giri"),
			messagepolicy.IntentFuelLapsTwo: same("Carburante per due giri"), messagepolicy.IntentFuelLapsOne: same("Carburante per un giro"),
			messagepolicy.IntentFuelPitNow: same("Carburante critico, rientra ai box"), messagepolicy.IntentPenaltyCountIncreased: same("C'è una nuova penalità da scontare"),
			messagepolicy.IntentLapCompleted: same("Giro completato"), messagepolicy.IntentTimingGapReport: same("Distacchi aggiornati"),
			messagepolicy.IntentPitEntry: same("Ingresso ai box"), messagepolicy.IntentPitExit: same("Uscita dai box"),
		},
		LocalePortugueseBrazil: {
			messagepolicy.IntentSpotterCarLeft: same("Carro à esquerda"), messagepolicy.IntentSpotterCarRight: same("Carro à direita"),
			messagepolicy.IntentSpotterStillThere: same("Ainda está aí"), messagepolicy.IntentSpotterClearLeft: same("Livre à esquerda"),
			messagepolicy.IntentSpotterClearRight: same("Livre à direita"), messagepolicy.IntentSpotterAllClear: same("Tudo livre"),
			messagepolicy.IntentSpotterThreeWide: same("Três carros lado a lado"), messagepolicy.IntentFuelHalfTank: same("Resta meio tanque"),
			messagepolicy.IntentFuelOneLitre: same("Resta um litro"), messagepolicy.IntentFuelTwoLitres: same("Restam dois litros"),
			messagepolicy.IntentFuelLapsFour: same("Combustível para quatro voltas"), messagepolicy.IntentFuelLapsThree: same("Combustível para três voltas"),
			messagepolicy.IntentFuelLapsTwo: same("Combustível para duas voltas"), messagepolicy.IntentFuelLapsOne: same("Combustível para uma volta"),
			messagepolicy.IntentFuelPitNow: same("Combustível crítico, entre nos boxes"), messagepolicy.IntentPenaltyCountIncreased: same("Há uma nova penalização pendente"),
			messagepolicy.IntentLapCompleted: same("Volta concluída"), messagepolicy.IntentTimingGapReport: same("Diferenças atualizadas"),
			messagepolicy.IntentPitEntry: same("Entrando nos boxes"), messagepolicy.IntentPitExit: same("Saindo dos boxes"),
		},
	}
}
