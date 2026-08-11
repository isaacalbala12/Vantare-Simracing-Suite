# Spotter observable — plan de fase

Estado: entrada documental aceptada humanamente por Isaac el 2026-08-12 dentro
de ISA-313 / ENG-R01 Fase 5. S1 está en replanning técnico con ISA-327 y rama
propia; la implementación no comienza hasta aprobar el microplan de S1. S2-S7
siguen como subfases probables. ISA-189 (S2), ISA-187 (S4) e ISA-314 quedan
diferidos expresamente hasta cerrar S1.

## Resultado

Vantare entrega un Spotter de seguridad y tráfico para LMU en español e inglés.
Una misma decisión fresca alimenta audio Kokoro preparado/cacheado y la salida
visual compartida. El piloto recibe avisos oportunos, o una degradación visible
y honesta cuando faltan señal, certeza, audio o dispositivo.

Vantare replica y mejora capacidades observables de CrewChief, no su
arquitectura, código, constantes, frases, sonidos, assets ni estructura. El
implementer trabaja solo con contratos y evidencia propios de Vantare y, cuando
corresponda, con el brief clean-room autorizado.

## Alcance

Incluye:

- ocupación lateral, tráfico cercano, clears y estados de ambos lados;
- tráfico multiclase, doblados y peligros demostrables;
- lifecycle de sesión, pérdida y recuperación de fuente;
- prioridad, cadencia, debounce, expiración, clears y cooldowns;
- reproducción, beeps o señales propias, dispositivo, hot-plug y fallback;
- sincronía de intención, locale, timing y lifecycle entre audio, radio,
  subtítulos, Desktop y OBS;
- medición separada de decisión, transporte, comienzo del player y audibilidad;
- aceptación acumulativa manual y evaluable por IA.

Quedan fuera el cambio de piloto, acciones sobre LMU, conversación libre,
wake word, otros simuladores y cualquier asset de terceros no autorizado.

## Arquitectura mínima

```text
Telemetría canónica
  -> estado Spotter
  -> mensaje y política
  -> audio Kokoro preparado/cacheado + visual compartido
```

- Telemetry Core es la única fuente de datos y calidad.
- Spotter mantiene solo el estado necesario para decidir seguridad y tráfico.
- La política gobierna prioridad, tempo, debounce, clears, cooldowns y
  expiración sin crear un framework nuevo.
- Kokoro es el único TTS de Vantare. Las alertas de seguridad usan clips
  preparados/cacheados y un camino inmediato simple. No se sintetiza en el
  hot path hasta que exista evidencia que justifique revisarlo.
- Audio y visual nacen de la misma presentación. `WidgetVisualHost` sigue
  siendo la frontera visual compartida; no se crea otro renderer.

Este plan no fija algoritmos, constantes, archivos ni abstracciones futuras.
Cada subfase decide el corte mínimo desde la Nightly vigente y se detiene si
requiere arquitectura, dependencia o alcance nuevos.

## Entrada común de cada subfase

1. Verificar Nightly, Linear, handoff, capacidades y evidencia actuales.
2. Leer este plan y la [aceptación acumulativa](acceptance.md).
3. Convertir la subfase probable en un microalcance con resultado observable,
   contratos y riesgos concretos.
4. Definir antes de editar la validación manual proporcional y la ampliación
   de la misma aceptación evaluable por IA.
5. Usar solo código, tests, contratos y evidencia permitidos por el
   [router Engineer](../../README.md).

## Subfases probables

### S1 — Autoridades y baseline confiable

**Replanning activo ISA-327** (rama `vantareapp/isa-327-eng-s1-spotter-autoridades-y-baseline-confiable`).
La implementación no ha comenzado: este microplan debe aprobarse primero.
Entrada: vertical Nightly existente y riesgos del
[baseline Vantare](audits/2026-08-11-vantare-baseline.md).
Resultado: enable/reset, sensibilidad, locale, calidad por rival, secuencia y
estado de salida tienen una autoridad honesta y ninguna deuda P1 conocida
impide ampliar Spotter.

Invariantes objetivo que S1 hará cumplir (hoy no se cumplen: `SetSpotterEnabled`
cancela de forma global y `SemanticEvidence` hardcodea sensibilidad Normal):

