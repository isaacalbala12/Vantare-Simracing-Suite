// Package radio defines the transport-neutral radio.v1 message bus.
package radio

import (
	"errors"
	"strings"
	"time"
)

const VersionV1 = "radio.v1"

var ErrInvalidMessage = errors.New("radio message is invalid")

// Priority orders radio work. P0 is reserved for safety-critical Spotter output.
type Priority uint8

const (
	PriorityP3 Priority = iota
	PriorityP2
	PriorityP1
	PriorityP0
)

// Locale is a supported radio presentation locale.
type Locale string

const (
	LocaleES   Locale = "es"
	LocaleEN   Locale = "en"
	LocaleIT   Locale = "it"
	LocalePTBR Locale = "pt-BR"
)

// RadioMessage is the bounded, versioned unit accepted by the radio bus.
// Subject scopes coalescing without giving the bus knowledge of producers.
type RadioMessage struct {
	Version     string            `json:"version"`
	ID          string            `json:"id"`
	Source      string            `json:"source"`
	Intent      string            `json:"intent"`
	Subject     string            `json:"subject"`
	Priority    Priority          `json:"priority"`
	TTL         time.Duration     `json:"-"`
	CreatedAtMS int64             `json:"createdAtMs"`
	ExpiresAtMS int64             `json:"expiresAtMs"`
	Locale      Locale            `json:"locale"`
	Payload     map[string]string `json:"payload"`
}

// Limits bounds memory, identity and fairness state owned by a Bus.
type Limits struct {
	MaxPending       int
	MaxPayloadItems  int
	MaxPayloadBytes  int
	MaxFieldBytes    int
	MaxPriorityBurst int
	Cooldowns        map[string]time.Duration
}

// DefaultLimits returns conservative limits suitable for live radio output.
func DefaultLimits() Limits {
	return Limits{MaxPending: 64, MaxPayloadItems: 16, MaxPayloadBytes: 2048, MaxFieldBytes: 256, MaxPriorityBurst: 3}
}

func (limits Limits) valid() bool {
	return limits.MaxPending > 0 && limits.MaxPayloadItems > 0 && limits.MaxPayloadBytes > 0 &&
		limits.MaxFieldBytes > 0 && limits.MaxPriorityBurst > 0
}

func normalizeMessage(message RadioMessage, now int64, limits Limits) (RadioMessage, error) {
	if message.Version == "" {
		message.Version = VersionV1
	}
	if message.CreatedAtMS == 0 {
		message.CreatedAtMS = now
	}
	if message.ExpiresAtMS == 0 && message.TTL > 0 {
		message.ExpiresAtMS = message.CreatedAtMS + message.TTL.Milliseconds()
	}
	if message.Version != VersionV1 || message.Priority > PriorityP0 || message.CreatedAtMS < 0 ||
		message.ExpiresAtMS <= message.CreatedAtMS || now >= message.ExpiresAtMS ||
		!validField(message.ID, limits.MaxFieldBytes) || !validField(message.Source, limits.MaxFieldBytes) ||
		!validField(message.Intent, limits.MaxFieldBytes) || !validField(message.Subject, limits.MaxFieldBytes) ||
		!validLocale(message.Locale) || len(message.Payload) > limits.MaxPayloadItems {
		return RadioMessage{}, ErrInvalidMessage
	}
	total := 0
	copyPayload := make(map[string]string, len(message.Payload))
	for key, value := range message.Payload {
		if !validField(key, limits.MaxFieldBytes) || len(value) > limits.MaxFieldBytes || strings.ContainsRune(value, '\x00') {
			return RadioMessage{}, ErrInvalidMessage
		}
		total += len(key) + len(value)
		if total > limits.MaxPayloadBytes {
			return RadioMessage{}, ErrInvalidMessage
		}
		copyPayload[key] = value
	}
	message.Payload = copyPayload
	return message, nil
}

func validField(value string, max int) bool {
	return value != "" && len(value) <= max && !strings.ContainsRune(value, '\x00')
}

func validLocale(locale Locale) bool {
	switch locale {
	case LocaleES, LocaleEN, LocaleIT, LocalePTBR:
		return true
	default:
		return false
	}
}
