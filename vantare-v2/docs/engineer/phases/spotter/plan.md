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
Entrada: vertical Nightly existente y riesgos del [baseline Vantare](audits/2026-08-11-vantare-baseline.md).
Resultado: enable/reset, sensibilidad, locale, calidad por rival, secuencia y estado de salida tienen una autoridad honesta y ninguna deuda P1 conocida impide ampliar Spotter.

Invariantes objetivo que S1 hará cumplir (hoy no se cumplen: `SetSpotterEnabled` cancela de forma global y `SemanticEvidence` hardcodea sensibilidad Normal):

- El toggle de Spotter nunca usa `Runtime.Reset()` global; el reset es solo de la máquina Spotter.
- La cancelación del toggle es por familia (`CancelFamily`), nunca de la cola o scheduler completos.
- Sensibilidad única en evidence y rearme sin versionado nuevo.
- Service y replayoracle no divergen en secuencia: misma regla de snapshot estrictamente posterior dentro del mismo epoch.
- El filtro espacial por rival se aplica solo a `FamilySpotter`.
- `audio-only` necesita reason contractual válida y no-success; no toca device, player ni audibilidad.
- El test acumulativo se crea en S1 sobre `EngineerService` productivo; no es replayoracle ni un framework nuevo.

Clean-room transversal: prohibido modificar/ajustar constantes o lógica atribuidas a CrewChief. `spotter/geometry.go`, `state.go` y `types.go` se leen
  solo como contrato; constantes heredadas intactas; cualquier umbral nuevo se rederiva con evidencia propia o falla cerrado. Un corte que exija
  tocarlas se detiene y pide revisión.

#### Corte A — autoridad de máquina (enable/reset/cancelación/sensibilidad)

- **MODIFICAR (mínimo):** `service/engineer_service.go` — `SetSpotterEnabled` (toggle aislado, cancelación por familia, reset acotado) y `SetSensitivity` (rearme, sensibilidad compartida);
  `core/runtime.go` — método ADITIVO `ResetSpotter()` o equivalente que resetea solo la máquina Spotter sin tocar monitores;
  `projectioninput/policy.go` — `SemanticEvidence` usa sensibilidad configurada
  (no Normal). No se invita a tocar `Status`, `SetEnabled` ni `ProcessMonitorFrame` salvo necesidad real.
- **SOLO LEER / contexto:** `core/runtime.go` — `Reset` global intacto (solo boundaries); `messagepolicy/scheduler.go` y `spotter_policy.go` (`Cancel`, `CancelFamily`) se consumen sin modificar;
  `spotter/state.go` y `types.go` — contrato de rearme, no congelar diseño; `service/engineer_service.go` — `SetEnabled`, `Status`, `ConsumeObservation` solo lectura.
- **Tests NUEVOS (toggle, no SetOutputMode):** `service/engineer_service_test.go` — `TestSetSpotterEnabledCancelsOnlySpotterAndPreservesFuel` y `TestSetSpotterEnabledRearmsCleanState` (máquina Spotter
  limpia tras re-enable, monitores/familias preservados); `core/runtime_test.go` — regresión de `TestRuntime_Disabled` + reset acotado; `projectioninput/policy_test.go` — sensibilidad compartida.
  `messagepolicy/scheduler_test.go` y `spotter_policy_test.go` SOLO LECTURA: la regresión de toggle vive en tests de `EngineerService`/`SetSpotterEnabled`; los tests de `SetOutputMode` no cubren el
  toggle.
- **Orden TDD red-verde:** (1) rojo: re-enable conserva estado Spotter obsoleto (still/clear tardío) porque el toggle no limpia la máquina; (2) rojo:
  Spotter off cancela solo Spotter y preserva Fuel pendiente/en reproducción; (3) rojo: revalidación usa la misma sensibilidad que el detector; (4)
  verde mínimo.
- **Criterios + validación manual:** `SpotterEnabled=false` no altera `Connected`, no deja `lastError` engañoso ni cancela otras familias; re-enable deja la máquina limpia y conserva
  monitores/familias; cambio de sensibilidad rearma sin estado obsoleto ni versionado nuevo; `Runtime.Reset` global no se invoca por toggle. Manual: apagar Spotter con Fuel pendiente/en reproducción y
  verificar que Fuel sigue saliendo sin desconexión ni error; re-encender sin still/clear fantasma; cambiar sensibilidad y confirmar rearme. Cierra
  con manual + tests focales; la ruta acumulativa aún no
  existe y este corte no la amplía.
