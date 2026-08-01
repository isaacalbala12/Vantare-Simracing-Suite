package service

import (
	"context"
	"errors"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/core"
	"github.com/vantare/overlays/v2/internal/engineer/projectioninput"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

type EventEmitter interface {
	Emit(name string, data any)
}

var ErrCanonicalSourceUnavailable = errors.New("canonical Engineer source is unavailable")

// EngineerService coordinates the telemetry input, runtime spotter engine, and notification store.
type EngineerService struct {
	mu             sync.Mutex
	store          *NotificationStore
	queue          *audio.Queue
	runtime        *core.Runtime
	input          *projectioninput.Adapter
	emitter        EventEmitter
	running        bool
	enabled        bool
	connected      bool
	source         string
	spotterEnabled bool
	sensitivity    string
	lastError      string

	lastContext  engineerprojection.Context
	factEpoch    uint64
	factSequence uint64
	sourceState  engineerprojection.SourceState

	// Loop management
	ctx      context.Context
	cancelFn context.CancelFunc
	wg       sync.WaitGroup
	subs     []chan EngineerNotification

	// Drop counter: número de notificaciones que no pudieron entregarse a un
	// suscriptor SSE porque su canal estaba lleno. Se incrementa atómicamente
	// en el fan-out y se expone vía DropCount() / Health() / /api/engineer/health.
	dropCount atomic.Uint64

	// Audio playback (opcional). Si audioPlayer != nil y audioResolver devuelve
	// un path, queueLoop invoca Player.Play tras desencolar mensajes spotter.
	// Sin tts/ aún, el resolver por defecto devuelve "" y la reproducción se
	// salta silenciosamente. Esto cablea el flujo de extremo a extremo y deja
	// listo el cambio cuando internal/tts/ entre.
	audioPlayer    AudioPlayer
	audioResolver  AudioResolver
	audioConfig    *audio.AudioConfig
	audioRouter    *audio.AudioRouter
	lastWasSpotter bool

	// skipAudioUntilMS evita reproducir el mismo spotter de nuevo si llegó
	// hace muy poco (evita spam audible).
	skipAudioUntilMS int64
}

// AudioPlayer es la interfaz mínima que queueLoop necesita del reproductor.
// *audio.Player (internal/engineer/audio) la implementa.
type AudioPlayer interface {
	Play(path string) error
}

// AudioResolver resuelve un textKey de spotter a un path de audio reproducible
// en disco (típicamente .mp3 cacheado por internal/tts/). Devuelve "" si no hay
// cache disponible (en cuyo caso el servicio omite la reproducción silenciosamente).
//
// Implementación por defecto: NoopAudioResolver (siempre devuelve "").
// Implementación real: cuando internal/tts/ exista, un TTSResolver que consulte
// el cache TTS y sintetice si no existe (de forma síncrona o asíncrona según TTL).
type AudioResolver interface {
	Resolve(textKey string) string
}

// NoopAudioResolver es el resolver por defecto: nunca encuentra audio.
// El cableado de queueLoop queda listo; cuando internal/tts/ exista basta
// inyectar el resolver real vía SetAudioResolver.
type NoopAudioResolver struct{}

// Resolve devuelve "" (sin audio). Implementa AudioResolver.
func (NoopAudioResolver) Resolve(textKey string) string { return "" }

// SetAudioPlayer inyecta el reproductor de audio. Si es nil, queueLoop no
// intenta reproducir (modo silencioso).
func (s *EngineerService) SetAudioPlayer(p AudioPlayer) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.audioPlayer = p
}

// SetAudioResolver inyecta el resolver textKey -> path de audio. Si es nil,
// se usa NoopAudioResolver (siempre devuelve "" -> sin reproducción).
func (s *EngineerService) SetAudioResolver(r AudioResolver) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r == nil {
		r = NoopAudioResolver{}
	}
	s.audioResolver = r
}

// SetAudioConfig inyecta la configuración de audio multi-idioma.
// Si ya hay un AudioRouter configurado, se reenvía la configuración
// automáticamente. Debe llamarse antes de Start() para evitar carreras.
func (s *EngineerService) SetAudioConfig(cfg *audio.AudioConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.audioConfig = cfg
	if s.audioRouter != nil {
		s.audioRouter.SetConfig(cfg)
	}
}

// SetAudioRouter inyecta el enrutador de audio con resolucion por canal.
func (s *EngineerService) SetAudioRouter(r *audio.AudioRouter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.audioRouter = r
}

