# Master Plan — Vantare Ingeniero Go (reescritura desde Python v0.7)

> **Estado:** v1.
> **Última revisión:** 2026-06-27.
> **Worktree canónico:** `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer`.
> **Submódulo de código:** `vantare-v2/` dentro del worktree.
> **Autoridad vigente:** [`vantare-go-master-plan.md`](engineer/vantare-go-master-plan.md).
> Este documento NO contradice al plan maestro: lo segmenta en tareas,
> secciones y planes generales para que el orquestador, el worker y el
> reviewer operen sin ambigüedad.

## 1. Propósito de este documento

`engineer/vantare-go-master-plan.md` define **reglas, defaults, decisiones y
matrices**. Este `master-plan-go.md` define **cómo se ejecuta** esa
estrategia:

- Qué secciones componen el producto reescrito.
- Qué tareas pertenecen a cada sección.
- Qué planes generales cierran cada fase.
- Qué gates debe superar cada fase antes de pasar a la siguiente.
- Cómo se conecta con `current-work-go.md` (la siguiente tarea
  concreta).

## 2. Reglas no negociables (heredadas)

Estas reglas son **el suelo**. Cualquier plan, feature o PR que las
contradiga se considera roto y se revierte. Origen:
`engineer/vantare-go-master-plan.md` § 3.

1. La IA nunca decide datos críticos.
2. Spotter y suite a 20 Hz sobre el mismo `TelemetryFrame`.
3. Detección ≠ messaging (geometría, histéresis, transición, delay,
   expiración y prioridad son paquetes distintos).
4. Defaults Locked: cambiar una default requiere actualizar el plan
   maestro, evidencia live y PR separado.
5. i18n + NumberProcessing: ES por defecto, EN desde beta.
6. Sin overlays in-game en Vantare.
7. Tests antes que código (TDD).
8. Sin daemon, sin bus, sin microservicios locales.
9. Wails UI solo capa de presentación.
10. Solo LMU en prealpha y alpha temprana. AC/AC EVO entran en 1.0.

**Regla CrewChief por feature.** Las auditorías generales de CrewChief
sirven como contexto, no como permiso. Antes de implementar cualquier
feature de paridad, el miniplan debe incluir una mini-auditoría
específica contra
`https://gitlab.com/mr_belowski/CrewChiefV4` con archivos, funciones,
constantes/cooldowns/gates, campos de telemetría, gap exacto y tests
esperados. Detalle en `engineer/agent-workflow.md` § 4 y
`engineer/README.md` § 3.

## 3. Secciones del producto (mapa de trabajo)

La reescritura Go se divide en **8 secciones**. Cada sección agrupa
tareas de un mismo subsistema. Las secciones 1-4 son las que sostienen
el núcleo; 5-8 crecen encima sin tocar el suelo.

| # | Sección | Fuente Python v0.7 | Estado Go | Fase dueña |
|---|---|---|---|---|
| 1 | Telemetría LMU | `lmu_api.py` + offsets | PARCIAL (`internal/telemetry/lmu/parser.go` lee Fuel/GamePhase/Place/etc.; parser experimental `internal/engineer/lmu/` sin commit, geometría only) | prealpha + 1.1 |
| 2 | Spotter | `spotter/` Python | CONFIRMADO geometría + ActiveSides; NO_IMPLEMENTADO speed gate, ValidityRule, stacked-cars, fixtures persistentes | prealpha |
| 3 | Suite CrewChief race-control | `Events/FlagsMonitor`, `Penalties`, `DamageReporting`, `ConditionsMonitor`, `FrozenOrderMonitor` | NO_IMPLEMENTADO | alpha 1 |
| 4 | Suite CrewChief core race | `Events/LapTimes`, `LapCounter`, `PushNow`, `SessionEndMessages`, `Fuel`, `PitStops` | NO_IMPLEMENTADO | alpha 1 |
| 5 | Suite CrewChief vehicle + opponents | `Events/TyreMonitor`, `EngineMonitor`, `Battery`, `OvertakingAids`, `MulticlassWarnings`, `Opponents`, `OpponentMessages`, `WatchedOpponents`, `Strategy`, `PearlsOfWisdom`, `RaceTime` | NO_IMPLEMENTADO | alpha 2 |
| 6 | Suite CrewChief endurance + comandos | `Events/DriverSwaps`, `Position`, `Timings`, `CommandManager`, `LMUPitMenu` | NO_IMPLEMENTADO | alpha 2-3 |
| 7 | Audio queue + TTS + voice contract | `audio/`, TTS Edge/Gemini/Kokoro | PARCIAL (cola + expiración + Player con kill; TTS Edge real, Kokoro stub; `internal/tts/` NO existe; integración `queueLoop→Player.Play` NO_IMPLEMENTADO) | prealpha → 1.0 |
| 8 | Infra compartida + hardening | NSIS, auto-update, duck_lmu, voice clone, i18n | PARCIAL (NSIS heredado, auto-update no) | alpha 3 → 1.0 |

