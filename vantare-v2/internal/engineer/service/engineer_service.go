package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/core"
	"github.com/vantare/overlays/v2/internal/engineer/replay"
	"github.com/vantare/overlays/v2/internal/engineer/simulator"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
	telemetryservice "github.com/vantare/overlays/v2/internal/engineer/telemetry/service"
)

type EventEmitter interface {
	Emit(name string, data any)
}

// EngineerService coordinates the telemetry input, runtime spotter engine, and notification store.
type EngineerService struct {
	mu             sync.Mutex
	store          *NotificationStore
	queue          *audio.Queue
	runtime        *core.Runtime
	emitter        EventEmitter
	enabled        bool
	connected      bool
	source         string
	spotterEnabled bool
	sensitivity    string
	lastError      string

	// Live LMU buffer provider (opcional). Si no es nil y source=="lmu",
	// se construye un OverlaysLiveAdapter en telemetryLoop sin abrir segundo reader.
	bufferProvider BufferProvider
	bufferAvail    bool

	// Loop management
	ctx      context.Context
	cancelFn context.CancelFunc
	wg       sync.WaitGroup
	subs     []chan EngineerNotification

	// Drop counter: número de notificaciones que no pudieron entregarse a un
	// suscriptor SSE porque su canal estaba lleno. Se incrementa atómicamente
	// en el fan-out y se expone vía DropCount() / Health() / /api/engineer/health.
	dropCount atomic.Uint64
}

// SetBufferProvider inyecta el proveedor de buffer mmap de LMU (EnrichedLMUSource)
// para que source=="lmu" pueda construir un OverlaysLiveAdapter sin abrir un
// segundo reader. Es seguro llamarlo antes o después de Start; el cambio aplica
// en el siguiente startLoopsLocked.
func (s *EngineerService) SetBufferProvider(bp BufferProvider, available bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.bufferProvider = bp
	s.bufferAvail = available
}

// NewEngineerService creates a new instance of EngineerService.
func NewEngineerService(emitter EventEmitter) *EngineerService {
	queue := audio.NewQueue()
	s := &EngineerService{
		store:          NewNotificationStore(50),
		queue:          queue,
		runtime:        core.NewRuntime(queue, spotter.SensitivityNormal, true),
		emitter:        emitter,
		enabled:        true,
		connected:      true,
		source:         "simulator",
		spotterEnabled: true,
		sensitivity:    "normal",
	}
	return s
}

// Start launches the background loops for the service.
func (s *EngineerService) Start(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ctx = ctx
	s.startLoopsLocked()
}

// Stop cancels the running loops and waits for them to terminate.
func (s *EngineerService) Stop() {
	s.mu.Lock()
	if s.cancelFn != nil {
		s.cancelFn()
		s.cancelFn = nil
	}
	s.connected = false

	for _, ch := range s.subs {
		close(ch)
	}
	s.subs = nil
	s.mu.Unlock()

	s.wg.Wait()
}

func (s *EngineerService) startLoopsLocked() {
	// Cancel previous loop and wait for goroutines to finish before starting new ones.
	// We must release s.mu before s.wg.Wait() to prevent deadlock: the goroutines
	// we are waiting on may need to acquire s.mu (e.g. emitStatus, telemetryLoop reads).
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

	// Start telemetry loop if enabled
	if s.enabled {
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			s.telemetryLoop(loopCtx)
		}()
	}
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
	s.startLoopsLocked()
	s.emitStatusLocked()
	return nil
}

// SetSource updates the active telemetry source ("simulator", "replay" or "lmu").
// "lmu" requiere que se haya inyectado un BufferProvider vía SetBufferProvider;
// si no lo hay, cae a simulator con lastError informativo.
func (s *EngineerService) SetSource(source string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if source != "simulator" && source != "replay" && source != "lmu" {
		return errors.New("invalid source: must be one of 'simulator', 'replay' or 'lmu'")
	}
	if source == "lmu" && s.bufferProvider == nil {
		return errors.New("source 'lmu' requires a BufferProvider: call SetBufferProvider first")
	}

	s.source = source
	s.startLoopsLocked()
	s.emitStatusLocked()
	return nil
}

