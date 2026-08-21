package service

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/core"
	"github.com/vantare/overlays/v2/internal/engineer/delivery"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/presentation"
	"github.com/vantare/overlays/v2/internal/engineer/projectioninput"
	legacyspotter "github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
	"github.com/vantare/overlays/v2/internal/families"
	"github.com/vantare/overlays/v2/internal/radio"
	radiospotter "github.com/vantare/overlays/v2/internal/spotter"
	spottergeometry "github.com/vantare/overlays/v2/internal/spotter/geometry"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

type EventEmitter interface {
	Emit(name string, data any)
}

var (
	ErrCanonicalSourceUnavailable   = errors.New("canonical Engineer source is unavailable")
	ErrCanonicalObservationNotFresh = errors.New("canonical Engineer observation is not newer than the disconnect boundary")
)

var ErrPresentationLocaleRunning = errors.New("engineer presentation locale cannot change while the service is running")
var ErrLegacySpotterRunning = errors.New("engineer legacy spotter rollback cannot change while the service is running")
var ErrLegacyFamiliesRunning = errors.New("engineer legacy families rollback cannot change while the service is running")

// observationCursor is the ordering boundary captured when the canonical
// source becomes unavailable. Sequence is monotonic inside an epoch; a newer
// epoch is a legitimate lifecycle transition and is therefore always newer.
// Context is retained with the cursor so boundary classification still owns
// identity changes rather than treating them as a clock reset.
type observationCursor struct {
	context  engineerprojection.Context
	sequence uint64
}

func cursorFromObservation(snapshot engineerprojection.ObservationSnapshotV1) observationCursor {
	return observationCursor{context: snapshot.Context, sequence: uint64(snapshot.Sequence)}
}

func (cursor observationCursor) strictlyAfter(boundary observationCursor) bool {
	if cursor.context.Epoch != boundary.context.Epoch {
		return cursor.context.Epoch > boundary.context.Epoch
	}
	return cursor.sequence > boundary.sequence
}

// EngineerService coordinates the telemetry input, runtime spotter engine, and notification store.
type EngineerService struct {
	mu                    sync.Mutex
	store                 *NotificationStore
	queue                 *audio.Queue
	runtime               *core.Runtime
	input                 *projectioninput.Adapter
	emitter               EventEmitter
	running               bool
	enabled               bool
	connected             bool
	source                string
	spotterEnabled        bool
	legacySpotter         bool
	legacyFamilies        bool
	sensitivity           string
	outputModes           map[messagepolicy.Family]OutputMode
	subtitlesEnabled      bool
	lastError             string
	presentationLifecycle uint64
	streamSequence        uint64
	activePresentation    *EngineerNotification

	lastContext            engineerprojection.Context
	lastObservation        *observationCursor
	reconnectBoundary      *observationCursor
	factEpoch              uint64
	factSequence           uint64
	sourceState            engineerprojection.SourceState
	sourceReconnectAttempt int
	scheduler              *messagepolicy.Scheduler
	policyClock            messagepolicy.Clock

	// Loop management
	ctx        context.Context
	cancelFn   context.CancelFunc
	wg         sync.WaitGroup
	subs       []chan EngineerNotification
	statusSubs []chan EngineerStatus
	streamSubs []chan EngineerStreamEvent

	// Drop counter: número de notificaciones que no pudieron entregarse a un
	// suscriptor SSE porque su canal estaba lleno. Se incrementa atómicamente
	// en el fan-out y se expone vía DropCount() / Health() / /api/engineer/health.
	dropCount atomic.Uint64

	// Audio playback opcional. El puerto productivo resuelve una ruta ya
	// disponible y la reproduce con contexto cancelable. La síntesis TTS no
	// pertenece a este corte y nunca debe bloquear este resolver.
	audioPlayer   AudioPlayer
	audioResolver AudioResolver
	audioConfig   *audio.AudioConfig
	audioRouter   *audio.AudioRouter

	deliveryPort    delivery.Port
	deliveryMetrics *delivery.Metrics
	deliveryWake    chan struct{}
	deliveryDone    chan deliveryResult
	activeDelivery  *activeDelivery
	deliveryNext    uint64
	radioBus        *radio.Bus
	radioResolver   *radio.Resolver
	radioMetrics    *radio.Metrics
	spotterProducer *radiospotter.Producer
	familyEngine    *families.Engine

	presentationResolver *presentation.Resolver
	presentationLocale   presentation.Locale
}

