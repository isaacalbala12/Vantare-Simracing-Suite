# Handoff vivo — Engineer/Spotter

Estado verificado: 2026-08-13. Este documento conserva solo el presente; Git y
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
  y padre documental ISA-313 `7ac6b4b9a5adf964fdb14d5e6d80ffa90a548eca`. Observación 2026-08-13 (tras fetch):
  `origin/nightly` en `b6df494298578ff9a043bbd9b48a66eb1512010f` (publicación #211); sin deriva en `internal/engineer`;
  cambios `cmd/vantare` ajenos al wiring Engineer; el SHA de Nightly es observación, no autoridad fija.
- PR #210 `OPEN` + `DRAFT` + `CLEAN` (https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/210):
  rango funcional/documental final en `ba3b45d`, remoto y verificado. Localmente el Corte A añade `cfbe63e` + `1af3fb5` (aún sin push). Base temporal apilada sobre
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
  `SUCCESS` y GitGuardian `SUCCESS`. Estado actual 2026-08-13: PR #196
  `OPEN`+`DRAFT`+`DIRTY` y no se integra; #210 sigue apilado sobre su rama.
- Cierre funcional documental de Corte B ISA-313: rango local
  `90a0905e0f7198623c80c2b6f8f3c63945abae82..ebc0dfb533ffcb41b680ad51d1ef79ecac478695`.
  Reviews del cierre funcional: spec `ACCEPT`, quality `READY`, navegación
  fresh `PASS` y Opus `READY`. El finding normativo de S7 y la duplicación de
  evidencia quedaron corregidos en `ebc0dfb`.
- P3 aceptado conscientemente: no se renombra el paquete legacy porque sus
  banners y el router mitigan la colisión; moverlo exige issue y alcance aparte.
- Review final DeepSeek V4 Flash max (spec + quality) sobre el rango funcional
  final `ba3b45d`: ACCEPT sin P0-P3. La review final Opus/Fable queda pendiente
  por cuota y sigue como gate adversarial al cierre; no bloquea el arranque de
  A por aprobación explícita de Isaac; la review Opus anterior no es final PASS.
- El microplan S1 fue aprobado por Isaac el 2026-08-13 (cortes A/B/C, incluido
  el cambio visible Spotter ES→EN del Corte C). Corte A implementado y revisado:
  commits locales `cfbe63e` + `1af3fb5` (HEAD `1af3fb5f63dc192c3c1576a10c2f12471c2b3782`);
  spec `ACCEPT` (P0-P2=0) y quality `READY` (P0-P2=0); `go test ./internal/engineer/...` y
  `go test ./...` PASS (94 paquetes); `-race` no ejecutable (CGO off). Validación manual
  LMU/pestaña Ingeniero NO ejecutada: Corte A abierto hasta ese gate humano; B/C no iniciados.

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
- Gate master: la sección visual temporal Testing/Diagnóstico de la pestaña
  Ingeniero puede existir y crecer en issue/Nightly/Testers para validar, pero
  debe retirarse o quedar excluida antes de promover a master (no llega visible
  a master). Tests y contratos productivos se conservan; los controles normales
  de Engineer no se confunden con la superficie temporal. La retirada se
  replanifica en el cierre S7/promoción master con prueba automática que falle
  si la superficie temporal es visible en master.
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
  test acumulativo sobre EngineerService); el Corte A ya implementa reset solo
  Spotter, reset de política Spotter aditivo/scoped en el toggle y sensibilidad
  única; los invariantes restantes (secuencia/filtro, audio-only y test acumulativo) los implementan B y C.

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
   tocar su subfase. Corte A: polling acotado en tests async; residuo teórico/
  inaccesible por ruta canónica de cola ante hard-error posterior a encolar Spotter;
  replayoracle usa `Normal` explícito como default determinista. No son bloqueo ni promesa falsa.

## Issues y bloqueos

- Isaac aceptó humanamente ISA-313 Fase 5 el 2026-08-12. La aceptación no cambia
  producto ni inicia S1.
- ISA-327 está `In Progress` y replanifica S1 (cortes A/B/C). Isaac aprobó el
  microplan el 2026-08-13, incluido el cambio visible Spotter ES→EN del Corte C;
  Corte A implementado y revisado; validación manual pendiente; B/C no iniciados.
- ISA-187 / ENG-16 e ISA-189 / ENG-18 siguen en Backlog y bloqueadas por
  ISA-313; S4/ISA-187, S2/ISA-189 e ISA-314 quedan diferidos expresamente hasta
  cerrar S1.
- ISA-314 conserva separado el bug de promesa falsa de guardado.
- Las issues de voz, Pit, Strategy y gate Beta mantienen sus dependencias; este
  corte no las mueve ni declara GO.

## Siguiente acción

Ejecutar la validación manual LMU/pestaña Ingeniero del Corte A (gate humano pendiente; no se afirma PASS manual); tras aceptarla, implementar Corte B del [microplan S1](../../engineer/phases/spotter/plan.md) (unica siguiente implementacion; C despues). Al integrar #196 por el flujo autorizado, retargetear #210 a nightly y revalidar (gate: deriva funcional relevante para Engineer en `internal/engineer` o en wiring/call sites Engineer en `cmd/vantare` respecto a `8880a880`; el SHA de Nightly es observacion, no autoridad fija; sin rebase manual).
Obtener la review final Opus/Fable como gate adversarial al cierre (DeepSeek V4 Flash max spec+quality ACCEPT final sin P0-P3; la review Opus anterior no es final PASS); su cuota previa no bloquea el arranque de A por aprobacion explicita de Isaac.
