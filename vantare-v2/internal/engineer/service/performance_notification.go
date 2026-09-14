package service

import (
	"fmt"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/presentation"
)

var performanceLevelText = map[presentation.Locale]map[performancepolicy.Level]string{
	presentation.LocaleSpanish: {
		performancepolicy.LevelHigh:     "Pasamos a Alto, el PC tiene margen.",
		performancepolicy.LevelBalanced: "Pasamos a Equilibrado.",
		performancepolicy.LevelSaving:   "Pasamos a Ahorro, el PC va justo.",
		performancepolicy.LevelMinimum:  "Pasamos a Mínimo, reduzco al máximo el consumo.",
	},
	presentation.LocaleEnglish: {
		performancepolicy.LevelHigh:     "Switching to High, the PC has headroom.",
		performancepolicy.LevelBalanced: "Switching to Balanced.",
		performancepolicy.LevelSaving:   "Switching to Saving, the PC is under load.",
		performancepolicy.LevelMinimum:  "Switching to Minimum to reduce system load.",
	},
	presentation.LocaleItalian: {
		performancepolicy.LevelHigh:     "Passiamo ad Alto, il PC ha margine.",
		performancepolicy.LevelBalanced: "Passiamo a Bilanciato.",
		performancepolicy.LevelSaving:   "Passiamo a Risparmio, il PC è sotto carico.",
		performancepolicy.LevelMinimum:  "Passiamo a Minimo per ridurre il carico.",
	},
	presentation.LocalePortugueseBrazil: {
		performancepolicy.LevelHigh:     "Mudando para Alto, o PC tem margem.",
		performancepolicy.LevelBalanced: "Mudando para Equilibrado.",
		performancepolicy.LevelSaving:   "Mudando para Economia, o PC está sob carga.",
		performancepolicy.LevelMinimum:  "Mudando para Mínimo para reduzir a carga.",
	},
}

// PublishPerformanceLevel publica solo presentación visual. Al no pasar por el
// router de audio ni rellenar VoiceText, nunca sintetiza ni reproduce voz.
func (s *EngineerService) PublishPerformanceLevel(level performancepolicy.Level) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	localized, ok := performanceLevelText[s.presentationLocale]
	if !ok {
		return presentation.ErrUnsupportedLocale
	}
	text, ok := localized[level]
	if !ok {
		return fmt.Errorf("performance notification level %d", level)
	}
	if !s.running || !s.enabled || !s.subtitlesEnabled {
		return nil
	}
	now := s.policyClock.NowMS()
	s.publishNotificationLocked(EngineerNotification{
		Version:  presentation.ContractVersionV1,
		ID:       fmt.Sprintf("performance-level-%d-%d", level, now),
		Category: "performance", Severity: string(presentation.SeverityInfo),
		TextKey: fmt.Sprintf("performance.level.%d", level), Text: text,
		Locale: string(s.presentationLocale), Role: string(presentation.RoleEngineer),
		Channel: string(presentation.ChannelEngineer), Priority: int(messagepolicy.PriorityInformation),
		CreatedAt: now, ExpiresAt: now + 5_000, Source: "performance-sensor",
	})
	return nil
}
