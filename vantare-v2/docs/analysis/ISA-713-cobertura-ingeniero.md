# ISA-713 — matriz de cobertura del Ingeniero/Spotter

Base: `4e5e9556574bd2b3dc6d115ce13625812016aa0b` (`origin/nightly`), rama `vantareapp/isa-713-reconciliacion-cobertura`, worktree `vantare-isa713-cobertura`. Reconciliación del alcance real de la issue padre #713 tras la serie F integrada. Documento de análisis: sin cambios de producto, tests ni roadmap.

## Resumen ejecutivo

El rework del Ingeniero (spec `docs/engineer/rework-spec.md`, decisiones D1–D11) está integrado en nightly: el bus `radio.v1`, el Spotter unificado P0, el motor de cinco familias declarativas y el carril experimental de voz de entrada conviven con el stack legacy de monitores, que permanece como rollback reversible tras dos toggles de servicio. La producción real es el stack nuevo; el legacy no se borra hasta el gate LMU humano. Lo residual del proyecto vive en cuatro issues hijas: #928 (preferencias Spotter + aviso de indisponibilidad, PR #933 draft verde), #899/#901 (notificaciones coherentes y Spotter overlay-only) y #720 (widget radio beta + promoción a testers). El oráculo de replay existente cubre el stack viejo, no `radio.v1`: extenderlo es el hueco de verificación más útil antes de la sesión LMU.

## Fuentes contrastadas

- Spec del rework: `docs/engineer/rework-spec.md` (D1–D11, asunciones A1–A5, fases F0–F6).
- Handoff vivo: `docs/vantare-program/handoffs/engineer-spotter.md` (última entrada 2026-08-22; ver discrepancias abajo).
- Código: `internal/radio/`, `internal/families/`, `internal/spotter/`, `internal/engineer/`, `internal/telemetry/projection/engineer/`, `internal/notify/`, `frontend/src/{engineer,overlay,hub}`.
- Git: merges de F3 `#733` (`ebd57040`), F4 `#739` (`4a697b6a`), F5 `#756` (`8174d944`) y resto de la serie sobre `origin/nightly`; issues hijas vivas y PR #933.

## Matriz por familia e intent

El bus registra 20 intents cerrados: 13 del motor de familias (`internal/families/catalog.go:36-50`) y 7 del Spotter (`internal/spotter/catalog.go:8-16`). Todas las frases existen en los cuatro locales es/en/it/pt-BR (`catalog.go:70-74` en ambos paquetes).

| Familia | Intents | Productor | Capabilities exigidas | Prioridad | Tests | Gate pendiente |
|---|---|---|---|---|---|---|
| spotter | `car_left/right`, `still_there`, `clear_left/right`, `all_clear`, `three_wide` | `internal/spotter/producer.go` + `policy.go` + `geometry/` | `spatial` (vía snapshot) | P0 | `radio_policy_test.go` (595 l), `policy_test.go`, `catalog_test.go`, `benchmark_test.go` | p95 <150 ms y sesión LMU reales |
| fuel | `low_half_tank`, `low_2l`, `low_1l`, `laps_remaining_4..1`, `for_pit_now` | `internal/families/fuel.go` vía `engine.go` | session+standings+fuel; intents de capacidad condicionados por authorizer (`engine.go:76-80`) | P2 | `parity_test.go` (402 l) + tests del engine | LMU real |
| penalties | `count_increased` | `families/penalties.go` | standings | P3 | `parity_test.go` | LMU real |
| laps | `lap_completed` | `families/laps.go` | session+standings | P3 | `parity_test.go` | LMU real |
| timings | `gap_report` | `families/timings.go` | session+standings+gaps | P3 | `parity_test.go` | LMU real |
| pitstops | `entry`, `exit` | `families/pitstops.go` | session+standings+controls+pit | P3 | `parity_test.go` | LMU real |

Comportamiento clave verificado en código: cada familia declara capabilities y se resetea cuando alguna deja de estar `supported` (`engine.go:220-227`); los intents con autorizador se invalidan al perder su evidencia (`engine.go:177-186`); snapshots no listos o jugador ausente devuelven `ErrObservationNotReady` y resetean (`engine.go:154-163`).

## Infraestructura

