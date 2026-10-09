// Package audio provides configuration for multi-language TTS audio.
// Each "channel" (spotter, engineer) can have independent language and voice settings.
package audio

import (
	"fmt"
	"sync"
)

// Channel identifies which subsystem an audio message belongs to.
// Spotter messages always have priority over engineer messages.
type Channel string

const (
	ChannelSpotter  Channel = "spotter"
	ChannelEngineer Channel = "engineer"
)

// AudioConfig holds the language and voice settings per channel.
// It is safe for concurrent use once configured; set values before calling Start().
type AudioConfig struct {
	mu            sync.RWMutex
	spotterLang   string
	spotterVoice  string
	engineerLang  string
	engineerVoice string
}

// DefaultAudioConfig returns sensible defaults:
// Spotter: English, af_bella (female US); Engineer: Spanish, ef_dora (female ES)
func DefaultAudioConfig() *AudioConfig {
	return &AudioConfig{
		spotterLang:   "en",
		spotterVoice:  "af_bella",
		engineerLang:  "es",
		engineerVoice: "ef_dora",
	}
}

// DefaultAudioConfigForLocale builds the product configuration from the
// canonical presentation locale. Both channels therefore resolve only clips
// belonging to the same locale that produced the visual/voice text.
func DefaultAudioConfigForLocale(locale string) (*AudioConfig, error) {
	voice := ""
	switch locale {
	case "es":
		voice = "ef_dora"
	case "en":
		voice = "af_bella"
	case "it":
		voice = "if_sara"
	case "pt-BR":
		voice = "pf_dora"
	default:
		return nil, fmt.Errorf("audio: unsupported product locale %q", locale)
	}
	return &AudioConfig{
		spotterLang: locale, spotterVoice: voice,
		engineerLang: locale, engineerVoice: voice,
	}, nil
}

// SetSpotter sets the language and voice for the spotter channel.
func (c *AudioConfig) SetSpotter(lang, voice string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.spotterLang = lang
	c.spotterVoice = voice
}

// SetEngineer sets the language and voice for the engineer channel.
func (c *AudioConfig) SetEngineer(lang, voice string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.engineerLang = lang
	c.engineerVoice = voice
}

// Lang returns the language for the given channel.
// Unknown channels fall back to the engineer language.
func (c *AudioConfig) Lang(ch Channel) string {
	if c == nil {
		return ""
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	switch ch {
	case ChannelSpotter:
		return c.spotterLang
	case ChannelEngineer:
		return c.engineerLang
	default:
		return c.engineerLang
	}
}

// Voice returns the voice for the given channel.
// Unknown channels fall back to the engineer voice.
func (c *AudioConfig) Voice(ch Channel) string {
	if c == nil {
		return ""
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	switch ch {
	case ChannelSpotter:
		return c.spotterVoice
	case ChannelEngineer:
		return c.engineerVoice
	default:
		return c.engineerVoice
	}
}

// Validate checks that all configured languages are supported by the
// canonical Engineer presentation contract.
func (c *AudioConfig) Validate() error {
	if c == nil {
		return fmt.Errorf("audio: nil AudioConfig")
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	validLangs := map[string]bool{"es": true, "en": true, "it": true, "pt-BR": true}
	if !validLangs[c.spotterLang] {
		return fmt.Errorf("audio: unsupported spotter language %q", c.spotterLang)
	}
	if !validLangs[c.engineerLang] {
		return fmt.Errorf("audio: unsupported engineer language %q", c.engineerLang)
	}
	return nil
}
