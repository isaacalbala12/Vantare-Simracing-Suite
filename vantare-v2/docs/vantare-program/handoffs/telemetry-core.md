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
- TC-07A.1 ISA-129: `In Review`; D0 `6acb352`, D1 `470d6a6`, D2
  `e2c92fd`, D3 `462f0ee` y D4A `94c2994` aceptados (cierre documental
  `19252a0`), sin promoción. D4A publica grid real 44/44, sanitizer zero-rebuild
  y SHM-first; review final `ACCEPT`, P0/P1/P2/P3 = 0. D4B queda cerrado en
  `be6563f` más registro `47f82d3`: LMU 1.4 real de menú/pista hash-pinned,
  REST correlacionado, 38 vehículos y runtime opt-in `live`.
- D5 queda aceptado y publicado en `7523def`: mapper canónico síncrono,
  adapter real y duradero para `DriverManager`, fixture real 44/44, identidad
  opaca por slot/generación, limpieza segura del jugador y detección de reset
  de reloj entre reconexiones. Review final `APPROVE`, P0/P1/P2/P3 = 0.
- D6 queda aceptado y publicado en `496b758`: remaining, gaps relativos y
  self-delta deterministas, transaccionales y acotados. La evidencia LMU 1.4
  real conserva 1.846 muestras sanitizadas, tres wraps, dos vueltas comparables
  y SHA-256
  `d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938`.
  Review final `APPROVE`, P0/P1/P2/P3 = 0.
- D7 queda aceptado y publicado en `79bdc98`: Overlay Projection v1 se amplía
  de forma aditiva con timing, identidad/scoring, fuel, gaps y self-delta. El
  timestamp UTC canónico de cada muestra se conserva aunque el delta actual
  pase a missing/stale. El decoder prueba old/new en cuatro direcciones, sector
  cerrado e IDs únicos. La matriz 18/18 queda en 2 exactos, 10 parciales, 5 no
  comparables y 1 externo. Frontend 297 archivos/2.019 tests, Telemetry Core,
  Go focal x20, lint focal y build pasan; review `APPROVE`, P0/P1/P2/P3 = 0.
- D8 queda aceptado y publicado en `0d741e0`: un único harness recorre la
  captura real LMU 1.4 por Driver/Fusion -> BatchMapper -> Reducer ->
  SessionCoordinator -> Derive -> Overlay Projection v1, con una apertura,
  38 vehículos y bytes idénticos en 20 ejecuciones. Menú falla cerrado; el
  trace real D6 demuestra Delta desde missing hasta fresh y cruza Go,
  transporte y adaptador TypeScript. Review independiente final `APPROVE`,
  P0/P1/P2/P3 = 0. Las vueltas válidas quedan conservadas y no deben repetirse.
- D9 queda aceptado y publicado en `7f679e6`; PR draft `#42` contra la rama
  exacta de ISA-105 y Linear `In Review`. Cuatro frames LMU 1.4 reales,
  zero-rebuild y hash-pinned demuestran `InPit=false -> true -> false`,
  disconnect fail-closed sin payload y reconnect con sesión nueva y exactamente
  un epoch adicional. El decoder de evidencia rechaza campos desconocidos,
  payloads y valores JSON extra. Review final `APPROVE`, P0/P1/P2/P3 abiertos
  = 0. Telemetry Core, frontend 297/2.020, build, lint focal, replay x20,
  benchmarks y diff-check pasan. La review reprodujo ISA-118 en Windows fuera
  del diff; `-race` no está disponible con `CGO_ENABLED=0`. Sin merge,
  promoción, wiring productivo ni cutover.
- TC-07B–TC-09: pendientes.

No existe wiring productivo del nuevo reducer/derivaciones. Gaps y delta ya
tienen inputs, semántica y proyección demostrados; D8 prueba la cadena completa
en un único harness y D9 cierra la evidencia real de pit/outlap y
disconnect/reconnect. La captura raw diagnóstica de ISA-104 permanece
desactivada y sin wiring productivo.

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
- **P3 heredado:** seis avisos `unsafe.Pointer` Win32 en vet global. Los seis
  archivos son idénticos a la base exacta ISA-105; dos pertenecen al driver LMU
  modular y cuatro a readers/iconos legacy.
- **Deuda heredada fuera del corte:** lint global con 33 errores y dos warnings.
- **Deuda heredada reproducida:** `TestConcurrentSavesDontCorruptFile` falla
  tanto en ISA-129 como en la base exacta ISA-105 por contención de
  `app-settings.json.tmp`; seguimiento en ISA-118.
