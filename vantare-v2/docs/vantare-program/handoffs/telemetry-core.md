# Handoff vivo — Telemetry Core

## Resultado

Un único núcleo live modular y neutral al simulador. El driver LMU posee Shared
Memory y REST local como fuentes complementarias. Overlay, Engineer, Strategy
y Analysis consumen proyecciones versionadas y nunca abren readers propios.

## Autoridad

- `docs/adr/0004-telemetry-core-modular-observation-architecture.md`.
- `docs/telemetry-core/README.md` y su evidencia.
- `docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md`.
- Microplan activo y Linear.

## Estado real

- Proyecto Linear: `Telemetry Core — Modular Runtime & LMU`.
- Base apilada de ISA-129: ISA-105 / TC-07A, SHA
  `c9acee24cf4c4d80922b380b12f7367c2a60c937`.
- Rama activa:
  `vantareapp/isa-129-tc-07a1-senales-canonicas-overlay-y-retirada-del-mock`.
- Worktree activo: `C:\tmp\vantare-isa129\vantare-v2`.
- Promoción: ninguna; la cadena permanece en ramas de issue.
- TC-01–TC-03: cerrados.
- TC-04A–D y TC-05A–C: cerrados técnicamente en la cadena apilada.
- TC-06A–D: cerrados técnicamente; ISA-104 está `In Review`.
- TC-07A ISA-105: cerrado técnicamente en `c9acee2`; PR draft `#41`; Linear
  `In Review`; re-review D6 `ACCEPT`, P0/P1/P2/P3 = 0.
- TC-07A.1 ISA-129: `In Progress`; D0 `6acb352`, D1 `470d6a6`, D2
  `e2c92fd`, D3 `462f0ee` y D4A `94c2994` aceptados (cierre documental
  `19252a0`), sin promoción. D4A publica grid real 44/44, sanitizer zero-rebuild
  y SHM-first; review final `ACCEPT`, P0/P1/P2/P3 = 0.
- TC-07B–TC-09: pendientes.

No existe wiring productivo del nuevo reducer/derivaciones. Gaps y delta
permanecen `missing` hasta tener inputs demostrados. La captura raw diagnóstica
de ISA-104 permanece desactivada y sin wiring productivo.

## Decisiones

- Preferencia por señal, no autoridad global entre Shared Memory y REST.
- Cero es legítimo; missing/stale/invalid no se inventan.
- Raw en memoria; persistencia solo con consentimiento.
- LMU usa sus archivos históricos y no duplica recording por defecto.
- Reducer single-writer sin I/O; derivaciones lineales/versionadas/acotadas.
- Replays raw, canónicos e históricos son niveles distintos.
- Mocks/simulator solo en harness explícito.

## Evidencia y riesgos

- ISA-104: catálogo metadata-only, inspector local, export sanitizado
  byte-exacto, Wails correlacionado, UI responsive y captura raw limitada sin
  wiring. Reviews backend/UI `ACCEPT`, P0/P1/P2/P3 = 0.
- Gates finales ISA-104: Go global serial, Telemetry, app, race focal, vet
  aplicable, 1.923 tests frontend, build frontend/Wails y Playwright
  wide/medium/compact en verde. Privacidad y seis capturas verificadas.
- **P3 heredado:** dos avisos `unsafe.Pointer` Win32 en vet LMU normal.
- **Deuda heredada fuera del corte:** lint global con 33 errores y dos warnings.
- **P2 operativo:** Nightly/Testers no existen; ISA-121 bloquea promoción.
- **P2 funcional conocido:** gaps/delta siguen missing hasta demostrar inputs.
- **P0 ISA-129 confirmado:** el bootstrap comercial inyecta
  `createMockSource()`, normaliza el buffer sintético como `Connected=true` y
  lo publica por Wails y SSE cuando LMU no está disponible.
- **P0 ISA-129 confirmado:** no existe adaptador productivo
  `lmu.Observation → core.Batch`; los replays crean batches manuales y no
  prueban el pipeline real.
- **P0 ISA-129 confirmado:** el driver modular publica solo al jugador; no
  existe `[]Vehicle` canónico ni identidad estable de parrilla.
- **P1 fuera de ISA-129:** Engineer arranca con `source="simulator"` y
  `connected=true`; debe resolverse en su corte antes del cutover Engineer.
