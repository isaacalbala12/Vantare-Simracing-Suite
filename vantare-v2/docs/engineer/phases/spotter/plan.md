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

Autoridad/coupling ya verificados y no renegociables:

- El toggle de Spotter nunca usa `Runtime.Reset()` global; el reset es solo de la máquina Spotter.
- La cancelación del toggle es por familia (`CancelFamily`), nunca de la cola o scheduler completos.
- Sensibilidad única en evidence y rearme sin versionado nuevo.
- Service y replayoracle no divergen en secuencia: misma regla de snapshot estrictamente posterior dentro del mismo epoch.
- El filtro espacial por rival se aplica solo a `FamilySpotter`.
- `audio-only` necesita reason contractual válida y no-success; no toca device, player ni audibilidad.
- El test acumulativo se crea en S1 sobre `EngineerService` productivo; no es replayoracle ni un framework nuevo.

#### Corte A — autoridad de máquina (enable/reset/cancelación/sensibilidad)

- **Rutas exactas:** `service/engineer_service.go` (`SetEnabled`, `SetSpotterEnabled`, `SetSensitivity`, `ConsumeObservation`, `Status`); `core/runtime.go` (`SetEnabled`, `SetSensitivity`, `Reset`, `ProcessSpotterFrame`, `ProcessMonitorFrame`, `frameUsableLocked`, `processSpotterLocked`); `messagepolicy/scheduler.go` (`Cancel`, `CancelFamily`); `spotter/state.go` y `types.go` (rearme).
- **Tests a ampliar/crear:** `service/engineer_service_test.go` (`TestEngineerService_InitialStateAndValidation`), `service/output_policy_test.go` (`TestDisabledSpotterNeverEntersSchedulerOrPreemptsEngineer`, `TestDisablingFamilyCancelsOnlyMatchingActiveOutputs`) — "Spotter off no altera conexión, error ni Fuel pendiente/en reproducción"; `core/runtime_test.go` (`TestRuntime_Disabled`) — reset solo de la máquina Spotter; `messagepolicy/scheduler_test.go` y `spotter_policy_test.go` — cancelación por familia y sensibilidad compartida en revalidación.
- **Orden TDD red-verde:** (1) rojo: Spotter off no cancela cola/scheduler completos ni Fuel pendiente/en reproducción; (2) rojo: toggling no invoca `Reset()` global, reset solo de la máquina; (3) rojo: revalidación usa la misma sensibilidad que el detector; (4) verde mínimo.
- **Criterios observables:** `SpotterEnabled=false` no altera `Connected`, no deja `lastError` engañoso ni cancela otras familias; re-enable limpia; cambio de sensibilidad rearma sin estado obsoleto ni versionado nuevo.
- **Validación manual al final del corte:** apagar Spotter con Fuel pendiente/en reproducción y comprobar que Fuel sigue saliendo sin desconexión ni error; re-encender y rearmar; cambiar sensibilidad y confirmar rearme.
- **Comandos (desde `vantare-v2/`):** `go test ./internal/engineer/service`, `./internal/engineer/core`, `./internal/engineer/messagepolicy`, `./internal/engineer/spotter`, `./internal/engineer/...`.
- **Stop conditions:** `Reset()` global para un toggle, cancelación de cola completa por familia, versionado nuevo de sensibilidad/evidence, o test que aísle Spotter sin regresión.

#### Corte B — autoridad de entrada (secuencia y filtro por rival)

