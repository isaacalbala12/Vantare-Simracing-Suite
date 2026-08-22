package audio

import (
	"sync"
	"testing"
)

func TestDefaultAudioConfig(t *testing.T) {
	c := DefaultAudioConfig()
	if c.Lang(ChannelSpotter) != "en" {
		t.Errorf("spotter lang = %q, want en", c.Lang(ChannelSpotter))
	}
	if c.Voice(ChannelSpotter) != "af_bella" {
		t.Errorf("spotter voice = %q, want af_bella", c.Voice(ChannelSpotter))
	}
	if c.Lang(ChannelEngineer) != "es" {
		t.Errorf("engineer lang = %q, want es", c.Lang(ChannelEngineer))
	}
	if c.Voice(ChannelEngineer) != "ef_dora" {
		t.Errorf("engineer voice = %q, want ef_dora", c.Voice(ChannelEngineer))
	}
}

func TestAudioConfig_Setters(t *testing.T) {
	c := DefaultAudioConfig()
	c.SetSpotter("es", "em_alex")
	c.SetEngineer("en", "am_echo")
	if c.Lang(ChannelSpotter) != "es" || c.Voice(ChannelSpotter) != "em_alex" {
		t.Errorf("spotter = %s/%s", c.Lang(ChannelSpotter), c.Voice(ChannelSpotter))
	}
	if c.Lang(ChannelEngineer) != "en" || c.Voice(ChannelEngineer) != "am_echo" {
		t.Errorf("engineer = %s/%s", c.Lang(ChannelEngineer), c.Voice(ChannelEngineer))
	}
}

func TestAudioConfig_UnknownChannel_FallsBackToEngineer(t *testing.T) {
	c := DefaultAudioConfig()
	c.SetEngineer("en", "am_echo")
	if got := c.Lang("unknown"); got != "en" {
		t.Errorf("unknown channel lang = %q, want en (fallback)", got)
	}
	if got := c.Voice("unknown"); got != "am_echo" {
		t.Errorf("unknown channel voice = %q, want am_echo (fallback)", got)
	}
}

func TestAudioConfig_Validate_InvalidLang(t *testing.T) {
	c := DefaultAudioConfig()
	c.spotterLang = "fr"
	if err := c.Validate(); err == nil {
		t.Error("expected error for unsupported language fr")
	}
}

func TestAudioConfig_Validate_EmptyLang(t *testing.T) {
	c := DefaultAudioConfig()
	c.engineerLang = ""
	if err := c.Validate(); err == nil {
		t.Error("expected error for empty language")
	}
}

func TestAudioConfig_Validate_ValidPasses(t *testing.T) {
	c := DefaultAudioConfig()
	if err := c.Validate(); err != nil {
		t.Errorf("default config should be valid, got: %v", err)
	}
}

func TestAudioConfig_Validate_AllPresentationLocales(t *testing.T) {
	for _, locale := range []string{"es", "en", "it", "pt-BR"} {
		c := DefaultAudioConfig()
		c.SetSpotter(locale, "voice")
		c.SetEngineer(locale, "voice")
		if err := c.Validate(); err != nil {
			t.Fatalf("locale %q rejected: %v", locale, err)
		}
	}
}

func TestAudioConfig_NilReceiver(t *testing.T) {
	var c *AudioConfig
	if got := c.Lang(ChannelSpotter); got != "" {
		t.Errorf("nil.Lang = %q, want \"\"", got)
	}
	if got := c.Voice(ChannelSpotter); got != "" {
		t.Errorf("nil.Voice = %q, want \"\"", got)
	}
	if err := c.Validate(); err == nil {
		t.Error("nil.Validate should return error")
	}
	// SetSpotter/SetEngineer on nil should not panic
	c.SetSpotter("es", "em_alex")
	c.SetEngineer("en", "am_echo")
}

func TestAudioConfig_RaceFree(t *testing.T) {
	c := DefaultAudioConfig()
	var wg sync.WaitGroup
	// Concurrent writes
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c.SetSpotter("es", "em_alex")
			c.SetEngineer("en", "am_echo")
		}()
	}
	// Concurrent reads
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = c.Lang(ChannelSpotter)
			_ = c.Voice(ChannelEngineer)
			_ = c.Validate()
		}()
	}
	wg.Wait()
}

func TestDefaultAudioConfigForLocaleKeepsBothChannelsCanonical(t *testing.T) {
	t.Parallel()
	wantVoice := map[string]string{
		"es": "ef_dora", "en": "af_bella", "it": "if_sara", "pt-BR": "pf_dora",
	}
	for locale, voice := range wantVoice {
		locale, voice := locale, voice
		t.Run(locale, func(t *testing.T) {
			t.Parallel()
			config, err := DefaultAudioConfigForLocale(locale)
			if err != nil {
				t.Fatal(err)
			}
			for _, channel := range []Channel{ChannelSpotter, ChannelEngineer} {
				if config.Lang(channel) != locale || config.Voice(channel) != voice {
					t.Fatalf("channel=%s lang/voice=%s/%s, want %s/%s", channel, config.Lang(channel), config.Voice(channel), locale, voice)
				}
			}
		})
	}
	if _, err := DefaultAudioConfigForLocale("fr"); err == nil {
		t.Fatal("unsupported product locale was accepted")
	}
}