> Detalle por módulo CC y estado exacto:
> `engineer/vantare-go-master-plan.md` § 6 y matriz LMU-01..48 en § 13.

## 4. Planes generales (uno por fase)

Cada fase es un **plan general** con su propio set de miniplanes. Aquí
solo se define el contrato del plan; los miniplanes viven en
`docs/superpowers/plans/`.

### Plan general G0 — Prealpha (0.0.x): Spotter MVP

**Objetivo:** cerrar spotter lateral con paridad CrewChief confirmada
en pista real.

**Tareas (segmentadas, no son planes individuales aún):**

- G0.1 Geometría CrewChief X/Z validada en pista real.
- G0.2 Replay JSONL con fixtures left/right/three-wide/all-clear.
- G0.3 `cmd/spotter-debug` exportando
  `alignedX/alignedZ/side/inOverlap/rejectReason` (sustituye al
  `-jsonl` que nunca existió en `cmd/lmu-debug`).
- G0.4 Captura side-by-side real LMU con ≥1 min de tráfico.
- G0.5 `verify-prealpha.ps1` verde.
- G0.6 Sin mensajes stale en tests.
- G0.7 Speed gate `minSpotterSpeedMPS=10.0` implementado y
  testeado.
- G0.8 `ValidityRule` + `Runtime.IsMessageStillValid` implementados.
- G0.9 `Player.Play` integrado en `queueLoop`.
- G0.10 Spotter audible y consistente en ≥3 circuitos.

**Secciones implicadas:** 1 (parcial), 2 (cierre), 7 (audio + voice
contract VC-A*).

**Gate de salida (`engineer/testing/prealpha-gate.md`):** todos los
checks de `engineer/vantare-go-master-plan.md` § 14 prealpha.

**Planes individuales a derivar (futuros miniplanes):**

- Captura LMU real → fixtures reproducibles.
- Cancelación de clears stale tras cambio de lado.
- Validación `clearDelayMS=150` con trazas reales.
- Reconexión del reader tras arranque tardío.
- Comportamiento sin panic al salir a menú.

### Plan general G1 — Alpha 1 (0.1.x): Ingeniero determinista básico

**Objetivo:** portar race-control + core race mínimo viable.

**Tareas:**

- G1.1 FlagsMonitor (LMU-15 FCY/flags + LMU-13 penalty type).
- G1.2 Penalties.
- G1.3 DamageReporting (5 componentes LMU PARCIAL documentado).
- G1.4 ConditionsMonitor (rain/weather, LMU-30).
- G1.5 FrozenOrderMonitor (LMU-07).
- G1.6 LapTimes + LapCounter (LMU-08, 21, 22).
- G1.7 PushNow (LMU-19).
- G1.8 SessionEndMessages (LMU-28).
- G1.9 Fuel básico (LMU-06).
- G1.10 PitStops básicos read-only (LMU-16, 17).
- G1.11 Position messages (LMU-20, 27).
- G1.12 Timings / gaps (LMU-10, 31, 32).
- G1.13 Sector delta reports (LMU-31).
- G1.14 Sector splits nativos (LMU-32).
- G1.15 Grid side @ race start (LMU-36).
- G1.16 FCY pause spotter 10-30s (LMU-40).
- G1.17 `minSessionRunTimeForEndMessages` (gate 60s CC; el campo
  `minSessionParticipationTime 6s` del plan maestro es decisión de
  producto no-paridad, LMU-47 NO_VERIFICADO).
