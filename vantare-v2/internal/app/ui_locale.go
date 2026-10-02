package app

import (
	"encoding/json"
	"fmt"
)

// UILocaleSnapshot is a complete, versioned UI preference. An empty locale
// means the native authority has not been initialized by the Hub yet.
type UILocaleSnapshot struct {
	Locale   string `json:"locale"`
	Revision uint64 `json:"revision"`
}

func validUILocale(locale string) bool {
	switch locale {
	case "es", "en", "pt", "it":
		return true
	default:
		return false
	}
}

func (s *SettingsService) uiLocaleSnapshotLocked() UILocaleSnapshot {
	locale := ""
	if s.settings != nil {
		locale = s.settings.UILocale
	}
	return UILocaleSnapshot{Locale: locale, Revision: s.localeRevision}
}

func (s *SettingsService) UILocaleSnapshot() UILocaleSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.uiLocaleSnapshotLocked()
}

// SubscribeUILocale registers before capturing the snapshot under one lock.
// Each subscriber keeps only the latest update if it cannot keep up.
func (s *SettingsService) SubscribeUILocale() (UILocaleSnapshot, <-chan UILocaleSnapshot, func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.localeSubscribers == nil {
		s.localeSubscribers = make(map[chan UILocaleSnapshot]struct{})
	}
	updates := make(chan UILocaleSnapshot, 1)
	s.localeSubscribers[updates] = struct{}{}
	snapshot := s.uiLocaleSnapshotLocked()
	return snapshot, updates, func() {
		s.mu.Lock()
		delete(s.localeSubscribers, updates)
		s.mu.Unlock()
	}
}

// SetUILocale writes the focused preference atomically. Failed persistence
// leaves both the live preference and its revision unchanged.
func (s *SettingsService) SetUILocale(locale string) (UILocaleSnapshot, error) {
	return s.writeUILocale(locale, false)
}

// InitializeUILocale imports the old browser preference only when no native
// preference exists. A second Hub cannot overwrite the first winner.
func (s *SettingsService) InitializeUILocale(locale string) (UILocaleSnapshot, error) {
	return s.writeUILocale(locale, true)
}

func (s *SettingsService) writeUILocale(locale string, onlyIfMissing bool) (UILocaleSnapshot, error) {
	if !validUILocale(locale) {
		return UILocaleSnapshot{}, fmt.Errorf("invalid UI locale %q", locale)
	}
	if s.path == "" {
		return UILocaleSnapshot{}, ErrSettingsPathEmpty
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.uiLocaleSnapshotLocked()
	if current.Locale == locale || (onlyIfMissing && current.Locale != "") {
		return current, nil
	}
	candidate := s.settings
	if candidate == nil {
		candidate = DefaultAppSettings()
	} else {
		candidate = cloneAppSettings(candidate)
	}
	candidate.UILocale = locale
	data, err := json.MarshalIndent(candidate, "", "  ")
	if err != nil {
		return current, fmt.Errorf("marshal UI locale: %w", err)
	}
	if err := s.saveWithRetryMode(candidate, data, 0, false); err != nil {
		return current, err
	}
	return s.uiLocaleSnapshotLocked(), nil
}