- **Compatibilidad real pendiente:** LMU instalado es `1.4.0.0`; el driver
  canónico solo permite `1.3.0.0`. El mapping conserva tamaño 324820, pero no
  se permitirá 1.4 hasta demostrar invariantes y fixtures sanitizados.

## Issues

| Estado | Issues |
|---|---|
| Cerradas | ISA-23–37, incluyendo ISA-96/97/100 según Linear |
| Cerradas técnicamente | ISA-38–41 e ISA-101–103 en la cadena apilada |
| En revisión | ISA-104 / TC-06D, PR draft `#40` |
| En revisión | ISA-105 / TC-07A, `c9acee2`, PR draft `#41` |
| En progreso | ISA-129 / TC-07A.1 |
| Pendientes | ISA-106–117 e ISA-87 según dependencias |

## Siguiente acción exacta

Ejecutar D4B de ISA-129 / TC-07A.1 sobre `19252a0`: preparar primero el perfil
diagnóstico y captura sanitizada LMU 1.4; pedir a Isaac menú y pista solo cuando
el CLI esté listo. Sin CSS, canvas, renderers, baselines ni cutover productivo.

Auditoría de fallback cerrada:

- Ruta afectada:
  `cmd/vantare → app.New → TelemetrySourceManager → createMockSource →
  BuildSyntheticBuffer → Normalizer Connected=true → Wails/SSE`.
- Sin LMU, Studio/Desktop/OBS reciben una sesión sintética con `Spa` y
  `TestDriver`, aunque el indicador superior diga Mock.
- Las excepciones válidas permanecen en preview Mock explícita, harnesses,
  fixtures, replays y CLIs de diagnóstico.
- ISA-129 debe invertir primero los tests del manager, retirar el fallback
  implícito de producción, impedir que `fusion.Merge(nil, ...)` conceda
  conexión y demostrar payload desconectado honesto por Wails y SSE.
- Después debe construir evidencia reproducible, observación multivehículo,
  bridge `Observation → Batch`, scoring/sesión/timing, gaps/delta con semántica
  explícita y proyección aditiva. No se aceptan campos por existir solo en
  código legacy.
- `InPit` no participa hoy en `withFreshness`; debe recibir la misma política
  stale que el resto del frame.
- VE, compuesto, daños y cualquier clima sin fuente demostrada permanecen
  `missing` y no bloquean la honestidad del contrato.
- El simulador productivo de Engineer queda documentado y excluido de este
  corte; no debe perderse antes del cutover Engineer.

Primera review del plan ISA-129:

- `REQUEST CHANGES`: P0=0, P1=2, P2=4, P3=0.
- P1: faltaba una matriz probatoria exacta por señal antes de schema/código.
- P1: identidad, sesión y epoch no tenían una tabla de transiciones ejecutable.
- P2: la captura 1.4 dependía circularmente del allowlist y del sanitizer
  multivehículo posterior.
- P2: el gate exigía pit/reconexión pero el cierre permitía omitirlos.
- P2: compatibilidad Overlay v1 no definía old/new y extensiones desconocidas.
- P2: comandos gofmt/fuzz necesitaban nombres literales ejecutables.
- No se inicia comportamiento hasta corregir y obtener re-review limpia.

Segunda review del plan ISA-129:

- `REQUEST CHANGES`: P0=0, P1=2, P2=1, P3=1.
- Los seis hallazgos anteriores quedaron cerrados en lo esencial.
- P1: falta una matriz por señal para autoridad/fusión Shared Memory frente a
  REST, incluyendo preferencia, alternativa, TTL, alcance y desacuerdo.
- P1: Delta necesita una traza real sanitizada de una vuelta completa de
  referencia y muestras comparables; sin ella debe permanecer missing y
  bloquear ISA-106.
- P2: D3 debe reutilizar/endurecer IDs ya existentes del catálogo y prohibir
  duplicados semánticos, especialmente piloto y combustible.
- P3: renumerar D4A/D4B y fijar el orden literal de rollback.
- Rama/base/fixture de 44 vehículos y offsets revisados; sin código iniciado.

Tercera review del plan ISA-129:

- `APPROVE`: P0=0, P1=0, P2=0, P3=0.
- Cerrada la autoridad SHM/REST por señal, scope, TTL, equivalencia,
  fresh/stale/conflicto y cero/false.
