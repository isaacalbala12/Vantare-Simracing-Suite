package commands

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	maxInputBytes = 512
	ReadinessNoGo = "NO-GO"
)

var (
	ErrInvalidInput     = errors.New("engineer command input is invalid")
	ErrUnknownUtterance = errors.New("engineer command utterance is unknown")
	ErrAmbiguousInput   = errors.New("engineer command utterance is ambiguous")
	ErrInvalidSlot      = errors.New("engineer command slot is invalid")
)

type DialogueIntent string

const (
	DialogueConfirm DialogueIntent = "confirm"
	DialogueCancel  DialogueIntent = "cancel"
)

type Match struct {
	IntentID             string
	Kind                 IntentKind
	RequiresConfirmation bool
	Slots                map[string]string
}

// TextHarness exercises the catalog contract using text only. It is not the
// product speech router and it never performs STT, PTT, audio or game actions.
type TextHarness struct {
	catalog Catalog
}

func NewTextHarness(catalog Catalog) (*TextHarness, error) {
	if err := catalog.Validate(); err != nil {
		return nil, err
	}
	encoded, err := jsonMarshalCatalog(catalog)
	if err != nil {
		return nil, err
	}
	owned, err := ParseCatalog(encoded)
	if err != nil {
		return nil, err
	}
	return &TextHarness{catalog: owned}, nil
}

func (harness *TextHarness) Match(locale Locale, text string) (Match, error) {
	if harness == nil || !supportedLocale(locale) || !validInput(text) {
		return Match{}, ErrInvalidInput
	}
	input := canonicalizeText(text)
	if input == "" {
		return Match{}, ErrInvalidInput
	}

	var matches []Match
	var slotErr error
	for _, intent := range harness.catalog.Intents {
		for _, phrase := range intent.Phrases[locale] {
			slots, structuralMatch, err := matchTemplate(locale, input, phrase, intent.Slots)
			if err != nil {
				if structuralMatch {
					slotErr = err
				}
				continue
			}
			if structuralMatch {
				matches = append(matches, Match{
					IntentID: intent.ID, Kind: intent.Kind,
					RequiresConfirmation: intent.RequiresConfirmation,
					Slots:                slots,
				})
			}
		}
	}
	if len(matches) == 0 {
		if slotErr != nil {
			return Match{}, slotErr
		}
		return Match{}, ErrUnknownUtterance
	}
	first := matches[0]
	for _, candidate := range matches[1:] {
		if candidate.IntentID != first.IntentID || !equalSlots(candidate.Slots, first.Slots) {
			return Match{}, ErrAmbiguousInput
		}
	}
	return first, nil
}

func (harness *TextHarness) MatchDialogue(locale Locale, text string) (DialogueIntent, error) {
	if harness == nil || !supportedLocale(locale) || !validInput(text) {
		return "", ErrInvalidInput
	}
	input := canonicalizeText(text)
	var matched DialogueIntent
	for _, terms := range []struct {
		intent DialogueIntent
		values []string
	}{
		{DialogueConfirm, harness.catalog.Dialogue.Confirm[locale]},
		{DialogueCancel, harness.catalog.Dialogue.Cancel[locale]},
	} {
		for _, term := range terms.values {
			if input != canonicalizeText(term) {
				continue
			}
			if matched != "" && matched != terms.intent {
				return "", ErrAmbiguousInput
			}
			matched = terms.intent
		}
	}
	if matched == "" {
		return "", ErrUnknownUtterance
	}
	return matched, nil
}

func matchTemplate(locale Locale, input, phrase string, slots []SlotDefinition) (map[string]string, bool, error) {
	patternTokens := strings.Fields(canonicalizeText(phrase))
	inputTokens := strings.Fields(input)
	definitions := make(map[string]SlotDefinition, len(slots))
	for _, slot := range slots {
		definitions[slot.Name] = slot
	}

	values := make(map[string]string, len(slots))
	inputIndex := 0
	for patternIndex, patternToken := range patternTokens {
		if placeholder, ok := placeholderName(patternToken); ok {
			slot := definitions[placeholder]
			if inputIndex >= len(inputTokens) {
				return nil, false, nil
			}
			captured := inputTokens[inputIndex]
			if slot.Type == SlotText || (slot.Type == SlotEnum && patternIndex == len(patternTokens)-1) {
				captured = strings.Join(inputTokens[inputIndex:], " ")
				inputIndex = len(inputTokens)
			} else {
				inputIndex++
			}
			value, err := validateSlotValue(locale, slot, captured)
			if err != nil {
				if slot.Type == SlotEnum {
					return nil, false, nil
				}
				return nil, literalStructureMatches(patternTokens, inputTokens, patternIndex), err
			}
			values[slot.Name] = value
			continue
		}
		if inputIndex >= len(inputTokens) || inputTokens[inputIndex] != patternToken {
			return nil, false, nil
		}
		inputIndex++
	}
	if inputIndex != len(inputTokens) {
		return nil, false, nil
	}
	return values, true, nil
}

