package radio

import (
	"errors"
	"strings"
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
)

var (
	ErrInvalidDefinition = errors.New("radio presentation definition is invalid")
	ErrNotRegistered     = errors.New("radio intent is not registered")
	ErrInvalidParameters = errors.New("radio presentation parameters are invalid")
)

const maxPresentationBytes = 4096

// Definition is catalog metadata registered by a radio producer.
type Definition struct {
	Family    string
	Priority  Priority
	Role      string
	Channel   audio.Channel
	Severity  string
	ParamKeys []string
}

// Phrase contains the visual and spoken templates for one locale.
type Phrase struct{ Visual, Voice string }

// Presentation is the single resolved value shared by UI and audio output.
type Presentation struct {
	ID, Intent, Family, Role, Severity string
	Priority                           Priority
	Channel                            audio.Channel
	Locale                             Locale
	VisualText, VoiceText              string
	CreatedAtMS, ExpiresAtMS           int64
}

type registered struct {
	definition Definition
	phrases    map[Locale]Phrase
}

// Resolver stores no built-in intents; producers register their own catalog.
type Resolver struct {
	mu      sync.RWMutex
	intents map[string]registered
}

// NewResolver returns an empty, fail-closed resolver.
func NewResolver() *Resolver { return &Resolver{intents: make(map[string]registered)} }

// Register adds one complete four-locale definition. Duplicate intents fail.
func (resolver *Resolver) Register(intent string, definition Definition, phrases map[Locale]Phrase) error {
	if resolver == nil || !validField(intent, 256) || !validField(definition.Family, 256) ||
		!validField(definition.Role, 256) || !validField(string(definition.Channel), 256) ||
		!validField(definition.Severity, 256) || definition.Priority > PriorityP0 || len(phrases) != 4 {
		return ErrInvalidDefinition
	}
	keys := make(map[string]struct{}, len(definition.ParamKeys))
	for _, key := range definition.ParamKeys {
		if !validField(key, 256) {
			return ErrInvalidDefinition
		}
		if _, exists := keys[key]; exists {
			return ErrInvalidDefinition
		}
		keys[key] = struct{}{}
	}
	copyPhrases := make(map[Locale]Phrase, 4)
	for _, locale := range []Locale{LocaleES, LocaleEN, LocaleIT, LocalePTBR} {
		phrase, ok := phrases[locale]
		if !ok || phrase.Visual == "" || phrase.Voice == "" || len(phrase.Visual) > maxPresentationBytes ||
			len(phrase.Voice) > maxPresentationBytes || !templatesMatch(phrase, keys) {
			return ErrInvalidDefinition
		}
		copyPhrases[locale] = phrase
	}
	definition.ParamKeys = append([]string(nil), definition.ParamKeys...)
	resolver.mu.Lock()
	defer resolver.mu.Unlock()
	if _, exists := resolver.intents[intent]; exists {
		return ErrInvalidDefinition
	}
	resolver.intents[intent] = registered{definition: definition, phrases: copyPhrases}
	return nil
}

// Resolve validates locale and exact parameter shape before rendering.
func (resolver *Resolver) Resolve(message RadioMessage) (Presentation, error) {
	if resolver == nil || message.Version != VersionV1 || !validLocale(message.Locale) {
		return Presentation{}, ErrNotRegistered
	}
	resolver.mu.RLock()
	entry, ok := resolver.intents[message.Intent]
	resolver.mu.RUnlock()
	if !ok {
		return Presentation{}, ErrNotRegistered
	}
	if message.Priority != entry.definition.Priority || len(message.Payload) != len(entry.definition.ParamKeys) {
		return Presentation{}, ErrInvalidParameters
	}
	for _, key := range entry.definition.ParamKeys {
		value, ok := message.Payload[key]
		if !ok || len(value) > 256 || strings.ContainsRune(value, '\x00') {
			return Presentation{}, ErrInvalidParameters
		}
	}
	phrase, ok := entry.phrases[message.Locale]
	if !ok {
		return Presentation{}, ErrNotRegistered
	}
	visual, voice := phrase.Visual, phrase.Voice
	for _, key := range entry.definition.ParamKeys {
		visual = strings.ReplaceAll(visual, "{"+key+"}", message.Payload[key])
		voice = strings.ReplaceAll(voice, "{"+key+"}", message.Payload[key])
	}
	if len(visual) > maxPresentationBytes || len(voice) > maxPresentationBytes {
		return Presentation{}, ErrInvalidParameters
	}
	return Presentation{ID: message.ID, Intent: message.Intent, Family: entry.definition.Family, Priority: entry.definition.Priority,
		Role: entry.definition.Role, Channel: entry.definition.Channel, Severity: entry.definition.Severity,
		Locale: message.Locale, VisualText: visual, VoiceText: voice,
		CreatedAtMS: message.CreatedAtMS, ExpiresAtMS: message.ExpiresAtMS}, nil
}

func templatesMatch(phrase Phrase, keys map[string]struct{}) bool {
	for _, template := range []string{phrase.Visual, phrase.Voice} {
		remaining := template
		for {
			start := strings.IndexByte(remaining, '{')
			if start < 0 {
				break
			}
			end := strings.IndexByte(remaining[start+1:], '}')
			if end < 0 {
				return false
			}
			key := remaining[start+1 : start+1+end]
			if _, ok := keys[key]; !ok {
				return false
			}
			remaining = remaining[start+end+2:]
		}
		if strings.ContainsRune(remaining, '}') {
			return false
		}
	}
	for key := range keys {
		if !strings.Contains(phrase.Visual, "{"+key+"}") || !strings.Contains(phrase.Voice, "{"+key+"}") {
			return false
		}
	}
	return true
}
