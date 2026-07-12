// Package penalties implements a minimal Penalties monitor for alpha 1:
// detects when the player first receives a Drive-Through or Stop&Go
// penalty (rising edge on the public Penalties counter) and emits a
// single event the runtime can enqueue.
//
// Parity CC: Events/Penalties.cs (full implementation has many
// sub-types: cutting, false start, FCY pass, slow-down, time deduction,
// pit stop, meatball flag, plus 1/2/3 laps-to-serve, pit-now, etc.). For
// alpha 1 we only distinguish the two main buckets the user hears
// ("new drive-through" / "new stop-and-go"). The full mapping is G2.x
// scope and requires live capture of mLastHistoryMessage sub-strings
// in LMU (NO_VERIFICADO — see audit 2026-06-27).
//
// Con ExtendedReader opcional, el monitor puede leer el mensaje de
// historial (mLastHistoryMessage) del buffer Extended de LMU para
// clasificar con precision el tipo de penalizacion y detectar
// "penalty served" (cuando el contador vuelve a cero tras cumplirla).
package penalties

import (
	"log"
	"strings"
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/lmu"
	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// Event types emitted by Monitor.
const (
	EventNewDriveThrough = "penalties.new_drivethrough"
	EventNewStopAndGo    = "penalties.new_stopgo"
	EventPenaltyServed   = "penalties.penalty_served"
)

// Event is the monitor's output.
type Event struct {
	Type      string
	ExpiresAt int64 // unix-ms; 0 means no expiry
}

// Drive-through and stop-and-go show up as a non-zero Penalties counter
// on the player vehicle. The public parser already populates
// VehicleScoring.Penalties from offset 194 of vehicleScoring (per LMU
// shared memory). At the monitor layer we just need the rising edge
// from 0 to >0 — we don't try to distinguish DT from S&G by counter
// value alone (LMU uses a single counter; the distinction comes from
// the history message which we don't decode in alpha 1).
//
// In alpha 1 the monitor emits EventNewDriveThrough by default when
// Penalties rises; for accurate DT vs S&G discrimination we need live
// capture (G2.x). This is a documented gap.
const (
	defaultEventType  = EventNewDriveThrough
	defaultCooldownMS = 30_000 // 30s — avoid double-firing on the same penalty
)

// Monitor tracks penalty counter transitions.
type Monitor struct {
	mu sync.Mutex

	lastPenalties int32
	lastEmitMS    int64
	initialized   bool

	// Opcional: lector del buffer Extended para clasificar penalizaciones
	// mediante mLastHistoryMessage.
	extendedReader *lmu.ExtendedReader
	// Ultimo mensaje de historial procesado para evitar re-procesamiento.
	lastHistoryMsg string
}

// NewMonitor creates a Monitor.
func NewMonitor() *Monitor {
	return &Monitor{}
}

// SetExtendedReader asigna un ExtendedReader opcional para leer mensajes
// de historial del buffer Extended de LMU. Si se asigna, Trigger() puede
// clasificar con mas precision el tipo de penalizacion.
func (m *Monitor) SetExtendedReader(reader *lmu.ExtendedReader) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.extendedReader = reader
}

// classifyFromHistoryMessage analiza el mensaje de historial del buffer
// Extended para determinar el tipo de penalizacion.
// Devuelve el tipo de evento, o "" si no se puede clasificar.
func classifyFromHistoryMessage(msg string) string {
	if strings.HasPrefix(msg, "Stop/Go Penalty: ") {
		return EventNewStopAndGo
	}
	if strings.HasPrefix(msg, "Drive-Thru Penalty: ") {
		return EventNewDriveThrough
	}
	return ""
}

// Trigger inspects the current frame and returns events for penalty
// transitions. prev may be nil on the first call.
func (m *Monitor) Trigger(nowMS int64, prev, curr *telemetry.Frame) []Event {
	if curr == nil {
		return nil
	}
	player := telemetry.FindPlayerVehicle(curr)
	if player == nil {
		return nil
	}

	// On the first call (or after restart), seed lastPenalties from prev if
	// available so the first rising edge is detected correctly. Without
	// this, a nil prev followed by a non-zero current would be treated as
	// "already had penalty" and no event would fire.
	if !m.initialized {
		if prev != nil {
			if p := telemetry.FindPlayerVehicle(prev); p != nil {
				m.lastPenalties = p.Penalties
			}
		}
		m.initialized = true
	}

	var out []Event

	cooldownStart := m.lastEmitMS
	if cooldownStart == 0 {
		cooldownStart = nowMS - defaultCooldownMS
	}

	// --- Deteccion de nueva penalizacion (rising edge) ---
	if player.Penalties > 0 && m.lastPenalties == 0 && nowMS-cooldownStart >= defaultCooldownMS {
		m.lastEmitMS = nowMS
		m.lastPenalties = player.Penalties

		// Intentar clasificar mediante el mensaje de historial.
		eventType := m.readHistoryMessageType()
		if eventType == "" {
			eventType = defaultEventType
		}
		out = append(out, Event{Type: eventType, ExpiresAt: nowMS + 5000})
	}

	// --- Deteccion de penalty servido (falling edge: penalties >0 → 0) ---
	if player.Penalties == 0 && m.lastPenalties > 0 {
		m.lastPenalties = player.Penalties
		out = append(out, Event{Type: EventPenaltyServed, ExpiresAt: nowMS + 5000})
		return out
	}

	m.lastPenalties = player.Penalties
	return out
}

// readHistoryMessageType intenta leer el mensaje de historial del buffer
// Extended. Si el reader no esta configurado o falla la lectura, devuelve "".
func (m *Monitor) readHistoryMessageType() string {
	m.mu.Lock()
	reader := m.extendedReader
	m.mu.Unlock()
	if reader == nil {
		return ""
	}
	data, err := reader.Read()
	if err != nil {
		log.Printf("penalties: extendedReader.Read() error: %v", err)
		return ""
	}
	// Evitar re-procesar el mismo mensaje.
	if data.LastHistoryMessage == m.lastHistoryMsg {
		return ""
	}
	m.lastHistoryMsg = data.LastHistoryMessage
	return classifyFromHistoryMessage(data.LastHistoryMessage)
}
