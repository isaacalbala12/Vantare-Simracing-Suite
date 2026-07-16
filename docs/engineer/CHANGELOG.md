# Changelog — `docs/engineer/`

Bitácora de cambios del paquete de documentación del Ingeniero Go.

## v1.1 — 2026-06-27 (revisión documental)

Auditoría adversarial de la capa documental. Cambios principales:

- **Jerarquía explícita en `INDEX.md`:** 6 niveles (raíz, plan y
  estado, reglas de operación, arquitectura y dominio, auditorías y
  evidencia, testing y producto). Tabla de archivos con estado real
  (`CONFIRMADO`, `PARCIAL`, `NO_IMPLEMENTADO`, etc.). Sección de
  estado real del paquete Go vs claims de los docs.
- **Regla CrewChief reforzada** en `README.md` § 3 y
  `agent-workflow.md` § 4. Estados válidos para matriz:
  `CONFIRMADO`, `PARCIAL`, `NO_VERIFICADO`, `NO_IMPLEMENTADO`,
  `GAP`, `NOT_PORTED`, `HISTÓRICO`.
- **`vantare-go-master-plan.md` corregido:**
  - `battery_low_soc_pct=20.0 → 10.0` (alineado con CC
    `Battery.cs:77`).
  - `push_window_laps=3` reemplazado por reglas por TrackLengthClass
    (`MEDIUM≤4, LONG≤2, VERY_LONG=1`) según `PushNow.cs:96-98`.
  - `push_window_time_s=240` reemplazado por ventana
    `120 < remaining < 240` según `PushNow.cs:88`.
  - `minSpotterSpeedMPS=10.0` marcado como decisión Vantare (no
    paridad CC directa; default CC no verificable en este repo).
  - `session_start_delay_s=6.0` marcado como decisión Vantare (no
    paridad CC directa; CC tiene `minSessionRunTimeForEndMessages=60s`
    que es un gate distinto).
  - `tyre_wear_warn_pct=75.0` confirmado y aclarado que CC usa 4
    umbrales per-wheel: scrubbed=5, minor=20, major=50,
    wornOut=75.
  - Matriz LMU-01..48 (§ 13) reescrita con estados basados en
    evidencia y columna "Mini-auditoría CrewChief" para cada fila.
  - Lista de módulos CC (§ 6) reescrita con archivos y líneas CC
    exactas.
- **`current-plan.md` corregido:** § 2 "Estado técnico actual"
  reescrito con lo confirmado en código + tests, lo NO implementado
  (ValidityRule, IsMessageStillValid, minSpotterSpeedMPS,
  cmd/lmu-debug -jsonl, fixtures persistentes, paquetes aspiracionales),
  y los cambios sin commit del worktree. § 6 con 5 mini-tareas
  concretas (incluyendo creación de `cmd/spotter-debug`).
- **`current-work-go.md` (raíz) y `master-plan-go.md` (raíz)**
  reescritos para reflejar la nueva jerarquía, los cambios sin
  commit, y el miniplan activo.
- **`architecture/0001-prealpha-architecture.md` corregido:**
  paquetes aspiracionales (`tts/`, `sim/`, `config/`,
  `persistence/`, `cli/`, `engineer/modules/`, etc.) marcados como
  NO_IMPLEMENTADO con tabla de evidencia.
- **`architecture/crewchief-parity.md` reescrito** como vista
  basada en evidencia con sección 14 de "Open Questions
  NO_VERIFICADO" explícitas.
- **`architecture/crewchief-parity-report.md` marcado HISTÓRICO**
  con cabecera que explica los 7 errores principales del informe
  previo y conserva el contenido como referencia.
- **`architecture/crewchief-parity-audit.md` marcado EVIDENCIA**
  con cabecera que advierte sobre los errores internos del propio
  audit (ej. typo tyre wear 75→30 incorrecto).
- **`architecture/spotter-geometry-findings.md` reescrito:**
  separado CONFIRMADO (código + tests) vs NO_VERIFICADO (captura
  live pendiente). Tests pendientes listados explícitamente.
- **`architecture/tts.md` marcado HISTÓRICO/ASPIRACIONAL.**
  `internal/tts/` no existe.