- **Comandos (desde `vantare-v2/`, tras `gofmt` en los `.go` modificados):** `go test ./internal/engineer/service`; `go test ./internal/engineer/core`;
  `go test ./internal/engineer/messagepolicy`; `go test ./internal/engineer/spotter`; `go test ./internal/engineer/projectioninput`;
  `go test ./internal/engineer/...`; `go test ./...` como cierre conforme a AGENTS.
- **Stop conditions:** `Reset()` global para un toggle, cancelación de cola completa, versionado nuevo de sensibilidad/evidence, modificar
  `scheduler.go`/`spotter_policy.go`/`types.go` sin justificación, usar tests de `SetOutputMode` como cobertura del toggle, o test que aísle Spotter sin
  regresión.

#### Corte B — autoridad de entrada (secuencia y filtro por rival)

- **MODIFICAR (mínimo):** `service/engineer_service.go` — `ConsumeObservation` con guard local de regresión same-epoch sobre `lastObservation`, sin tocar `Context`/`ClassifyBoundary` ni el contrato de
  observación; `replayoracle/runner.go` — `consume` con la misma regla local para no divergir; `projectioninput/adapter.go` — filtro individual por rival solo para `FamilySpotter` (fila incompleta no
  produce rival de coordenadas cero), sin cambiar `Evaluate`/`requireBaseSignals` si no hace falta.
- **SOLO LEER:** `spotter/geometry.go` (`ClassifyWithActiveSides`) y `spotter/geometry_test.go` — se preserva
  `TestClassify_DoesNotTreatWorldOriginOpponentAsInvalid`; `projectioninput/policy.go` (`SemanticEvidence`) no cambia en este corte.
- **Tests NUEVOS (same-epoch conectado):** `service/canonical_input_test.go` o `service/engineer_service_test.go` — secuencia regresiva en mismo epoch con conexión activa rechazada con
  `ErrCanonicalObservationNotFresh`; `replayoracle/runner_test.go` — mismo caso con `ReasonStaleContext`. Los tests de reconnect existentes quedan como regresión verde, no como rojo.
  `projectioninput/adapter_test.go` — fila incompleta excluida solo en Spotter.
- **Orden TDD red-verde:** (1) rojo: snapshot no estrictamente posterior en mismo epoch con conexión activa se acepta hoy y debe rechazarse (service y oracle igual); (2) rojo: rival con posición/pit
  no usable produce zona de coordenadas cero y debe excluirse solo en Spotter; (3) verde mínimo. La combinación regresión→disconnect→reconnect se añade como regresión verde, no como paso rojo.
- **Criterios + validación manual:** toda observación del mismo epoch avanza la secuencia; una regresión falla cerrado con `ErrCanonicalObservationNotFresh`; replayoracle reporta `ReasonStaleContext`;
  Spotter nunca recibe coordenada cero como rival válido; otras familias no cambian; `Context`/`ClassifyBoundary` y el contrato de observación no cambian. Manual: reproducir snapshots regresivos con
  conexión activa y verificar que no hay mensajes/clears fantasma; un reconnect solo admite snapshots posteriores al borde. Cierra con manual + tests focales; la ruta acumulativa aún no existe.
- **Comandos (desde `vantare-v2/`, tras `gofmt` en los `.go` modificados):** `go test ./internal/engineer/service`; `go test ./internal/engineer/replayoracle`;
  `go test ./internal/engineer/projectioninput`; `go test ./internal/engineer/spotter`; `go test ./internal/engineer/...`;
  `go test ./...` como cierre conforme a AGENTS.
- **Stop conditions:** divergencia de secuencia entre service y replayoracle, filtro que afecte a otra familia, cambio del contrato de
  observación/proyección, o modificar `geometry.go`/su test/`policy.go` en este corte.

#### Corte C — autoridad de salida/aceptación (locale, audio-only, ruta S1)

- **Resultado de producto:** se preservan los defaults existentes (`DefaultAudioConfig`: Spotter EN `af_bella`, Engineer ES `ef_dora`) y `cmd/vantare/main.go` es SOLO LEER; la presentación visual de
  cada entrega usa el locale de su canal/familia: Spotter visual+audio EN y Engineer visual+audio ES por defecto, solo en el wiring productivo `EngineerService` S1; una configuración explícita solo admite ES/EN y mantiene
  visual+audio coherentes por canal; locale ausente/no soportado/mismatch no produce `completed` silencioso: falla cerrado con reason diagnóstica. No cambian defaults globales, frontend, persistencia, router, player ni `main`.
