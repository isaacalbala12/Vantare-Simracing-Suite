# ISA-161 / TC-10B — replay, soak y benchmark Strategy live

Fecha: 2026-08-12.

Rama: `vantareapp/isa-161-tc-10b-productor-strategyliveprojection-v1`.

Base del corte: `f1f341bf5fddc2d4a22ee1afbca2541ad98afb23`, con
`merge-base origin/nightly` `8880a8800e07e2af21fe5ff37a714578bf8fcd00`.
Los comandos de esta evidencia se ejecutaron sobre esa base más el diff final
de Task 4. El SHA del commit único que incluye la propia evidencia se informa
fuera del archivo con `git rev-parse HEAD`: incrustarlo aquí cambiaría ese
mismo SHA.

## Alcance demostrado

- Replay canónico síncrono por `Step` y temporizado 4× con el mismo digest.
- Oráculo pequeño independiente para metadata, cursor `1/1`, sesión,
  progreso, pit y Fuel, incluida calidad `observed`/`derived` y `fresh`.
- Virtual Energy, tyres y weather continúan ausentes.
- El replay solo usa el contrato público de proyección; no lee storage privado
  de Strategy ni produce facts para STR-17.
- El soak existente conserva 121 muestras de un minuto, 64 vehículos,
  Engineer y recording SQLite, y añade simultáneamente Overlay y Strategy.
  Cada producto usa cinco consumidores rápidos y uno lento; el lento recibe el
  status retenido y únicamente el último `full` con cursor `1/121`. Un tercer
  `Next` por producto termina con `context.DeadlineExceeded`, demostrando que
  no queda backlog oculto.
- Las métricas prueban 121 batches y publicaciones canónicas, Overlay,
  Strategy y Engineer; ambos hubs reemplazan 120 snapshots, no retienen
  deltas, no rechazan observaciones, no reportan fallos y terminan con cero
  suscriptores. Recording termina completo, 121/121, cola cero y cero
  rechazos.
- Cada suscripción registra cleanup idempotente al adquirirla. El recorder
  registra cleanup inmediatamente después de `Start`: intenta un `Stop` limpio
  con contexto independiente y acotado antes de cancelar el contexto del run,
  por lo que un `t.Fatal` no deja el writer SQLite sin esperar.

No se registraron payloads, nombres de personas, rutas privadas ni PII en esta
evidencia.

## TDD observado

1. RED replay del productor ya presente: digest esperado
   `b77b80eab55217ba9a112ff5f34b9ef995132171f012e5e88af2383afb4a5602`
   frente a digest real
   `a288b037d4952303e29d69244b6d6dceb58cad06dd4ec6bbab3039c083690511`.
2. RED tras enriquecer el fixture y antes de tocar el golden: el mismo digest
   esperado antiguo frente al digest mecánico del JSON completo
   `e33867533dc2ef0fc1ec7394ee11511100576a680c70d30d10d726847bd093d6`.
3. RED soak: Overlay tenía 6 suscriptores actuales y Strategy 0, aunque ambos
   ya publicaban 121 snapshots. Después del wiring test-only, ambos productos
   conservan 6 suscriptores durante la prueba y 0 tras el teardown.
4. GREEN focal inicial: replay y soak pasan una repetición; después ambos
   pasan 20 repeticiones.
5. El hardening posterior de cleanup y cola vacía caracteriza garantías ya
   implementadas por `Subscription.Close`, `Coordinator.Stop` y el Hub. No se
   fabricó un RED mediante un fallo o evento artificial; el focal pasó al
   añadir la prueba observable faltante.

El golden contiene el SHA-256 calculado sobre el JSON completo de Overlay,
Analysis, Strategy, Engineer y EngineerFact; no es una constante elegida a
mano.

## Gates ejecutados

| Gate | Resultado |
| --- | --- |
| `gofmt` en los dos tests Go modificados | PASS |
| replay canónico focal `-count=20` | PASS, 0,029 s |
| soak lógico focal `-count=20` | PASS, 50,052 s |
| replay + app, paquetes completos `-count=1` | PASS; app 4,858 s |
| `go test -count=1 ./internal/telemetry/...` | PASS |
| `go vet ./internal/telemetry/recording/replay ./internal/app` | PASS |
| `git diff --check` | PASS |

`-race` no se ejecutó ni se declara PASS: el host devuelve
`CGO_ENABLED=0` y no tiene `gcc`. La verificación manual con LMU tampoco se
ejecutó en Task 4; el corte usa replay sanitizado y el soak lógico.

## Benchmark combinado

Comando exacto:

```text
go test -run '^$' -bench '^BenchmarkTelemetryCoreCombined64Vehicles$' -benchmem -count=5 ./internal/app
```

Entorno reportado por Go:

```text
goos: windows
goarch: amd64
pkg: github.com/vantare/overlays/v2/internal/app
cpu: AMD Ryzen 7 3700X 8-Core Processor
```

Salida de las cinco repeticiones:

```text
BenchmarkTelemetryCoreCombined64Vehicles-16         148  10558305 ns/op  1839893 B/op  201 allocs/op
BenchmarkTelemetryCoreCombined64Vehicles-16         127  11303093 ns/op  1816806 B/op  187 allocs/op
BenchmarkTelemetryCoreCombined64Vehicles-16         118   9283155 ns/op  1796107 B/op  187 allocs/op
BenchmarkTelemetryCoreCombined64Vehicles-16         140   8911258 ns/op  1827966 B/op  188 allocs/op
BenchmarkTelemetryCoreCombined64Vehicles-16         136   8118061 ns/op  1808440 B/op  187 allocs/op
PASS
ok github.com/vantare/overlays/v2/internal/app 6.573s
```

Rango observado: 8,118–11,303 ms/op, 1.796.107–1.839.893 B/op y 187–201
allocs/op. El nombre histórico se conserva, pero un guard fuera del timer exige
una publicación Overlay, una Strategy y una entrega Engineer por iteración.
Este benchmark es evidencia local comparativa; no define un umbral de CI.

## Riesgos y verificación manual pendiente

- SQLite depende del rendimiento de disco local; el timeout lógico explícito
  sigue acotado a 30 s por repetición. Veinte repeticiones completaron sin
  rechazo ni cola residual.
- El benchmark incluye el fan-out productivo Overlay + Engineer + Strategy,
  pero no sustituye una sesión LMU real.
- Antes de promover, Isaac debe abrir LMU, observar Strategy junto a Overlay y
  Engineer, comprobar desconexión/reconexión y confirmar cierre sin procesos o
  suscriptores residuales.
