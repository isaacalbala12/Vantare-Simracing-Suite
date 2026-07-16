package penalties

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/lmu"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// makeExtendedReader crea un reader con buffer sintetico para tests.
// El buffer se rellena con el mensaje de historial dado.
func makeExtendedReader(historyMsg string) *lmu.ExtendedReader {
	// ExtendedReader solo existe en Windows con //go:build windows.
	// En otras plataformas esta funcion no se compilaria porque la
	// importacion de lmu fallaria al no encontrar el tipo ExtendedReader.
	// Para mantener los tests multiplataforma, usamos el constructor
	// exportado NewExtendedReaderFromBuffer del paquete lmu.
	buf := lmu.NewSyntheticExtendedBuffer()
	if historyMsg != "" {
		copy(buf[lmu.LastHistoryMessageOffset:], historyMsg)
	}
	return lmu.NewExtendedReaderFromBuffer(buf)
}

// TestClassifyFromHistoryMessage verifica la funcion de clasificacion
// de mensajes de historial directamente.
func TestClassifyFromHistoryMessage(t *testing.T) {
	tests := []struct {
		msg  string
		want string
	}{
		{"Stop/Go Penalty: Cut Track", EventNewStopAndGo},
		{"Stop/Go Penalty: Speeding In Pitlane", EventNewStopAndGo},
		{"Stop/Go Penalty: False Start", EventNewStopAndGo},
		{"Drive-Thru Penalty: Speeding In Pitlane", EventNewDriveThrough},
		{"Drive-Thru Penalty:  False Start", EventNewDriveThrough},
		{"Drive-Thru Penalty:  Ignored Blue Flags", EventNewDriveThrough},
		{"Warning: Driving Too Slow", ""},
		{"Crew Is Ready For Pitstop", ""},
		{"", ""},
	}
	for _, tc := range tests {
		t.Run(tc.msg[:min(len(tc.msg), 30)], func(t *testing.T) {
			got := classifyFromHistoryMessage(tc.msg)
			if got != tc.want {
				t.Errorf("classifyFromHistoryMessage(%q) = %q, want %q", tc.msg, got, tc.want)
			}
		})
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// TestClassifyFromHistoryMessage_Empty verifica que mensaje vacio devuelva "".
func TestClassifyFromHistoryMessage_Empty(t *testing.T) {
	if got := classifyFromHistoryMessage(""); got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}

// TestClassifyFromHistoryMessage_PartialMatch verifica que prefijos
// parciales no produzcan falsos positivos.
func TestClassifyFromHistoryMessage_PartialMatch(t *testing.T) {
	if got := classifyFromHistoryMessage("Stop"); got != "" {
		t.Errorf("expected empty for 'Stop', got %q", got)
	}
	if got := classifyFromHistoryMessage("Drive"); got != "" {
		t.Errorf("expected empty for 'Drive', got %q", got)
	}
}

func mkFrame(penalties int32) *telemetry.Frame {
	return &telemetry.Frame{
		Session: &telemetry.SessionInfo{GamePhase: 5},
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: true, Penalties: penalties, LapDistance: 100},
		},
	}
}

func TestMonitor_RisingEdgeEmitsEvent(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0), mkFrame(1))
	if len(evs) != 1 || evs[0].Type != EventNewDriveThrough {
		t.Fatalf("expected 1 EventNewDriveThrough, got %+v", evs)
	}
}

func TestMonitor_NoEventWhenAlreadyPenalized(t *testing.T) {
	m := NewMonitor()
	// First frame already has penalty=2; second frame still 2 — no rising edge.
	evs := m.Trigger(1000, mkFrame(2), mkFrame(2))
	if evs != nil {
		t.Errorf("expected nil (no rising edge), got %+v", evs)
	}
}

func TestMonitor_NoEventWhenCleared(t *testing.T) {
	m := NewMonitor()
	// Penalty went 2 -> 0 (served). Not a rising edge, but IS a served event.
	evs := m.Trigger(1000, mkFrame(2), mkFrame(0))
	if len(evs) != 1 || evs[0].Type != EventPenaltyServed {
		t.Errorf("expected 1 EventPenaltyServed, got %+v", evs)
	}
}