| Pieza | Ubicación | Estado en nightly | Tests | Nota |
|---|---|---|---|---|
| Bus `radio.v1` | `internal/radio/bus.go` (334 l) | Integrado: prioridades P0–P3, TTL, coalescing por subject/revision, límites acotados (`message.go:69-86`), `ProducerRevision` contra ACK tardío (`message.go:63-65`) | `bus_test.go` (408 l), `delivery_test.go`, `presentation_test.go`, `benchmark_test.go` | p95 Wails real pendiente |
| Delivery | `internal/radio/delivery.go` + `engineer/delivery/` | Dual: bus + handoff acotado | `delivery_test.go` (242 l) | — |
| Presentación/resolver | `internal/radio/presentation.go`, catálogos registrables (`families/catalog.go:60-68`, `spotter/catalog.go:34-45`) | Registro por intent con definición + frases | `presentation_test.go` (93 l) | — |
| Servicio | `internal/engineer/service/engineer_service.go` | Orquesta bus, resolver, productores, delivery, presentación, health de voz | 13 archivos `_test.go` | Toggles de rollback en `:216,:230` |
| Capabilities | `internal/telemetry/projection/engineer/contract.go:28-34` | 7 IDs: session, standings, controls, pit, fuel, gaps, spatial; estados unknown/supported/unsupported/degraded | tests del paquete | unknown ≠ unsupported (`contract.go:25-26`) |
| Audio | `internal/engineer/audio/` | Config TTS multi-locale por canal (spotter/engineer), cache-only en producción | 6 archivos de test | Verificación Wails audio real pendiente |
| Voz de entrada | `internal/engineer/voiceinput/` | Carril experimental tras flag `-engineer-voice-input` (`cmd/vantare/main.go:1338`), memoria-only | 2 archivos de test | STT real, wake word, FAR/FRR: NO-GO humano |
| PTT | `internal/engineer/ptt/` | Bindings normalizados, detección de conflictos, asignaciones | 4 archivos de test | Pulsación física real pendiente |
| Replay/oráculo | `internal/engineer/replayoracle/`, `replay/`, `simulator/` | Laboratorio determinista test-only | `runner` + tests | **Cubre projectioninput+messagepolicy+spotter legacy; NO cubre `radio.v1`/delivery** |
| Notificaciones | `internal/notify/notify.go` | Toast de sistema mínimo (Wails, ventana oculta) | `notify_test.go` | Centro/contrato de notificaciones: #899/#901 |
| Rendimiento visual | ISA-940 (`9a9179aa`) | Niveles 4–5 bloquean subtítulos/presentación visual conservando audio | regresión "cero visual + un audio" | — |

## Superficies UI

- Subtítulos: `frontend/src/engineer/EngineerSubtitles.tsx` (+ test, CSS).
- Widget radio: `frontend/src/overlay/widget-types/engineer-radio/` (definición + test) con renderizadores Crystal y Functional — existe en código; la beta F6 y promoción a testers son #720.
- Hub Engineer Orbit: `frontend/src/hub/engineer-orbit/` (página, modelo, bridge, i18n ×4) — centro de control donde aterriza la persistencia de preferencias de #928/PR #933.
- Preferencias de notificación del sistema: `frontend/src/hub/settings/notification-preferences.ts`, `useSystemNotifications.ts`.
- Harness de desarrollo: `frontend/src/orbit-engineer-harness.tsx`.

## Stack legacy y rollback

- `internal/engineer/core/runtime.go` instancia los 20 monitores alpha (engine, tyre, opponents, multiclass, watchedopponents, flags, fuel, penalties, laps, position, push, racetime, sessionend, timings, pearls, pitstops, strategy, + spotter legacy) sobre `telemetry.Frame` — sigue cableado en el servicio (`engineer_service.go:258`).
- Rollback reversible en caliente: `SetLegacySpotterRollback` / `SetLegacyFamiliesRollback` (`engineer_service.go:213-236`); la ruta vieja pasa por `projectioninput` + `messagepolicy` (`legacyProjectionFamilies` en `:1019`).
- `internal/engineer/pitmanager/` no tiene importadores fuera de sí mismo: el Pit Manager transaccional del spec no está implementado en el stack nuevo; el paquete viejo es código dormido.
- Criterio del handoff y spec: no se borra legacy hasta gate LMU humano (D3 lo deja en git; el rollback en runtime desaparece con la retirada).

## Discrepancias handoff vs. código

- El handoff (2026-08-22) lista F1/F3/F4/F5 "En revisión, PRs draft sin merge". En `origin/nightly` ya están mergeadas (`ebd57040`, `4a697b6a`, `8174d944`, más el cutover). El handoff describe el momento pre-merge; su sección "Siguiente acción exacta" está superada en la parte de review y sigue vigente en el gate LMU.
- El handoff menciona ENG-16..29 como roadmap; el programa ENG-xx quedó reemplazado por la serie F: su residual real son las issues vivas y los gates humanos, no esos tickets históricos.

## Veredicto de reconciliación de #713

Alcance cubierto por la serie F ya en nightly: F0 catálogo (tablas cerradas de intents+frases), F1 bus, F3 spotter unificado, F4 motor de familias, F5 voz experimental tras flag. **El objeto "radio bus + motor de familias" de la issue padre está entregado.**

Residual que NO pertenece al cierre de #713 y tiene issue propia:

- #928 — persistencia de preferencias Spotter y aviso de indisponibilidad (PR #933 draft, CI verde).
- #899 / #901 — notificaciones coherentes, centro/contrato y Spotter overlay-only.
- #720 — F6 widget radio en beta + promoción a testers.

Residual sin issue ejecutable (gates humanos de Isaac):

- Sesión LMU real: Spotter p95 <150 ms, familias, y posterior retirada del legacy.
- Audio Wails real, micrófono/STT, wake word FAR/FRR, licencia TTS productiva, Pit transaccional.

Hueco de verificación recomendado (documentable como siguiente tarea): extender `replayoracle` o un equivalente a `radio.v1` + delivery (ACK tardío, reconexión, saturación, exclusividad de rollback) para convertir la sesión LMU en validación dirigida.

## Limitaciones

- Análisis estático: no se ejecutaron builds, tests ni sesión LMU/Wails. Los estados "integrado" significan "presente y cableado en `origin/nightly` con tests", no "validado en hardware".
- Los conteos de líneas/tests son de este checkout (`4e5e9556`).