- G1.18 Cutover definitivo de `triggers.py` legacy.
- G1.19 Voice contract VC-A* sin regresión.
- G1.20 ≥80% matriz LMU-01..48 en `CONFIRMADO` o `PARCIAL` con
  mini-auditoría adjunta.

**Secciones implicadas:** 3, 4, 7 (audio priority/preemption +
delayed queue).

**Gate de salida (`engineer/vantare-go-master-plan.md` § 14 alpha 1):**
todos los checks alpha 1.

### Plan general G2 — Alpha 2 (0.2.x): Vehicle + opponents + multiclase

**Objetivo:** portar suite CC vehicle + opponents + endurance base.

**Tareas:**

- G2.1 TyreMonitor (LMU-11, 18; hot/cooking/wear/brake).
- G2.2 EngineMonitor (LMU-29).
- G2.3 Battery Hypercar SOC (LMU paralelo a CC `Battery.cs`; LMU
  reusa `mFuel` como proxy).
- G2.4 OvertakingAids DRS/PTP.
- G2.5 MulticlassWarnings 3 escenarios MVP.
- G2.6 Opponents (pit/pos) (LMU-26).
- G2.7 OpponentMessages (rival fast lap).
- G2.8 WatchedOpponents (LMU-34).
- G2.9 Strategy (sector fuel).
- G2.10 PearlsOfWisdom (LMU-24).
- G2.11 RaceTime (announce cada N vueltas).
- G2.12 DriverSwaps stint countdown (LMU-25 NO_VERIFICADO).
- G2.13 NumberProcessing EN (LMU-46) — base para beta.
- G2.14 Driver name helper.
- G2.15 Frases editables (PhraseStore + import/export).
- G2.16 Idioma EN con NumberProcessing.

**Secciones implicadas:** 5, 6 (parcial), 7 (i18n audio).

**Gate de salida (`engineer/vantare-go-master-plan.md` § 14 alpha 2):**
todos los checks alpha 2.

### Plan general G3 — Alpha 3 (0.3.x): Pit Manager + PTT + installer

**Objetivo:** escribir en LMU REST `:6397`, abrir PTT y endurecer
distribución.

**Tareas:**

- G3.1 REST LMU `:6397` write con `dry_run=true` + confirmación por
  voz.
- G3.2 Command catalog PTT ≥14 tools (LMU-35 ≥80%).
- G3.3 Grid side @ race start ya integrado con Position.
- G3.4 FCY pause spotter integrado.
- G3.5 `duck_lmu.exe` en bundle.
- G3.6 NSIS installer Windows x64 (heredado, endurecido).
- G3.7 Auto-update GitHub Releases E2E.
- G3.8 Beeps (radio) opcional (LMU-38).
- G3.9 Pit menu write (LMU-48) con guard doble.

**Secciones implicadas:** 6, 7, 8.

**Gate de salida (`engineer/vantare-go-master-plan.md` § 14 alpha 3):**
todos los checks alpha 3.

### Plan general G4 — Beta (0.9): Hardening ship-quality LMU

**Objetivo:** producto LMU-first listo para ship con evidencia
multi-circuito.

**Tareas:**

- G4.1 `verify-release.ps1` + `verify_beta_gate.ps1` verdes.
- G4.2 Evidencia ≥3 circuitos × ≥2 condiciones (seco/mojado,
  día/noche).
- G4.3 ≥85% matriz LMU-01..48 en `CONFIRMADO` o `PARCIAL` con
  mini-auditoría adjunta.
- G4.4 NumberReading multi-idioma completo (LMU-42, 46).
- G4.5 Driver name helper estable.
- G4.6 Sub-100ms critical latency verde (LMU-33) en test de carga.
- G4.7 Voice contract VC-* completo en CI.

**Secciones implicadas:** todas (regression global).

**Gate de salida (`engineer/vantare-go-master-plan.md` § 14 beta):**
todos los checks beta.

### Plan general G5 — 1.0: Voice clone + release stable

**Objetivo:** liberar la primera versión comercial con voz clonada y
consentimiento.

- G5.1 Sample de voz del usuario + consentimiento explícito + cifrado
  + borrado a petición.
- G5.2 Fallback chain clone → Gemini → Edge → Kokoro.
- G5.3 ≥90% matriz LMU-01..48 en `CONFIRMADO` o `PARCIAL` con
  mini-auditoría adjunta.