// AudioPlayer es la interfaz mínima que el puerto productivo necesita.
// *audio.Player (internal/engineer/audio) la implementa.
type AudioPlayer interface {
	PlayContext(ctx context.Context, path string) error
}

// AudioResolver resuelve una presentación canónica a un path de audio ya cacheado. Debe
// respetar el contexto, no sintetizar ni descargar y devolver "" si no hay
// audio disponible (en cuyo caso se mantiene la notificación visual).
//
// Implementación por defecto: NoopAudioResolver (siempre devuelve "").
// Este contrato solo puede consultar rutas ya preparadas; sintetizar o descargar
// audio pertenece al futuro transporte TTS y no puede bloquear el camino crítico.
type AudioResolver interface {
	ResolvePresentationCached(ctx context.Context, request audio.PresentationRequest) (string, error)
}

// NoopAudioResolver es el resolver por defecto: nunca encuentra audio.
// El cableado de queueLoop queda listo; cuando internal/tts/ exista basta
// inyectar el resolver real vía SetAudioResolver.
type NoopAudioResolver struct{}

// ResolvePresentationCached devuelve "" (sin audio). Implementa AudioResolver.
func (NoopAudioResolver) ResolvePresentationCached(context.Context, audio.PresentationRequest) (string, error) {
	return "", nil
}

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
	if s.audioRouter != nil && s.audioConfig != nil {
		s.audioRouter.SetConfig(s.audioConfig)
	}
}

// SetLegacySpotterRollback restores the former projectioninput/messagepolicy
// Spotter for one cycle. It is false by default and must be set before Start;
// the radio producer is disabled while rollback is active to prevent doubles.
func (s *EngineerService) SetLegacySpotterRollback(enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return ErrLegacySpotterRunning
	}
	s.legacySpotter = enabled
	s.syncLegacyRuntimeLocked()
	return nil
}

// SetLegacyFamiliesRollback restores the five former projectioninput monitors.
// It is false by default and immutable after Start. The radio family engine is
// exclusive with this path so one observation can never produce doubles.
func (s *EngineerService) SetLegacyFamiliesRollback(enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return ErrLegacyFamiliesRunning
	}
	s.legacyFamilies = enabled
	s.syncLegacyRuntimeLocked()
	return nil
}

