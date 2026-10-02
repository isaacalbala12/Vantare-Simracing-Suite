package service

import (
	"context"
	"encoding/binary"
	"errors"
	"log/slog"
	"math"
	"os"
	"time"

	"github.com/vantare/overlays/v2/internal/radio"
	"github.com/vantare/overlays/v2/internal/spotter"
)

// AudioTestResult contains stable outcomes without local file paths.
type AudioTestResult struct {
	Kind       string `json:"kind"`
	Outcome    string `json:"outcome"`
	Text       string `json:"text,omitempty"`
	FinishedAt int64  `json:"finishedAt"`
}

// TestAudio exercises the installed player only while the Engineer is off.
// It never synthesizes speech, publishes telemetry or advances radio policy.
func (s *EngineerService) TestAudio(parent context.Context, kind string) (result AudioTestResult) {
	result.Kind = kind
	defer func() { result.FinishedAt = time.Now().UnixMilli() }()
	if kind != "tone" && kind != "cached" {
		result.Outcome = "invalid_request"
		return
	}
	s.mu.Lock()
	if !s.running || s.enabled || s.activeDelivery != nil || s.audioTestCancel != nil {
		s.mu.Unlock()
		result.Outcome = "busy"
		return
	}
	player := s.audioPlayer
	if player == nil {
		s.mu.Unlock()
		result.Outcome = "unavailable"
		return
	}
	ctx, cancel := context.WithTimeout(s.ctx, 8*time.Second)
	stopParent := context.AfterFunc(parent, cancel)
	s.audioTestCancel = cancel
	resolver := radioAudioResolver{router: s.audioRouter, resolver: s.audioResolver, locale: s.presentationLocale, intent: spotter.IntentCarLeft}
	catalog, locale := s.radioResolver, radio.Locale(s.presentationLocale)
	s.wg.Add(1)
	s.mu.Unlock()
	defer func() {
		stopParent()
		cancel()
		s.mu.Lock()
		s.audioTestCancel = nil
		s.signalDeliveryLocked()
		s.mu.Unlock()
		s.wg.Done()
	}()
	var path string
	var err error
	if kind == "tone" {
		path, err = writeTestTone()
		if err == nil {
			defer func() {
				if removeErr := os.Remove(path); removeErr != nil && result.Outcome == "completed" {
					result.Outcome = "cleanup_error"
				}
			}()
		}
	} else {
		phrase, resolveErr := catalog.Resolve(radio.RadioMessage{Version: radio.VersionV1, Intent: spotter.IntentCarLeft, Priority: radio.PriorityP0, Locale: locale})
		if resolveErr != nil {
			result.Outcome = "lookup_error"
			return
		}
		result.Text = phrase.VisualText
		lookupCtx, stopLookup := context.WithTimeout(ctx, audioCacheResolveTimeout)
		path, err = resolver.ResolveCached(lookupCtx, phrase.VoiceText, phrase.Channel)
		stopLookup()
		if context.Cause(ctx) != nil {
			result.Outcome = "cancelled"
			return
		}
		if err != nil {
			result.Outcome = "lookup_error"
			return
		}
		if path == "" {
			result.Outcome = "cache_miss"
			return
		}
	}
	if err != nil {
		slog.Warn("engineer audio test file failed", "error", err)
		result.Outcome = "failed"
		return
	}
	err = player.PlayContext(ctx, path)
	switch {
	case context.Cause(ctx) != nil:
		result.Outcome = "cancelled"
	case err != nil:
		slog.Warn("engineer audio test playback failed", "error", err)
		result.Outcome = "failed"
	default:
		result.Outcome = "completed"
	}
	return
}

// A short, quiet PCM tone works through the same OS player as cached speech.
func writeTestTone() (string, error) {
	const rate = 22050
	const samples = rate / 2
	data := make([]byte, 44+samples*2)
	copy(data, "RIFF")
	binary.LittleEndian.PutUint32(data[4:], uint32(len(data)-8))
	copy(data[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(data[16:], 16)
	binary.LittleEndian.PutUint16(data[20:], 1)
	binary.LittleEndian.PutUint16(data[22:], 1)
	binary.LittleEndian.PutUint32(data[24:], rate)
	binary.LittleEndian.PutUint32(data[28:], rate*2)
	binary.LittleEndian.PutUint16(data[32:], 2)
	binary.LittleEndian.PutUint16(data[34:], 16)
	copy(data[36:], "data")
	binary.LittleEndian.PutUint32(data[40:], samples*2)
	for i := 0; i < samples; i++ {
		envelope := math.Min(1, math.Min(float64(i)/440, float64(samples-i)/440))
		v := int16(4000 * envelope * math.Sin(2*math.Pi*440*float64(i)/rate))
		binary.LittleEndian.PutUint16(data[44+i*2:], uint16(v))
	}
	f, err := os.CreateTemp("", "vantare-audio-test-*.wav")
	if err != nil {
		return "", err
	}
	_, writeErr := f.Write(data)
	closeErr := f.Close()
	if writeErr != nil || closeErr != nil {
		return "", errors.Join(writeErr, closeErr, os.Remove(f.Name()))
	}
	return f.Name(), nil
}
