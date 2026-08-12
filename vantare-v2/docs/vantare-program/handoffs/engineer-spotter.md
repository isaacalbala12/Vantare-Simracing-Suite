# Handoff vivo — Engineer/Spotter

Estado verificado: 2026-08-12. Este documento conserva solo el presente; Git y
Linear preservan la historia.

## Resultado

Engineer acompaña al piloto en directo y Spotter cubre seguridad, proximidad y
tráfico. Ambos consumen Telemetry Core, funcionan offline y fallan cerrados
ante datos no demostrables. La primera Beta es ES/EN y excluye cambio de piloto.

Vantare replica o mejora capacidades observables de CrewChief con contratos,
contenido y evidencia propios; no copia su arquitectura, código, constantes,
frases, sonidos, assets ni estructura.

## Autoridad

1. `AGENTS.md`, `docs/current-plan.md` y el expediente canónico.
2. Linear para alcance, dependencias, rama y estado.
3. Este handoff y el [router Engineer](../../engineer/README.md).
4. [Plan Spotter](../../engineer/phases/spotter/plan.md),
   [aceptación](../../engineer/phases/spotter/acceptance.md), contratos, código,
   tests y evidencia aplicables.

El [brief clean-room sanitizado](../research/engineer/crewchief-clean-room-brief-2026-08-10.md)
es la única salida competitiva para implementers. Los índices y dossiers de
research quedan fuera de su context pack.

## Estado Git, PR y CI

- Issue activa: ISA-327 / ENG-S1 — replanning técnico de S1 Spotter
  (autoridades y baseline confiable). In Progress en Linear, con comentario/
  attachment del PR #210.
- Rama de ISA-327:
  `vantareapp/isa-327-eng-s1-spotter-autoridades-y-baseline-confiable`.