- **Rutas exactas:** `service/engineer_service.go` (`ConsumeObservation`, `observationCursor.strictlyAfter`, `reconnectBoundary`/`lastObservation`); `replayoracle/runner.go` (`consume`, `observationCursor.strictlyAfter`, `replayAwaitingFreshSnapshot`); `projectioninput/adapter.go` (`FrameFor`, `Evaluate`, `requireBaseSignals`, `adaptVehicle`); `projectioninput/policy.go` (`SemanticEvidence`); `spotter/geometry.go` (`ClassifyWithActiveSides`).
- **Tests a ampliar/crear:** `service/canonical_input_test.go` (`TestEngineerServiceSourceStatusDisconnectsAndRequiresFreshLiveObservation`) — secuencia regresiva en mismo epoch y regresión→disconnect→reconnect; `replayoracle/runner_test.go` (`TestRunnerDisconnectReconnectRequiresFreshSnapshotBeforePlaybackResumes`) — misma regla para no divergir; `projectioninput/adapter_test.go` y `spotter/geometry_test.go` — fila incompleta no produce rival de coordenadas cero; filtro solo `FamilySpotter`.
- **Orden TDD red-verde:** (1) rojo: snapshot no estrictamente posterior en mismo epoch se rechaza (service y oracle igual); (2) rojo: regresión→disconnect→reconnect no rebaja el cursor; (3) rojo: rival con posición/pit no usable queda excluido; (4) verde mínimo.
- **Criterios observables:** toda observación del mismo epoch avanza la secuencia; una regresión falla cerrado con `ErrCanonicalObservationNotFresh`; replayoracle reporta `ReasonStaleContext`; Spotter nunca recibe coordenada cero como rival válido; otras familias no cambian.
- **Validación manual al final del corte:** reproducir snapshots regresivos y verificar que no hay mensajes/clears fantasma y que un reconnect solo admite snapshots posteriores al borde.
- **Comandos (desde `vantare-v2/`):** `go test ./internal/engineer/service`, `./internal/engineer/replayoracle`, `./internal/engineer/projectioninput`, `./internal/engineer/spotter`, `./internal/engineer/...`.
- **Stop conditions:** divergencia de secuencia entre service y replayoracle, filtro que afecte a otra familia, o cambio del contrato de observación/proyección.

#### Corte C — autoridad de salida/aceptación (locale, audio-only, ruta S1)

- **Rutas exactas:** `audio/config.go` (`DefaultAudioConfig`); `service/engineer_service.go` (`NewEngineerService`, `SetLocale`, `SetAudioConfig`); `service/delivery_runtime.go` (`productDeliveryPort.Deliver`); `delivery/contract.go` (reason diagnóstica de audio); `service/output_policy.go` (`OutputAudio`); nuevo `service/s1_cumulative_test.go` (u nombre análogo) sobre `EngineerService` productivo, no en replayoracle.
- **Tests a ampliar/crear:** `audio/config_test.go` y `service/presentation_delivery_test.go` (`TestProductDeliveryKeepsSpanishVisualOnlyWhenSpotterAudioIsEnglish`) — default de locale coherente y mismatch; `service/output_policy_test.go` (`TestProductDeliveryHonoursCategoryOutputMode`) — `audio-only` miss/mismatch no-success con reason; `delivery/contract_test.go` — validar reason nueva y transiciones; `service/s1_cumulative_test.go` — primera ruta acumulativa S1.
- **Orden TDD red-verde:** (1) rojo: locale default de presentación y audio coinciden; (2) rojo: `audio-only` sin clip/player/mismatch no termina `completed` y expone reason; (3) rojo: ruta S1 reporta esperado/observado/prohibidos sobre EngineerService; (4) verde mínimo.
- **Criterios observables:** una única elección ES/EN compartida y diagnosticable; `audio-only` falla cerrado con no-success y reason contractual ante clip, player o mismatch ausentes; la ruta S1 es ejecutable y evaluable por IA con fallo visible ante precondiciones ausentes.
- **Validación manual al final del corte:** sin cache, un modo `audio-only` no afirma salida y expone la causa; con cache del locale correcto, la ruta S1 entrega audio o degradación honesta.
- **Comandos (desde `vantare-v2/`):** `go test ./internal/engineer/service`, `./internal/engineer/audio`, `./internal/engineer/delivery`, `./internal/engineer/...`.
- **Stop conditions:** cambio en device/player/audibilidad, reason no válida en el contrato de delivery, o replayoracle como base del test acumulativo.

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
