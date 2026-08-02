package commands

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode"
	"unicode/utf8"
)

const ContractVersionV1 = "engineer.commands.v1"

var (
	ErrInvalidCatalog   = errors.New("engineer command catalog is invalid")
	ErrAmbiguousCatalog = errors.New("engineer command catalog is ambiguous")
)

var allowedIntentIDsV1 = map[string]struct{}{
	"query.fuel": {}, "query.virtual_energy": {}, "query.position": {}, "query.lap": {},
	"query.gap": {}, "query.tyres": {}, "query.damage": {}, "query.race_time": {},
	"query.rival.by_number": {}, "query.rival.by_name": {}, "query.strategy": {},
	"query.pit_status": {}, "query.car_status": {}, "query.penalties": {},
	"action.pit.request": {}, "action.pit.abort": {}, "action.pit.set_fuel": {},
	"action.pit.change_tyres": {}, "action.strategy.accept": {}, "action.strategy.reject": {},
}

type Locale string

const (
	LocaleSpanish          Locale = "es"
	LocaleEnglish          Locale = "en"
	LocaleItalian          Locale = "it"
	LocalePortugueseBrazil Locale = "pt-BR"
)

type IntentKind string

const (
	KindQuery  IntentKind = "query"
	KindAction IntentKind = "action"
)

type SlotType string

const (
	SlotEnum    SlotType = "enum"
	SlotInteger SlotType = "integer"
	SlotDecimal SlotType = "decimal"
	SlotText    SlotType = "text"
)

type EnumValue struct {
	Value   string              `json:"value"`
	Aliases map[Locale][]string `json:"aliases"`
}

type SlotDefinition struct {
	Name          string      `json:"name"`
	Type          SlotType    `json:"type"`
	Required      bool        `json:"required"`
	Sensitive     bool        `json:"sensitive,omitempty"`
	CanonicalUnit string      `json:"canonical_unit,omitempty"`
	HasRange      bool        `json:"has_range,omitempty"`
	Minimum       float64     `json:"minimum,omitempty"`
	Maximum       float64     `json:"maximum,omitempty"`
	EnumValues    []EnumValue `json:"enum_values,omitempty"`
}

type IntentDefinition struct {
	ID                   string              `json:"id"`
	Kind                 IntentKind          `json:"kind"`
	Mutable              bool                `json:"mutable"`
	RequiresConfirmation bool                `json:"requires_confirmation"`
	Preconditions        []string            `json:"preconditions"`
	ResponseKey          string              `json:"response_key"`
	Slots                []SlotDefinition    `json:"slots,omitempty"`
	Phrases              map[Locale][]string `json:"phrases"`
}

type DialogueTerms struct {
	Confirm map[Locale][]string `json:"confirm"`
	Cancel  map[Locale][]string `json:"cancel"`
}

type Catalog struct {
	Version   string             `json:"version"`
	WakeWords map[Locale]string  `json:"wake_words"`
	Dialogue  DialogueTerms      `json:"dialogue"`
	Intents   []IntentDefinition `json:"intents"`
}

func SupportedLocales() []Locale {
	return []Locale{LocaleSpanish, LocaleEnglish, LocaleItalian, LocalePortugueseBrazil}
}