// NewEngineerService creates a new instance of EngineerService.
func NewEngineerService(emitter EventEmitter) *EngineerService {
	queue := audio.NewQueue()
	s := &EngineerService{
		store:          NewNotificationStore(50),
		queue:          queue,
		runtime:        core.NewRuntime(queue, spotter.SensitivityNormal, true),
		input:          projectioninput.NewAdapter(),
		emitter:        emitter,
		enabled:        true,
		connected:      false,
		source:         "telemetry-core",
		spotterEnabled: true,
		sensitivity:    "normal",
		audioResolver:  NoopAudioResolver{},
	}
	return s
}

// Start launches the background loops for the service.
func (s *EngineerService) Start(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ctx = ctx
	s.running = true
	s.startLoopsLocked()
}

// Stop cancels the running loops and waits for them to terminate.
func (s *EngineerService) Stop() {
	s.mu.Lock()
	if s.cancelFn != nil {
		s.cancelFn()
		s.cancelFn = nil
	}
	s.running = false
	s.connected = false

	for _, ch := range s.subs {
		close(ch)
	}
	s.subs = nil
	s.mu.Unlock()

	s.wg.Wait()
}

func (s *EngineerService) startLoopsLocked() {
	// Cancel the previous queue lifecycle and wait before starting a replacement.
	// Release s.mu while waiting because queueLoop reads service configuration.
	if s.cancelFn != nil {
		s.cancelFn()
		s.cancelFn = nil
		s.mu.Unlock()
		s.wg.Wait()
		s.mu.Lock()
	}

	if s.ctx == nil {
		s.ctx = context.Background()
	}

	loopCtx, cancel := context.WithCancel(s.ctx)
	s.cancelFn = cancel

	// Start queue loop
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.queueLoop(loopCtx)
	}()

}

// Status returns a snapshot of the current service status.
func (s *EngineerService) Status() EngineerStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.getStatusLocked()
}

func (s *EngineerService) getStatusLocked() EngineerStatus {
	return EngineerStatus{
		Enabled:        s.enabled,
		Connected:      s.connected,
		Source:         s.source,
		SpotterEnabled: s.spotterEnabled,
		Sensitivity:    s.sensitivity,
		TTSCacheCount:  0, // TTS audio is disabled in this checkpoint
		RecentMessages: s.store.GetAll(),
		LastError:      s.lastError,
	}
}

// SetEnabled enables or disables the service.
func (s *EngineerService) SetEnabled(enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.enabled = enabled
	s.runtime.SetEnabled(enabled && s.spotterEnabled)
	if !enabled {
		s.connected = false
	}
	s.emitStatusLocked()
	return nil
}

// SetSpotterEnabled enables or disables the spotter engine.
func (s *EngineerService) SetSpotterEnabled(enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.spotterEnabled = enabled
	s.runtime.SetEnabled(s.enabled && enabled)
	s.emitStatusLocked()
	return nil
}

// SetSensitivity updates the spotter sensitivity setting.
func (s *EngineerService) SetSensitivity(value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if value != "conservative" && value != "normal" && value != "aggressive" {
		return errors.New("invalid sensitivity: must be one of 'conservative', 'normal', or 'aggressive'")
	}

	s.sensitivity = value
	var sensitivity spotter.Sensitivity
	switch value {
	case "conservative":
		sensitivity = spotter.SensitivityConservative
	case "aggressive":
		sensitivity = spotter.SensitivityAggressive
	default:
		sensitivity = spotter.SensitivityNormal
	}
	s.runtime.SetSensitivity(sensitivity)
	s.emitStatusLocked()
	return nil
}

// RecentNotifications returns the list of recent visual notifications in the store.
func (s *EngineerService) RecentNotifications() []EngineerNotification {
	return s.store.GetAll()
}

// Subscribe registers a channel to receive real-time engineer notifications.
func (s *EngineerService) Subscribe() (<-chan EngineerNotification, func()) {
	ch := make(chan EngineerNotification, 16)
	s.mu.Lock()
	s.subs = append(s.subs, ch)
	s.mu.Unlock()
	return ch, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		for i, existing := range s.subs {
			if existing == ch {
				copy(s.subs[i:], s.subs[i+1:])
				s.subs[len(s.subs)-1] = nil
				s.subs = s.subs[:len(s.subs)-1]
				close(ch)
				return
			}
		}
	}
}

func (s *EngineerService) emitStatus() {
	if s.emitter != nil {
		s.emitter.Emit("engineer:status", s.Status())
	}
}