- El toggle de Spotter nunca usa `Runtime.Reset()` global; el reset es solo de la máquina Spotter.
- La cancelación del toggle es por familia (`CancelFamily`), nunca de la cola o scheduler completos.
- Sensibilidad única en evidence y rearme sin versionado nuevo.
- Service y replayoracle no divergen en secuencia: misma regla de snapshot estrictamente posterior dentro del mismo epoch.
- El filtro espacial por rival se aplica solo a `FamilySpotter`.
- `audio-only` necesita reason contractual válida y no-success; no toca device, player ni audibilidad.
- El test acumulativo se crea en S1 sobre `EngineerService` productivo; no es replayoracle ni un framework nuevo.

Clean-room transversal a los tres cortes: prohibido modificar o ajustar
constantes y lógica atribuidas a CrewChief. `spotter/geometry.go`, `state.go` y
`types.go` pueden leerse para conocer el contrato, pero no se cambian constantes
heredadas; cualquier umbral nuevo se rederiva con evidencia propia o falla
cerrado. Un corte que exija tocar esas constantes se detiene y pide revisión.

#### Corte A — autoridad de máquina (enable/reset/cancelación/sensibilidad)

- **MODIFICAR:** `service/engineer_service.go` (`SetEnabled`, `SetSpotterEnabled`, `SetSensitivity`, `ConsumeObservation`, `Status`) — toggle aislado y cancelación por familia, mínimo cambio; `core/runtime.go` (`SetEnabled`, `SetSensitivity`, `Reset`, `ProcessSpotterFrame`, `ProcessMonitorFrame`, `frameUsableLocked`, `processSpotterLocked`) — reset acotado solo de la máquina Spotter; `spotter/state.go` (rearme de la máquina, sin constantes heredadas); `projectioninput/policy.go` (`SemanticEvidence`) — detector y revalidación usan la sensibilidad configurada.
- **SOLO LEER:** `messagepolicy/scheduler.go` y `spotter_policy.go` (`Cancel`, `CancelFamily`) — se consumen, no se modifican salvo justificación técnica explícita que requiera revisión; `spotter/types.go` — contrato de tipos, no congelar diseño.
- **Tests a ampliar/crear:** `service/engineer_service_test.go` (`TestEngineerService_InitialStateAndValidation`), `service/output_policy_test.go` (`TestDisabledSpotterNeverEntersSchedulerOrPreemptsEngineer`, `TestDisablingFamilyCancelsOnlyMatchingActiveOutputs`) — "Spotter off no altera conexión, error ni Fuel pendiente/en reproducción"; `core/runtime_test.go` (`TestRuntime_Disabled`) — reset solo de la máquina Spotter; `projectioninput/policy_test.go` — sensibilidad compartida en evidence; `messagepolicy/scheduler_test.go` y `spotter_policy_test.go` — solo lectura y regresión de cancelación por familia.
- **Orden TDD red-verde:** (1) rojo: Spotter off no cancela cola/scheduler completos ni Fuel pendiente/en reproducción; (2) rojo: toggling no invoca `Reset()` global, reset solo de la máquina; (3) rojo: revalidación usa la misma sensibilidad que el detector; (4) verde mínimo.
- **Criterios observables:** `SpotterEnabled=false` no altera `Connected`, no deja `lastError` engañoso ni cancela otras familias; re-enable limpia; cambio de sensibilidad rearma sin estado obsoleto ni versionado nuevo.
- **Validación manual al final del corte:** apagar Spotter con Fuel pendiente/en reproducción y comprobar que Fuel sigue saliendo sin desconexión ni error; re-encender y rearmar; cambiar sensibilidad y confirmar rearme. Cierra con manual + tests focales; la ruta acumulativa aún no existe y este corte no la amplía.
- **Comandos (desde `vantare-v2/`, tras `gofmt` en los `.go` modificados):** `go test ./internal/engineer/service`; `go test ./internal/engineer/core`; `go test ./internal/engineer/messagepolicy`; `go test ./internal/engineer/spotter`; `go test ./internal/engineer/projectioninput`; `go test ./internal/engineer/...`.
- **Stop conditions:** `Reset()` global para un toggle, cancelación de cola completa por familia, versionado nuevo de sensibilidad/evidence, modificar `scheduler.go`/`spotter_policy.go`/`types.go` sin justificación explícita, o test que aísle Spotter sin regresión.