func literalStructureMatches(pattern, input []string, placeholderIndex int) bool {
	if placeholderIndex >= len(pattern) || placeholderIndex >= len(input) {
		return false
	}
	for index := 0; index < placeholderIndex; index++ {
		if pattern[index] != input[index] {
			return false
		}
	}
	if placeholderIndex == len(pattern)-1 {
		return len(input) >= len(pattern)
	}
	if len(pattern) != len(input) {
		return false
	}
	for index := placeholderIndex + 1; index < len(pattern); index++ {
		if pattern[index] != input[index] {
			return false
		}
	}
	return true
}

func validateSlotValue(locale Locale, slot SlotDefinition, raw string) (string, error) {
	switch slot.Type {
	case SlotEnum:
		value := canonicalizeText(raw)
		for _, candidate := range slot.EnumValues {
			for _, alias := range candidate.Aliases[locale] {
				if value == canonicalizeText(alias) {
					return candidate.Value, nil
				}
			}
		}
		return "", ErrInvalidSlot
	case SlotInteger:
		if !validUnsignedInteger(raw) {
			return "", ErrInvalidSlot
		}
		value, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || float64(value) < slot.Minimum || float64(value) > slot.Maximum {
			return "", ErrInvalidSlot
		}
		// A racing number is a numeric identity, not a quantity. Keep leading
		// zeroes after validating its numeric range so #007 never becomes #7.
		return raw, nil
	case SlotDecimal:
		separator := byte('.')
		if locale != LocaleEnglish {
			separator = ','
		}
		if !validUnsignedDecimal(raw, separator) {
			return "", ErrInvalidSlot
		}
		normalized := raw
		if locale != LocaleEnglish {
			normalized = strings.ReplaceAll(normalized, ",", ".")
		}
		value, err := strconv.ParseFloat(normalized, 64)
		if err != nil || value < slot.Minimum || value > slot.Maximum {
			return "", ErrInvalidSlot
		}
		return strconv.FormatFloat(value, 'f', -1, 64), nil
	case SlotText:
		value := strings.TrimSpace(raw)
		if !validText(value, 64) || strings.ContainsAny(value, "{}") {
			return "", ErrInvalidSlot
		}
		return value, nil
	default:
		return "", ErrInvalidSlot
	}
}

func validUnsignedInteger(value string) bool {
	if value == "" {
		return false
	}
	for index := range value {
		if value[index] < '0' || value[index] > '9' {
			return false
		}
	}
	return true
}

func validUnsignedDecimal(value string, separator byte) bool {
	if value == "" {
		return false
	}
	separatorIndex := -1
	for index := range value {
		character := value[index]
		if character >= '0' && character <= '9' {
			continue
		}
		if character != separator || separatorIndex >= 0 {
			return false
		}
		separatorIndex = index
	}
	return separatorIndex != 0 && separatorIndex != len(value)-1
}

func placeholderName(token string) (string, bool) {
	if len(token) < 3 || token[0] != '{' || token[len(token)-1] != '}' {
		return "", false
	}
	return token[1 : len(token)-1], true
}

func validInput(value string) bool {
	if strings.TrimSpace(value) == "" || len(value) > maxInputBytes || !utf8.ValidString(value) {
		return false
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

func canonicalizeText(value string) string {
	runes := []rune(strings.ToLower(value))
	var builder strings.Builder
	builder.Grow(len(value))
	space := true
	for index, r := range runes {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r), r == '{', r == '}', r == '_':
			builder.WriteRune(r)
			space = false
		case (r == '.' || r == ',') && index > 0 && index+1 < len(runes) &&
			unicode.IsDigit(runes[index-1]) && unicode.IsDigit(runes[index+1]):
			builder.WriteRune(r)
			space = false
		case (r == '-' || r == '+' || r == '−') && index+1 < len(runes) && unicode.IsDigit(runes[index+1]):
			builder.WriteRune(r)
			space = false
		default:
			if !space {
				builder.WriteByte(' ')
				space = true
			}
		}
	}
	return strings.TrimSpace(builder.String())
}

