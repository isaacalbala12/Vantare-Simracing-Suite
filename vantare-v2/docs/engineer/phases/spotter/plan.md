# Spotter observable — plan de fase

Estado: entrada documental aceptada por Isaac el 2026-08-12 (ISA-313 Fase 5);
microplan S1 aprobado el 2026-08-13, incluido el cambio visible Spotter ES→EN
del Corte C; S1 iniciado solo a nivel de autorización, sin código. S2-S7
probables; ISA-189 (S2), ISA-187 (S4) e ISA-314 diferidos hasta cerrar S1.

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

**Aprobado por Isaac el 2026-08-13** (rama `vantareapp/isa-327-eng-s1-spotter-autoridades-y-baseline-confiable`),
incluido el cambio visible Spotter ES→EN del Corte C. S1 iniciado solo a nivel de autorización, sin código aún;
Corte A es la única siguiente implementación. Entrada: vertical Nightly existente y riesgos del [baseline Vantare](audits/2026-08-11-vantare-baseline.md).
Resultado: enable/reset, sensibilidad, locale, calidad por rival, secuencia y estado de salida tienen una autoridad honesta; ninguna deuda P1 de integración conocida impide ampliar Spotter (S1 no promete cerrar los P1 de fases futuras).

Invariantes objetivo que S1 hará cumplir (hoy no se cumplen: `SetSpotterEnabled` cancela de forma global, `CancelFamily(FamilySpotter)` no resetea la política Spotter y `SemanticEvidence` hardcodea sensibilidad Normal):

- El toggle de Spotter nunca usa `Runtime.Reset()` global; el reset es solo de la máquina Spotter y resetea la política Spotter con método aditivo/scoped (sin cambiar `CancelFamily` para todos sus callers), nunca de la cola o scheduler completos.
- Sensibilidad única en evidence y rearme sin versionado nuevo.
- Service y replayoracle no divergen en secuencia: misma regla de snapshot estrictamente posterior dentro del mismo epoch.
- El filtro espacial por rival se aplica solo a `FamilySpotter`.
- `audio-only` necesita reason contractual válida y no-success; no toca device, player ni audibilidad.
- El test acumulativo se crea en S1 sobre `EngineerService` productivo (no es replayoracle ni un framework nuevo) y la UI de prueba crece acumulativamente en la pestaña Ingeniero consumiendo los mismos contratos/estado productivos, sin lógica paralela.

Clean-room transversal: prohibido modificar/ajustar constantes o lógica de CrewChief. `spotter/geometry.go`, `state.go` y `types.go` se leen solo como
contrato; constantes heredadas intactas; umbral nuevo se rederiva con evidencia propia o falla cerrado; un corte que exija tocarlas se detiene y pide revisión.

#### Corte A — autoridad de máquina (enable/reset/cancelación/sensibilidad)

- **MODIFICAR (mínimo):** `service/engineer_service.go` — `SetSpotterEnabled` (toggle aislado, cancelación por familia, reset acotado, cancelación visual selectiva y sin `queue.Clear()`) y `SetSensitivity` (rearme, sensibilidad compartida);
  `core/runtime.go` — método ADITIVO `ResetSpotter()` o equivalente que resetea solo la máquina Spotter sin tocar monitores; `messagepolicy/scheduler.go` — cambio mínimo autorizado con preferencia por método aditivo/scoped que resetea la política Spotter (`spotterDeliveryState`) desde el toggle `SetSpotterEnabled`, preservando Fuel y sin alterar `CancelFamily` para todos sus callers (incluye `SetOutputMode`); si hubiera razón fuerte para tocar `CancelFamily`, declarar comportamiento y añadir test de output mode; ningún otro cambio en este archivo;
  `projectioninput/policy.go` — `SemanticEvidence`/`PolicyEvidence` usan sensibilidad configurada (no Normal); `replayoracle/runner.go`, `replayoracle/runner_test.go` y `projectioninput/policy_test.go` — ajuste obligatorio/mecánico de sus call sites de evidence por sensibilidad; `service/engineer_service.go:703` — ajuste estrictamente mecánico del call site de `PolicyEvidence` en `ConsumeObservation` para pasar la sensibilidad configurada, sin cambiar lógica/contrato/secuencia (la lógica de secuencia es de Corte B). No se invita a tocar `Status`, `SetEnabled` ni `ProcessMonitorFrame` salvo necesidad real.