// NewEngineerService creates a new instance of EngineerService.
func NewEngineerService(emitter EventEmitter) *EngineerService {
	queue := audio.NewQueue()
	clock := wallClock{}
	scheduler, schedulerErr := messagepolicy.NewScheduler(clock, messagepolicy.Limits{})
	presentationResolver, presentationErr := presentation.NewResolver()
	radioLimits := radio.DefaultLimits()
	radioLimits.Cooldowns = families.Cooldowns()
	radioBus, radioBusErr := radio.NewBus(radioLimits, clock)
	radioResolver := radio.NewResolver()
	radioCatalogErr := radiospotter.RegisterCatalog(radioResolver)
	familyCatalogErr := families.RegisterCatalog(radioResolver)
	spotterProducer, spotterProducerErr := radiospotter.NewProducer(clock, radio.LocaleES)
	familyEngine, familyEngineErr := families.New(clock, radio.LocaleES)
	s := &EngineerService{
		store:                NewNotificationStore(50),
		queue:                queue,
		runtime:              core.NewRuntime(queue, legacyspotter.SensitivityNormal, true),
		input:                projectioninput.NewAdapter(),
		emitter:              emitter,
		enabled:              true,
		connected:            false,
		source:               "telemetry-core",
		spotterEnabled:       true,
		sensitivity:          "normal",
		outputModes:          defaultOutputModes(),
		subtitlesEnabled:     true,
		audioResolver:        NoopAudioResolver{},
		scheduler:            scheduler,
		policyClock:          clock,
		deliveryMetrics:      delivery.NewMetrics(128),
		deliveryWake:         make(chan struct{}, 1),
		deliveryDone:         make(chan deliveryResult, 1),
		radioBus:             radioBus,
		radioResolver:        radioResolver,
		radioMetrics:         radio.NewMetrics(128),
		spotterProducer:      spotterProducer,
		familyEngine:         familyEngine,
		presentationResolver: presentationResolver,
		presentationLocale:   presentation.LocaleSpanish,
	}
	if schedulerErr != nil {
		s.enabled = false
		s.lastError = schedulerErr.Error()
	}
	if presentationErr != nil {
		s.enabled = false
		s.lastError = presentationErr.Error()
	}
	for _, initErr := range []error{radioBusErr, radioCatalogErr, familyCatalogErr, spotterProducerErr, familyEngineErr} {
		if initErr != nil {
			s.enabled = false
			s.lastError = initErr.Error()
			break
		}
	}
	return s
}

// Start launches the background loops for the service.
func (s *EngineerService) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.presentationResolver == nil || !s.presentationLocale.Supported() {
		err := presentation.ErrUnsupportedLocale
		if s.presentationResolver == nil {
			err = presentation.ErrInvalidInput
		}
		s.lastError = err.Error()
		return err
	}

	s.ctx = ctx
	s.running = true
	s.startLoopsLocked()
	return nil
}

// SetLocale configures the canonical presentation locale. Locale is immutable
// while the runtime is active so one delivery cannot change language midway.
func (s *EngineerService) SetLocale(value string) error {
	locale, err := presentation.ParseLocale(value)
	if err != nil {
		return err
	}
	audioConfig, err := audio.DefaultAudioConfigForLocale(string(locale))
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return ErrPresentationLocaleRunning
	}
	if s.spotterProducer != nil {
		if err := s.spotterProducer.SetLocale(radio.Locale(locale)); err != nil {
			return err
		}
	}
	if s.familyEngine != nil {
		if err := s.familyEngine.SetLocale(radio.Locale(locale)); err != nil {
			return err
		}
	}
	s.audioConfig = audioConfig
	if s.audioRouter != nil {
		s.audioRouter.SetConfig(audioConfig)
	}
	s.presentationLocale = locale
	return nil
}

func (s *EngineerService) Locale() presentation.Locale {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.presentationLocale
}

// Stop cancels the running loops and waits for them to terminate.
func (s *EngineerService) Stop() {
	s.mu.Lock()
	if s.scheduler != nil {
		s.scheduler.Cancel(messagepolicy.ReasonLifecycleBoundary)
	}
	s.queue.Clear()
	s.resetRadioLocked(radio.ErrLifecycleBoundary)
	s.cancelDeliveryLocked(delivery.ErrLifecycleBoundary)
	if s.cancelFn != nil {
		s.cancelFn()
		s.cancelFn = nil
	}
	s.running = false
	s.connected = false
	s.advancePresentationLifecycleLocked()
	s.emitStatusLocked()

	for _, ch := range s.subs {
		close(ch)
	}
	s.subs = nil
	for _, ch := range s.statusSubs {
		close(ch)
	}
	s.statusSubs = nil
	for _, ch := range s.streamSubs {
		close(ch)
	}
	s.streamSubs = nil
	s.mu.Unlock()

	s.wg.Wait()
	s.mu.Lock()
	s.activeDelivery = nil
	for len(s.deliveryDone) > 0 {
		<-s.deliveryDone
	}
	s.mu.Unlock()
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
		Enabled:               s.enabled,
		Connected:             s.connected,
		Source:                s.source,
		PresentationLifecycle: s.presentationLifecycle,
		SpotterEnabled:        s.spotterEnabled,
		Sensitivity:           s.sensitivity,
		OutputModes:           s.outputModesSnapshotLocked(),
		SubtitlesEnabled:      s.subtitlesEnabled,
		TTSCacheCount:         0, // TTS audio is disabled in this checkpoint
		RecentMessages:        s.store.GetAll(),
		LastError:             s.lastError,
	}
}