#### Corte B — autoridad de entrada (secuencia y filtro por rival)

- **MODIFICAR:** `service/engineer_service.go` (`ConsumeObservation`, `observationCursor.strictlyAfter`, `reconnectBoundary`/`lastObservation`) — guard local de regresión same-epoch; `replayoracle/runner.go` (`consume`, `observationCursor.strictlyAfter`, `replayAwaitingFreshSnapshot`) — misma regla para no divergir; `projectioninput/adapter.go` (`FrameFor`, `Evaluate`, `requireBaseSignals`, `adaptVehicle`) — filtro individual por rival solo para `FamilySpotter`.
- **SOLO LEER:** `spotter/geometry.go` (`ClassifyWithActiveSides`) — se consume sin cambios; `projectioninput/policy.go` (`SemanticEvidence`) — no cambia en este corte.
- **Tests a ampliar/crear:** `service/canonical_input_test.go` (`TestEngineerServiceSourceStatusDisconnectsAndRequiresFreshLiveObservation`) — secuencia regresiva en mismo epoch y regresión→disconnect→reconnect; `replayoracle/runner_test.go` (`TestRunnerDisconnectReconnectRequiresFreshSnapshotBeforePlaybackResumes`) — misma regla para no divergir; `projectioninput/adapter_test.go` — fila incompleta no produce rival de coordenadas cero para Spotter. `spotter/geometry_test.go` se mantiene SOLO LECTURA y preserva `TestClassify_DoesNotTreatWorldOriginOpponentAsInvalid`.
- **Orden TDD red-verde:** (1) rojo: snapshot no estrictamente posterior en mismo epoch se rechaza (service y oracle igual); (2) rojo: regresión→disconnect→reconnect no rebaja el cursor; (3) rojo: rival con posición/pit no usable queda excluido solo en Spotter; (4) verde mínimo.
- **Criterios observables:** toda observación del mismo epoch avanza la secuencia; una regresión falla cerrado con `ErrCanonicalObservationNotFresh`; replayoracle reporta `ReasonStaleContext`; Spotter nunca recibe coordenada cero como rival válido; otras familias no cambian; `Context`/`ClassifyBoundary`/contrato de observación no cambian.
- **Validación manual al final del corte:** reproducir snapshots regresivos y verificar que no hay mensajes/clears fantasma y que un reconnect solo admite snapshots posteriores al borde. Cierra con manual + tests focales; la ruta acumulativa aún no existe.
- **Comandos (desde `vantare-v2/`, tras `gofmt` en los `.go` modificados):** `go test ./internal/engineer/service`; `go test ./internal/engineer/replayoracle`; `go test ./internal/engineer/projectioninput`; `go test ./internal/engineer/spotter`; `go test ./internal/engineer/...`.
- **Stop conditions:** divergencia de secuencia entre service y replayoracle, filtro que afecte a otra familia, cambio del contrato de observación/proyección, o modificar `geometry.go`/su test/`policy.go` en este corte.

#### Corte C — autoridad de salida/aceptación (locale, audio-only, ruta S1)