- **Sensibilidad:** S1 unifica el preset/configuración de sensibilidad y su rearme (detector y revalidación comparten el preset configurado); la divergencia topológica de lados activos/histéresis
  del baseline queda registrada y diferida a S2, donde se rederiva con evidencia propia. S1 no toca constantes ni geometría.
- **SOLO LEER / contexto:** `core/runtime.go` — `Reset` global intacto (solo boundaries); `messagepolicy/scheduler.go` — `Cancel` y `CancelFamily` viven en este archivo (no en `spotter_policy.go`); solo se toca el cambio mínimo autorizado;
  `spotter_policy.go` SOLO LECTURA salvo necesidad demostrada; `spotter/state.go` y `types.go` — contrato de rearme, no congelar diseño; `service/engineer_service.go` — `SetEnabled`, `Status` y `ConsumeObservation` solo lectura salvo el ajuste mecánico de call site autorizado.
- **Tests NUEVOS (toggle, no SetOutputMode):** `service/engineer_service_test.go` — `TestSetSpotterEnabledCancelsOnlySpotterAndPreservesFuel`, `TestSetSpotterEnabledRearmsCleanState` (aserto de regresión verde: tras re-enable no reaparece ningún mensaje Spotter legacy previo al disable, preservando Fuel; `ConsumeObservation` drena íntegramente la cola con `Queue.Next` sin filtrar, ningún camino productivo deja residual Spotter) y "toggle Spotter preserva el visual activo Fuel/Engineer"
  (guard `activePresentation.Category == FamilySpotter`, patrón de `output_policy.go:86-93`); `messagepolicy/scheduler_test.go` — reset aditivo/scoped de política Spotter invocado desde el toggle `SetSpotterEnabled`, preservando Fuel y sin alterar la semántica de `CancelFamily`;
  `core/runtime_test.go` — regresión `TestRuntime_Disabled` + reset acotado; `projectioninput/policy_test.go` — sensibilidad compartida. `spotter_policy_test.go` SOLO LECTURA; los tests de `SetOutputMode` no cubren el toggle.
- **Orden TDD red-verde:** (1) rojo: re-enable conserva estado Spotter obsoleto (still/clear tardío) porque el toggle no limpia la máquina Spotter (aserto de no-reemisión legacy es guard verde, no rojo); (2) rojo: Spotter off cancela solo Spotter sin `queue.Clear()` y preserva Fuel pendiente/en reproducción; (3) rojo: revalidación usa la misma sensibilidad que el detector; (4) verde mínimo.
- **Criterios + validación manual:** `SpotterEnabled=false` no altera `Connected`, no deja `lastError` engañoso ni cancela otras familias; la cancelación visual solo afecta a `activePresentation.Category == FamilySpotter` (patrón `output_policy.go:86-93`) y deja intacto el visual activo Fuel/Engineer;
  re-enable deja la máquina limpia y conserva monitores/familias; el toggle no llama a `queue.Clear()` (cola legacy drenada íntegramente por observación con `Queue.Next` sin filtrar; `audio/queue.go` sin cambios; ningún camino productivo deja residual Spotter; si el aserto legacy resultara rojo, STOP y revisión, sin API nueva ni filtro/cambio lógico en `ConsumeObservation`); cambio de sensibilidad unifica preset y rearme sin estado obsoleto ni versionado nuevo; `Runtime.Reset` global no se invoca por toggle.
  Manual: apagar Spotter con Fuel pendiente/en reproducción y verificar que Fuel sigue saliendo sin desconexión ni error; apagar Spotter con visual activo de Fuel/Engineer y verificar que el visual no se cancela; re-encender sin still/clear fantasma; cambiar sensibilidad y confirmar rearme. Cierra con manual + tests focales; la ruta acumulativa aún no existe y este corte no la amplía.