- **MODIFICAR (mínimo):** `service/engineer_service.go` — wiring mínimo de locale antes de `Start` que resuelve una autoridad ES/EN coherente por canal/familia (presentación y audio mismo locale o fallo
  cerrado con reason diagnóstica), sin mismatch silencioso; `service/delivery_runtime.go` — solo el tramo cache/resolver/output observable de `productDeliveryPort.Deliver`; `delivery/contract.go` —
  reason diagnóstica de audio integrada en los puntos contractuales mínimos `knownReason` y `validStateReason`, sin ampliar estados; nuevo `service/s1_cumulative_test.go` — primera ruta acumulativa S1 sobre `EngineerService` productivo, no en replayoracle. No frontend ni persistencia.
- **SOLO LEER / contexto:** `audio/config.go` (`DefaultAudioConfig`) y `audio/config_test.go` (`TestDefaultAudioConfig`) — se conservan defaults y test actuales; `cmd/vantare/main.go` — composición,
  no cambia; `audio/router.go` y `audio/router_test.go` — se preserva `TestCacheOnlyAudioRouterReadsCanonicalTTSCacheWithoutEngine`; `service/output_policy.go` — no cambia en este corte;
  `EngineerService.SetLocale`, `presentation.ParseLocale` y `presentation.Resolver` — SOLO LEER/intactos, autoridad canónica de locale del wiring S1;
  `audio/player.go`, `player_windows.go` y tests de player — no se implementa, cambia ni prueba el player; un player ausente puede producir no-success por backend no configurado, sin cambiarlo; sin device, hotplug, ducking ni audibilidad real.
- **Tests a ampliar/crear (MODIFICAR/REESCRIBIR porque cambia su premisa):** `service/presentation_delivery_test.go` — `TestProductDeliveryPropagatesCanonicalLocaleAndVoiceToInjectedResolver` queda SOLO LEER/intacto: el puerto de test
  respeta el locale canónico inyectado y lo propaga al resolver inyectado; el test de defaults ES/EN por canal (Spotter EN, Engineer ES) usa el path de `EngineerService`, no inyecta ES manualmente en el puerto; un mismatch visual/audio
  ya no completa en silencio: falla cerrado con reason; el fallback visual de cache miss sin `audio-only` sigue cubierto. Se añade un test Engineer que preserve ES por defecto: canal/familia Engineer entrega visual ES + audio ES y completa.
  `service/engineer_service_test.go` — tests de autoridad de locale (mismo locale visual/audio o fallo cerrado con reason);
  `service/delivery_runtime_test.go` — `audio-only` miss/mismatch no-success con reason; `delivery/contract_test.go` — `knownReason`/`validStateReason` aceptan la reason nueva; `service/s1_cumulative_test.go` — primera ruta acumulativa S1.
- **Orden TDD red-verde:** (1) rojo: la configuración del servicio produce mismatch silencioso de locale y debe dar locale coherente o fallar cerrado con reason; (2) rojo: `audio-only` sin
  clip/resolver/mismatch no termina `completed` y expone reason diagnóstica; (3) rojo: `s1_cumulative_test.go` reporta esperado/observado/prohibidos sobre EngineerService; (4) verde mínimo.
- **Criterios + validación manual:** una única autoridad de locale ES/EN por canal/familia, diagnosticable, sin mismatch silencioso; defaults intactos (Spotter EN, Engineer ES) en visual y audio;
  `audio-only` falla cerrado con no-success y reason contractual (clip/resolver/mismatch ausentes o player ausente por backend no configurado) sin cambiar el player; la ruta S1 es ejecutable y
  evaluable por IA con fallo visible ante precondiciones ausentes. El corte C cubre acumulativamente A+B+C: ejercita enable/sensibilidad/secuencia/filtro junto con la salida en la misma ruta. Manual: sin
  cache, un modo `audio-only` no afirma salida y expone la causa; con cache del locale correcto, la ruta S1 entrega audio o degradación honesta; confirmar que no se abrió el player real ni se tocó el wiring de composición.
- **Comandos (desde `vantare-v2/`, tras `gofmt` en los `.go` modificados):** `go test ./internal/engineer/service`; `go test ./internal/engineer/audio`;
  `go test ./internal/engineer/delivery`; `go test ./internal/engineer/...`; `go test ./...` como cierre conforme a AGENTS.
- **Stop conditions:** cambio en device/player/hotplug/ducking/audibilidad, reason no válida en `knownReason`/`validStateReason`, ampliación innecesaria de estados de delivery, modificar
  `audio/config.go`, `cmd/vantare/main.go`, `audio/router.go` o `output_policy.go`, replayoracle como base del test acumulativo, o ruta acumulativa creada antes que los tests focales de A y B.

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