- **MODIFICAR:** `audio/config.go` (`DefaultAudioConfig`) — default de locale coherente; `service/engineer_service.go` (`NewEngineerService`, `SetLocale`, `SetAudioConfig`) — wiring mínimo; `service/delivery_runtime.go` (`productDeliveryPort.Deliver`) — solo el tramo cache/resolver/output observable; `delivery/contract.go` (reason diagnóstica de audio y sus transiciones); `service/output_policy.go` (`OutputAudio`) — lectura para el modo; nuevo `service/s1_cumulative_test.go` (u nombre análogo) sobre `EngineerService` productivo, no en replayoracle.
- **SOLO LEER:** `audio/player.go`, `player_windows.go` y los tests de player — no se implementa, cambia ni prueba el player; un player ausente puede producir no-success por backend no configurado, sin cambiarlo. No hay device, hotplug, ducking ni audibilidad real en este corte.
- **Tests a ampliar/crear (MODIFICAR/REESCRIBIR porque cambia su premisa):** `audio/config_test.go` (`TestDefaultAudioConfig`) — premisa de locale default coherente; `service/presentation_delivery_test.go` (`TestProductDeliveryKeepsSpanishVisualOnlyWhenSpotterAudioIsEnglish`) — premisa de mismatch que este corte redefine; `service/output_policy_test.go` (`TestProductDeliveryHonoursCategoryOutputMode`) — `audio-only` miss/mismatch no-success con reason; `delivery/contract_test.go` — validar reason nueva y transiciones; `service/s1_cumulative_test.go` — primera ruta acumulativa S1.
- **Orden TDD red-verde:** (1) rojo: locale default de presentación y audio coinciden; (2) rojo: `audio-only` sin clip/resolver/mismatch no termina `completed` y expone reason; (3) rojo: ruta S1 reporta esperado/observado/prohibidos sobre EngineerService; (4) verde mínimo.
- **Criterios observables:** una única elección ES/EN compartida y diagnosticable; `audio-only` falla cerrado con no-success y reason contractual ante clip, resolver o mismatch ausentes, o player ausente por backend no configurado; la ruta S1 es ejecutable y evaluable por IA con fallo visible ante precondiciones ausentes. El corte C cubre acumulativamente A+B+C: ejercita enable/sensibilidad/secuencia/filtro junto con la salida en la misma ruta.
- **Validación manual al final del corte:** sin cache, un modo `audio-only` no afirma salida y expone la causa; con cache del locale correcto, la ruta S1 entrega audio o degradación honesta; confirmar que no se abrió el player real.
- **Comandos (desde `vantare-v2/`, tras `gofmt` en los `.go` modificados):** `go test ./internal/engineer/service`; `go test ./internal/engineer/audio`; `go test ./internal/engineer/delivery`; `go test ./internal/engineer/...`; `go test ./...` como cierre conforme a AGENTS.
- **Stop conditions:** cambio en device/player/hotplug/ducking/audibilidad, reason no válida en el contrato de delivery, replayoracle como base del test acumulativo, o ruta acumulativa creada antes que los tests focales de A y B.

### S2 — Núcleo lateral completo

- **Entrada:** autoridades de S1 estables y evidencia Vantare para geometría.
- **Resultado:** ocupación, transición y clear funcionan para uno o varios
  rivales sin copiar parámetros del competidor.
- **Salida:** escenarios laterales esperados y prohibidos quedan cubiertos.

### S3 — Lifecycle e inhibición LMU

- **Entrada:** señales canónicas demostrables de sesión y actividad.
- **Resultado:** pits, formación, cautiones, baja velocidad, pérdida de fuente,
  reconexión e identidad silencian y rearman sin estado obsoleto.
- **Salida:** todo silencio y rearme tiene motivo observable.

### S4 — Audio inmediato y visual compartido

- **Entrada:** núcleo seguro y contenido ES/EN propio, autorizado y aceptado.
- **Resultado:** una alerta se oye y se ve desde la misma presentación, o
  declara de forma visible por qué no puede hacerlo.
- **Salida:** cache, player, dispositivo, preempción y fallback son verificables.

### S5 — Tráfico multiclase y doblados

- **Entrada:** geometría y lifecycle estables con identidad/clase confiables.
- **Resultado:** tráfico más rápido o lento se informa con cadencia útil sin
  competir con avisos laterales de seguridad.
- **Salida:** precisión y silencio quedan demostrados con tráfico representativo.

### S6 — Peligros demostrables

- **Entrada:** señales LMU con provenance y freshness suficientes.
- **Resultado:** coche lento, detenido, accidente, bandera local o rejoin solo
  se anuncian cuando la evidencia permite afirmarlos.
- **Salida:** cada peligro queda implementado o declarado no disponible con
  razón y condición de reapertura.

### S7 — Cierre LMU/Windows

- **Entrada:** S1-S6 aceptadas y matriz acumulativa completa.
- **Resultado:** la vertical se valida en LMU y Windows con audio, dispositivo,
  visuales, reconexión, carga y tiempos observables.
- **Salida:** evidencia manual y de IA permite decidir el cierre de fase sin
  presentar capacidades condicionadas como terminadas.

## Regla de cierre

Cada subfase amplía [acceptance.md](acceptance.md); no crea otro protocolo ni
un documento por worker. Los reportes de workers son respuestas estructuradas.
La fase solo cierra cuando la aceptación acumulativa completa pasa, los límites
siguen visibles y handoff, Linear y documentos vivos reflejan el mismo estado.