func ParseCatalog(data []byte) (Catalog, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var catalog Catalog
	if err := decoder.Decode(&catalog); err != nil {
		return Catalog{}, fmt.Errorf("%w: decode: %v", ErrInvalidCatalog, err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return Catalog{}, fmt.Errorf("%w: trailing JSON", ErrInvalidCatalog)
	}
	if err := catalog.Validate(); err != nil {
		return Catalog{}, err
	}
	return catalog, nil
}

func (catalog Catalog) Validate() error {
	if catalog.Version != ContractVersionV1 {
		return fmt.Errorf("%w: version %q", ErrInvalidCatalog, catalog.Version)
	}
	if len(catalog.Intents) != len(allowedIntentIDsV1) {
		return fmt.Errorf("%w: got %d intents, want %d", ErrInvalidCatalog, len(catalog.Intents), len(allowedIntentIDsV1))
	}
	if err := validateLocaleMap(catalog.WakeWords, "wake word", func(value string) bool {
		return validText(value, 64)
	}); err != nil {
		return err
	}
	if err := validateDialogue(catalog.Dialogue); err != nil {
		return err
	}

	intentIDs := make(map[string]struct{}, len(catalog.Intents))
	phrases := make(map[string]string)
	for _, intent := range catalog.Intents {
		if !validIdentifier(intent.ID) || !validIdentifier(intent.ResponseKey) {
			return fmt.Errorf("%w: invalid intent or response key", ErrInvalidCatalog)
		}
		if _, allowed := allowedIntentIDsV1[intent.ID]; !allowed {
			return fmt.Errorf("%w: intent %q is not in v1", ErrInvalidCatalog, intent.ID)
		}
		if _, exists := intentIDs[intent.ID]; exists {
			return fmt.Errorf("%w: duplicate intent %q", ErrInvalidCatalog, intent.ID)
		}
		intentIDs[intent.ID] = struct{}{}
		if err := validateIntent(intent, phrases); err != nil {
			return err
		}
	}
	return nil
}

func validateIntent(intent IntentDefinition, phrases map[string]string) error {
	switch intent.Kind {
	case KindQuery:
		if intent.Mutable || intent.RequiresConfirmation {
			return fmt.Errorf("%w: query %q mutates or confirms", ErrInvalidCatalog, intent.ID)
		}
	case KindAction:
		if !intent.Mutable || !intent.RequiresConfirmation {
			return fmt.Errorf("%w: action %q is not confirmable", ErrInvalidCatalog, intent.ID)
		}
	default:
		return fmt.Errorf("%w: intent %q has kind %q", ErrInvalidCatalog, intent.ID, intent.Kind)
	}
	if len(intent.Preconditions) == 0 {
		return fmt.Errorf("%w: intent %q has no preconditions", ErrInvalidCatalog, intent.ID)
	}
	for _, precondition := range intent.Preconditions {
		if !validIdentifier(precondition) {
			return fmt.Errorf("%w: intent %q has invalid precondition", ErrInvalidCatalog, intent.ID)
		}
	}

	slots := make(map[string]SlotDefinition, len(intent.Slots))
	for _, slot := range intent.Slots {
		if err := validateSlot(slot); err != nil {
			return fmt.Errorf("%w: intent %q: %v", ErrInvalidCatalog, intent.ID, err)
		}
		if _, exists := slots[slot.Name]; exists {
			return fmt.Errorf("%w: intent %q duplicates slot %q", ErrInvalidCatalog, intent.ID, slot.Name)
		}
		slots[slot.Name] = slot
	}

	for _, locale := range SupportedLocales() {
		localePhrases, ok := intent.Phrases[locale]
		if !ok || len(localePhrases) == 0 {
			return fmt.Errorf("%w: intent %q lacks locale %q", ErrInvalidCatalog, intent.ID, locale)
		}
		for _, phrase := range localePhrases {
			if !validText(phrase, 256) {
				return fmt.Errorf("%w: intent %q has invalid phrase", ErrInvalidCatalog, intent.ID)
			}
			if err := validateTemplate(phrase, slots); err != nil {
				return fmt.Errorf("%w: intent %q: %v", ErrInvalidCatalog, intent.ID, err)
			}
			key := string(locale) + "\x00" + canonicalizeText(phrase)
			if previous, exists := phrases[key]; exists {
				return fmt.Errorf("%w: %q and %q share a phrase", ErrAmbiguousCatalog, previous, intent.ID)
			}
			phrases[key] = intent.ID
		}
	}
	if len(intent.Phrases) != len(SupportedLocales()) {
		return fmt.Errorf("%w: intent %q has unsupported locale", ErrInvalidCatalog, intent.ID)
	}
	return nil
}

func validateSlot(slot SlotDefinition) error {
	if !validIdentifier(slot.Name) || !slot.Required {
		return fmt.Errorf("slot %q must be named and required", slot.Name)
	}
	switch slot.Type {
	case SlotEnum:
		if len(slot.EnumValues) == 0 {
			return fmt.Errorf("enum slot %q has no values", slot.Name)
		}
		seen := make(map[string]struct{}, len(slot.EnumValues))
		for _, value := range slot.EnumValues {
			if !validIdentifier(value.Value) {
				return fmt.Errorf("enum slot %q has invalid value", slot.Name)
			}
			if _, exists := seen[value.Value]; exists {
				return fmt.Errorf("enum slot %q duplicates value", slot.Name)
			}
			seen[value.Value] = struct{}{}
			if err := validateLocaleMap(value.Aliases, "enum alias", func(aliases []string) bool {
				if len(aliases) == 0 {
					return false
				}
				for _, alias := range aliases {
					wordCount := len(strings.Fields(alias))
					if !validText(alias, 64) || wordCount == 0 || wordCount > 4 {
						return false
					}
				}
				return true
			}); err != nil {
				return err
			}
		}
	case SlotInteger, SlotDecimal:
		if !slot.HasRange || slot.Minimum > slot.Maximum {
			return fmt.Errorf("numeric slot %q has invalid range", slot.Name)
		}
		if slot.CanonicalUnit != "" && !validIdentifier(slot.CanonicalUnit) {
			return fmt.Errorf("numeric slot %q has invalid unit", slot.Name)
		}
	case SlotText:
		if slot.HasRange || len(slot.EnumValues) != 0 {
			return fmt.Errorf("text slot %q has numeric or enum constraints", slot.Name)
		}
	default:
		return fmt.Errorf("slot %q has unknown type %q", slot.Name, slot.Type)
	}
	return nil
}

func validateTemplate(phrase string, slots map[string]SlotDefinition) error {
	found := make(map[string]int)
	tokens := strings.Fields(canonicalizeText(phrase))
	for index, token := range tokens {
		if !strings.HasPrefix(token, "{") && !strings.HasSuffix(token, "}") {
			continue
		}
		if len(token) < 3 || token[0] != '{' || token[len(token)-1] != '}' {
			return errors.New("malformed slot placeholder")
		}
		name := token[1 : len(token)-1]
		slot, exists := slots[name]
		if !exists {
			return fmt.Errorf("unknown slot placeholder %q", name)
		}
		found[name]++
		if (slot.Type == SlotText || slotHasMultiWordAlias(slot)) && index != len(tokens)-1 {
			return fmt.Errorf("multi-word slot %q must terminate its phrase", name)
		}
	}
	for name := range slots {
		if found[name] != 1 {
			return fmt.Errorf("slot %q must appear exactly once", name)
		}
	}
	return nil
}

func slotHasMultiWordAlias(slot SlotDefinition) bool {
	for _, value := range slot.EnumValues {
		for _, aliases := range value.Aliases {
			for _, alias := range aliases {
				if len(strings.Fields(alias)) > 1 {
					return true
				}
			}
		}
	}
	return false
}

func validateDialogue(dialogue DialogueTerms) error {
	seen := make(map[string]DialogueIntent)
	for _, terms := range []struct {
		kind   DialogueIntent
		values map[Locale][]string
	}{
		{DialogueConfirm, dialogue.Confirm},
		{DialogueCancel, dialogue.Cancel},
	} {
		if err := validateLocaleMap(terms.values, "dialogue term", func(values []string) bool {
			return len(values) > 0
		}); err != nil {
			return err
		}
		for locale, values := range terms.values {
			for _, value := range values {
				if !validText(value, 64) {
					return fmt.Errorf("%w: invalid dialogue term", ErrInvalidCatalog)
				}
				key := string(locale) + "\x00" + canonicalizeText(value)
				if previous, exists := seen[key]; exists && previous != terms.kind {
					return fmt.Errorf("%w: dialogue term has two meanings", ErrAmbiguousCatalog)
				}
				seen[key] = terms.kind
			}
		}
	}
	return nil
}

func validateLocaleMap[T any](values map[Locale]T, label string, valid func(T) bool) error {
	if len(values) != len(SupportedLocales()) {
		return fmt.Errorf("%w: %s locales", ErrInvalidCatalog, label)
	}
	for _, locale := range SupportedLocales() {
		value, exists := values[locale]
		if !exists || !valid(value) {
			return fmt.Errorf("%w: %s for %q", ErrInvalidCatalog, label, locale)
		}
	}
	return nil
}

func validIdentifier(value string) bool {
	if value == "" || len(value) > 128 || !utf8.ValidString(value) {
		return false
	}
	for _, r := range value {
		if !(r == '.' || r == '_' || r == '-' || unicode.IsLower(r) || unicode.IsDigit(r)) {
			return false
		}
	}
	return true
}

func validText(value string, maxBytes int) bool {
	if strings.TrimSpace(value) == "" || len(value) > maxBytes || !utf8.ValidString(value) {
		return false
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

func DefaultCatalogV1() Catalog {
	return Catalog{
		Version: ContractVersionV1,
		WakeWords: map[Locale]string{
			LocaleSpanish: "Ingeniero", LocaleEnglish: "Engineer",
			LocaleItalian: "Ingegnere", LocalePortugueseBrazil: "Engenheiro",
		},
		Dialogue: DialogueTerms{
			Confirm: localized([]string{"confirmar", "sí"}, []string{"confirm", "yes"}, []string{"conferma", "sì"}, []string{"confirmar", "sim"}),
			Cancel:  localized([]string{"cancelar", "no"}, []string{"cancel", "no"}, []string{"annulla", "no"}, []string{"cancelar", "não"}),
		},
		Intents: []IntentDefinition{
			query("query.fuel", "capability.fuel", "response.fuel", noSlots(), localized(
				[]string{"cuánto combustible queda", "dime el combustible"}, []string{"how much fuel is left", "tell me the fuel"},
				[]string{"quanto carburante resta", "dimmi il carburante"}, []string{"quanto combustível resta", "diga o combustível"})),
			query("query.virtual_energy", "capability.virtual_energy", "response.virtual_energy", noSlots(), localized(
				[]string{"cuánta energía virtual queda", "dime la energía virtual"}, []string{"how much virtual energy is left", "tell me the virtual energy"},
				[]string{"quanta energia virtuale resta", "dimmi l energia virtuale"}, []string{"quanta energia virtual resta", "diga a energia virtual"})),
			query("query.position", "capability.position", "response.position", noSlots(), localized(
				[]string{"cuál es mi posición", "dime mi posición"}, []string{"what is my position", "tell me my position"},
				[]string{"qual è la mia posizione", "dimmi la mia posizione"}, []string{"qual é a minha posição", "diga a minha posição"})),
			query("query.lap", "capability.lap", "response.lap", noSlots(), localized(
				[]string{"en qué vuelta estoy", "dime la vuelta"}, []string{"what lap am i on", "tell me the lap"},
				[]string{"a che giro sono", "dimmi il giro"}, []string{"em que volta estou", "diga a volta"})),
			query("query.gap", "capability.gaps", "response.gap", []SlotDefinition{gapTargetSlot()}, localized(
				[]string{"cuál es la diferencia con {target}"}, []string{"what is the gap to {target}"},
				[]string{"qual è il distacco da {target}"}, []string{"qual é a diferença para {target}"})),
			query("query.tyres", "capability.tyres", "response.tyres", noSlots(), localized(
				[]string{"cómo están los neumáticos", "dime los neumáticos"}, []string{"how are the tyres", "tell me about the tyres"},
				[]string{"come sono le gomme", "dimmi delle gomme"}, []string{"como estão os pneus", "diga como estão os pneus"})),
			query("query.damage", "capability.damage", "response.damage", noSlots(), localized(
				[]string{"qué daños tiene el coche", "dime los daños"}, []string{"what damage does the car have", "tell me the damage"},
				[]string{"quali danni ha la macchina", "dimmi i danni"}, []string{"quais danos o carro tem", "diga os danos"})),
			query("query.race_time", "capability.race_time", "response.race_time", noSlots(), localized(
				[]string{"cuánto tiempo queda", "dime el tiempo restante"}, []string{"how much time is left", "tell me the remaining time"},
				[]string{"quanto tempo resta", "dimmi il tempo rimanente"}, []string{"quanto tempo resta", "diga o tempo restante"})),
			query("query.rival.by_number", "capability.grid_identity", "response.rival", []SlotDefinition{numberSlot()}, localized(
				[]string{"dime cómo va el coche {car_number}"}, []string{"tell me about car {car_number}"},
				[]string{"dimmi come va la macchina {car_number}"}, []string{"fale sobre o carro {car_number}"})),
			query("query.rival.by_name", "capability.grid_identity", "response.rival", []SlotDefinition{nameSlot()}, localized(
				[]string{"dime cómo va el piloto {driver_name}"}, []string{"tell me about driver {driver_name}"},
				[]string{"dimmi come va il pilota {driver_name}"}, []string{"fale sobre o piloto {driver_name}"})),
			query("query.strategy", "capability.strategy", "response.strategy", noSlots(), localized(
				[]string{"cuál es la estrategia", "dime el plan"}, []string{"what is the strategy", "tell me the plan"},
				[]string{"qual è la strategia", "dimmi il piano"}, []string{"qual é a estratégia", "diga o plano"})),
			query("query.pit_status", "capability.pit_status", "response.pit_status", noSlots(), localized(
				[]string{"cuál es el estado de boxes", "dime la parada preparada"}, []string{"what is the pit status", "tell me the prepared stop"},
				[]string{"qual è lo stato dei box", "dimmi la sosta preparata"}, []string{"qual é o estado dos boxes", "diga a parada preparada"})),
			query("query.car_status", "capability.car_status", "response.car_status", noSlots(), localized(
				[]string{"cuál es el estado del coche", "dime el estado del coche"}, []string{"what is the car status", "tell me the car status"},
				[]string{"qual è lo stato della macchina", "dimmi lo stato della macchina"}, []string{"qual é o estado do carro", "diga o estado do carro"})),
			query("query.penalties", "capability.penalties", "response.penalties", noSlots(), localized(
				[]string{"tengo alguna penalización", "dime las penalizaciones"}, []string{"do i have a penalty", "tell me the penalties"},
				[]string{"ho una penalità", "dimmi le penalità"}, []string{"tenho alguma penalidade", "diga as penalidades"})),
			action("action.pit.request", "capability.pit_actions", "response.pit_request", noSlots(), localized(
				[]string{"solicita la parada en boxes", "entra en boxes esta vuelta"}, []string{"request the pit stop", "box this lap"},
				[]string{"richiedi la sosta ai box", "rientra ai box questo giro"}, []string{"solicite a parada nos boxes", "entre nos boxes nesta volta"})),
			action("action.pit.abort", "capability.pit_actions", "response.pit_abort", noSlots(), localized(
				[]string{"cancela la parada en boxes"}, []string{"abort the pit stop"},
				[]string{"annulla la sosta ai box"}, []string{"cancele a parada nos boxes"})),
			action("action.pit.set_fuel", "capability.pit_fuel", "response.pit_fuel", []SlotDefinition{fuelAmountSlot()}, localized(
				[]string{"configura {amount} litros de combustible"}, []string{"set pit fuel to {amount} litres"},
				[]string{"imposta {amount} litri di carburante"}, []string{"configure {amount} litros de combustível"})),
			action("action.pit.change_tyres", "capability.pit_tyres", "response.pit_tyres", []SlotDefinition{compoundSlot()}, localized(
				[]string{"configura neumáticos {compound}"}, []string{"set {compound} tyres"},
				[]string{"imposta gomme {compound}"}, []string{"configure pneus {compound}"})),
			action("action.strategy.accept", "capability.strategy_proposal", "response.strategy_accept", noSlots(), localized(
				[]string{"acepta la estrategia"}, []string{"accept the strategy"},
				[]string{"accetta la strategia"}, []string{"aceite a estratégia"})),
			action("action.strategy.reject", "capability.strategy_proposal", "response.strategy_reject", noSlots(), localized(
				[]string{"rechaza la estrategia"}, []string{"reject the strategy"},
				[]string{"rifiuta la strategia"}, []string{"rejeite a estratégia"})),
		},
	}
}

func localized[T any](es, en, it, pt T) map[Locale]T {
	return map[Locale]T{LocaleSpanish: es, LocaleEnglish: en, LocaleItalian: it, LocalePortugueseBrazil: pt}
}

func noSlots() []SlotDefinition { return nil }

func query(id, precondition, response string, slots []SlotDefinition, phrases map[Locale][]string) IntentDefinition {
	return IntentDefinition{ID: id, Kind: KindQuery, Preconditions: []string{precondition}, ResponseKey: response, Slots: slots, Phrases: phrases}
}

func action(id, precondition, response string, slots []SlotDefinition, phrases map[Locale][]string) IntentDefinition {
	return IntentDefinition{ID: id, Kind: KindAction, Mutable: true, RequiresConfirmation: true, Preconditions: []string{precondition}, ResponseKey: response, Slots: slots, Phrases: phrases}
}

func gapTargetSlot() SlotDefinition {
	return SlotDefinition{Name: "target", Type: SlotEnum, Required: true, EnumValues: []EnumValue{
		{Value: "ahead", Aliases: localized([]string{"delante"}, []string{"ahead"}, []string{"davanti"}, []string{"frente"})},
		{Value: "behind", Aliases: localized([]string{"detrás"}, []string{"behind"}, []string{"dietro"}, []string{"atrás"})},
		{Value: "class_leader", Aliases: localized([]string{"líder de clase"}, []string{"class leader"}, []string{"leader di classe"}, []string{"líder da classe"})},
	}}
}

func numberSlot() SlotDefinition {
	return SlotDefinition{Name: "car_number", Type: SlotInteger, Required: true, HasRange: true, Minimum: 0, Maximum: 999}
}

func nameSlot() SlotDefinition {
	return SlotDefinition{Name: "driver_name", Type: SlotText, Required: true, Sensitive: true}
}

func fuelAmountSlot() SlotDefinition {
	return SlotDefinition{Name: "amount", Type: SlotDecimal, Required: true, CanonicalUnit: "litre", HasRange: true, Minimum: 0, Maximum: 200}
}

func compoundSlot() SlotDefinition {
	return SlotDefinition{Name: "compound", Type: SlotEnum, Required: true, EnumValues: []EnumValue{
		{Value: "soft", Aliases: localized([]string{"blandos"}, []string{"soft"}, []string{"morbide"}, []string{"macios"})},
		{Value: "medium", Aliases: localized([]string{"medios"}, []string{"medium"}, []string{"medie"}, []string{"médios"})},
		{Value: "hard", Aliases: localized([]string{"duros"}, []string{"hard"}, []string{"dure"}, []string{"duros"})},
		{Value: "wet", Aliases: localized([]string{"mojados"}, []string{"wet"}, []string{"bagnate"}, []string{"molhados"})},
	}}
}