func supportedLocale(locale Locale) bool {
	for _, supported := range SupportedLocales() {
		if locale == supported {
			return true
		}
	}
	return false
}

func equalSlots(left, right map[string]string) bool {
	if len(left) != len(right) {
		return false
	}
	for key, value := range left {
		if right[key] != value {
			return false
		}
	}
	return true
}

type SanitizedResult struct {
	SchemaVersion    string   `json:"schema_version"`
	CaseRef          string   `json:"case_ref"`
	Locale           Locale   `json:"locale"`
	ExpectedIntent   string   `json:"expected_intent,omitempty"`
	ActualIntent     string   `json:"actual_intent,omitempty"`
	Outcome          string   `json:"outcome"`
	SlotNames        []string `json:"slot_names,omitempty"`
	Synthetic        bool     `json:"synthetic"`
	CommandReadiness string   `json:"command_readiness"`
}

func NewSanitizedResult(caseID string, locale Locale, expectedIntent string, match Match, matchErr error) SanitizedResult {
	caseRef, validCaseRef := normalizeUUIDV4(caseID)
	metadataInvalid := !validCaseRef
	if !supportedLocale(locale) {
		locale = ""
		metadataInvalid = true
	}
	_, expectedKnown := catalogIntent(expectedIntent)
	if !expectedKnown {
		expectedIntent = ""
		metadataInvalid = true
	}
	actualIntent, actualKnown := catalogIntent(match.IntentID)
	if match.IntentID == "" && matchErr != nil {
		actualKnown = false
	} else if !actualKnown {
		match.IntentID = ""
		metadataInvalid = true
	} else if match.Kind != actualIntent.Kind ||
		(match.Kind == KindAction && !match.RequiresConfirmation) {
		metadataInvalid = true
	}
	outcome := "matched"
	if matchErr != nil {
		outcome = "invalid"
		if errors.Is(matchErr, ErrUnknownUtterance) {
			outcome = "unknown"
		} else if errors.Is(matchErr, ErrAmbiguousInput) {
			outcome = "ambiguous"
		}
	}
	slotNames := make([]string, 0, len(match.Slots))
	allowedSlots := make(map[string]struct{})
	if actualKnown {
		for _, slot := range actualIntent.Slots {
			allowedSlots[slot.Name] = struct{}{}
		}
	}
	for name := range match.Slots {
		if _, allowed := allowedSlots[name]; allowed {
			slotNames = append(slotNames, name)
		} else {
			metadataInvalid = true
		}
	}
	if metadataInvalid {
		outcome = "invalid"
	}
	sort.Strings(slotNames)
	return SanitizedResult{
		SchemaVersion: ContractVersionV1, CaseRef: caseRef, Locale: locale,
		ExpectedIntent: expectedIntent, ActualIntent: match.IntentID, Outcome: outcome,
		SlotNames: slotNames, Synthetic: true, CommandReadiness: ReadinessNoGo,
	}
}

func catalogIntent(id string) (IntentDefinition, bool) {
	for _, intent := range DefaultCatalogV1().Intents {
		if intent.ID == id {
			return intent, true
		}
	}
	return IntentDefinition{}, false
}

func normalizeUUIDV4(value string) (string, bool) {
	value = strings.ToLower(value)
	if len(value) != 36 || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' || value[14] != '4' {
		return "", false
	}
	if !strings.ContainsRune("89ab", rune(value[19])) {
		return "", false
	}
	for index := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			continue
		}
		if !strings.ContainsRune("0123456789abcdef", rune(value[index])) {
			return "", false
		}
	}
	return value, true
}

func jsonMarshalCatalog(catalog Catalog) ([]byte, error) {
	data, err := json.Marshal(catalog)
	if err != nil {
		return nil, fmt.Errorf("%w: encode: %v", ErrInvalidCatalog, err)
	}
	return data, nil
}
