package main

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
)

func TestEngineerAudioCompositionDerivesPresentationLocale(t *testing.T) {
	service := engineerservice.NewEngineerService(nil)
	if err := service.SetLocale("it"); err != nil {
		t.Fatal(err)
	}
	config, err := engineerAudioConfigFor(service)
	if err != nil {
		t.Fatal(err)
	}
	if got := config.Lang(audio.ChannelSpotter); got != "it" {
		t.Fatalf("spotter audio locale = %s, want presentation locale it", got)
	}
}
