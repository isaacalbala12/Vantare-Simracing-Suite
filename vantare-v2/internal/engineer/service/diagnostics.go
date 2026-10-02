package service

import (
	"context"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/radio"
)

const deliveryHistoryLimit = 200

// DeliveryDiagnostic describes a selected radio item, not every evaluated candidate.
// Audio completed means the player returned successfully, never acoustic proof.
type DeliveryDiagnostic struct {
	ID         string     `json:"id"`
	Lifecycle  uint64     `json:"lifecycle"`
	Intent     string     `json:"intent"`
	Family     string     `json:"family"`
	Text       string     `json:"text"`
	Mode       OutputMode `json:"mode"`
	SelectedAt int64      `json:"selectedAt"`
	UpdatedAt  int64      `json:"updatedAt"`
	State      string     `json:"state"`
	Reason     string     `json:"reason"`
	Visual     bool       `json:"visual"`
	Audio      string     `json:"audio"`
}

type deliveryJournal struct {
	mu      sync.Mutex
	entries []DeliveryDiagnostic
}

func (j *deliveryJournal) add(entry DeliveryDiagnostic) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if len(j.entries) == deliveryHistoryLimit {
		copy(j.entries, j.entries[1:])
		j.entries = j.entries[:deliveryHistoryLimit-1]
	}
	j.entries = append(j.entries, entry)
}
func (j *deliveryJournal) update(id string, update func(*DeliveryDiagnostic)) {
	j.mu.Lock()
	defer j.mu.Unlock()
	for i := len(j.entries) - 1; i >= 0; i-- {
		if j.entries[i].ID == id {
			update(&j.entries[i])
			return
		}
	}
}
func (j *deliveryJournal) snapshot() []DeliveryDiagnostic {
	j.mu.Lock()
	defer j.mu.Unlock()
	return append([]DeliveryDiagnostic{}, j.entries...)
}

// EngineerDiagnostics is an in-memory, bounded local debugging snapshot.
type EngineerDiagnostics struct {
	Version                   int                  `json:"version"`
	CapturedAt                int64                `json:"capturedAt"`
	Running                   bool                 `json:"running"`
	Status                    EngineerStatus       `json:"status"`
	Health                    EngineerHealth       `json:"health"`
	SubtitlesPreference       bool                 `json:"subtitlesPreference"`
	VisualPresentationEnabled bool                 `json:"visualPresentationEnabled"`
	PlayerAvailable           bool                 `json:"playerAvailable"`
	CacheOnly                 bool                 `json:"cacheOnly"`
	Locale                    string               `json:"locale"`
	SpotterVoice              string               `json:"spotterVoice"`
	EngineerVoice             string               `json:"engineerVoice"`
	AudioTestActive           bool                 `json:"audioTestActive"`
	HistoryLimit              int                  `json:"historyLimit"`
	RadioHistoryAvailable     bool                 `json:"radioHistoryAvailable"`
	Deliveries                []DeliveryDiagnostic `json:"deliveries"`
}

// Diagnostics returns a local snapshot with transport errors redacted.
func (s *EngineerService) Diagnostics() EngineerDiagnostics {
	s.mu.Lock()
	defer s.mu.Unlock()
	status := s.getStatusLocked()
	// Raw transport errors can contain filesystem paths. Keep them in existing
	// local logs, not in this export surface.
	if status.LastError != "" {
		status.LastError = "runtime_error"
	}
	status.RecentMessages = []EngineerNotification{} // preserve the array contract; journal is the single history here
	health := s.healthLocked()
	if health.LastError != "" {
		health.LastError = "runtime_error"
	}
	return EngineerDiagnostics{Version: 1, CapturedAt: time.Now().UnixMilli(), Running: s.running,
		Status: status, Health: health, SubtitlesPreference: s.subtitlesEnabled, VisualPresentationEnabled: s.visualPresentationEnabled, PlayerAvailable: s.audioPlayer != nil, CacheOnly: true,
		Locale: string(s.presentationLocale), SpotterVoice: s.audioConfig.Voice(audio.ChannelSpotter), EngineerVoice: s.audioConfig.Voice(audio.ChannelEngineer),
		AudioTestActive: s.audioTestCancel != nil, HistoryLimit: deliveryHistoryLimit, RadioHistoryAvailable: !s.legacyFamilies && !s.legacySpotter,
		Deliveries: s.deliveryJournal.snapshot()}
}

type diagnosticRadioCache struct {
	delegate radio.CachedAudioResolver
	journal  *deliveryJournal
	id       string
}

func (c diagnosticRadioCache) ResolveCached(ctx context.Context, text string, channel audio.Channel) (string, error) {
	path, err := c.delegate.ResolveCached(ctx, text, channel)
	outcome := "ready"
	if err != nil {
		outcome = "lookup_error"
	} else if path == "" {
		outcome = "cache_miss"
	}
	c.journal.update(c.id, func(d *DeliveryDiagnostic) { d.Audio = outcome })
	return path, err
}

type diagnosticRadioPlayer struct {
	delegate AudioPlayer
	journal  *deliveryJournal
	id       string
}

func (p diagnosticRadioPlayer) PlayContext(ctx context.Context, path string) error {
	p.journal.update(p.id, func(d *DeliveryDiagnostic) { d.Audio = "playing" })
	err := p.delegate.PlayContext(ctx, path)
	outcome := "completed"
	if context.Cause(ctx) != nil {
		outcome = "cancelled"
	} else if err != nil {
		outcome = "failed"
	}
	p.journal.update(p.id, func(d *DeliveryDiagnostic) { d.Audio = outcome })
	return err
}