- **P2 operativo:** Nightly/Testers no existen; ISA-121 bloquea promoción.
- **Resuelto en D6–D8:** gaps/delta tienen inputs reales, semántica, evidencia
  LMU hash-pinned, proyección aditiva y cadena única verificada hasta TypeScript.
- **P0 ISA-129 confirmado:** el bootstrap comercial inyecta
  `createMockSource()`, normaliza el buffer sintético como `Connected=true` y
  lo publica por Wails y SSE cuando LMU no está disponible.
- **Resuelto en D5, aún sin wiring productivo:** existe el adapter duradero
  `lmu.Observation → core.Batch`; la cadena real DriverManager → mapper →
  reducer conserva sesión/cursor/generaciones entre reconexiones.
- **Resuelto en D4A/D5:** el driver publica `[]Vehicle` canónico y D5 asigna
  identidades estables por slot/generación. El cutover sigue fuera de alcance.
- **P1 fuera de ISA-129:** Engineer arranca con `source="simulator"` y
  `connected=true`; debe resolverse en su corte antes del cutover Engineer.
- **Compatibilidad real cerrada en D4B:** LMU `1.4.0.0` está allowlisted solo
  con file/product version coincidentes y cuatro hashes reales sanitizados.
  Versiones desconocidas o evidencia incompleta continúan rechazadas.

## Issues

| Estado | Issues |
|---|---|
| Cerradas | ISA-23–37, incluyendo ISA-96/97/100 según Linear |
| Cerradas técnicamente | ISA-38–41 e ISA-101–103 en la cadena apilada |
| En revisión | ISA-104 / TC-06D, PR draft `#40` |
| En revisión | ISA-105 / TC-07A, `c9acee2`, PR draft `#41` |
| En revisión | ISA-129 / TC-07A.1, `7f679e6`, PR draft `#42` |
| Pendientes | ISA-106–117 e ISA-87 según dependencias |

## Siguiente acción exacta

Mantener ISA-129 y su PR draft `#42` sin merge ni promoción. ISA-106 permanece
bloqueada por la dependencia formal y no debe iniciarse desde esta entrega. El
siguiente corte solo puede comenzar mediante su propio preflight, rama y plan,
con la evidencia ISA-129 como base; no se permiten fixtures sintéticos ni
cutover implícito.

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

2026-07-31, ISA-129 D6 aceptado y publicado en `496b758`. Remaining, gaps
relativos y self-delta se derivan de observaciones canónicas demostradas. La
fixture LMU 1.4 real contiene 1.846 muestras a 10 Hz, tres wraps y dos vueltas
comparables; su SHA-256 es
`d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938`.
El oráculo independiente fija 100 ms de incertidumbre, exige delta superior y
prueba el signo. Focales x20, dos fuzzers de 10 s, Telemetry Core, vet focal,
benchmarks y diff-check PASS. Review final `APPROVE`, P0/P1/P2/P3 = 0. Sin PR,
merge, promoción, wiring productivo ni cutover. Siguiente corte: D7.

2026-07-31, ISA-129 D5 aceptado y publicado en `7523def`. La observación LMU
canónica atraviesa el adapter duradero hasta `core.Batch`/Reducer con la
fixture real 44/44. Slots, generaciones, sesión, jugador y cursor son atómicos;
rechazo, backpressure y cancelación no avanzan estado. La desaparición del
jugador limpia header, derivaciones y Overlay; una reconexión no oculta resets
de reloj. Focal x20, Telemetry Core y suite Go global serial PASS. Review final
`APPROVE`, P0/P1/P2/P3 = 0. `-race` queda no ejecutable por `CGO_ENABLED=0`.
Sin PR, merge, promoción, wiring productivo ni cutover. Siguiente corte: D6.

2026-07-31, ISA-129 D4B cerrado y publicado. Cuatro artefactos LMU 1.4 reales,
sanitizados y hash-pinned prueban menú y pista; el par de pista contiene 38
vehículos y jugador, con ocho solapes SHM/REST correlacionados antes de
anonimizar. El circuito se compara por digest privado en memoria; solo se
persiste `Track-01`. Sentinels negativos finitos de lap distance/gaps quedan
`missing`. Driver/CLI x20, Telemetry Core, suite Go global serial, lector
opt-in y auditoría de privacidad PASS. Review previa independiente SAFE y
delta final adversarial sin hallazgos. Sin PR, merge, promoción ni cutover.

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