// SetSpotterEnabled enables or disables the spotter engine.
func (s *EngineerService) SetSpotterEnabled(enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.spotterEnabled = enabled
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

func (s *EngineerService) telemetryLoop(ctx context.Context) {
	s.mu.Lock()
	sourceType := s.source
	s.mu.Unlock()

	var source telemetry.Source
	var err error

	switch sourceType {
	case "simulator":
		frames := simulator.Build(simulator.ScenarioLeftBasic)
		source = simulator.NewSource(frames)
	case "replay":
		replayPath := "testdata/engineer-replay/spotter-left-basic.jsonl"
		source, err = replay.NewSource(replayPath)
		if err != nil {
			// Fallback in case path is resolved differently
			replayPath = "testdata/replay/spotter-left-basic.jsonl"
			source, err = replay.NewSource(replayPath)
			if err != nil {
				s.mu.Lock()
				s.connected = false
				s.lastError = fmt.Sprintf("failed to open replay source: %v", err)
				s.mu.Unlock()
				s.emitStatus()
				return
			}
		}
	case "lmu":
		s.mu.Lock()
		bp := s.bufferProvider
		avail := s.bufferAvail
		s.mu.Unlock()
		if bp == nil {
			s.mu.Lock()
			s.connected = false
			s.lastError = "lmu source selected but no BufferProvider injected"
			s.mu.Unlock()
			s.emitStatus()
			return
		}
		source = NewOverlaysLiveAdapter(bp, avail)
	default:
		s.mu.Lock()
		s.lastError = fmt.Sprintf("unknown source type: %s", sourceType)
		s.mu.Unlock()
		s.emitStatus()
		return
	}

	defer func() {
		if source != nil {
			_ = source.Close()
		}
	}()

	cfg := telemetryservice.Config{
		ReadHz: 60,
		Source: source,
	}
	telemetrySvc := telemetryservice.New(cfg)

	ch, unsubscribe := telemetrySvc.Subscribe()
	defer unsubscribe()

	svcCtx, svcCancel := context.WithCancel(ctx)
	defer svcCancel()

	svcErrChan := make(chan error, 1)
	go func() {
		svcErrChan <- telemetrySvc.Run(svcCtx)
	}()

	s.mu.Lock()
	s.connected = source.Info().Available
	s.lastError = ""
	s.mu.Unlock()
	s.emitStatus()

	// Heartbeat loop — tracked by wg so Stop() can wait for its exit
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		hb := time.NewTicker(500 * time.Millisecond)
		defer hb.Stop()
		for {
			select {
			case <-svcCtx.Done():
				return
			case <-hb.C:
				s.mu.Lock()
				s.connected = source.Info().Available
				s.mu.Unlock()
				s.emitStatus()
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case err := <-svcErrChan:
			if err != nil && err != context.Canceled {
				log.Printf("EngineerService telemetry loop error: %v", err)
			}
			return
		case upd, ok := <-ch:
			if !ok {
				return
			}
			s.mu.Lock()
			enabled := s.enabled
			spotterEnabled := s.spotterEnabled
			sensStr := s.sensitivity
			s.mu.Unlock()

			if enabled && spotterEnabled {
				var sens spotter.Sensitivity
				switch sensStr {
				case "conservative":
					sens = spotter.SensitivityConservative
				case "aggressive":
					sens = spotter.SensitivityAggressive
				default:
					sens = spotter.SensitivityNormal
				}

				s.mu.Lock()
				s.runtime.SetSensitivity(sens)
				s.runtime.SetEnabled(enabled && spotterEnabled)
				// Process the telemetry frame using current timestamp
				s.runtime.ProcessFrame(time.Now().UnixMilli(), upd.Frame)
				s.connected = upd.Frame.Connected
				s.mu.Unlock()
			}
		}
	}
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
				Category:  "spotter",
				Severity:  "info",
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
	OK         bool   `json:"ok"`
	Source     string `json:"source"`
	Connected  bool   `json:"connected"`
	Enabled    bool   `json:"enabled"`
	Subs       int    `json:"subscribers"`
	DropCount  uint64 `json:"dropCount"`
	LastError  string `json:"lastError,omitempty"`
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

// engineerSvcOKLocked considera OK el servicio si está habilitado y conectado,
// o si está habilitado pero aún no ha intentado conectar (lastError vacío).
// No exportado; se llama con s.mu sostenido.
func (s *EngineerService) engineerSvcOKLocked() bool {
	if !s.enabled {
		return false
	}
	if s.source == "" {
		return false
	}
	return true
}