- Delta exige traza real LMU 1.4 sanitizada/hash-pinned con una vuelta de
  referencia y otra comparable; sin ella ISA-129/106 quedan bloqueadas.
- Catálogo define reuse/harden/append/unproduced/tombstone y reutiliza los IDs
  existentes de piloto y combustible.
- Once microcortes/commits D0–D9, incluyendo D4A/D4B, y rollback inverso
  literal.
- Plan global aprobado contra ISA-129 y AGENTS; D0 puede comenzar.

D0 documental implementado y aceptado:

- Cuatro documentos exactos: plan ISA-129, nueva procedencia LMU/Overlay,
  matriz shadow y `docs/current-plan.md`.
- Matrices §1.4/§1.5, hashes LMU 1.3, incompatibilidad 1.4 pendiente,
  P0 mock/bridge/grid y exclusiones missing registrados.
- Baseline previo/posterior, Telemetry focal, app/server, hashes y diff-check
  pasan.
- Review independiente `ACCEPT`, P0/P1/P2/P3 = 0. La corrección final fija
  correlación únicamente en `[0,mNumVehicles)`, IDs activos únicos/no
  negativos/biyectivos, jugador por `mIsPlayer` + ID telemetry activa y
  `lapDistMax=3982.366455078125`.
- Commit de producto D0 `6acb352`, push sincronizado, sin merge, promoción ni
  cutover. D1 también fue aceptado en `470d6a6` (estado documental
  `f4988e0`): elimina el mock conectado de producción, conserva el objeto LMU
  real para attach tardío, bloquea REST-only como connected y publica
  desconectado por Wails/SSE/frontend. Review independiente `ACCEPT`,
  P0/P1/P2/P3 = 0; Go completo, frontend 2001/2001 y build pasan. `-race`
  está omitido por CGO desactivado y el lint global conserva deuda heredada.
  D2 queda desbloqueado; LMU 1.4 y los gates físicos siguen pendientes en sus
  cortes explícitos.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-07-31, ISA-129 iniciada sobre ISA-105 `c9acee2`. Las dos auditorías
read-only confirmaron el fallback sintético conectado de Overlay, ausencia del
bridge productivo `Observation → Batch` y driver modular limitado al jugador.
También aislaron el simulador productivo de Engineer como deuda de su propio
corte. Los fixtures reales sanitizados prueban 44 vehículos para LMU 1.3, pero
REST modular sigue siendo sintético. LMU instalado es 1.4.0.0; el driver solo
reconoce 1.3.0.0 y el allowlist no se ampliará sin prueba estructural. Worktree
limpio; sin código modificado, merge, promoción ni cutover.

El plan fue revisado tres veces. La primera review rechazó con
P0=0/P1=2/P2=4/P3=0; sus seis hallazgos quedaron corregidos. La segunda review
rechazó con P0=0/P1=2/P2=1/P3=1 por autoridad SHM/REST, evidencia real de
Delta, reutilización de IDs del catálogo y numeración/rollback. La tercera
review fue `APPROVE`, P0/P1/P2/P3=0. D0 documental está aceptado, con checks
en verde y publicado en `6acb352`; D1 es la próxima acción y todavía no hay
código de comportamiento promovido.

Histórico ISA-105: D1–D5 aprobados y publicados en `f2a1ac3`. Cobertura real:
18/18, con un exacto, cinco parciales, once no comparables y un externo. La
evidencia sanitizada conserva 2 widgets, 31 campos, 19 iguales y 12 diferencias
explicadas; tres capturas y hashes verificados. Go telemetry/app, frontend
297/1.993, build y Playwright pasan. Visual Crystal falla al 100 % también en
la base exacta y el benchmark incumple umbrales en ambas ramas; no se tocaron
ni regeneraron baselines, canvas o renderers. Review D5 `APPROVE`,
P0/P1/P2/P3 = 0. D6 detectó cuatro P2 y un P3; todos quedaron corregidos:
cap separado 64+64, `pitStopCount` retirado, sourcePaths reales, identidad
`vehicles[].id` + `playerVehicleId`, handoff sincronizado y ADR válido.
Re-review final `ACCEPT`, P0/P1/P2/P3 = 0. Suite frontend final
297 archivos/2.000 tests y Playwright PASS. HEAD `c9acee2`, PR draft `#41`,
Linear `In Review`; ISA-129 es la siguiente dependencia.
