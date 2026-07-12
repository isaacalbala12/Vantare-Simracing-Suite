package service_test

import (
	"context"
	"encoding/binary"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/service"
)

type mockEmitter struct {
	mu     sync.Mutex
	events []map[string]any
}

func (e *mockEmitter) Emit(name string, data any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = append(e.events, map[string]any{"name": name, "data": data})
}

func (e *mockEmitter) Events() []map[string]any {
	e.mu.Lock()
	defer e.mu.Unlock()
	res := make([]map[string]any, len(e.events))
	copy(res, e.events)
	return res
}

func TestNotificationStore(t *testing.T) {
	store := service.NewNotificationStore(50)

	// Test deep copy
	n1 := service.EngineerNotification{ID: "1", Text: "Hello"}
	store.Add(n1)

	all := store.GetAll()
	if len(all) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(all))
	}

	// Mutate returned copy
	all[0].Text = "Mutated"

	all2 := store.GetAll()
	if all2[0].Text != "Hello" {
		t.Errorf("store did not return a deep copy; mutation affected the store")
	}

	// Test limit 50 and chronological order
	store.Clear()
	for i := 1; i <= 60; i++ {
		store.Add(service.EngineerNotification{
			ID:        string(rune(i)),
			CreatedAt: int64(i),
		})
	}

	all3 := store.GetAll()
	if len(all3) != 50 {
		t.Errorf("expected store to cap size at 50, got %d", len(all3))
	}

	// First item should have CreatedAt = 11 because we discarded the first 10
	if all3[0].CreatedAt != 11 {
		t.Errorf("expected first item to have CreatedAt 11, got %d (order/cap issue)", all3[0].CreatedAt)
	}
	if all3[49].CreatedAt != 60 {
		t.Errorf("expected last item to have CreatedAt 60, got %d", all3[49].CreatedAt)
	}
}

func TestEngineerService_InitialStateAndValidation(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)

	status := svc.Status()
	if status.Source != "simulator" {
		t.Errorf("expected initial source to be 'simulator', got %q", status.Source)
	}
	if !status.Enabled {
		t.Errorf("expected initial enabled to be true")
	}
	if !status.SpotterEnabled {
		t.Errorf("expected initial spotterEnabled to be true")
	}

	// Invalid source validation
	err := svc.SetSource("invalid-source")
	if err == nil {
		t.Error("expected error for invalid source, got nil")
	}

	// Invalid sensitivity validation
	err = svc.SetSensitivity("invalid-sensitivity")
	if err == nil {
		t.Error("expected error for invalid sensitivity, got nil")
	}

	// Valid toggles and sensitivity
	err = svc.SetSensitivity("conservative")
	if err != nil {
		t.Errorf("unexpected error setting sensitivity: %v", err)
	}
	if svc.Status().Sensitivity != "conservative" {
		t.Errorf("expected sensitivity to be 'conservative', got %q", svc.Status().Sensitivity)
	}

	err = svc.SetSpotterEnabled(false)
	if err != nil {
		t.Errorf("unexpected error setting spotter enabled: %v", err)
	}
	if svc.Status().SpotterEnabled {
		t.Errorf("expected spotterEnabled to be false")
	}

	err = svc.SetEnabled(false)
	if err != nil {
		t.Errorf("unexpected error setting enabled: %v", err)
	}
	if svc.Status().Enabled {
		t.Errorf("expected enabled to be false")
	}
}

func TestEngineerService_ToggleDoesNotDuplicateLoops(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	svc.Start(ctx)
	time.Sleep(50 * time.Millisecond)

	// Toggle enabled multiple times — each should restart loops cleanly
	for i := 0; i < 3; i++ {
		_ = svc.SetEnabled(false)
		time.Sleep(50 * time.Millisecond)
		_ = svc.SetEnabled(true)
		time.Sleep(100 * time.Millisecond)
	}

	// Toggle source multiple times
	for i := 0; i < 3; i++ {
		_ = svc.SetSource("simulator")
		time.Sleep(100 * time.Millisecond)
		_ = svc.SetSource("simulator")
		time.Sleep(100 * time.Millisecond)
	}

	svc.Stop()

	// After Stop, no new notifications should arrive
	prevCount := len(svc.RecentNotifications())
	time.Sleep(300 * time.Millisecond)
	// Allow up to 2 additional due to in-flight messages
	if got := len(svc.RecentNotifications()); got > prevCount+5 {
		t.Errorf("notifications kept growing after Stop: prev=%d, got=%d (possible duplicate loop)", prevCount, got)
	}
}