func (s *EngineerService) SetSubtitlesEnabled(enabled bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.subtitlesEnabled == enabled {
		return
	}
	s.subtitlesEnabled = enabled
	s.emitStatusLocked()
}

// advancePresentationLifecycleLocked invalidates visual output without
// inventing a frontend TTL. Every status transport carries the generation so
// Desktop and OBS clear the same canonical presentation at source/session
// boundaries.
func (s *EngineerService) advancePresentationLifecycleLocked() {
	s.presentationLifecycle++
	s.activePresentation = nil
	// A buffered notification belongs to the generation being invalidated.
	// Drain it before publishing the new status; otherwise an SSE select could
	// observe the clear first and then resurrect the stale message.
	for _, subscriber := range s.subs {
		for {
			select {
			case <-subscriber:
				continue
			default:
			}
			break
		}
	}
}

// SubscribeStream returns the canonical ordered Engineer visual stream. The
// first item is an exact snapshot of the current active presentation, or an
// explicit empty snapshot when nothing valid remains.
func (s *EngineerService) SubscribeStream() (<-chan EngineerStreamEvent, func()) {
	ch := make(chan EngineerStreamEvent, 32)
	s.mu.Lock()
	s.streamSubs = append(s.streamSubs, ch)
	event := s.streamSnapshotLocked()
	ch <- event
	s.mu.Unlock()
	return ch, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		for i, existing := range s.streamSubs {
			if existing == ch {
				copy(s.streamSubs[i:], s.streamSubs[i+1:])
				s.streamSubs[len(s.streamSubs)-1] = nil
				s.streamSubs = s.streamSubs[:len(s.streamSubs)-1]
				close(ch)
				return
			}
		}
	}
}

// StreamSnapshot returns the same rehydration envelope used by a new SSE
// subscriber so Wails surfaces cannot start from a different state.
func (s *EngineerService) StreamSnapshot() EngineerStreamEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.streamSnapshotLocked()
}

func (s *EngineerService) streamSnapshotLocked() EngineerStreamEvent {
	s.streamSequence++
	event := EngineerStreamEvent{
		Version: EngineerStreamVersion, Sequence: s.streamSequence,
		Generation: s.presentationLifecycle, Kind: EngineerStreamSnapshot,
		Status: pointerToStatus(s.getStatusLocked()),
	}
	if s.activePresentation != nil && s.activePresentation.ExpiresAt > s.policyClock.NowMS() {
		presentation := *s.activePresentation
		event.Active = true
		event.Presentation = &presentation
	} else {
		s.activePresentation = nil
	}
	return event
}

func pointerToStatus(status EngineerStatus) *EngineerStatus { return &status }

func (s *EngineerService) publishStreamLocked(kind EngineerStreamKind, presentation *EngineerNotification, status *EngineerStatus) {
	s.streamSequence++
	event := EngineerStreamEvent{
		Version: EngineerStreamVersion, Sequence: s.streamSequence,
		Generation: s.presentationLifecycle, Kind: kind,
		Active: s.activePresentation != nil, Presentation: presentation, Status: status,
	}
	for _, subscriber := range s.streamSubs {
		select {
		case subscriber <- event:
		default:
			s.dropCount.Add(1)
		}
	}
	if s.emitter != nil {
		s.emitter.Emit("engineer:stream", event)
	}
}