func TestMonitor_Cooldown30s(t *testing.T) {
	m := NewMonitor()
	// Simulate 4 frames: imposed, served, re-imposed after cooldown, etc.
	// Behaviour: a rising edge 0->>0 fires (subject to cooldown); once the
	// monitor has seen a non-zero value, it stays "armed" until it sees 0,
	// at which point the next >0 is again a fresh rising edge (subject to cooldown).
	frames := []struct {
		prev  int32
		curr  int32
		nowMS int64
		want  int // expected events (includes both penalty AND served events)
	}{
		{prev: 0, curr: 1, nowMS: 100_000, want: 1}, // imposed -> fire (rising edge)
		{prev: 1, curr: 0, nowMS: 100_001, want: 1}, // served -> fire (EventPenaltyServed)
		{prev: 0, curr: 1, nowMS: 105_000, want: 0}, // re-imposed 5s after first: cooldown blocks (lastEmitMS=100000, 5s < 30s)
		{prev: 1, curr: 1, nowMS: 131_000, want: 0}, // no change (1->1)
		{prev: 1, curr: 0, nowMS: 132_000, want: 1}, // served -> fire (EventPenaltyServed)
		{prev: 0, curr: 1, nowMS: 200_000, want: 1}, // 100s after first penalty: cooldown elapsed, fires
	}
	for i, tc := range frames {
		evs := m.Trigger(tc.nowMS, mkFrame(tc.prev), mkFrame(tc.curr))
		got := len(evs)
		if got != tc.want {
			t.Errorf("frame %d (prev=%d curr=%d now=%d): expected %d events, got %d (%+v)",
				i, tc.prev, tc.curr, tc.nowMS, tc.want, got, evs)
		}
	}
}

func TestMonitor_NilPrevFiresOnFirstPenalty(t *testing.T) {
	m := NewMonitor()
	// No previous frame; current has penalty=1.
	evs := m.Trigger(1000, nil, mkFrame(1))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event, got %+v", evs)
	}
}

func TestMonitor_NilCurrNoPanic(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0), nil)
	if evs != nil {
		t.Errorf("expected nil, got %+v", evs)
	}
}

func TestMonitor_NoPlayerVehicle(t *testing.T) {
	m := NewMonitor()
	// Two non-player vehicles — no single player, no fallback.
	f := &telemetry.Frame{
		Vehicles: []telemetry.VehicleScoring{
			{ID: 1, IsPlayer: false, Penalties: 5},
			{ID: 2, IsPlayer: false, Penalties: 0},
		},
	}
	evs := m.Trigger(1000, nil, f)
	if evs != nil {
		t.Errorf("expected nil (no player), got %+v", evs)
	}
}

// --- Extended penalty detection tests ---

// TestMonitor_ExtendedReader_StopGo clasifica Stop/Go Penalty mediante
// ExtendedReader.
func TestMonitor_ExtendedReader_StopGo(t *testing.T) {
	reader := makeExtendedReader("Stop/Go Penalty: Cut Track")
	m := NewMonitor()
	m.SetExtendedReader(reader)

	evs := m.Trigger(1000, mkFrame(0), mkFrame(1))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event, got %+v", evs)
	}
	if evs[0].Type != EventNewStopAndGo {
		t.Errorf("expected EventNewStopAndGo, got %s", evs[0].Type)
	}
}

// TestMonitor_ExtendedReader_DriveThrough clasifica Drive-Thru Penalty
// mediante ExtendedReader.
func TestMonitor_ExtendedReader_DriveThrough(t *testing.T) {
	reader := makeExtendedReader("Drive-Thru Penalty: Speeding In Pitlane")
	m := NewMonitor()
	m.SetExtendedReader(reader)

	evs := m.Trigger(1000, mkFrame(0), mkFrame(1))
	if len(evs) != 1 {
		t.Fatalf("expected 1 event, got %+v", evs)
	}
	if evs[0].Type != EventNewDriveThrough {
		t.Errorf("expected EventNewDriveThrough, got %s", evs[0].Type)
	}
}