- Base apilada de este corte: productiva merge-base `8880a8800e07e2af21fe5ff37a714578bf8fcd00`
  y padre documental ISA-313 `7ac6b4b9a5adf964fdb14d5e6d80ffa90a548eca`. Observación 2026-08-12 (tras fetch):
  `origin/nightly` en `234794d238a59fa14be53431065bf88eca46459a` (ISA-330 #208); sin deriva en `internal/engineer`;
  cambios `cmd/vantare` (main.go, main_test.go) solo Overlay Studio/window/profile, sin wiring/call sites Engineer; el SHA de Nightly es observación, no autoridad fija.
- PR #210 `OPEN` + `DRAFT` + `CLEAN` (https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/210):
  último SHA del rango funcional/documental previo al registro de estado (`c35db15`,
  snapshot revisado; el commit posterior solo registra estado externo y no se autoancla). Base temporal apilada sobre
  `vantareapp/isa-313-eng-r01-reconciliar-nightly-y-replanificar-spotter` (PR padre #196), no nightly:
  review aislada sin resolver artificialmente el conflicto de current-plan; cuando #196 se integre por el
  flujo autorizado, #210 se retargetea a nightly y se revalida. No es promoción ni salto de canal.
  GitGuardian `SUCCESS`; los gates completos de branch-channel no se ejecutaron en esta base apilada:
  no se declara CI completa. Sin merge/promoción/release.
- Nivel real: rama de issue, integración en Nightly/Testers/Master sin realizar; no existe release de
  este corte. El corte documental se apila sobre el cierre ISA-313 sin fingir promoción.
- Cierre remoto previo auditado en `b2519a25`: PR #196 `OPEN` + `DRAFT`, base
  `nightly`, merge state `CLEAN`; sin merge ni promoción. Checks de ese cierre:
  `Validate promotion path` `SUCCESS`, `Validate Vantare blocking gates`
  `SUCCESS` y GitGuardian `SUCCESS`.
- Cierre funcional documental de Corte B ISA-313: rango local
  `90a0905e0f7198623c80c2b6f8f3c63945abae82..ebc0dfb533ffcb41b680ad51d1ef79ecac478695`.
  Reviews del cierre funcional: spec `ACCEPT`, quality `READY`, navegación
  fresh `PASS` y Opus `READY`. El finding normativo de S7 y la duplicación de
  evidencia quedaron corregidos en `ebc0dfb`.
- P3 aceptado conscientemente: no se renombra el paquete legacy porque sus
  banners y el router mitigan la colisión; moverlo exige issue y alcance aparte.
- Este commit B solo registra evidencia y estado; su SHA se reporta al cierre y
  no forma parte del rango funcional anterior.
- Revisión Opus 5 sobre HEAD 75c958d: findings P0-P3 corregidos en este corte
  documental (padre `75c958d301e286ddf34c6849a12476332f8bda0b`); re-review queda
  pendiente y la revisión no se marca como superada. El microplan de S1 no está
  aceptado ni S1 iniciado.
- Re-review 2026-08-12 (CHANGES REQUIRED, 2 P2 + 3 P3): corregidos en este corte
  documental (padre `4d437d25f125c8eab6ac74ba75abf835228ab073`); re-review queda
  pendiente y ninguna revisión se marca como superada. El microplan de S1 no está
  aceptado ni S1 iniciado.
- Re-review read-only DeepSeek V4 Flash max sobre HEAD b2d355c: READY FOR HUMAN
  APPROVAL, 5/5 PASS (P2-A/B, P3-C/D/E); única observación P3: Nightly stale,
  ya refrescada. La re-review final por Claude Code MCP y T3 Code MCP devolvió
  cuota de sesión antes de leer archivos; Fable quedó bloqueado por la misma
  cuota. No se inventa PASS: la re-review final Opus/Fable queda pendiente y la
  review Opus 5 anterior no se marca como final PASS.

## Capacidades demostradas

- ENG-01..ENG-12, ENG-14 y ENG-15 están integradas en Nightly.
- Existe la vertical Telemetry Core -> decisión/policy -> presentación ->
  transporte visual, con radio y subtítulos compartidos.
- Existen policy/scheduler deterministas, preempción Spotter, presentación
  multilingüe, PTT y diálogo confirmable sin efectos reales.
- La ruta de audio actual es cache-only y cancelable; el tooling de host de voz
  sigue test-only.

## Pendiente o condicionado

- Audio audible ES/EN distribuible, dispositivo/hot-plug y evidencia humana.
- Núcleo lateral completo, multiclase, lifecycle/FCY/peligros y plausibilidad.
- Paridad LMU extremo a extremo entre decisión, audio y visuales.
- Kokoro legal, empaquetable y perceptualmente aceptado; no hay síntesis en hot
  path ni segundo motor TTS.
- STT/wake word condicionados por corpus y gates humanos.
- Pit Manager con confirmación, ejecución, readback y fallo cerrado.
- Footer preexistente de guardado automático: alcance/riesgo ISA-314, no se
  corrige en S1 y no se legitima su promesa.

## Decisiones vigentes

- Arquitectura simple: Telemetría -> estado Spotter -> mensaje -> audio Kokoro
  preparado/cacheado + visual compartido.
- Timings, tempo, cadencia, debounce, clears, cooldowns, audio, dispositivo y
  sincronía visual forman parte de la feature y de su aceptación.
- `WidgetVisualHost` es la única frontera visual compartida.
- La sección de testing crece de forma acumulativa dentro de la pestaña Ingeniero
  ya existente: cada corte expone controles seguros, estado/resultado observable
  y motivo de silencio/degradación/error, y amplía un test automatizado evaluable
  por IA junto al test backend; sin app, ruta, renderer, estado ni lógica paralela
  de debug. La UI consume las mismas autoridades/estado/contratos productivos y no
  admite inyección arbitraria de telemetría. El panel solo gana un observable/
  control visual cuando la feature aporta señal productiva útil; si ya está
  representada, se amplían escenario y regresión UI sin inflar componentes, y el
  test UI crece cuando cambia el contrato/representación. `cmd/spotter-debug` queda
  como herramienta técnica; la ruta manual primaria es la pestaña Ingeniero. S1
  incluye solo el mínimo frontend necesario para probar lo que S1 incorpore;
  persiste la exclusión de persistencia y rediseño de preferencias (ISA-314
  separada).
- Wiring mínimo S1: se reutilizan las métricas productivas delivery; `delivery.Metrics.record`
  persiste el último delivery state+reason por acknowledgement (`Session.Acknowledge`) y
  `delivery.MetricsSnapshot` lo expone como `lastState`/`lastReason` (camelCase, sin payload),
  viajando en `service.EngineerStatus`/`engineer:status` y `engineer:stream` (datos acotados, sin
  cambiar OBS/Desktop/store); `internal/app/engineer_bridge.go` queda SOLO LEER/passthrough sin
  evento nuevo; la selección de locale efectiva en `productDeliveryPort.Deliver` deriva por delivery desde
  `EngineerService.audioConfig` cuando no es nil (`decision/family` → `AudioConfig.Lang(channel)` →
  `ParseLocale`); con `audioConfig == nil` conserva `port.locale` como fallback canónico ya inyectado;
  config presente inválida (lang vacío/no soportado o mismatch) falla cerrado sin fallback silencioso; el panel
  Testing/Diagnóstico de la pestaña Ingeniero muestra campos productivos existentes (sin conteo
  TTS) y último delivery state/reason; `EngineerPage.test.tsx` usa transporte Wails mockeado; la
  ruta acumulativa Go sobre `EngineerService` es la única prueba de comportamiento y reasons.
- Cada subfase se replantea al entrar y amplía la misma aceptación manual + IA.
- Engineer/Spotter se implementa mediante workers subagentes; sus reportes son
  respuestas estructuradas, no documentación nueva.
- ISA-327 replanifica S1 en tres cortes secuenciales A/B/C (máquina, entrada,
  salida/aceptación) dentro del [plan Spotter](../../engineer/phases/spotter/plan.md).
  No se negocian los invariantes objetivo que S1 debe cumplir (reset solo Spotter,
  reset de política Spotter con método aditivo/scoped en el toggle, sensibilidad única,
  service/oracle coherentes, filtro solo Spotter, audio-only no-success con reason,
  test acumulativo sobre EngineerService); hoy no se cumplen (cancelación global,
  sin reset de política Spotter y sensibilidad Normal hardcodeada)
  y S1 los hace cumplir.

## Riesgos

- **P0:** Pit Manager no tiene transacción/readback demostrados; permanece sin
  efectos productivos.
- **P1:** enable de Spotter comparte autoridad con runtime; sensibilidad,
  calidad por rival, secuencias, salida `audio-only`, same-side, ghost y
  plausibilidad conservan deudas del baseline.
- **P1:** no existe aceptación LMU real completa ni audio distribuible; ACK o
  replay sintético no demuestran audibilidad.
- **P1:** licencias y cadena G2P/voz/pack pueden impedir distribución Kokoro.
- **P2:** documentación snapshot conserva estados antiguos; los banners y el
  router evitan usarla como estado operativo.
- **P3:** parámetros y tests heredados necesitan rederivación clean-room al
  tocar su subfase.

## Issues y bloqueos

- Isaac aceptó humanamente ISA-313 Fase 5 el 2026-08-12. La aceptación no cambia
  producto ni inicia S1.
- ISA-327 está `In Progress` y replanifica S1 (cortes A/B/C). Tras la
  reconciliación de la pestaña Ingeniero, el microplan requiere nueva aprobación
  humana; la implementación no ha comenzado hasta aprobar su microplan.
- ISA-187 / ENG-16 e ISA-189 / ENG-18 siguen en Backlog y bloqueadas por
  ISA-313; S4/ISA-187, S2/ISA-189 e ISA-314 quedan diferidos expresamente hasta
  cerrar S1.
- ISA-314 conserva separado el bug de promesa falsa de guardado.
- Las issues de voz, Pit, Strategy y gate Beta mantienen sus dependencias; este
  corte no las mueve ni declara GO.

## Siguiente acción

Tras integrar #196 por el flujo autorizado, retargetear #210 a nightly y revalidar (gate: deriva funcional relevante para Engineer en `internal/engineer` o en wiring/call sites Engineer en `cmd/vantare` respecto a `8880a880`; el SHA de Nightly es observación, no autoridad fija; sin rebase manual).
Obtener la review final Claude cuando la cuota lo permita (DeepSeek READY; Opus/Fable final pendientes por cuota; la review Opus anterior no se marca como final PASS).
Solo después pedir/aplicar la aprobación humana del [microplan de S1](../../engineer/phases/spotter/plan.md) y la decisión visible Spotter ES→EN. No iniciar Corte A ni S2 por anticipado.
