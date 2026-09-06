package app

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

// isa998BenchSink consume la salida del benchmark para que el compilador no
// elimine el trabajo medido.
var isa998BenchSink uint64

// BenchmarkIsa998RuntimeSink mide el camino productivo real del sink con
// defaults (engineON por flags nil, transportOFF sin Hub), en 2 y 64 coches
// con el mismo código.
//
// Entradas: lote sintético hardeningBatch (generado, no captura real; deriva
// su forma de engineerRuntimeBatch). Se preconstruye fuera del timer y por
// iteración solo avanzan Header.Cursor.Sequence, Header.Clock y
// State.SourceTime, como el benchmark existente: el setup con fmt.Sprintf no
// se mide. Salida consumida: BatchesApplied debe igualar las iteraciones.
//
// Límites (nombrados, no medidos aquí):
//
//   - En la baseline el shadow corre por defecto (compara 1 de cada 30,
//     presupuesto 2 ms con auto-disable al exceder). El coste previo al exceso
//     no se elimina; no atribuir como permanente el shadow forzado con
//     presupuesto alterado. Este bench usa defaults y reporta si la baseline
//     se autodesactivó.
//   - El verificador aislado solo puede medirse como coste local; el runtime
//     real va con defaults.
//   - Compila en base 210340b8 y candidato: sin símbolos shadow (el estado del
//     shadow se lee por reflexión solo si el campo existe).
//
// Medición: main, N>=10 secuencial/intercalado.
func BenchmarkIsa998RuntimeSink(b *testing.B) {
	for _, vehicles := range []int{2, 64} {
		b.Run(fmt.Sprintf("%dvehiculos", vehicles), func(b *testing.B) {
			runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
			if err != nil {
				b.Fatal(err)
			}
			batch := hardeningBatch(1, vehicles)
			var sequence uint64
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				sequence++
				batch.Header.Cursor.Sequence = schema.Sequence(sequence)
				batch.Header.Clock = hardeningClock(sequence)
				batch.State.SourceTime = runtimePresent(time.Duration(sequence-1) * hardeningSampleInterval)
				if err := (runtimeBatchSink{runtime: runtime}).WriteBatch(context.Background(), batch); err != nil {
					b.Fatal(err)
				}
			}
			b.StopTimer()
			metrics := runtime.Metrics()
			if metrics.BatchesApplied != sequence {
				b.Fatalf("BatchesApplied = %d, iterations = %d", metrics.BatchesApplied, sequence)
			}
			isa998BenchSink = metrics.BatchesApplied
			reportIsa998ShadowBaseline(b, metrics)
		})
	}
}

// reportIsa998ShadowBaseline informa si la baseline se autodesactivó, sin
// acoplar el bench al campo (ausente en el candidato).
func reportIsa998ShadowBaseline(b *testing.B, metrics TelemetryCoreMetrics) {
	b.Helper()
	value := reflect.ValueOf(metrics).FieldByName("ShadowDisabled")
	if !value.IsValid() {
		b.Log("isa998: shadow retirado de producción (candidato)")
		return
	}
	mismatches := 0
	if field := reflect.ValueOf(metrics).FieldByName("ShadowMismatches"); field.IsValid() && !field.IsNil() {
		mismatches = field.Len()
	}
	b.Logf("isa998: baseline shadow presente, disabled=%v campos=%d (budget default 2ms con auto-disable)",
		value.Bool(), mismatches)
}