- G5.4 Release stable (sin pre-release).
- G5.5 Hardening final + smoke checklist.

**Secciones implicadas:** 7 (cierre), 8 (release).

**Gate de salida (`engineer/vantare-go-master-plan.md` § 14 1.0):**
todos los checks 1.0.

### Plan general G6 — 1.1: iRacing + Suite Go opcional

**Objetivo:** añadir iRacing y abrir convivencia opcional con la app
de overlays Go.

- G6.1 iRSDK read (LMU y iRacing en paralelo).
- G6.2 Spotter iRacing.
- G6.3 Triggers endurance iRacing.
- G6.4 Suite launcher opt-in (no obligatorio).
- G6.5 Go standalone con `shared-telemetry` CGO.
- G6.6 Companion API v1 documentada.
- G6.7 LMU sin regresión.

**Secciones implicadas:** 1 (segundo adapter), 6 (PIT/PTT iRacing).

**Gate de salida (`engineer/vantare-go-master-plan.md` § 14 1.1):**
todos los checks 1.1.

### Plan general G7 — 2.0 (futuro): Strategy platform

**Objetivo:** Monte Carlo maduro + SDK/plugin system.

> **Estado:** registrado como futurible. NO se inicia sin decisión
> explícita del orquestador. Origen: `engineer/vantare-go-master-plan.md`
> § 7.

## 5. Mapa cruzado sección × plan general

| Sección \ Plan | G0 | G1 | G2 | G3 | G4 | G5 | G6 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 Telemetría LMU | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (iRSDK) |
| 2 Spotter | ✓ | ✓ | — | — | ✓ | ✓ | ✓ |
| 3 Race-control | — | ✓ | — | — | ✓ | ✓ | ✓ |
| 4 Core race | — | ✓ | — | — | ✓ | ✓ | ✓ |
| 5 Vehicle + opponents | — | — | ✓ | — | ✓ | ✓ | ✓ |
| 6 Endurance + comandos | — | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 Audio + TTS + voice | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 Infra + hardening | — | — | — | ✓ | ✓ | ✓ | — |

## 6. Defaults Locked (resumen ejecutivo)

Cualquier cambio de default requiere actualizar
`engineer/vantare-go-master-plan.md` § 5, evidencia live y PR separado.
Listado canónico en el plan maestro; este master plan NO redefine
valores.

Anclas críticas a respetar (con nota de evidencia cuando aplique):

- `detectionHoldMS=350`, `clearDelayMS=150`, `stillThereRepeatMS=2500`.
- `messageExpiryMS=2000`, `clearExpiryMS=2000`.
- `minSpotterSpeedMPS=10.0` (decisión Vantare; default CC es user
  setting no verificable en este repo).
- `trackZoneToConsiderM=20.0`.
- `carLengthM=4.5`, `carWidthM=1.8`, `gapNeededForClearM=0.5`.
- `battery_low_soc_pct=10.0` (CORREGIDO 2026-06-27; antes 20.0;
  CC `Battery.cs:77`).
- `session_start_delay_s=6.0` (decisión Vantare, NO paridad CC
  directa).
- `push_window_laps` y `push_window_time_s` por TrackLengthClass
  (CC `PushNow.cs:88,96-98`), NO valor único global.
- `pit_menu_dry_run=true`, `pit_menu_confirm_writes=true`.
- `multiclass_check_interval_s=4.0`, `multiclass_settle_s=6.0`
  (CC `MulticlassWarnings.cs:90-91`).

## 7. Voice contract VC-* y matriz LMU-01..48

Ambos son el segundo anillo de seguridad para no degradar la calidad
durante la reescritura.

- Matriz LMU-01..48: fuente de verdad del progreso. Vive en
  `engineer/vantare-go-master-plan.md` § 13 y se detalla en
  `engineer/architecture/crewchief-parity.md`.
- Matriz VC-A01..VC-R04: contrato normativo de voz/TTS. Vive en
  `engineer/voice-contract.md`. Cobertura de tests en
  `engineer/testing-strategy.md` § "Cobertura de voice contract".

Cada plan general debe declarar qué filas de cada matriz cierra antes
de darse por bueno. Estado válido solo si la fila tiene
**mini-auditoría específica** adjunta (ver
`engineer/agent-workflow.md` § 4).

