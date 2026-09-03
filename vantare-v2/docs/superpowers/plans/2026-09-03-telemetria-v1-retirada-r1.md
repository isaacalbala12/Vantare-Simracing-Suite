# Retirada V1 — R1 pull Go exclusivamente V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** eliminar la dependencia y entrega V1 del pull dirigido de Wails sin alterar su contrato V2 ni las garantías de entrega/cierre.

**Architecture:** `OverlayPullTransport` recibe únicamente `PublisherRegistry`. Conserva ACK, sesión, replay, latest-wins y ownership. El productor/SSE/cliente legacy quedan para cortes posteriores; no se declara retirada completa. Sin hub opcional, interfaz nueva, segunda implementación o fallback.

**Tech Stack:** Go/Wails, tests existentes y fixtures V2; sin dependencias nuevas.

---

## Estado, base y autorización

**Preparado por R0, no ejecutado.** Issue [ISA-894](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/894).
Usar el SHA documental final de R0 una vez revisado y registrado en esa issue;
su código congelado es `8e8ec17b2d2b660d717316c10925a6b93d073d1c`.
Revalidar raíz/rama/HEAD/status y diff antes de abrir writer nuevo. No asumir
que #969/R0 estén integrados en Nightly. Rama propuesta
`vantareapp/isa-894-retirada-v1-r1`, worktree `C:\tmp\vantare-v1-retirada-r1`.
Sólo Muse Spark 1.3 Contributor xhigh; writer único, reviews independientes.

Insumos: [inventario](../../telemetry-core/evidence/isa-894/retirada-v1-inventario-20260903.md),
[rollback](../../telemetry-core/evidence/isa-894/retirada-v1-rollback-20260903.md),
[checks R0](../../telemetry-core/evidence/isa-894/retirada-v1-checks-20260903.md).
R1 no cambia stores/schemas, perfiles, UI, Hz, Core ni fuentes auxiliares.
No ejecuta apps/LMU, mediciones físicas o promociones.

## Archivos del conjunto cerrado

Todos bajo `vantare-v2/`:

| Archivo | Cambio permitido |
| --- | --- |
| `internal/app/telemetrytransport/overlay_pull.go` | Quitar Hub de struct/ctor/guard/currentEvents; conservar algoritmo de sesión |
| `cmd/vantare/main.go` | Único caller productivo del constructor: quitar argumento `Hub()` |
| `internal/app/telemetrytransport/overlay_pull_test.go` | Nuevo negativo V1 y migrar pruebas existentes a payload V2, sin eliminar escenarios |
| `internal/app/telemetrytransport/publisher_test.go` | Actualizar ctor; conservar identidad bytes pull/SSE |
| `internal/app/telemetrytransport/overlay_pull_bench_test.go` | Medir sólo V2, warmup con ACK real; no falsear etiquetas dual/V1 |
| `cmd/vantare/telemetry_lifecycle_harness_test.go` | Dos callers y aserciones: V1 sigue comprobado por SSE, pull sólo V2; Strategy intacto |

El coordinador actualiza handoff/issue/`plan.md`/digest y evidencia. Cualquier
otro fichero productivo necesario obliga a parar y revisar esta unidad, no a
ampliarla silenciosamente.

## Tarea 1 — RED que distingue V1 de V2

- [ ] Añadir al archivo de tests del pull este test, **con el constructor antiguo**:

```go
func TestOverlayPullExcludesLegacyEvenWhenPublished(t *testing.T) {
    for _, hasV2 := range []bool{false, true} {
        name := "legacy-only"
        if hasV2 { name = "legacy-and-v2" }
        t.Run(name, func(t *testing.T) {
            hub := NewHub(HubConfig{Product: ProductOverlay})
            if err := hub.PublishStatus(mustStatus(t, 1, map[string]any{"state": "live"})); err != nil {
                t.Fatal(err)
            }
            if err := hub.PublishSnapshot(mustSnapshot(t, 1, 1, Full, 1, map[string]any{"sequence": 1}), nil); err != nil {
                t.Fatal(err)
            }
            registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
            if hasV2 {
                if err := registry.PublishStatus(ProductOverlayV2, 1, map[string]any{"revision": 1}); err != nil {
                    t.Fatal(err)
                }
            }
            transport := NewOverlayPullTransport(hub, registry)
            defer transport.CloseAll()
            response, deliver, err := transport.Pull("overlay-window", OverlayPullRequest{SessionID: "test", Ack: 0})
            if err != nil { t.Fatal(err) }
            if deliver != hasV2 { t.Fatalf("deliver=%v want=%v: %#v", deliver, hasV2, response) }
            if !hasV2 {
                if len(response.Events) != 0 { t.Fatalf("legacy events: %#v", response.Events) }
                return
            }
            if len(response.Events) != 1 { t.Fatalf("events=%#v", response.Events) }
            assertPullEventContains(t, response.Events, PublisherEventName(ProductOverlayV2, PublisherEventStatus), `"revision":1`)
        })
    }
}
```

- [ ] Ejecutar `go test ./internal/app/telemetrytransport -run '^TestOverlayPullExcludesLegacyEvenWhenPublished$' -count=1`.
  Esperado: FAIL conductual por V1 entregado (no un error de compilación/imports).
  Guardar salida antes de modificar producción; si no falla, investigar la base.

## Tarea 2 — GREEN mínimo y sin dependencia muerta

- [ ] Quitar `hub *Hub` del struct y sustituir constructor por:

```go
func NewOverlayPullTransport(registry *PublisherRegistry) *OverlayPullTransport {
    return &OverlayPullTransport{
        registry: registry,
        sessions: make(map[string]*overlayPullSession),
        retired: make(map[string][]string),
    }
}
```

- [ ] En el guard inicial de `Pull`, eliminar únicamente `transport.hub == nil ||`.
  En `Pull`, sustituir la llamada y rama de error de `currentEvents` por
  `events := transport.currentEvents(session)`. Mantener error del registro del
  consumidor y el resto del método. Reemplazar `currentEvents` por:

```go
func (transport *OverlayPullTransport) currentEvents(session *overlayPullSession) []OverlayPullEvent {
    candidates := make([]OverlayPullEvent, 0, 2)
    if event, ok := session.publisher.ReplayStatus(); ok {
        candidates = append(candidates, OverlayPullEvent{
            Name: PublisherEventName(event.Product, event.Kind), Data: event.Data,
        })
    }
    if event, ok := session.publisher.ReplaySnapshot(); ok {
        candidates = append(candidates, OverlayPullEvent{
            Name: PublisherEventName(event.Product, event.Kind), Data: event.Data,
        })
    }
    changed := make([]OverlayPullEvent, 0, len(candidates))
    for _, event := range candidates {
        if bytes.Equal(session.last[event.Name], event.Data) { continue }
        data := append(json.RawMessage(nil), event.Data...)
        session.last[event.Name] = data
        changed = append(changed, OverlayPullEvent{Name: event.Name, Data: data})
    }
    return changed
}
```

- [ ] Cambiar cada ctor de la lista cerrada de archivos de
  `NewOverlayPullTransport(hub, registry)` a `NewOverlayPullTransport(registry)`;
  en main/harness la forma es
  `telemetrytransport.NewOverlayPullTransport(telemetryRuntime.OverlayV2Publishers())`
  (main usa la variable existente `telemetryCoreRuntime`). El caso nil pasa de
  `NewOverlayPullTransport(nil, nil)` a `NewOverlayPullTransport(nil)`.
  El nuevo test RED conserva Hub como productor independiente, pero ya no lo
  inyecta. No conservar campo/argumento/variadic sin uso por compatibilidad.

- [ ] Migrar el escenario lento sin borrar sus assertions: sembrar status V2
  mediante `registry.PublishStatus(ProductOverlayV2, 1, map[string]any{"revision": 1})`;
  tras primer pull, publicar revisiones 2..100 con `publisher.PublishSnapshot`.
  Primer delivery status V2; ACK perdido devuelve mismos bytes; siguiente ACK
  entrega revisión 100, nunca 99. Mantener cierres antiguo/vigente y desactivación.
  No usar un consumidor extra permanente que impida probar liberación del último.