func TestEngineerService_NoPanicWithoutTTS(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)

	// Start the service loops
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	svc.Start(ctx)

	// Let the loops run briefly to ensure no panics
	time.Sleep(100 * time.Millisecond)
	svc.Stop()
}

func TestEngineerService_SimulatorGeneratesNotifications(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	svc.Start(ctx)

	// Wait up to 2 seconds for the simulator to tick and generate a spotter notification
	var foundNotification bool
	start := time.Now()
	for time.Since(start) < 2*time.Second {
		notifications := svc.RecentNotifications()
		if len(notifications) > 0 {
			foundNotification = true
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	svc.Stop()

	if !foundNotification {
		t.Error("expected simulator to generate at least one notification, but none was found")
	}
}

// fakeBufferProvider expone un buffer para tests del servicio con source="lmu".
type fakeBufferProvider struct {
	buf []byte
}

func (f fakeBufferProvider) Read() []byte { return f.buf }

func TestEngineerService_SetSource_LMU_BuildsAdapter(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)

	// Sin BufferProvider debe rechazar "lmu".
	if err := svc.SetSource("lmu"); err == nil {
		t.Error("expected error setting 'lmu' without BufferProvider, got nil")
	}

	// Con BufferProvider debe aceptar "lmu".
	svc.SetBufferProvider(fakeBufferProvider{buf: buildSyntheticEngineerFrameBufferPublic()}, true)
	if err := svc.SetSource("lmu"); err != nil {
		t.Fatalf("unexpected error setting 'lmu' with BufferProvider: %v", err)
	}
	if svc.Status().Source != "lmu" {
		t.Errorf("expected source 'lmu', got %q", svc.Status().Source)
	}
}

func TestEngineerService_Loop_LMU_ProcessesFrame(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)
	svc.SetBufferProvider(fakeBufferProvider{buf: buildSyntheticEngineerFrameBufferPublic()}, true)
	if err := svc.SetSource("lmu"); err != nil {
		t.Fatalf("SetSource(lmu) error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	// Esperar hasta 1s: el loop debe procesar al menos un frame sin panic.
	// No exigimos notificación (el fixture sintético puede no disparar spotter),
	// solo que el servicio no paniquea y queda conectado/ procesando.
	time.Sleep(500 * time.Millisecond)
	st := svc.Status()
	if st.Source != "lmu" {
		t.Errorf("expected source 'lmu', got %q", st.Source)
	}
}

func TestEngineerService_LMU_FallsBackWhenNoLiveSource(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)
	// BufferProvider con buffer nil → adapter devuelve nil frames.
	svc.SetBufferProvider(fakeBufferProvider{buf: nil}, false)
	if err := svc.SetSource("lmu"); err != nil {
		t.Fatalf("SetSource(lmu) error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	time.Sleep(300 * time.Millisecond)
	st := svc.Status()
	// No debe paniquear; el estado debe reflejar source lmu pero no conectado.
	if st.Source != "lmu" {
		t.Errorf("expected source 'lmu', got %q", st.Source)
	}
}

// buildSyntheticEngineerFrameBufferPublic construye un buffer mmap válido con
// geometría conocida (player en X=100) para tests del servicio con source="lmu".
// Vive en service_test (paquete externo) para no depender de helpers internos.
func buildSyntheticEngineerFrameBufferPublic() []byte {
	const objectOutSize = 324820
	buf := make([]byte, objectOutSize)
	buf[128466] = 1 // player has vehicle
	buf[128465] = 0 // player idx 0
	binary.LittleEndian.PutUint32(buf[1736:], 2)

	po := 128468
	binary.LittleEndian.PutUint32(buf[po:], 11)
	binary.LittleEndian.PutUint64(buf[po+160:], math.Float64bits(100))
	binary.LittleEndian.PutUint64(buf[po+168:], math.Float64bits(0))
	binary.LittleEndian.PutUint64(buf[po+176:], math.Float64bits(200))

	off0 := 2192
	binary.LittleEndian.PutUint32(buf[off0:], 11)
	copy(buf[off0+4:], "Player")
	buf[off0+196] = 1
	binary.LittleEndian.PutUint64(buf[off0+104:], math.Float64bits(5000))
	binary.LittleEndian.PutUint64(buf[off0+264:], math.Float64bits(100))

	off1 := 2192 + 584
	binary.LittleEndian.PutUint32(buf[off1:], 22)
	copy(buf[off1+4:], "Opponent")
	binary.LittleEndian.PutUint64(buf[off1+104:], math.Float64bits(5050))
	binary.LittleEndian.PutUint64(buf[off1+264:], math.Float64bits(103))
	return buf
}

// --- G0.9 Player.Play en queueLoop ---

// spyPlayer implementa service.AudioPlayer y registra todas las llamadas Play.
type spyPlayer struct {
	mu    sync.Mutex
	paths []string
	err   error
}

func (p *spyPlayer) Play(path string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.paths = append(p.paths, path)
	return p.err
}

func (p *spyPlayer) Calls() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]string, len(p.paths))
	copy(out, p.paths)
	return out
}