- **Comandos (desde `vantare-v2/`, tras `gofmt` en los `.go` modificados):** `go test ./internal/engineer/service`; `go test ./internal/engineer/core`;
  `go test ./internal/engineer/messagepolicy`; `go test ./internal/engineer/spotter`; `go test ./internal/engineer/projectioninput`; `go test ./internal/engineer/...`; `go test ./...` como cierre conforme a AGENTS.
- **Stop conditions:** `Reset()` global para un toggle, cancelación de cola completa o API nueva en `audio/queue.go`, versionado nuevo de sensibilidad/evidence, modificar `spotter_policy.go`/`types.go` o `scheduler.go` fuera del cambio mínimo autorizado (reset aditivo/scoped de política Spotter), aserto legacy rojo sin remedio autorizado (STOP y revisión; sin filtro ni cambio lógico en `ConsumeObservation`),
  mover la lógica de secuencia a este corte (es de Corte B), usar tests de `SetOutputMode` como cobertura del toggle, test que aísle Spotter sin regresión, o reutilizar en S1 los lados
  activos/histéresis topológicos del baseline (diferido a S2). Antes de editar, revalidar Nightly: detenerse solo por deriva funcional relevante para Engineer en `internal/engineer` o en wiring/call sites Engineer dentro de `cmd/vantare` respecto a `8880a880`; cambios ajenos en `cmd/vantare` se registran/reconcilian y no bloquean solo por nombre de path. El SHA de `origin/nightly` es observación, no autoridad fija (2026-08-13 tras fetch: `b6df494298578ff9a043bbd9b48a66eb1512010f` publicación #211; sin deriva en `internal/engineer` ni wiring Engineer en `cmd/vantare`); no se hace rebase ahora.

#### Corte B — autoridad de entrada (secuencia y filtro por rival)

- **MODIFICAR (mínimo):** `service/engineer_service.go` — `ConsumeObservation` con guard local de regresión same-epoch sobre `lastObservation`, evaluado DESPUÉS de `ClassifyBoundary`, que no altera `Connected`, usa error propio distinto del de reconnect y no deja `lastError` engañoso, sin tocar `Context`/`ClassifyBoundary` ni el contrato de observación;
  `replayoracle/runner.go` — `consume` con la misma regla local (después de `ClassifyBoundary`) y reason propio distinto de `ReasonStaleContext` para no divergir; `projectioninput/adapter.go` — filtro individual por rival solo para `FamilySpotter` (fila incompleta no
  produce rival de coordenadas cero), sin cambiar `Evaluate`/`requireBaseSignals` si no hace falta.
- **SOLO LEER:** `spotter/geometry.go` (`ClassifyWithActiveSides`) y `spotter/geometry_test.go` — se preserva
  `TestClassify_DoesNotTreatWorldOriginOpponentAsInvalid`; `projectioninput/policy.go` (`SemanticEvidence`) no cambia en este corte.
- **Tests NUEVOS (same-epoch conectado):** `service/canonical_input_test.go` o `service/engineer_service_test.go` — secuencia regresiva en mismo epoch con conexión activa rechazada con error propio distinto del de reconnect,
  sin alterar `Connected` ni dejar `lastError` engañoso, y prueba de rearme: el siguiente snapshot estrictamente posterior se acepta (sin rechazo indefinido); `replayoracle/runner_test.go` — mismo caso con reason propio
  distinto de `ReasonStaleContext` y prueba de rearme/aceptación del siguiente snapshot válido. Los tests de reconnect existentes quedan como regresión verde, no como rojo.
  `projectioninput/adapter_test.go` — fila incompleta excluida solo en Spotter.
- **Orden TDD red-verde:** (1) rojo: snapshot no estrictamente posterior en mismo epoch con conexión activa se acepta hoy y debe rechazarse (service y oracle igual); (2) rojo: rival con posición/pit no usable produce zona de coordenadas cero y debe excluirse solo en Spotter;
  (3) rojo: tras un rechazo same-epoch, el siguiente snapshot válido debe aceptarse (rearme, sin rechazo indefinido); (4) verde mínimo. La combinación regresión→disconnect→reconnect se añade como regresión verde, no como paso rojo.
- **Criterios + validación manual:** toda observación del mismo epoch avanza la secuencia; una regresión same-epoch con conexión activa se evalúa después de `ClassifyBoundary`, falla cerrado con error propio distinto del de reconnect,
  no altera `Connected` ni deja `lastError` engañoso, y el siguiente snapshot válido se acepta (rearme); replayoracle reporta reason propio distinto de `ReasonStaleContext`; Spotter nunca recibe coordenada cero como rival válido;
  otras familias no cambian; `Context`/`ClassifyBoundary` y el contrato de observación no cambian. La regresión determinista de snapshots pertenece a los tests focales/evaluación IA, no a inyección desde la UI ni a una promesa falsa de UI. Manual: la parte observable se comprueba con sesión LMU real y la pestaña Engineer (sin ghosts en boundary/reconnect);
  `cmd/spotter-debug` sigue herramienta técnica opcional. Cierra con manual + tests focales; la ruta acumulativa aún no existe.
- **Comandos (desde `vantare-v2/`, tras `gofmt` en los `.go` modificados):** `go test ./internal/engineer/service`; `go test ./internal/engineer/replayoracle`;
  `go test ./internal/engineer/projectioninput`; `go test ./internal/engineer/spotter`; `go test ./internal/engineer/...`; `go test ./...` como cierre conforme a AGENTS.
- **Stop conditions:** divergencia de secuencia entre service y replayoracle, filtro que afecte a otra familia, cambio del contrato de
  observación/proyección, o modificar `geometry.go`/su test/`policy.go` en este corte.

#### Corte C — autoridad de salida/aceptación (locale, audio-only, ruta S1)

- **Resultado de producto:** S1 solo hace coherentes los defaults actuales por canal en el wiring productivo `EngineerService`: Spotter EN con `af_bella` y Engineer ES con `ef_dora`, audio y visual del mismo locale; un locale ausente/mismatch no produce `completed` silencioso: falla cerrado con reason contractual diagnóstica. S1 NO expone selector ES/EN ni promete configurar ambos idiomas por canal; el mapeo locale→voz y la superficie de configuración quedan diferidos a S4.
  Cambio visible deliberado: hoy el visual Spotter es ES global; alinearlo a EN para casar con el audio Spotter es un cambio visible que requiere confirmación humana/manual de Isaac; no se afirma que los defaults visuales quedan intactos.
  `ParseLocale`/`Resolver` siguen siendo la autoridad canónica de parsing y soportan es/en/it/pt-BR; S1 no cambia parsing ni reclama "única autoridad" ni "solo admite ES/EN". `cmd/vantare/main.go`, persistencia, rediseño de preferencias (ISA-314 separada) y player se mantienen SOLO LEER; S1 incluye solo el mínimo frontend en la pestaña Ingeniero para probar lo que incorpore, sin selector ES/EN ni settings persistidos.
- **MODIFICAR (mínimo):** `service/delivery_runtime.go` — precedencia exacta en `productDeliveryPort.Deliver`: cuando `audioConfig != nil`, derivar por delivery el channel productivo de `decision/family`, obtener lang con `AudioConfig.Lang(channel)`, convertir con `presentation.ParseLocale` y resolver visual+audio con ese locale (autoridad efectiva); si `audioConfig == nil` (puerto/test aislado), conservar `port.locale` como fallback canónico ya inyectado; si `audioConfig` existe pero lang vacío/no soportado o hay mismatch, NO hacer fallback silencioso: fallo cerrado con reason contractual. `delivery_runtime.go:168` conserva `s.presentationLocale` solo como fallback, no como fuente efectiva cuando hay `audioConfig`. Se autoriza pasar/referenciar `audioConfig` en `productDeliveryPort` desde `EngineerService` sin mapa/estado nuevo, con snapshot/lectura segura coherente con los locks existentes; no tocar `main`. `service/engineer_service.go` — wiring pre-`Start` que solo valida configuración/defaults del `AudioConfig` inyectado, sin ser la selección efectiva;
  añade el snapshot `delivery.MetricsSnapshot` ampliado a `service.EngineerStatus` (ya viaja completo por `engineer:status` y en `engineer:stream`; verificar compatibilidad sin cambiar OBS/Desktop/store, datos acotados); `delivery/contract.go` —
  reason diagnóstica de audio integrada en los puntos contractuales mínimos `knownReason` y `validStateReason`, sin ampliar estados; persiste el último delivery state+reason por acknowledgement: amplía `delivery.Metrics.record` con reason y actualiza su único call site `Session.Acknowledge` (o equivalente last-ack mínimo); `MetricsSnapshot` JSON usa `lastState`/`lastReason` camelCase, enums acotados y sin payload; tests de contrato. Nuevo `service/s1_cumulative_test.go` — primera ruta acumulativa S1 sobre `EngineerService` productivo, no en replayoracle;
  `docs/engineer/phases/spotter/acceptance.md` — actualización documental obligatoria al crear `s1_cumulative_test.go` (punto de entrada, comando ejecutable y evaluación esperado/observado/prohibidos); no se crea otro protocolo. `frontend/src/engineer/engineer-types.ts` y `frontend/src/hub/pages/EngineerPage.tsx` — sección compacta Testing/Diagnóstico con campos productivos existentes (conexión/source/lifecycle/lastError), último delivery state/reason y locale/channel de la notificación real cuando exista; sin raw telemetry, sin inyección sintética ni store nuevo, sin conteo TTS (hoy 0 constante). `EngineerPage.test.tsx` — test de UI con transporte Wails mockeado para representación/controles del contrato recibido (el test Go S1 prueba comportamiento y reasons); sin persistencia ni ISA-314.
- **SOLO LEER / contexto:** `audio/config.go` (`DefaultAudioConfig`) y `audio/config_test.go` (`TestDefaultAudioConfig`) — se conservan defaults y test actuales; `cmd/vantare/main.go` — composición,
  no cambia; `internal/app/engineer_bridge.go` — SOLO LEER/passthrough del estado completo, sin evento nuevo; `audio/router.go` y `audio/router_test.go` — se preserva `TestCacheOnlyAudioRouterReadsCanonicalTTSCacheWithoutEngine`; `service/output_policy.go` — no cambia en este corte;
  `EngineerService.SetLocale`, `presentation.ParseLocale` y `presentation.Resolver` — SOLO LEER/intactos; `ParseLocale` sigue siendo la autoridad de parsing y soporta es/en/it/pt-BR (S1 no cambia parsing); un único `presentationLocale` pre-`Start` no cubre Spotter EN + Engineer ES: la selección efectiva ocurre por delivery en `Deliver` usando `AudioConfig.Lang(channel)`; el wiring pre-`Start` solo valida defaults Spotter EN / Engineer ES; config presente inválida falla cerrado (no se trata como tolerancia de fallback);
  `audio/player.go`, `player_windows.go` y tests de player — no se implementa, cambia ni prueba el player; un player ausente puede producir no-success por backend no configurado, sin cambiarlo; sin device, hotplug, ducking ni audibilidad real.
- **Tests a ampliar/crear (MODIFICAR/REESCRIBIR porque cambia su premisa):** `service/presentation_delivery_test.go` — `TestProductDeliveryPropagatesCanonicalLocaleAndVoiceToInjectedResolver` queda SOLO LEER/intacto (audioConfig nil → usa `port.locale` Italiano); `TestProductDeliveryKeepsSpanishVisualOnlyWhenSpotterAudioIsEnglish` queda SOLO LEER/intacto en su fixture aislada (audioConfig nil/`port.locale` ES);
  se añaden tests nuevos vía `EngineerService` + `DefaultAudioConfig` que demuestran runtime Spotter EN visual/audio y Engineer ES visual/audio; el test de defaults por canal (Spotter EN, Engineer ES) usa el path de `EngineerService`, no inyecta ES manualmente en el puerto; un mismatch visual/audio
  ya no completa en silencio: falla cerrado con reason; config presente inválida falla cerrado sin fallback silencioso; el fallback visual de cache miss sin `audio-only` sigue cubierto. Se añade un test Engineer que preserve ES por defecto: canal/familia Engineer entrega visual ES + audio ES y completa.
  `service/engineer_service_test.go` — tests de autoridad de locale (mismo locale visual/audio o fallo cerrado con reason; sin selector ni configuración explícita en S1);
  `service/delivery_runtime_test.go` — `audio-only` miss/mismatch no-success con reason y selección de locale por delivery (Spotter EN / Engineer ES); `delivery/contract_test.go` — `knownReason`/`validStateReason` aceptan la reason nueva, `MetricsSnapshot`/`Metrics.record` conservan state/reason sin payload y test Go de contrato JSON con keys camelCase `lastState`/`lastReason`/`delivery` y compatibilidad del status en `engineer:stream` (sin fixture duplicado gigante); `service/s1_cumulative_test.go` — primera ruta acumulativa S1; `frontend/src/hub/pages/EngineerPage.test.tsx` — test de la pestaña Ingeniero con transporte Wails mockeado (representación/controles del contrato recibido; no atraviesa `EngineerService`), ampliación acumulativa junto al test backend aplicable.
- **Orden TDD red-verde:** (1) rojo: la configuración del servicio produce mismatch silencioso de locale y debe dar locale coherente o fallar cerrado con reason; (2) rojo: `audio-only` sin
  clip/resolver/mismatch no termina `completed` y expone reason diagnóstica; (3) rojo: `s1_cumulative_test.go` reporta esperado/observado/prohibidos sobre EngineerService; (4) verde mínimo.
- **Criterios + validación manual:** un único locale efectivo por canal/familia (Spotter EN, Engineer ES), diagnosticable y sin mismatch silencioso; defaults de audio intactos (`DefaultAudioConfig`: Spotter EN `af_bella`, Engineer ES `ef_dora`);
  el visual Spotter pasa de ES global a EN como cambio visible deliberado, confirmado por Isaac; S1 no expone selector ni configuración explícita de idioma;
  `audio-only` falla cerrado con no-success y reason contractual (clip/resolver/mismatch ausentes o player ausente por backend no configurado) sin cambiar el player; la ruta S1 es ejecutable y
  evaluable por IA con fallo visible ante precondiciones ausentes. El corte C cubre acumulativamente A+B+C: ejercita enable/sensibilidad/secuencia/filtro junto con la salida en la misma ruta. Manual: sin
  cache, un modo `audio-only` no afirma salida y expone la causa; con cache del locale correcto, la ruta S1 entrega audio o degradación honesta; validar cada control/estado desde la pestaña Ingeniero (ruta manual primaria; `cmd/spotter-debug` queda como herramienta técnica); confirmar que no se abrió el player real ni se tocó el wiring de composición.
- **Comandos (desde `vantare-v2/`, tras `gofmt` en los `.go` modificados):** `go test ./internal/engineer/service`; `go test ./internal/engineer/audio`; `go test ./internal/engineer/delivery`; `go test ./internal/engineer/...`; `go test ./...`; test focal frontend `EngineerPage.test.tsx`; `pnpm --dir frontend test` (suite completa), `pnpm --dir frontend lint` y `pnpm --dir frontend build` como cierre conforme a AGENTS.
- **Stop conditions:** cambio en device/player/hotplug/ducking/audibilidad, reason no válida en `knownReason`/`validStateReason`, ampliación innecesaria de estados de delivery, exponer selector ES/EN o prometer configuración de ambos idiomas por canal en S1, crear app/ruta/renderer/estado/lógica paralela de debug, inyección arbitraria de telemetría o store frontend nuevo, mapa/estado nuevo de locale, payload en `MetricsSnapshot`, modificar `internal/app/engineer_bridge.go` o crear evento nuevo, cambiar OBS/Desktop/store, persistencia o rediseño de preferencias en S1 (ISA-314 separada), cambiar el parsing de `ParseLocale`/`Resolver`, modificar
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

Gate master: la sección visual temporal Testing/Diagnóstico de la pestaña
Ingeniero puede existir y crecer en issue/Nightly/Testers para validar, pero
debe retirarse o quedar excluida antes de promover a master. Tests y contratos
productivos se conservan; la retirada se replanifica en el cierre S7/promoción
master con prueba automática que falle si la superficie es visible en master.