func (s *EngineerService) emitStatusLocked() {
	if s.emitter != nil {
		s.emitter.Emit("engineer:status", s.getStatusLocked())
	}
}

var approvedProjectionFamilies = []projectioninput.MonitorFamily{
	projectioninput.FamilySpotter,
	projectioninput.FamilyFuel,
	projectioninput.FamilyPenalties,
	projectioninput.FamilyLaps,
	projectioninput.FamilyTimings,
	projectioninput.FamilyPitStops,
}

// ConsumeSourceStatus keeps source availability separate from telemetry
// values. A live source is not enough to declare Engineer connected; only a
// subsequent usable observation can do that.
func (s *EngineerService) ConsumeSourceStatus(status engineerprojection.SourceStatusV1) error {
	if !status.State.Known() || status.ReconnectAttempt < 0 {
		return engineerprojection.ErrInvalidSourceStatus
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running || !s.enabled {
		return nil
	}
	if s.sourceState == status.State {
		return nil
	}
	wasAvailable := s.sourceState.Available()
	s.sourceState = status.State
	if !status.State.Available() {
		s.connected = false
		if wasAvailable {
			s.runtime.Reset()
			s.queue.Clear()
		}
	}
	s.emitStatusLocked()
	return nil
}

// ConsumeObservation is the sole production telemetry entry for Engineer.
// It accepts an already projected, owned snapshot and never opens a simulator,
// file, mapping or network source.
func (s *EngineerService) ConsumeObservation(snapshot engineerprojection.ObservationSnapshotV1) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running || !s.enabled {
		return nil
	}
	if s.sourceState.Known() && !s.sourceState.Available() {
		return ErrCanonicalSourceUnavailable
	}
	if s.lastContext.Epoch != 0 {
		boundary, err := engineerprojection.ClassifyBoundary(s.lastContext, snapshot.Context)
		if err != nil {
			s.connected = false
			s.lastError = err.Error()
			s.emitStatusLocked()
			return err
		}
		if boundary.CancelsPending() {
			s.runtime.Reset()
			s.queue.Clear()
		}
	}

	processed := false
	for _, family := range approvedProjectionFamilies {
		if family == projectioninput.FamilySpotter && !s.spotterEnabled {
			continue
		}
		frame, err := s.input.FrameFor(family, snapshot)
		if errors.Is(err, projectioninput.ErrObservationNotReady) {
			continue
		}
		if err != nil {
			s.connected = false
			s.lastError = err.Error()
			s.emitStatusLocked()
			return err
		}
		if family == projectioninput.FamilySpotter {
			s.runtime.ProcessSpotterFrame(frame.TimestampUnixMS, frame)
			processed = true
			continue
		}
		if !s.runtime.ProcessMonitorFrame(string(family), frame.TimestampUnixMS, frame) {
			err := errors.New("approved engineer monitor family is not registered")
			s.connected = false
			s.lastError = err.Error()
			s.emitStatusLocked()
			return err
		}
		processed = true
	}
	if !processed {
		s.connected = false
		s.lastError = projectioninput.ErrObservationNotReady.Error()
		s.emitStatusLocked()
		return projectioninput.ErrObservationNotReady
	}

	s.lastContext = snapshot.Context
	s.connected = true
	s.lastError = ""
	s.emitStatusLocked()
	return nil
}

// ConsumeFact applies ordered lifecycle facts without turning facts into
// telemetry values. Connection recovery remains pending until a fresh snapshot
// arrives.
func (s *EngineerService) ConsumeFact(fact engineerprojection.FactEnvelopeV1) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running || !s.enabled {
		return nil
	}

	epoch := uint64(fact.Epoch)
	sequence := uint64(fact.Fact.Sequence)
	if epoch == 0 || sequence == 0 || epoch < s.factEpoch || (epoch == s.factEpoch && sequence <= s.factSequence) {
		return errors.New("engineer fact cursor is stale or invalid")
	}
	if epoch > s.factEpoch {
		s.factSequence = 0
	}
	s.factEpoch = epoch
	s.factSequence = sequence

	switch fact.Fact.Kind {
	case engineerprojection.FactConnectionLost, engineerprojection.FactSessionEnded:
		s.connected = false
		s.runtime.Reset()
		s.queue.Clear()
	case engineerprojection.FactConnectionRecovered:
		// A recovery fact is not proof that a usable observation exists.
		s.connected = false
	}
	s.emitStatusLocked()
	return nil
}

