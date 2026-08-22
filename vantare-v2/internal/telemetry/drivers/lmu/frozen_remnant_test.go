package lmu

import (
	"context"
	"testing"
	"time"

	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
)

// TestFrozenRemnantIsNotPublishedAsFresh reproduce el bug del frame congelado:
// tras salir al menu LMU 1.4.1.3 mantiene minutos el ultimo frame con reloj
// congelado. El driver no debe seguir sirviendolo como si fuera fresco.
func TestFrozenRemnantIsNotPublishedAsFresh(t *testing.T) {
	buf := knownBuffer(t) // track fixture, player=true, source_time avanza
	// Usamos un reader que devuelve siempre el mismo buffer (congelado).
	reader := &testReader{data: buf}
	ticks := &manualTicker{ticks: make(chan time.Time)}
	elapsed := time.Duration(0)
	elapsedFn := func() time.Duration { return elapsed }
	now := time.Unix(1000, 0).UTC()
	driver := newTestDriver(config{
		open:      func() (memoryReader, error) { return reader, nil },
		now:       func() time.Time { return now },
		elapsed:   elapsedFn,
		newTicker: func(time.Duration) ticker { return ticks },
		interval:  time.Hour, // no auto ticks; controlamos manualmente
	})
	sink := &collectingSink{values: make(chan Observation, 10)}
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()

	// Primer frame: debe publicarse.
	first := <-sink.values
	if state := driver.RuntimeSnapshot().State; state != drivercontract.StateLive {
		t.Fatalf("primer frame state = %s, want live", state)
	}
	_ = first

	// Simular 3 segundos de remanente congelado (source_time no avanza).
	// Con el gate actual (limit 500ms, recovery 2s) el segundo frame ya es stale,
	// pero el bug es que se sigue publicando como dato util (player=true).
	elapsed = 3 * time.Second
	ticks.ticks <- now
	// Tras el fix, el frame congelado prolongado no debe publicarse como fresco
	// ni como stale util: debe suprimirse o transformarse a menu/stale.
	select {
	case obs := <-sink.values:
		// Antes del fix: llega un segundo frame con player=true aunque congelado.
		// Despues del fix: no debe llegar, o debe llegar como menu/stale.
		if player, _ := obs.PlayerPresent.Value(); player {
			// Si sigue llegando con player true, el bug persiste.
			t.Fatalf("frame congelado publicado como player=true (stale=%v) — debe suprimirse o ser menu", obs.SourceTime.Freshness())
		}
		// Si llega como menu (player false) tambien es aceptable.
	case <-time.After(200 * time.Millisecond):
		// Supresion total tambien es valida: el pipeline deja de servir el ultimo
		// frame vivo y el watchdog pasa a stale/menu.
	}

	cancel()
	<-done
}