- **`testing/prealpha-gate.md` corregido:** `cmd/lmu-debug -jsonl`
  sustituido por `cmd/spotter-debug` (el flag `-jsonl` no existe).
  Criterios nuevos para `ValidityRule`, `minSpotterSpeedMPS` y
  cambios sin commit.
- **`product/prealpha-next-steps.md` corregido** igual que el gate
  prealpha.

### Recomendaciones archivado/fusión (no ejecutadas en este pase)

- `architecture/crewchief-parity-report.md` puede archivarse a
  `docs/historical/` cuando se confirme que el contenido histórico
  ya no se consulta. Mientras tanto se conserva con cabecera
  HISTÓRICO.
- `docs/proyecto/*` (V1) sigue siendo histórico, fuera del scope de
  este pase.
- `docs/plans/*` y `docs/superpowers/plans/*` siguen siendo planes
  puntuales, fuera del scope.

## v1 — 2026-06-27

Creación inicial del paquete en el worktree
`C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer`.

### Contexto

El producto Python `Vantare-Ingeniero` v0.7.0 (publicado 2026-06-15)
sentó las bases de paridad con CrewChief, voz, audio, i18n ES/EN,
Pit Manager LMU, NSIS installer y auto-update. El usuario decide
reescribir el producto en Go (`Vantare-Ingeniero-Go`) por motivos
técnicos y de mantenibilidad. Este paquete de docs refleja las
decisiones heredadas y la planificación futura del Go.

### Reglas heredadas de Python v0.7

- IA nunca decide datos críticos. Solo redacta sobre `facts`.
- Spotter y suite del ingeniero evalúan a 20 Hz sobre el mismo
  `TelemetryFrame`.
- Detección ≠ messaging. Paquetes separados para geometría,
  histéresis, transición, delay, expiración y prioridad.
- Defaults Locked en plan maestro §5. Cambios requieren actualizar
  plan maestro + tests + evidencia.
- i18n + NumberProcessing multi-idioma.
- Sin overlays in-game en Vantare.
- Tests antes que código.
- Sin daemon, sin bus, sin microservicios locales.
- Wails UI solo capa de presentación.
- Solo LMU en prealpha y alpha temprana.

### Lista canónica de módulos CC a portar

Lista de 25+ módulos CrewChief traducidos del Python v0.7 al Go. Ver
[`architecture/crewchief-parity.md`](architecture/crewchief-parity.md) § 8
y [`vantare-go-master-plan.md`](vantare-go-master-plan.md) § 6.

### Defaults Locked publicados

20 constantes verificadas en pista, organizadas en 4 categorías:
spotter, race-control, vehículo, LMU session. Ver
[`vantare-go-master-plan.md`](vantare-go-master-plan.md) § 5.

### Matriz LMU-01..48

48 filas con `MATCH / PARTIAL / NOT_PORTED` y ceiling documentado. Ver
[`vantare-go-master-plan.md`](vantare-go-master-plan.md) § 13.

### Voice contract matriz VC-A01..VC-R04

Adaptada del Python v0.7 al runtime Go/Wails. Ver
[`voice-contract.md`](voice-contract.md).

### Bug log del spotter

9 bugs documentados (8 heredados del Python + 1 nuevo del Go) con
causa, corrección y tests de regresión. Ver
[`testing/spotter-bug-log.md`](testing/spotter-bug-log.md).

### Prealpha gate

Criterios verificables para cerrar prealpha. Ver
[`testing/prealpha-gate.md`](testing/prealpha-gate.md).

### Archivos creados

- `README.md`
- `INDEX.md`
- `current-plan.md`
- `vantare-go-master-plan.md`
- `voice-contract.md`
- `domain-model.md`
- `agent-workflow.md`
- `go-review-checklist.md`
- `manual-verification.md`
- `operations.md`
- `testing-strategy.md`
- `architecture/0001-prealpha-architecture.md`
- `architecture/crewchief-parity.md`
- `architecture/spotter-geometry-findings.md`
- `architecture/tts.md`
- `product/prealpha-next-steps.md`
- `testing/lmu-telemetry.md`
- `testing/spotter-bug-log.md`
- `testing/prealpha-gate.md`
- `CHANGELOG.md`

Total: 20 archivos.