- [ ] En lifecycle conservar el V1 golden/SSE (esa ruta no se retira aquí).
  Sustituir sólo el cursor V1 leído de `wails[...]` por el mismo leído de `sse[...]`.
  Añadir negativo sobre cada `pulled.Events`: nombre sólo status/snapshot V2,
  y exigir presencia explícita de `overlayV2StatusName`. Mantener comparaciones
  bytes V2 pull/SSE y todos los status/cursor/cierres Strategy.

## Tarea 3 — benchmark honesto y protección de consumidor

- [ ] Reemplazar casos dual/V1 por tamaños 1, 20, 44, 104 V2-only. Conservar
  `benchmarkOverlayUpdateV2` e historias de 120 muestras; no crear un pull V1
  privado para mantener la comparación. Resultados viejos siguen en evidencia.
  No borrar helpers V1 que aún usen otros benchmarks sin comprobar importadores.
- [ ] Warmup V2: primer `Pull(Ack:0)` registra consumidor pero puede no entregar;
  publicar snapshot revisión 1, luego `Pull(Ack:0)` debe entregar. Guardar su
  `Delivery` como ACK inicial. **No codificar Ack:1** tras respuesta vacía.
  Iteraciones publican revisión siguiente fuera de la zona cronometrada y usan
  ACK real. Exigir entrega y snapshot V2 en cada iteración. Métrica sólo `v2_bytes`.
- [ ] El cliente TS no cambia: allowlist acepta V2 aunque no llegue V1. Mantener
  temporalmente `receivedV1Projections` para no cambiar shape del banco. Documentar
  que ON de paridad Wails ya no es aplicable; campo ausente no se convierte a cero
  (`sesion-v1-resumen.mjs:187` usa `Infinity`). No ejecutar ni publicar viejo ON como PASS.

## Tarea 4 — checks, review y entrega aislada

- [ ] `gofmt -w` sólo los seis archivos Go anteriores que se hayan modificado.
- [ ] Ejecutar el focal RED anterior (ahora PASS), después:

```powershell
corepack pnpm --dir frontend typecheck
corepack pnpm --dir frontend build
go test ./internal/app/telemetrytransport -count=1
go test ./cmd/vantare -run 'TestOverlayPullHTTPService|TestTelemetryLifecycleHarness|TestTelemetryStatusReplay' -count=1
go test ./...
corepack pnpm --dir frontend exec vitest run src/telemetry-transport/overlay-wails-pull.test.ts src/hub/overlay-studio/studio-overlay-telemetry.test.ts src/overlay/transports/legacy-retirement.test.ts --maxWorkers=2
```

Registrar salida de cada comando, skips y fallos heredados; no llamar verde a
una suite parcial. No activar pruebas físicas opt-in ni lanzar LMU/apps. El
benchmark requiere al menos un smoke controlado de iteración, no campaña de
rendimiento; si se ejecuta, registrarlo como sintético, nunca resultado LMU.

- [ ] Confirmar con `rg -n 'NewOverlayPullTransport' cmd internal` que todos los
  callers usan la firma nueva, y que `overlay_pull.go` no importa/retiene Hub.
  `git diff --check`, revisar diff completo y confirmar cero cambio de persistencia.
- [ ] Muse independiente: spec review y después quality/adversarial review del
  mismo SHA. No cerrar hallazgos por el informe del implementador solamente.
- [ ] Actualizar issue/handoff/roadmap/digest/evidencia con delta de código y
  alcance exacto. Commit/push/PR draft a Nightly; ningún merge implícito. El
  rollback de entrega es la build preservada, no un flag que reintroduzca V1.

**Done R1:** pull no recibe/retiene/entrega V1, V2 conserva garantías y tests,
bench no miente sobre variantes y review acepta. **No significa:** productor/SSE/
builders/flags eliminados, V2 auditado o rendimiento óptimo certificado.