// ProcessHarnessFrame keeps legacy simulator/replay fixtures usable in tests
// and explicit tools. The application composition root never calls it.
func (s *EngineerService) ProcessHarnessFrame(nowMS int64, frame *telemetry.Frame) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runtime.ProcessFrame(nowMS, frame)
}

func (s *EngineerService) queueLoop(ctx context.Context) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now().UnixMilli()
			msg, ok := s.queue.Next(now)
			if !ok {
				continue
			}

			s.mu.Lock()
			currentSource := s.source
			s.mu.Unlock()

			// Map spotter message to EngineerNotification
			notif := EngineerNotification{
				ID:        msg.ID,
				Category:  string(msg.Category),
				Severity:  string(msg.Severity),
				TextKey:   msg.TextKey,
				Text:      Translate(msg.TextKey),
				Priority:  int(msg.Priority),
				CreatedAt: msg.CreatedAt,
				ExpiresAt: msg.ExpiresAt,
				Source:    currentSource,
			}

			s.store.Add(notif)
			if s.emitter != nil {
				s.emitter.Emit("engineer:notification", notif)
				s.emitter.Emit("engineer:status", s.Status())
			}

			s.mu.Lock()
			for _, sub := range s.subs {
				select {
				case sub <- notif:
				default:
					s.dropCount.Add(1)
				}
			}
			s.mu.Unlock()

			// Reproducir audio: primero con AudioRouter (channel-aware),
			// fallback al resolver legacy si AudioRouter no está configurado.
			s.mu.Lock()
			player := s.audioPlayer
			resolver := s.audioResolver
			skipUntil := s.skipAudioUntilMS

			// NEW: channel-aware audio routing
			if player != nil && s.audioRouter != nil && now >= skipUntil {
				ch := audio.ChannelEngineer
				if msg.Priority >= audio.PrioritySpotter {
					ch = audio.ChannelSpotter
				}
				path := s.audioRouter.Resolve(msg.TextKey, ch)
				if path != "" {
					s.skipAudioUntilMS = now + 2500
					s.lastWasSpotter = msg.Priority >= audio.PrioritySpotter
					s.wg.Add(1)
					s.mu.Unlock()
					go func(p string) {
						defer s.wg.Done()
						if err := player.Play(p); err != nil {
							log.Printf("audio play error: %v", err)
						}
					}(path)
					continue
				}
			} else if player != nil && resolver != nil && msg.Priority >= audio.PrioritySpotter && now >= skipUntil {
				// Legacy fallback: old resolver interface
				if path := resolver.Resolve(msg.TextKey); path != "" {
					s.skipAudioUntilMS = now + 2500
					s.lastWasSpotter = true
					s.wg.Add(1)
					s.mu.Unlock()
					go func(p string) {
						defer s.wg.Done()
						if err := player.Play(p); err != nil {
							log.Printf("audio play error: %v", err)
						}
					}(path)
					continue
				}
			}
			s.mu.Unlock()
		}
	}
}

// DropCount devuelve el número acumulado de notificaciones que se descartaron
// porque un suscriptor SSE tenía el canal lleno. Útil para diagnóstico OBS.
func (s *EngineerService) DropCount() uint64 {
	return s.dropCount.Load()
}

// EngineerHealth es un snapshot ligero para /api/engineer/health.
// Incluye solo campos útiles para OBS/diagnóstico, no el historial completo.
type EngineerHealth struct {
	OK        bool   `json:"ok"`
	Source    string `json:"source"`
	Connected bool   `json:"connected"`
	Enabled   bool   `json:"enabled"`
	Subs      int    `json:"subscribers"`
	DropCount uint64 `json:"dropCount"`
	LastError string `json:"lastError,omitempty"`
}

// Health devuelve el estado de salud del servicio.
func (s *EngineerService) Health() EngineerHealth {
	s.mu.Lock()
	defer s.mu.Unlock()
	return EngineerHealth{
		OK:        s.engineerSvcOKLocked(),
		Source:    s.source,
		Connected: s.connected,
		Enabled:   s.enabled,
		Subs:      len(s.subs),
		DropCount: s.dropCount.Load(),
		LastError: s.lastError,
	}
}

// engineerSvcOKLocked reports healthy only after a canonical observation has
// demonstrated a live connection. A configured source is not connectivity.
func (s *EngineerService) engineerSvcOKLocked() bool {
	return s.running && s.enabled && s.connected && s.source == "telemetry-core"
}