// SetEnabled enables or disables the service.
func (s *EngineerService) SetEnabled(enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.enabled = enabled
	s.syncLegacyRuntimeLocked()
	if !enabled {
		s.connected = false
		s.advancePresentationLifecycleLocked()
		s.cancelDeliveryLocked(delivery.ErrLifecycleBoundary)
		if s.scheduler != nil {
			s.scheduler.Cancel(messagepolicy.ReasonLifecycleBoundary)
		}
		s.queue.Clear()
		s.resetRadioLocked(radio.ErrLifecycleBoundary)
	}
	s.emitStatusLocked()
	return nil
}

// SetSpotterEnabled enables or disables the spotter engine.
func (s *EngineerService) SetSpotterEnabled(enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.spotterEnabled = enabled
	s.syncLegacyRuntimeLocked()
	if !enabled {
		if s.activeDelivery != nil && s.activeDelivery.isSpotter() {
			s.activeDelivery.cancel(delivery.ErrLifecycleBoundary)
		}
		if s.scheduler != nil {
			s.scheduler.CancelFamily(messagepolicy.FamilySpotter, messagepolicy.ReasonLifecycleBoundary)
		}
		s.queue.ClearCategory(audio.CategorySpotter)
		s.resetSpotterRadioLocked(radio.ErrLifecycleBoundary)
		if s.activePresentation != nil && s.activePresentation.Category == string(messagepolicy.FamilySpotter) {
			s.advancePresentationLifecycleLocked()
		}
	}
	s.emitStatusLocked()
	return nil
}

func (s *EngineerService) syncLegacyRuntimeLocked() {
	enabled := s.enabled && (s.legacyFamilies || (s.legacySpotter && s.spotterEnabled))
	s.runtime.SetEnabled(enabled)
}

// SetSensitivity updates the spotter sensitivity setting.
func (s *EngineerService) SetSensitivity(value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if value != "conservative" && value != "normal" && value != "aggressive" {
		return errors.New("invalid sensitivity: must be one of 'conservative', 'normal', or 'aggressive'")
	}

	s.sensitivity = value
	var sensitivity legacyspotter.Sensitivity
	switch value {
	case "conservative":
		sensitivity = legacyspotter.SensitivityConservative
	case "aggressive":
		sensitivity = legacyspotter.SensitivityAggressive
	default:
		sensitivity = legacyspotter.SensitivityNormal
	}
	s.runtime.SetSensitivity(sensitivity)
	if s.spotterProducer != nil {
		s.spotterProducer.SetSensitivity(spottergeometry.Sensitivity(sensitivity))
	}
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

func (s *EngineerService) SubscribeStatus() (<-chan EngineerStatus, func()) {
	ch := make(chan EngineerStatus, 1)
	s.mu.Lock()
	s.statusSubs = append(s.statusSubs, ch)
	ch <- s.getStatusLocked()
	s.mu.Unlock()
	return ch, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		for i, existing := range s.statusSubs {
			if existing == ch {
				copy(s.statusSubs[i:], s.statusSubs[i+1:])
				s.statusSubs[len(s.statusSubs)-1] = nil
				s.statusSubs = s.statusSubs[:len(s.statusSubs)-1]
				close(ch)
				return
			}
		}
	}
}

func (s *EngineerService) emitStatus() {
	status := s.Status()
	s.mu.Lock()
	s.publishStatusLocked(status)
	s.publishStreamLocked(EngineerStreamStatus, nil, &status)
	s.mu.Unlock()
	if s.emitter != nil {
		s.emitter.Emit("engineer:status", status)
	}
}

func (s *EngineerService) emitStatusLocked() {
	status := s.getStatusLocked()
	s.publishStatusLocked(status)
	s.publishStreamLocked(EngineerStreamStatus, nil, &status)
	if s.emitter != nil {
		s.emitter.Emit("engineer:status", status)
	}
}

func (s *EngineerService) publishStatusLocked(status EngineerStatus) {
	for _, subscriber := range s.statusSubs {
		select {
		case subscriber <- status:
		default:
			// Status is state, not history. Replace a stale buffered snapshot so
			// lifecycle invalidation cannot be lost behind a slow SSE client.
			select {
			case <-subscriber:
			default:
			}
			select {
			case subscriber <- status:
			default:
			}
		}
	}
}

