package service

import (
	"context"
	"testing"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/engineer/presentation"
)

func TestPerformanceLevelNotificationIsTextOnlyInFourLocales(t *testing.T) {
	locales := []presentation.Locale{
		presentation.LocaleSpanish,
		presentation.LocaleEnglish,
		presentation.LocaleItalian,
		presentation.LocalePortugueseBrazil,
	}
	for _, locale := range locales {
		t.Run(string(locale), func(t *testing.T) {
			service := NewEngineerService(nil)
			if err := service.SetLocale(string(locale)); err != nil {
				t.Fatal(err)
			}
			if err := service.Start(context.Background()); err != nil {
				t.Fatal(err)
			}
			defer service.Stop()
			stream, unsubscribe := service.SubscribeStream()
			defer unsubscribe()
			<-stream
			if err := service.PublishPerformanceLevel(performancepolicy.LevelSaving); err != nil {
				t.Fatal(err)
			}
			event := <-stream
			if event.Presentation == nil || event.Presentation.Text == "" || event.Presentation.Locale != string(locale) {
				t.Fatalf("event = %+v", event)
			}
			if event.Presentation.VoiceText != "" {
				t.Fatalf("performance notification has audio text: %+v", event.Presentation)
			}
		})
	}
}