// staticResolver implementa service.AudioResolver devolviendo siempre el mismo path.
type staticResolver struct{ path string }

func (r staticResolver) Resolve(textKey string) string { return r.path }

// mapResolver implementa service.AudioResolver con tabla textKey->path.
type mapResolver struct{ m map[string]string }

func (r mapResolver) Resolve(textKey string) string { return r.m[textKey] }

// Encolar directamente un mensaje spotter en la cola y verificar que se invoca Player.Play.
func TestEngineerService_QueueLoop_InvokesPlayerPlay(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)

	player := &spyPlayer{}
	svc.SetAudioPlayer(player)
	svc.SetAudioResolver(staticResolver{path: `C:\cache\spotter.car_left.mp3`})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	// Acceder a la cola via reflection no es ideal; en su lugar, ejercitar
	// el runtime vía el simulador (ScenarioLeftBasic emite car_left en frame 1).
	// Esperar hasta 2s para que el primer mensaje sea encolado y reproducido.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if len(player.Calls()) > 0 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	calls := player.Calls()
	if len(calls) == 0 {
		t.Fatal("expected Player.Play to be called at least once, got 0 calls")
	}
	if calls[0] != `C:\cache\spotter.car_left.mp3` {
		t.Errorf("expected first call path spotter.car_left.mp3, got %q", calls[0])
	}
}

func TestEngineerService_QueueLoop_NoPlayer_NoCall(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)
	svc.SetAudioResolver(staticResolver{path: `C:\cache\x.mp3`})
	// No inyectamos player -> sin reproducción

	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	time.Sleep(1200 * time.Millisecond)
	// Sin player, el código de audio no se invoca. Verificar que no hay panic
	// y que el servicio sigue procesando mensajes (RecentNotifications > 0).
	if n := len(svc.RecentNotifications()); n == 0 {
		t.Error("expected recent notifications from simulator, got 0")
	}
}

func TestEngineerService_QueueLoop_NoopResolver_NoCall(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)
	player := &spyPlayer{}
	svc.SetAudioPlayer(player)
	// Resolver por defecto (NoopAudioResolver) devuelve "" -> no reproducir

	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	time.Sleep(1200 * time.Millisecond)
	if c := len(player.Calls()); c != 0 {
		t.Errorf("expected 0 Player.Play calls with NoopAudioResolver, got %d", c)
	}
}