// TestMonitor_ExtendedReader_UnchangedMessage no deberia reclasificar
// si el mensaje de historial no ha cambiado.
func TestMonitor_ExtendedReader_UnchangedMessage(t *testing.T) {
	reader := makeExtendedReader("Stop/Go Penalty: Cut Track")
	m := NewMonitor()
	m.SetExtendedReader(reader)

	// Primera penalizacion -> Stop/Go.
	evs1 := m.Trigger(1000, mkFrame(0), mkFrame(1))
	if len(evs1) != 1 || evs1[0].Type != EventNewStopAndGo {
		t.Fatalf("expected 1 EventNewStopAndGo, got %+v", evs1)
	}

	// Servir la penalizacion (1->0).
	_ = m.Trigger(2000, mkFrame(1), mkFrame(0))

	// Segunda penalizacion (despues de cooldown) -> mismo mensaje,
	// deberia usar defaultEventType porque el mensaje no ha cambiado.
	evs2 := m.Trigger(200_000, mkFrame(0), mkFrame(1))
	if len(evs2) != 1 {
		t.Fatalf("expected 1 event on second penalty, got %+v", evs2)
	}
	// Como el mensaje no ha cambiado, readHistoryMessageType devuelve ""
	// y se usa defaultEventType.
	if evs2[0].Type != defaultEventType {
		t.Errorf("expected default event type %s for unchanged msg, got %s",
			defaultEventType, evs2[0].Type)
	}
}

// TestMonitor_ExtendedReader_FallbackToDefault usa defaultEventType
// cuando el reader no esta configurado.
func TestMonitor_ExtendedReader_FallbackToDefault(t *testing.T) {
	m := NewMonitor()
	// Sin SetExtendedReader.

	evs := m.Trigger(1000, mkFrame(0), mkFrame(1))
	if len(evs) != 1 || evs[0].Type != defaultEventType {
		t.Fatalf("expected 1 default event, got %+v", evs)
	}
}

// TestMonitor_PenaltyServed dispara EventPenaltyServed cuando el contador
// vuelve de >0 a 0.
func TestMonitor_PenaltyServed(t *testing.T) {
	m := NewMonitor()
	// Primero simular que ya tenia penalizacion.
	m.Trigger(1000, mkFrame(0), mkFrame(1))

	// Ahora penalty servido: >0 -> 0.
	evs := m.Trigger(2000, mkFrame(1), mkFrame(0))
	if len(evs) != 1 {
		t.Fatalf("expected 1 EventPenaltyServed, got %+v", evs)
	}
	if evs[0].Type != EventPenaltyServed {
		t.Errorf("expected EventPenaltyServed, got %s", evs[0].Type)
	}
}

// TestMonitor_PenaltyServed_NoFalsePositive verifica que no se dispare
// EventPenaltyServed si nunca hubo penalizacion.
func TestMonitor_PenaltyServed_NoFalsePositive(t *testing.T) {
	m := NewMonitor()
	evs := m.Trigger(1000, mkFrame(0), mkFrame(0))
	if evs != nil {
		t.Errorf("expected nil events for 0->0 transition, got %+v", evs)
	}
}

// TestMonitor_PenaltyServed_MultipleCalls solo dispara una vez cuando
// se mantiene en 0.
func TestMonitor_PenaltyServed_MultipleCalls(t *testing.T) {
	m := NewMonitor()
	m.Trigger(1000, mkFrame(0), mkFrame(1))         // impose
	evs1 := m.Trigger(2000, mkFrame(1), mkFrame(0)) // serve
	if len(evs1) != 1 || evs1[0].Type != EventPenaltyServed {
		t.Fatalf("expected EventPenaltyServed on first 0, got %+v", evs1)
	}

	// Siguiente frame con 0 otra vez — no debe disparar de nuevo.
	evs2 := m.Trigger(3000, mkFrame(0), mkFrame(0))
	if evs2 != nil {
		t.Errorf("expected nil on second 0 frame, got %+v", evs2)
	}
}