## 8. Reglas duras (heredadas, no negociables)

Origen: `engineer/agent-workflow.md` § "Reglas duras".

- No tocar `go.mod` ni `frontend/package.json` sin aprobación.
- No cambiar Defaults Locked sin actualizar plan maestro y tests.
- No reescribir tipos `telemetry.Frame`, `spotter.Zone`,
  `audio.Message` sin migración completa.
- No añadir segundo binario, daemon, IPC o bus interno.
- No introducir IA en capas deterministas del spotter o suite.
- **No implementar feature CrewChief sin mini-auditoría específica.**

## 9. Cómo derivar trabajo concreto

El master plan NO crea miniplanes. Los miniplanes viven en
`docs/superpowers/plans/YYYY-MM-DD-<plan>-<slug>.md` y se crean
**solo** cuando un plan general va a ejecutarse.

Flujo:

1. Orquestador identifica el siguiente plan general a ejecutar (ver
   `current-work-go.md`).
2. Lo divide en miniplanes pequeños y secuenciales.
3. Cada miniplan declara objetivo, alcance, archivos esperados,
   archivos prohibidos, criterios de aceptación, checks y rollback.
4. Para features CrewChief: mini-auditoría específica con archivos,
   funciones, constantes/cooldowns/gates y estado
   `CONFIRMADO`/`NO_VERIFICADO` (`engineer/agent-workflow.md` § 4).
5. Worker implementa el miniplan con TDD.
6. Reviewer audita.
7. Orquestador cierra el miniplan y actualiza
   `current-work-go.md`.
8. Si cambia el estado real del código Go, actualizar también
   `engineer/INDEX.md` § 5.
9. Cuando un plan general cumple su gate de salida, se promociona al
   siguiente.

## 10. Cómo se conecta con `current-work-go.md`

`current-work-go.md` mantiene:

- El plan general activo.
- El miniplan activo dentro de ese plan general.
- Las 5 próximas tareas pequeñas concretas.
- Los riesgos activos y los gates pendientes.

Este `master-plan-go.md` mantiene la segmentación global. No se
modifica en cada tarea: solo cuando se cierra un plan general o se
descubre una nueva sección.

## 11. Reglas de mantenimiento de este documento

- Cambios pequeños y concretos; nada de rescrituras masivas.
- No duplicar contenido del plan maestro: referenciarlo.
- Si aparece una nueva sección transversal (ej. nuevo provider TTS,
  nuevo sim), añadir fila en § 3 y matriz en § 5.
- Si se reabre un plan general cerrado (regresión), marcarlo como
  "reabierto" con motivo en § 4.
- Versionar este doc en `engineer/INDEX.md` cuando se cree o cambie.

## 12. Antipatrones prohibidos

- Empezar G1 antes de cerrar G0 (prealpha sin spotter estable).
- Crear miniplanes que toquen varias secciones a la vez.
- "Heredar" lógica Python sin tests de paridad en Go.
- Cambiar defaults sin actualizar
  `engineer/vantare-go-master-plan.md` § 5.
- Mover tests de spotter fuera de `internal/engineer/spotter/`.
- Versionar bindings Wails en git (regenerados, no commiteados).
- Crecer la app con daemon, bus o microservicios (regla 8).
- Añadir AC/AC EVO antes de 1.0 (regla 10).
- Reintroducir overlays in-game (regla 6).
- Implementar feature CrewChief desde la matriz general sin
  mini-auditoría específica (regla CC).

## 13. Resumen ejecutivo

Este master plan segmenta la reescritura 100 % Go desde Python v0.7
en **8 secciones** y **7 planes generales** (G0 a G6, con G7 como
futurible). Cada plan general tiene un gate de salida explícito, mapea
contra la matriz LMU-01..48 y contra el voice contract VC-*, y deriva a
miniplanes concretos solo cuando se ejecuta. El avance real se mide en
`current-work-go.md` y en la matriz de paridad, no en esta tabla.

**La paridad con CrewChief no se asume; se demuestra.** Cada feature
de la matriz LMU-01..48 requiere mini-auditoría específica contra el
repo fuente antes de tocar código. Sin evidencia, el estado es
`NO_VERIFICADO` y la implementación se bloquea.