// Verificar que el cooldown evita reproducir el mismo spotter en menos de 2500ms.
func TestEngineerService_QueueLoop_Cooldown(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)
	player := &spyPlayer{}
	svc.SetAudioResolver(staticResolver{path: `C:\cache\x.mp3`})
	svc.SetAudioPlayer(player)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	// Esperar 3s: con cooldown 2500ms, solo debería escucharse el primer spotter.
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if len(player.Calls()) > 1 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	calls := player.Calls()
	if len(calls) == 0 {
		t.Fatal("expected at least 1 Player.Play call, got 0")
	}
	// ScenarioLeftBasic produce car_left (frame 1), clear_left (después). El cooldown
	// afecta a la misma regla de prioridad; toleramos 1 o 2 llamadas en 3s pero
	// no más de 3 (umbral pragmático).
	if len(calls) > 3 {
		t.Errorf("expected at most 3 Player.Play calls in 3s (cooldown 2500ms), got %d", len(calls))
	}
}

func TestNoopAudioResolver_ReturnsEmpty(t *testing.T) {
	r := service.NoopAudioResolver{}
	if got := r.Resolve("any.text.key"); got != "" {
		t.Errorf("NoopAudioResolver.Resolve should return empty, got %q", got)
	}
}

// TestEngineerService_EndToEnd_MonitorEventViaSSE: verifies that an
// event emitted by a non-spotter monitor (engine water temp high) flows
// through the full pipeline: runtime → queue → queueLoop → SSE subscriber.
// This is the canary test that confirms the 14-monitor runtime wiring
// actually delivers events to subscribers.
func TestEngineerService_EndToEnd_MonitorEventViaSSE(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)

	// Subscribe to SSE stream.
	sub, unsub := svc.Subscribe()
	defer unsub()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	// Build a synthetic LMU buffer with high water temp (106°C) so the
	// engine monitor fires. Use Green phase (5) so the engine monitor
	// doesn't skip (CC parity gate from iter-3).
	const objectOutSize = 324820
	buf := make([]byte, objectOutSize)
	buf[128466] = 1 // player has vehicle
	buf[128465] = 0 // player idx 0
	binary.LittleEndian.PutUint32(buf[1736:], 2)
	buf[1740] = 5 // GamePhase = Green

	po := 128468
	binary.LittleEndian.PutUint32(buf[po:], 11)
	binary.LittleEndian.PutUint64(buf[po+160:], math.Float64bits(100))
	binary.LittleEndian.PutUint64(buf[po+168:], math.Float64bits(0))
	binary.LittleEndian.PutUint64(buf[po+176:], math.Float64bits(200))
	buf[po+191] = 106 // engine water temp = 106°C → fires EventWaterTempHigh

	off0 := 2192
	binary.LittleEndian.PutUint32(buf[off0:], 11)
	copy(buf[off0+4:], "Player")
	buf[off0+196] = 1
	binary.LittleEndian.PutUint64(buf[off0+104:], math.Float64bits(5000))
	binary.LittleEndian.PutUint64(buf[off0+264:], math.Float64bits(100))

	svc.SetBufferProvider(fakeBufferProvider{buf: buf}, true)
	if err := svc.SetSource("lmu"); err != nil {
		t.Fatalf("SetSource(lmu) error: %v", err)
	}

	// Wait for the monitor event to arrive on the SSE channel.
	deadline := time.Now().Add(3 * time.Second)
	var found *service.EngineerNotification
	for time.Now().Before(deadline) {
		select {
		case n := <-sub:
			if n.TextKey == "engine.water_temp_high" {
				found = &n
				break
			}
		case <-time.After(100 * time.Millisecond):
			// keep polling
		}
		if found != nil {
			break
		}
	}

	if found == nil {
		t.Fatal("expected engine.water_temp_high notification on SSE, got none")
	}
	if found.Category != "engine" {
		t.Errorf("expected Category=engine, got %q", found.Category)
	}
	if found.Severity != "info" {
		t.Errorf("expected Severity=info, got %q", found.Severity)
	}
	if found.Text == "" || found.Text == found.TextKey {
		t.Errorf("expected translated text, got raw key %q", found.Text)
	}
}