var legacyProjectionFamilies = []projectioninput.MonitorFamily{
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
	stateChanged := s.sourceState != status.State
	reconnectAdvanced := status.ReconnectAttempt > s.sourceReconnectAttempt
	s.sourceState = status.State
	s.sourceReconnectAttempt = status.ReconnectAttempt
	// An increased reconnect attempt is a source boundary even when an
	// intermediate non-live status was coalesced before reaching Engineer.
	// Without an accepted observation there is no cursor to invalidate yet.
	reconnectBoundary := reconnectAdvanced && s.lastObservation != nil
	if !stateChanged && !reconnectBoundary {
		return nil
	}
	if !status.State.Available() || reconnectBoundary {
		s.markReconnectBoundaryLocked()
		s.connected = false
		s.advancePresentationLifecycleLocked()
		s.runtime.Reset()
		s.queue.Clear()
		s.resetRadioLocked(radio.ErrSourceUnavailable)
		if s.scheduler != nil {
			s.scheduler.Cancel(messagepolicy.ReasonSourceUnavailable)
		}
		s.cancelDeliveryLocked(delivery.ErrSourceUnavailable)
	}
	s.emitStatusLocked()
	return nil
}

func (s *EngineerService) markReconnectBoundaryLocked() {
	if s.lastObservation == nil || s.reconnectBoundary != nil {
		return
	}
	boundary := *s.lastObservation
	s.reconnectBoundary = &boundary
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
	if s.reconnectBoundary != nil && !cursorFromObservation(snapshot).strictlyAfter(*s.reconnectBoundary) {
		s.connected = false
		s.lastError = ErrCanonicalObservationNotFresh.Error()
		s.emitStatusLocked()
		return ErrCanonicalObservationNotFresh
	}
	if s.lastContext.Epoch != 0 {
		boundary, err := engineerprojection.ClassifyBoundary(s.lastContext, snapshot.Context)
		if err != nil {
			s.connected = false
			s.lastError = err.Error()
			s.advancePresentationLifecycleLocked()
			s.runtime.Reset()
			s.queue.Clear()
			s.resetRadioLocked(radio.ErrLifecycleBoundary)
			if s.scheduler != nil {
				s.scheduler.Cancel(messagepolicy.ReasonIdentityChanged)
			}
			s.cancelDeliveryLocked(delivery.ErrLifecycleBoundary)
			s.emitStatusLocked()
			return err
		}
		if boundary.CancelsPending() {
			s.advancePresentationLifecycleLocked()
			s.runtime.Reset()
			s.queue.Clear()
			s.resetRadioLocked(radio.ErrLifecycleBoundary)
			s.cancelDeliveryLocked(delivery.ErrLifecycleBoundary)
		}
	}

	source := s.sourceState
	if !source.Known() {
		source = engineerprojection.SourceLive
	}
	evidence := projectioninput.PolicyEvidenceWithoutSpotter(snapshot, s.input, source, s.policyClock.NowMS()+1_000)
	if s.legacySpotter {
		evidence = projectioninput.PolicyEvidence(snapshot, s.input, source, s.policyClock.NowMS()+1_000)
	}
	if s.scheduler == nil {
		return errors.New("engineer message scheduler is unavailable")
	}
	s.scheduler.Observe(evidence)

	processed := false
	if s.spotterEnabled && !s.legacySpotter && s.spotterProducer != nil && s.radioBus != nil {
		message, emit, err := s.spotterProducer.Evaluate(snapshot)
		if err == nil {
			processed = true
			if emit {
				result, submitErr := s.radioBus.Submit(message)
				if submitErr != nil {
					s.connected = false
					s.lastError = submitErr.Error()
					s.emitStatusLocked()
					return submitErr
				}
				if result.Accepted {
					if s.activeDelivery != nil && !s.activeDelivery.isSpotter() {
						s.activeDelivery.cancel(delivery.ErrPreemptedBySpotter)
					}
					s.signalDeliveryLocked()
				}
			}
		} else if errors.Is(err, radiospotter.ErrObservationNotReady) {
			// Capability/identity loss invalidates both policy context and any
			// already selected radio item. Keeping the bus would let old evidence
			// reach started after the producer has failed closed.
			s.resetSpotterRadioLocked(radio.ErrPolicyRejected)
		} else {
			s.connected = false
			s.lastError = err.Error()
			s.emitStatusLocked()
			return err
		}
	}
	if s.legacySpotter && s.spotterEnabled {
		frame, err := s.input.FrameFor(projectioninput.FamilySpotter, snapshot)
		if err == nil {
			s.runtime.ProcessSpotterFrame(frame.TimestampUnixMS, frame)
			processed = true
		} else if !errors.Is(err, projectioninput.ErrObservationNotReady) {
			s.connected = false
			s.lastError = err.Error()
			s.emitStatusLocked()
			return err
		}
	}
	if !s.legacyFamilies && s.familyEngine != nil && s.radioBus != nil {
		evaluation, err := s.familyEngine.Evaluate(snapshot)
		if len(evaluation.ResetIntents) > 0 {
			s.radioBus.ResetIntents(radio.ErrPolicyRejected, evaluation.ResetIntents...)
		}
		if err == nil {
			processed = true
			for _, message := range evaluation.Messages {
				result, submitErr := s.radioBus.Submit(message)
				if submitErr != nil {
					s.connected = false
					s.lastError = submitErr.Error()
					s.emitStatusLocked()
					return submitErr
				}
				if result.Accepted {
					s.signalDeliveryLocked()
				}
			}
		} else if !errors.Is(err, families.ErrObservationNotReady) {
			s.connected = false
			s.lastError = err.Error()
			s.emitStatusLocked()
			return err
		}
	}
	legacyFamilies := []projectioninput.MonitorFamily(nil)
	if s.legacyFamilies {
		legacyFamilies = legacyProjectionFamilies
	}
	for _, family := range legacyFamilies {
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
		if !s.runtime.ProcessMonitorFrame(string(family), frame.TimestampUnixMS, frame) {
			err := errors.New("approved engineer monitor family is not registered")
			s.connected = false
			s.lastError = err.Error()
			s.emitStatusLocked()
			return err
		}
		processed = true
	}
	for {
		message, ok := s.queue.Next(0)
		if !ok {
			break
		}
		candidate, err := projectioninput.CandidateFromMessage(message, snapshot, evidence.Semantic)
		if err != nil {
			s.lastError = err.Error()
			continue
		}
		s.submitCandidateLocked(candidate)
	}
	if !processed {
		s.connected = false
		s.lastError = projectioninput.ErrObservationNotReady.Error()
		s.emitStatusLocked()
		return projectioninput.ErrObservationNotReady
	}

	s.lastContext = snapshot.Context
	lastObservation := cursorFromObservation(snapshot)
	s.lastObservation = &lastObservation
	s.reconnectBoundary = nil
	s.connected = true
	s.lastError = ""
	s.signalDeliveryLocked()
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
	if epoch == s.factEpoch && s.factSequence != 0 && sequence != s.factSequence+1 {
		return &engineerprojection.FactResyncRequiredError{
			Previous: telemetrycore.FactSequence(s.factSequence),
			Next:     telemetrycore.FactSequence(sequence),
		}
	}
	if epoch > s.factEpoch {
		s.factSequence = 0
	}
	s.factEpoch = epoch
	s.factSequence = sequence

	switch fact.Fact.Kind {
	case engineerprojection.FactSessionStarted, engineerprojection.FactDriverChanged:
		s.advancePresentationLifecycleLocked()
		s.runtime.Reset()
		s.queue.Clear()
		s.resetRadioLocked(radio.ErrLifecycleBoundary)
		if s.scheduler != nil {
			s.scheduler.Cancel(messagepolicy.ReasonLifecycleBoundary)
		}
		s.cancelDeliveryLocked(delivery.ErrLifecycleBoundary)
	case engineerprojection.FactSessionEnded, engineerprojection.FactConnectionLost:
		s.markReconnectBoundaryLocked()
		s.connected = false
		s.advancePresentationLifecycleLocked()
		s.runtime.Reset()
		s.queue.Clear()
		s.resetRadioLocked(radio.ErrLifecycleBoundary)
		if s.scheduler != nil {
			s.scheduler.Cancel(messagepolicy.ReasonLifecycleBoundary)
		}
		s.cancelDeliveryLocked(delivery.ErrLifecycleBoundary)
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
	s.runtime.ProcessFrame(nowMS, frame)
	messages := make([]audio.Message, 0, s.queue.Len())
	for {
		message, ok := s.queue.Next(nowMS)
		if !ok {
			break
		}
		messages = append(messages, message)
	}
	s.mu.Unlock()
	for _, message := range messages {
		s.publishLegacyHarness(message)
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
	OK             bool                     `json:"ok"`
	Source         string                   `json:"source"`
	Connected      bool                     `json:"connected"`
	Enabled        bool                     `json:"enabled"`
	Subs           int                      `json:"subscribers"`
	DropCount      uint64                   `json:"dropCount"`
	ActiveFamilies int                      `json:"activeFamilies"`
	Policy         EngineerPolicyMetrics    `json:"policy"`
	Delivery       delivery.MetricsSnapshot `json:"delivery"`
	RadioDelivery  radio.MetricsSnapshot    `json:"radioDelivery"`
	LastError      string                   `json:"lastError,omitempty"`
}

// EngineerPolicyMetrics exposes counters only. Candidate IDs, message text,
// telemetry payloads and identity never cross the health boundary.
type EngineerPolicyMetrics struct {
	Pending     int    `json:"pending"`
	Capacity    int    `json:"capacity"`
	Accepted    uint64 `json:"accepted"`
	Emitted     uint64 `json:"emitted"`
	Suppressed  uint64 `json:"suppressed"`
	Expired     uint64 `json:"expired"`
	Cancelled   uint64 `json:"cancelled"`
	Unavailable uint64 `json:"unavailable"`
}

// Health devuelve el estado de salud del servicio.
func (s *EngineerService) Health() EngineerHealth {
	s.mu.Lock()
	defer s.mu.Unlock()
	var policyMetrics EngineerPolicyMetrics
	if s.scheduler != nil {
		state := s.scheduler.State()
		policyMetrics = EngineerPolicyMetrics{
			Pending: state.Pending, Capacity: state.Capacity,
			Accepted: state.Accepted, Emitted: state.Emitted, Suppressed: state.Suppressed,
			Expired: state.Expired, Cancelled: state.Cancelled, Unavailable: state.Unavailable,
		}
	}
	activeFamilies := 0
	if !s.legacyFamilies && s.familyEngine != nil {
		activeFamilies = s.familyEngine.ActiveCount()
	}
	return EngineerHealth{
		OK:             s.engineerSvcOKLocked(),
		Source:         s.source,
		Connected:      s.connected,
		Enabled:        s.enabled,
		Subs:           len(s.subs) + len(s.streamSubs),
		DropCount:      s.dropCount.Load(),
		ActiveFamilies: activeFamilies,
		Policy:         policyMetrics,
		Delivery:       s.deliveryMetrics.Snapshot(),
		RadioDelivery: func() radio.MetricsSnapshot {
			if s.radioMetrics == nil {
				return radio.MetricsSnapshot{}
			}
			return s.radioMetrics.Snapshot()
		}(),
		LastError: s.lastError,
	}
}

// engineerSvcOKLocked reports healthy only after a canonical observation has
// demonstrated a live connection. A configured source is not connectivity.
func (s *EngineerService) engineerSvcOKLocked() bool {
	return s.running && s.enabled && s.connected && s.source == "telemetry-core"
}
